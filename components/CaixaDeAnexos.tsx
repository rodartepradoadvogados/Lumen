"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { Briefcase, Check, FileText, Folder, Gavel, Loader2, MessageSquare, Paperclip, Pin, Search, AlertTriangle } from "lucide-react";
import ModalShell from "@/components/ModalShell";
import DocumentTypeSelect from "@/components/DocumentTypeSelect";
import { getDocumentTypeLabel } from "@/lib/documentTypes";
import { finalizeAttachmentUpload } from "@/lib/actions/attachments";
import { buscarDestinos, descreverDestino, partesDaAssessoria, type ItemDeDestino } from "@/lib/actions/caixaDeAnexos";
import {
  DESTINOS,
  PARTES_DA_ASSESSORIA,
  caixaVisivelEm,
  destinoDaRota,
  destinosPermitidos,
  sugerirTipoPeloNome,
  type ParteDaAssessoria,
  type TipoDeDestino,
} from "@/lib/caixaDeAnexos";

// A CAIXA DE ANEXOS DO PORTAL (DESIGN.md §10, aprovada pelo dono em 15/10/2026).
//
// Uma caixa pontilhada FIXA na barra de sub-abas (PageSectionTabs), à direita, em toda tela do
// portal — menos Atendimento e Petições (lib/caixaDeAnexos.ts:caixaVisivelEm). Clique ou arraste;
// um pop-up confirma ("Anexar estes documentos?") e um assistente de quatro passos leva cada arquivo
// ao lugar exato: Onde (processo, caso, atendimento, assessoria) → Qual (busca + recentes; na
// assessoria, também a parte: documento da empresa, parecer ou licitação) → Tipo (um por arquivo,
// sugerido pelo nome) → Conferir. Quando a tela atual JÁ É um destino, o primeiro passo oferece
// "Anexar aqui", que pula direto para o Tipo.
//
// O ENVIO NÃO É NOVO: são os mesmos dois caminhos das telas de cada item — Blob temporário
// (/api/attachments/blob-token) e depois finalizeAttachmentUpload (processo/caso/atendimento/
// licitação) ou /api/assessoria/documentos/upload (empresa/parecer). Os dois reconferem escritório
// e acesso no servidor, criam a pasta certa no Drive do escritório e registram o anexo.
//
// O RESULTADO SE IMPRIME NA PRÓPRIA CAIXA (sem toast): "3 documentos anexados em … · abrir", ou o
// que falhou e por quê. Arrastar arquivo em QUALQUER lugar da janela abre um alvo maior logo abaixo
// da caixa; soltar fora dele não anexa nada (as outras áreas de soltar da tela continuam valendo).

type Etapa = null | "confirmar" | "assistente";
type Resultado = { tipo: "ok" | "erro" | "parcial"; texto: string; href?: string } | null;
type Sub = { id: string; nome: string } | null;

const ICONE: Record<TipoDeDestino, typeof Gavel> = { processo: Gavel, caso: Folder, atendimento: MessageSquare, assessoria: Briefcase };
const PASSOS = ["Onde", "Qual", "Tipo", "Conferir"] as const;

function tamanho(b: number): string {
  return b >= 1e6 ? `${(b / 1e6).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`;
}

function hrefDoDestino(item: ItemDeDestino): string {
  if (item.tipo === "atendimento") return `/atendimento/${item.id}`;
  if (item.tipo === "assessoria") return `/assessoria/${item.id}`;
  return `/processos/${item.id}`;
}

export default function CaixaDeAnexos({ podeAtendimento, assessoria }: { podeAtendimento: boolean; assessoria: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const caixa = useRef<HTMLButtonElement>(null);

  const [arquivos, setArquivos] = useState<File[]>([]);
  const [etapa, setEtapa] = useState<Etapa>(null);
  const [passo, setPasso] = useState(0);
  const [destino, setDestino] = useState<TipoDeDestino | null>(null);
  const [item, setItem] = useState<ItemDeDestino | null>(null);
  const [parte, setParte] = useState<ParteDaAssessoria | null>(null);
  const [sub, setSub] = useState<Sub>(null);
  const [tipos, setTipos] = useState<string[]>([]);
  const [sugeridos, setSugeridos] = useState<boolean[]>([]);
  const [daTela, setDaTela] = useState<ItemDeDestino | null>(null);
  const [enviando, setEnviando] = useState<{ atual: number; total: number } | null>(null);
  const [resultado, setResultado] = useState<Resultado>(null);
  const [arrastando, setArrastando] = useState(false);
  const [sobreAlvo, setSobreAlvo] = useState(false);

  const permitidos = destinosPermitidos({ podeAtendimento, assessoria });
  const visivel = caixaVisivelEm(pathname);

  // O resultado fica na caixa por um tempo e volta ao repouso (um erro fica até a próxima ação).
  useEffect(() => {
    if (resultado?.tipo !== "ok") return;
    const t = setTimeout(() => setResultado(null), 15000);
    return () => clearTimeout(t);
  }, [resultado]);

  const comecar = useCallback((lista: File[]) => {
    if (lista.length === 0) return;
    setArquivos(lista);
    setResultado(null);
    setPasso(0);
    setDestino(null);
    setItem(null);
    setParte(null);
    setSub(null);
    setTipos(lista.map(() => ""));
    setSugeridos(lista.map(() => false));
    setEtapa("confirmar");
  }, []);

  // ARRASTAR EM QUALQUER LUGAR DA JANELA: só mostra o alvo; quem decide se anexa é soltar NELE.
  useEffect(() => {
    if (!visivel) return;
    let profundidade = 0;
    const temArquivo = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const entra = (e: DragEvent) => {
      if (!temArquivo(e)) return;
      profundidade++;
      setArrastando(true);
    };
    const sai = () => {
      profundidade = Math.max(0, profundidade - 1);
      if (profundidade === 0) setArrastando(false);
    };
    const fim = () => {
      profundidade = 0;
      setArrastando(false);
      setSobreAlvo(false);
    };
    window.addEventListener("dragenter", entra);
    window.addEventListener("dragleave", sai);
    window.addEventListener("drop", fim);
    window.addEventListener("dragend", fim);
    return () => {
      window.removeEventListener("dragenter", entra);
      window.removeEventListener("dragleave", sai);
      window.removeEventListener("drop", fim);
      window.removeEventListener("dragend", fim);
    };
  }, [visivel]);

  // Ctrl+U (aprovado na proposta): abre o seletor de arquivos, fora de campos de texto.
  useEffect(() => {
    if (!visivel) return;
    const tecla = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "u" || e.shiftKey || e.altKey) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(alvo.tagName))) return;
      e.preventDefault();
      entrada.current?.click();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [visivel]);

  // O atalho "Anexar aqui": descreve o registro da tela atual quando o assistente abre.
  useEffect(() => {
    if (etapa !== "assistente") return;
    const rota = destinoDaRota(pathname);
    if (!rota || !permitidos.includes(rota.tipo)) {
      setDaTela(null);
      return;
    }
    let vivo = true;
    descreverDestino(rota.tipo, rota.id)
      .then((d) => vivo && setDaTela(d))
      .catch(() => vivo && setDaTela(null));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao abrir o assistente
  }, [etapa, pathname]);

  function soltar(e: React.DragEvent) {
    e.preventDefault();
    setArrastando(false);
    setSobreAlvo(false);
    comecar(Array.from(e.dataTransfer.files));
  }
  function sobre(e: React.DragEvent) {
    if (!Array.from(e.dataTransfer.types).includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setSobreAlvo(true);
  }

  function fechar() {
    if (enviando) return;
    setEtapa(null);
    caixa.current?.focus();
  }

  function preencherSugestoes() {
    const s = arquivos.map((a) => sugerirTipoPeloNome(a.name));
    // Sem sugestão o tipo é "Outro" DE VERDADE (o que o seletor mostra é o que vai), e a linha avisa
    // para conferir — um seletor que mostra "Outros documentos" mas trava o Continuar seria um fantasma.
    setTipos((atuais) => atuais.map((t, i) => t || s[i] || "OUTRO"));
    setSugeridos((atuais) => atuais.map((v, i) => v || Boolean(s[i])));
  }

  function escolherDaTela() {
    if (!daTela) return;
    setDestino(daTela.tipo);
    setItem(daTela);
    setParte(daTela.tipo === "assessoria" ? "empresa" : null);
    setSub(null);
    preencherSugestoes();
    setPasso(2);
  }

  const podeAvancar =
    passo === 0
      ? Boolean(destino)
      : passo === 1
        ? Boolean(item) && (destino !== "assessoria" || parte === "empresa" || (Boolean(parte) && Boolean(sub)))
        : passo === 2
          ? tipos.every(Boolean)
          : true;

  function avancar() {
    if (!podeAvancar) return;
    if (passo === 1) preencherSugestoes();
    if (passo < 3) setPasso(passo + 1);
    else void anexar();
  }
  function voltar() {
    // Quem entrou pelo "Anexar aqui" pulou Onde e Qual: Voltar leva de volta ao começo.
    if (passo === 2 && daTela && item?.id === daTela.id) setPasso(0);
    else setPasso(Math.max(0, passo - 1));
  }

  const ondeLegivel = (() => {
    if (!item) return "";
    if (item.tipo === "assessoria") {
      if (parte === "parecer" && sub) return `${item.titulo} › Parecer “${sub.nome}”`;
      if (parte === "licitacao" && sub) return `${item.titulo} › Licitação “${sub.nome}”`;
      return `${item.titulo} › Documentos da empresa`;
    }
    const nome = DESTINOS.find((d) => d.tipo === item.tipo)?.nome ?? "";
    return `${nome} ${item.marca && item.marca !== nome ? `${item.marca} · ` : ""}${item.titulo}`;
  })();

  async function anexar() {
    if (!item) return;
    const total = arquivos.length;
    const falhas: string[] = [];
    setEnviando({ atual: 1, total });
    for (let i = 0; i < total; i++) {
      setEnviando({ atual: i + 1, total });
      const arquivo = arquivos[i];
      try {
        const blob = await upload(arquivo.name, arquivo, { access: "public", handleUploadUrl: "/api/attachments/blob-token" });
        const comum = { blobUrl: blob.url, name: arquivo.name, contentType: arquivo.type || "application/octet-stream", docType: tipos[i] };
        let erro: string | undefined;
        if (item.tipo === "assessoria" && parte !== "licitacao") {
          const res = await fetch("/api/assessoria/documentos/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...comum, assessoriaId: item.id, parecerId: parte === "parecer" ? sub?.id : undefined }),
          });
          // res.ok ANTES do corpo: um 413/504 de fora da nossa rota não é JSON (ver AssessoriaDocumentosTab).
          let corpo: { error?: string } | null = null;
          try {
            corpo = await res.json();
          } catch {
            corpo = null;
          }
          if (!res.ok) erro = corpo?.error || `Erro ao enviar (HTTP ${res.status}).`;
        } else {
          const r = await finalizeAttachmentUpload({
            ...comum,
            caseId: item.tipo === "processo" || item.tipo === "caso" ? item.id : undefined,
            attendanceId: item.tipo === "atendimento" ? item.id : undefined,
            licitacaoId: item.tipo === "assessoria" && parte === "licitacao" ? sub?.id : undefined,
          });
          erro = r.error;
        }
        if (erro) falhas.push(`${arquivo.name}: ${erro}`);
      } catch (e) {
        falhas.push(`${arquivo.name}: ${e instanceof Error ? e.message : "falha de conexão"}`);
      }
    }
    setEnviando(null);
    setEtapa(null);
    const certos = total - falhas.length;
    const href = hrefDoDestino(item);
    if (falhas.length === 0) {
      setResultado({ tipo: "ok", texto: `${certos === 1 ? "1 documento anexado" : `${certos} documentos anexados`} em ${ondeLegivel}`, href });
    } else if (certos > 0) {
      setResultado({ tipo: "parcial", texto: `${certos} de ${total} anexados em ${ondeLegivel}. Não foi: ${falhas.join(" · ")}`, href });
    } else {
      setResultado({ tipo: "erro", texto: `Nada foi anexado. ${falhas.join(" · ")}` });
    }
    router.refresh();
    caixa.current?.focus();
  }

  if (!visivel) return null;

  const tom =
    resultado?.tipo === "ok"
      ? "border-solid border-concluido bg-concluido-bg"
      : resultado
        ? "border-solid border-urgente bg-urgente-bg"
        : sobreAlvo
          ? "border-solid border-acao bg-acao-suave"
          : "border-dashed border-regua-forte hover:border-marca-tx hover:bg-acao-suave";

  return (
    <div className="relative my-[5px] ml-6 mr-3 flex min-w-[180px] flex-1" data-caixa-de-anexos="">
      <input
        ref={entrada}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const lista = Array.from(e.target.files ?? []);
          e.target.value = "";
          comecar(lista);
        }}
      />
      <button
        ref={caixa}
        type="button"
        onClick={() => entrada.current?.click()}
        onDragOver={sobre}
        onDragLeave={() => setSobreAlvo(false)}
        onDrop={soltar}
        aria-describedby="caixa-de-anexos-dica"
        className={`flex h-full w-full min-w-0 items-center gap-2.5 border-[1.5px] px-3.5 text-left text-sm text-tx-2 transition-colors ${tom}`}
      >
        {resultado?.tipo === "ok" ? (
          <Check size={16} aria-hidden="true" className="shrink-0 text-concluido" />
        ) : resultado ? (
          <AlertTriangle size={16} aria-hidden="true" className="shrink-0 text-urgente" />
        ) : (
          <Paperclip size={16} aria-hidden="true" className="shrink-0 text-marca-tx" />
        )}
        {resultado ? (
          <span className={`min-w-0 truncate text-tx ${resultado.href ? "pr-12" : ""}`} role="status">
            {resultado.texto}
          </span>
        ) : (
          <>
            <span className="shrink-0 font-semibold text-tx">{sobreAlvo ? "Solte para anexar" : "Anexar documentos"}</span>
            <span id="caixa-de-anexos-dica" className="hidden min-w-0 truncate lg:inline">
              arraste para cá ou clique para escolher no computador
            </span>
            <span className="ml-auto hidden shrink-0 text-etiqueta text-tx-3 xl:inline">
              <kbd className="border border-regua-forte px-1 font-sans">Ctrl</kbd> + <kbd className="border border-regua-forte px-1 font-sans">U</kbd>
            </span>
          </>
        )}
      </button>
      {resultado?.href && (
        <Link href={resultado.href} className="absolute right-2 top-1/2 -translate-y-1/2 px-2 text-sm font-semibold text-marca-tx underline underline-offset-2">
          abrir
        </Link>
      )}

      {/* O ALVO GRANDE: aparece enquanto há arquivo sendo arrastado em qualquer lugar da janela. */}
      {arrastando && (
        <div
          onDragOver={sobre}
          onDragLeave={() => setSobreAlvo(false)}
          onDrop={soltar}
          className={`absolute inset-x-0 top-[calc(100%+6px)] z-40 grid h-36 place-items-center border-2 border-dashed bg-sf text-center shadow-pop ${sobreAlvo ? "border-acao bg-acao-suave" : "border-acao"}`}
        >
          <div className="pointer-events-none">
            <p className="text-corpo font-semibold text-tx">Solte para anexar</p>
            <p className="mt-1 text-sm text-tx-2">Em seguida você escolhe onde e o tipo de cada documento.</p>
          </div>
        </div>
      )}

      {etapa === "confirmar" && (
        <ModalShell size="compacto" title={arquivos.length === 1 ? "Anexar este documento?" : `Anexar estes ${arquivos.length} documentos?`} subtitle="Você escolhe a seguir onde cada um fica e de que tipo é." onClose={fechar}>
          <ul className="flex flex-col gap-1 overflow-y-auto px-5 py-4">
            {arquivos.map((a, i) => (
              <li key={`${a.name}-${i}`} className="flex items-center gap-2 bg-sf-apoio px-3 py-2 text-sm text-tx">
                <FileText size={15} aria-hidden="true" className="shrink-0 text-tx-3" />
                <span className="min-w-0 flex-1 truncate">{a.name}</span>
                <span className="shrink-0 text-etiqueta text-tx-3">{tamanho(a.size)}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-end gap-2 border-t border-regua px-5 py-3">
            <button type="button" onClick={fechar} className="min-h-10 border border-regua-forte px-4 text-sm font-semibold text-tx hover:bg-sf-apoio">
              Não, cancelar
            </button>
            <button type="button" onClick={() => setEtapa("assistente")} className="min-h-10 bg-acao px-4 text-sm font-semibold text-acao-tx hover:bg-acao-hover">
              Sim, escolher onde
            </button>
          </div>
        </ModalShell>
      )}

      {etapa === "assistente" && (
        <ModalShell
          size="medio"
          title={arquivos.length === 1 ? `Anexar “${arquivos[0].name}”` : `Anexar ${arquivos.length} documentos`}
          subtitle={["Onde estes documentos devem ficar?", "Qual exatamente?", "De que tipo é cada documento? A sugestão vem do nome do arquivo.", "Confira antes de anexar."][passo]}
          onClose={fechar}
        >
          <ol className="flex gap-0.5 px-5 pt-3" aria-label="Passos">
            {PASSOS.map((p, i) => (
              <li
                key={p}
                aria-current={i === passo ? "step" : undefined}
                className={`flex-1 truncate border-b-2 bg-sf-apoio px-2 pb-1 pt-1.5 text-etiqueta font-semibold ${
                  i === passo ? "border-acao text-tx" : i < passo ? "border-regua-forte text-tx-2" : "border-transparent text-tx-3"
                }`}
              >
                {i + 1} · {p}
              </li>
            ))}
          </ol>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
            {passo === 0 && (
              <PassoOnde
                daTela={daTela}
                permitidos={permitidos}
                destino={destino}
                aoEscolherDaTela={escolherDaTela}
                aoEscolher={(t) => {
                  setDestino(t);
                  setItem(null);
                  setParte(null);
                  setSub(null);
                }}
              />
            )}
            {passo === 1 && destino && (
              <PassoQual
                destino={destino}
                item={item}
                parte={parte}
                sub={sub}
                aoEscolherItem={(i) => {
                  setItem(i);
                  setParte(destino === "assessoria" ? null : parte);
                  setSub(null);
                }}
                aoEscolherParte={(p) => {
                  setParte(p);
                  setSub(null);
                }}
                aoEscolherSub={setSub}
              />
            )}
            {passo === 2 && (
              <>
                <p className="flex items-center gap-2 border border-regua bg-sf-fundo px-3 py-2.5 text-sm text-tx">
                  <Pin size={15} aria-hidden="true" className="shrink-0 text-tx-3" />
                  <span className="min-w-0">
                    Vai para <b className="font-semibold">{ondeLegivel}</b>
                  </span>
                </p>
                <ul className="flex flex-col gap-2">
                  {arquivos.map((a, i) => (
                    <li key={`${a.name}-${i}`} className="grid gap-2 bg-sf-apoio px-3 py-2.5 md:grid-cols-[minmax(0,1fr)_minmax(0,280px)] md:items-center">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-tx">{a.name}</p>
                        {sugeridos[i] ? (
                          <p className="text-etiqueta text-concluido">tipo sugerido pelo nome do arquivo</p>
                        ) : tipos[i] === "OUTRO" ? (
                          <p className="text-etiqueta text-aviso">sem sugestão: confira o tipo</p>
                        ) : null}
                      </div>
                      <DocumentTypeSelect
                        value={tipos[i]}
                        onChange={(v) => {
                          setTipos((t) => t.map((x, j) => (j === i ? v : x)));
                          setSugeridos((s) => s.map((x, j) => (j === i ? false : x)));
                        }}
                        excludeKeys={item?.tipo === "assessoria" && parte !== "licitacao" ? ["PARECER"] : undefined}
                        className="h-10 w-full border border-[var(--campo-borda)] px-3 text-sm text-tx"
                        allowCreate
                      />
                    </li>
                  ))}
                </ul>
              </>
            )}
            {passo === 3 && item && (
              <>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                  <dt className="text-tx-3">Onde</dt>
                  <dd className="font-semibold text-tx">{ondeLegivel}</dd>
                  <dt className="text-tx-3">Arquivos</dt>
                  <dd className="text-tx">{arquivos.length}</dd>
                </dl>
                <ul className="flex flex-col gap-1">
                  {arquivos.map((a, i) => (
                    <li key={`${a.name}-${i}`} className="flex items-center gap-2 bg-sf-apoio px-3 py-2 text-sm text-tx">
                      <FileText size={15} aria-hidden="true" className="shrink-0 text-tx-3" />
                      <span className="min-w-0 flex-1 truncate">{a.name}</span>
                      <TipoLegivel chave={tipos[i]} />
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-tx-2">
                  Cada arquivo vai para o Drive do escritório, na pasta do tipo, como acontece ao anexar pela tela do próprio item.
                </p>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 border-t border-regua px-5 py-3">
            <button type="button" onClick={fechar} disabled={Boolean(enviando)} className="mr-auto min-h-10 border border-regua-forte px-4 text-sm font-semibold text-tx hover:bg-sf-apoio disabled:opacity-50">
              Cancelar
            </button>
            {passo > 0 && (
              <button type="button" onClick={voltar} disabled={Boolean(enviando)} className="min-h-10 border border-regua-forte px-4 text-sm font-semibold text-tx hover:bg-sf-apoio disabled:opacity-50">
                Voltar
              </button>
            )}
            <button
              type="button"
              onClick={avancar}
              disabled={!podeAvancar || Boolean(enviando)}
              className="inline-flex min-h-10 items-center gap-2 bg-acao px-4 text-sm font-semibold text-acao-tx hover:bg-acao-hover disabled:opacity-50"
            >
              {enviando && <Loader2 size={15} aria-hidden="true" className="animate-spin" />}
              {enviando
                ? `Enviando ${enviando.atual} de ${enviando.total}…`
                : passo === 3
                  ? arquivos.length === 1
                    ? "Anexar documento"
                    : `Anexar ${arquivos.length} documentos`
                  : "Continuar"}
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

function TipoLegivel({ chave }: { chave: string }) {
  return <span className="max-w-[45%] shrink-0 truncate text-etiqueta font-semibold text-tx-2">{getDocumentTypeLabel(chave)}</span>;
}

function PassoOnde({
  daTela,
  permitidos,
  destino,
  aoEscolherDaTela,
  aoEscolher,
}: {
  daTela: ItemDeDestino | null;
  permitidos: TipoDeDestino[];
  destino: TipoDeDestino | null;
  aoEscolherDaTela: () => void;
  aoEscolher: (t: TipoDeDestino) => void;
}) {
  return (
    <>
      {daTela && (
        <>
          <button type="button" onClick={aoEscolherDaTela} className="flex w-full items-center gap-3 border-2 border-acao bg-acao-suave px-3.5 py-3 text-left text-tx">
            <Pin size={20} aria-hidden="true" className="shrink-0 text-marca-tx" />
            <span className="min-w-0">
              <span className="block truncate font-semibold">
                Anexar aqui: {DESTINOS.find((d) => d.tipo === daTela.tipo)?.nome} {daTela.marca && daTela.tipo !== "assessoria" ? daTela.marca : daTela.titulo}
              </span>
              <span className="block truncate text-sm text-tx-2">{daTela.tipo === "assessoria" ? "Documentos da empresa" : daTela.titulo} · a tela que você está vendo</span>
            </span>
          </button>
          <p className="text-etiqueta font-semibold uppercase tracking-[.08em] text-tx-3">Ou escolha outro lugar</p>
        </>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="group" aria-label="Destino">
        {DESTINOS.filter((d) => permitidos.includes(d.tipo)).map((d) => {
          const Icone = ICONE[d.tipo];
          const aceso = destino === d.tipo;
          return (
            <button
              key={d.tipo}
              type="button"
              aria-pressed={aceso}
              onClick={() => aoEscolher(d.tipo)}
              className={`grid min-h-20 content-start gap-1 px-3 py-3 text-left text-tx ${aceso ? "border-2 border-acao bg-acao-suave" : "border border-regua-forte hover:bg-sf-apoio"}`}
            >
              <Icone size={19} aria-hidden="true" className={aceso ? "text-marca-tx" : "text-tx-2"} />
              <span className="text-sm font-semibold">{d.nome}</span>
              <span className="text-etiqueta text-tx-3">{d.apoio}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function PassoQual({
  destino,
  item,
  parte,
  sub,
  aoEscolherItem,
  aoEscolherParte,
  aoEscolherSub,
}: {
  destino: TipoDeDestino;
  item: ItemDeDestino | null;
  parte: ParteDaAssessoria | null;
  sub: Sub;
  aoEscolherItem: (i: ItemDeDestino) => void;
  aoEscolherParte: (p: ParteDaAssessoria) => void;
  aoEscolherSub: (s: Sub) => void;
}) {
  const [busca, setBusca] = useState("");
  const [itens, setItens] = useState<ItemDeDestino[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [partes, setPartes] = useState<{ pareceres: { id: string; nome: string }[]; licitacoes: { id: string; nome: string; status: string }[] } | null>(null);

  // A busca espera a pessoa parar de digitar (250 ms) e descarta resposta velha.
  useEffect(() => {
    let vivo = true;
    const t = setTimeout(() => {
      buscarDestinos(destino, busca)
        .then((r) => {
          if (!vivo) return;
          setItens(r.itens);
          setErro(r.error ?? null);
        })
        .catch(() => vivo && setErro("Não foi possível buscar agora. Tente de novo."));
    }, busca ? 250 : 0);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [destino, busca]);

  useEffect(() => {
    if (destino !== "assessoria" || !item) return;
    let vivo = true;
    partesDaAssessoria(item.id).then((p) => vivo && setPartes(p));
    return () => {
      vivo = false;
    };
  }, [destino, item]);

  const nome = DESTINOS.find((d) => d.tipo === destino)?.nome.toLowerCase() ?? "";
  const subs = parte === "parecer" ? partes?.pareceres : parte === "licitacao" ? partes?.licitacoes : undefined;

  return (
    <>
      <label className="flex h-10 items-center gap-2 border border-[var(--campo-borda)] bg-sf px-3 focus-within:ring-2 focus-within:ring-[var(--foco)]">
        <Search size={15} aria-hidden="true" className="shrink-0 text-tx-3" />
        <span className="sr-only">Buscar {nome}</span>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder={destino === "processo" ? "Número, título ou cliente" : destino === "assessoria" ? "Nome da empresa" : "Nome ou assunto"}
          className="min-w-0 flex-1 bg-transparent text-sm text-tx placeholder:text-tx-3 focus:outline-none"
          autoComplete="off"
        />
      </label>
      <p className="text-etiqueta font-semibold uppercase tracking-[.08em] text-tx-3">{busca ? "Resultados" : "Mais recentes"}</p>
      {erro && <p className="text-sm text-urgente">{erro}</p>}
      {itens === null ? (
        <p className="text-sm text-tx-3">Carregando…</p>
      ) : itens.length === 0 ? (
        <p className="text-sm text-tx-2">{busca ? `Nada encontrado para “${busca}”.` : `Nenhum ${nome} cadastrado ainda.`}</p>
      ) : (
        <ListaDeEscolha
          itens={itens.map((i) => ({ id: i.id, titulo: i.titulo, apoio: i.apoio, marca: i.marca }))}
          escolhido={item?.id ?? null}
          aoEscolher={(id) => {
            const i = itens.find((x) => x.id === id);
            if (i) aoEscolherItem(i);
          }}
        />
      )}
      {destino === "assessoria" && item && (
        <>
          <p className="text-etiqueta font-semibold uppercase tracking-[.08em] text-tx-3">Em que parte da assessoria?</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="group" aria-label="Parte da assessoria">
            {PARTES_DA_ASSESSORIA.map((p) => (
              <button
                key={p.parte}
                type="button"
                aria-pressed={parte === p.parte}
                onClick={() => aoEscolherParte(p.parte)}
                className={`grid content-start gap-1 px-3 py-2.5 text-left text-tx ${parte === p.parte ? "border-2 border-acao bg-acao-suave" : "border border-regua-forte hover:bg-sf-apoio"}`}
              >
                <span className="text-sm font-semibold">{p.nome}</span>
                <span className="text-etiqueta text-tx-3">{p.apoio}</span>
              </button>
            ))}
          </div>
          {(parte === "parecer" || parte === "licitacao") &&
            (subs === undefined ? (
              <p className="text-sm text-tx-3">Carregando…</p>
            ) : subs.length === 0 ? (
              <p className="text-sm text-tx-2">{parte === "parecer" ? "Esta assessoria ainda não tem parecer cadastrado." : "Esta assessoria ainda não tem licitação cadastrada."}</p>
            ) : (
              <ListaDeEscolha
                itens={subs.map((s) => ({ id: s.id, titulo: s.nome, apoio: "", marca: "status" in s ? String(s.status).replace(/_/g, " ").toLowerCase() : "" }))}
                escolhido={sub?.id ?? null}
                aoEscolher={(id) => {
                  const s = subs.find((x) => x.id === id);
                  if (s) aoEscolherSub({ id: s.id, nome: s.nome });
                }}
              />
            ))}
        </>
      )}
    </>
  );
}

function ListaDeEscolha({ itens, escolhido, aoEscolher }: { itens: { id: string; titulo: string; apoio: string; marca: string }[]; escolhido: string | null; aoEscolher: (id: string) => void }) {
  return (
    <ul className="border border-regua">
      {itens.map((i, n) => (
        <li key={i.id} className={n > 0 ? "border-t border-regua" : ""}>
          <button
            type="button"
            aria-pressed={escolhido === i.id}
            onClick={() => aoEscolher(i.id)}
            className={`grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-3 py-2.5 text-left ${escolhido === i.id ? "bg-acao-suave" : "hover:bg-sf-apoio"}`}
          >
            <span className="truncate text-sm font-semibold text-tx">{i.titulo}</span>
            <span className="row-span-2 self-center text-etiqueta tabular-nums text-tx-2">{i.marca}</span>
            {i.apoio && <span className="truncate text-etiqueta text-tx-3">{i.apoio}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}
