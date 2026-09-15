"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, ArrowRight, ChevronLeft, AlertTriangle, FilePlus, Link2, Trash2, CheckCircle2, FileQuestion, Undo2, FileText, Info } from "lucide-react";
import ModalShell from "@/components/ModalShell";
import DocumentTypeSelect from "@/components/DocumentTypeSelect";
import { getDocumentTypeLabel } from "@/lib/documentTypes";
import {
  planoReconciliacaoEntidade,
  planoReconciliacaoEscritorio,
  apontarDocumentoParaNovoArquivo,
  restaurarDocumentoAntigo,
  adicionarComoAnexo,
  desvincularPendenciaSumida,
  type ReconciliationScope,
  type EntidadePlano,
  type PendenciaSubstituicao,
  type PendenciaNovo,
  type PendenciaSumido,
  type RecordKind,
  type DriveFileRef,
} from "@/lib/actions/attachmentReconciliation";

// Card padrão de arquivo (usado na comparação e nas telas de decisão) — mesmo vocabulário visual
// do resto do produto (bg-sf-apoio, borda em regua/acao conforme o papel do card).
function CardArquivo({ nome, legenda, badge, destaque }: { nome: string; legenda: string; badge?: React.ReactNode; destaque?: boolean }) {
  return (
    <div className={`flex-1 min-w-0 border rounded-lg p-3 bg-sf-apoio ${destaque ? "border-acao/50" : "border-regua"}`}>
      <div className="flex items-start gap-2">
        <FileText size={18} className="shrink-0 text-tx-2 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-tx break-words">{nome}</p>
          <p className="text-xs text-tx-2 mt-0.5">{legenda}</p>
          {badge && <div className="mt-1.5">{badge}</div>}
        </div>
      </div>
    </div>
  );
}

function BadgeLixeira({ trashed }: { trashed: "lixeira" | "definitivo" | null }) {
  if (trashed === "lixeira") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-sm bg-aviso-bg text-aviso">
        <Trash2 size={11} /> Na lixeira do Drive
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-sm bg-urgente-bg text-urgente">
      Excluído em definitivo
    </span>
  );
}

type PopupConfig = {
  titulo: string;
  corpo: string;
  confirmarLabel: string;
  extraLabel?: string;
  perigoso?: boolean;
  onConfirmar: () => void;
  onExtra?: () => void;
};

type Alvo = { entIdx: number; pendIdx: number };
type Detalhe = ({ estagio: "principal" } & Alvo) | ({ estagio: "escolher-existente" } & Alvo) | ({ estagio: "apontar-outro" } & Alvo);

// Modal compartilhado da reconciliação de anexos do Drive — usado tanto pelo botão de escopo
// único (dentro de Processo/Caso/Atendimento/Licitação/Demanda/Assessoria, ver
// ReconciliarAnexosDriveButton.tsx) quanto pelo botão "geral" de Gestão → Conexões (scope
// "GLOBAL", ver ReconciliarAnexosDriveGlobalButton.tsx): os dois casos viram a MESMA forma de
// dado (`entidades: EntidadePlano[]` — um item só quando é uma pasta específica, vários quando é
// o escritório inteiro agrupado por entidade), então toda a tela de resultado/resolução é única.
export default function DriveReconciliationModal({ scope, onClose }: { scope: ReconciliationScope | "GLOBAL"; onClose: () => void }) {
  const router = useRouter();
  const [entidades, setEntidades] = useState<EntidadePlano[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [popup, setPopup] = useState<PopupConfig | null>(null);
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
  const [tipoEscolhido, setTipoEscolhido] = useState("");

  async function carregar() {
    setCarregando(true);
    setErro(null);
    setDetalhe(null);
    setTipoEscolhido("");
    if (scope === "GLOBAL") {
      const res = await planoReconciliacaoEscritorio();
      if ("error" in res) setErro(res.error);
      else setEntidades(res.entidades);
    } else {
      const res = await planoReconciliacaoEntidade(scope);
      if ("error" in res) setErro(res.error);
      else setEntidades([res]);
    }
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function mostrarToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast((atual) => (atual === msg ? null : atual)), 4500);
  }

  // Depois de QUALQUER resolução: atualiza a página de baixo (o anexo mudou de verdade) e refaz a
  // varredura desta janela — mais simples e mais confiável que tentar remover só o item resolvido
  // da lista local, e o custo (uma nova varredura da mesma pasta) é aceitável para uma ação de
  // manutenção pontual, não um fluxo de uso frequente.
  async function aposResolver(msg: string) {
    mostrarToast(msg);
    router.refresh();
    await carregar();
  }

  const totalPendencias = entidades?.reduce((n, e) => n + e.pendencias.length, 0) ?? 0;
  const entidadeAtual = detalhe ? entidades?.[detalhe.entIdx] : undefined;
  const pendenciaAtual = detalhe && entidadeAtual ? entidadeAtual.pendencias[detalhe.pendIdx] : undefined;

  function abrir(entIdx: number, pendIdx: number) {
    setTipoEscolhido("");
    setDetalhe({ estagio: "principal", entIdx, pendIdx });
  }
  function voltarALista() {
    setDetalhe(null);
  }

  async function onSubstituirManterNovo(ent: EntidadePlano, p: PendenciaSubstituicao) {
    setPending(true);
    const res = await apontarDocumentoParaNovoArquivo(ent.scope, p.recordKind, p.recordId, p.novo);
    setPending(false);
    setPopup(null);
    if (res.error) return mostrarToast(res.error);
    await aposResolver(`Substituído. O anexo agora aponta para "${p.novo.name}"; o arquivo antigo foi excluído em definitivo do Drive.`);
  }

  function onVoltarAnterior(ent: EntidadePlano, p: PendenciaSubstituicao) {
    if (p.antigo.trashed === "definitivo") {
      setPopup({
        titulo: "Não é possível recuperar",
        corpo: `"${p.antigo.name}" foi removido em definitivo do Drive (não só movido pra Lixeira) — não há como restaurá-lo. A única opção é manter o documento novo.`,
        confirmarLabel: "Manter o novo mesmo assim",
        onConfirmar: () => onSubstituirManterNovo(ent, p),
      });
      return;
    }
    setPopup({
      titulo: "Restaurar o documento anterior?",
      corpo: `Isso vai restaurar "${p.antigo.name}" da Lixeira do Drive e excluir em definitivo "${p.novo.name}", o arquivo anexado por engano. Não é possível desfazer.`,
      confirmarLabel: "Confirmar e restaurar",
      perigoso: true,
      onConfirmar: async () => {
        setPending(true);
        const res = await restaurarDocumentoAntigo(ent.scope, p.recordKind, p.recordId, p.novo.fileId);
        setPending(false);
        setPopup(null);
        if (res.error) return mostrarToast(res.error);
        await aposResolver(`Restaurado. O anexo voltou a apontar para "${p.antigo.name}".`);
      },
    });
  }

  async function onAdicionarComoAnexo(ent: EntidadePlano, p: PendenciaNovo, tipo: string) {
    setPending(true);
    const res = await adicionarComoAnexo(ent.scope, p.arquivo, tipo);
    setPending(false);
    setPopup(null);
    if (res.error) return mostrarToast(res.error);
    await aposResolver(`Adicionado como novo anexo, tipo "${getDocumentTypeLabel(tipo)}".`);
  }

  function onConfirmarTipoEscolhido(ent: EntidadePlano, p: PendenciaNovo, tipo: string) {
    if (p.tipoSugeridoKey && p.tipoSugeridoKey !== tipo) {
      setPopup({
        titulo: "Possível incompatibilidade de tipo",
        corpo: p.subpasta
          ? `Este arquivo está na pasta "${p.subpasta}" do Drive, mas você selecionou o tipo "${getDocumentTypeLabel(tipo)}". Isso deixa a organização inconsistente.`
          : `Os outros documentos já cadastrados aqui são do tipo "${p.tipoSugeridoLabel}". Você selecionou "${getDocumentTypeLabel(tipo)}" — pode ser proposital, mas vale confirmar.`,
        confirmarLabel: `Manter "${getDocumentTypeLabel(tipo)}" mesmo assim`,
        extraLabel: `Usar "${p.tipoSugeridoLabel}" (sugerido)`,
        onConfirmar: () => onAdicionarComoAnexo(ent, p, tipo),
        onExtra: () => onAdicionarComoAnexo(ent, p, p.tipoSugeridoKey!),
      });
      return;
    }
    onAdicionarComoAnexo(ent, p, tipo);
  }

  function onEscolherSubstituirExistente(ent: EntidadePlano, p: PendenciaNovo, existente: { recordKind: RecordKind; recordId: string; name: string }) {
    setPopup({
      titulo: "Substituir documento existente?",
      corpo: `Isso vai excluir do Drive o arquivo atual de "${existente.name}" e usar "${p.arquivo.name}" em seu lugar, mantendo o mesmo registro. Não é possível desfazer.`,
      confirmarLabel: "Confirmar substituição",
      perigoso: true,
      onConfirmar: async () => {
        setPending(true);
        const res = await apontarDocumentoParaNovoArquivo(ent.scope, existente.recordKind, existente.recordId, p.arquivo);
        setPending(false);
        setPopup(null);
        if (res.error) return mostrarToast(res.error);
        await aposResolver(`"${existente.name}" agora aponta para "${p.arquivo.name}".`);
      },
    });
  }

  async function onDesvincular(p: PendenciaSumido, confirmarProtocolado?: boolean) {
    setPending(true);
    const res = await desvincularPendenciaSumida(p.recordKind, p.recordId, confirmarProtocolado);
    setPending(false);
    if (res.precisaConfirmar) {
      const lista = (res.protocolos ?? []).map((x) => `• ${x}`).join("\n");
      setPopup({
        titulo: "Documento em protocolo já concluído",
        corpo: `Este documento faz parte de protocolo já concluído:\n\n${lista}\n\nO protocolo continua no histórico com o nome do documento, mas o arquivo deixa de existir. Excluir mesmo assim?`,
        confirmarLabel: "Excluir mesmo assim",
        perigoso: true,
        onConfirmar: () => onDesvincular(p, true),
      });
      return;
    }
    setPopup(null);
    if (res.error) return mostrarToast(res.error);
    await aposResolver("Anexo desvinculado.");
  }

  function onConfirmarApontarOutro(ent: EntidadePlano, p: PendenciaSumido, arquivo: DriveFileRef) {
    setPopup({
      titulo: "Apontar para este arquivo?",
      corpo: `"${p.nome}" passa a apontar para "${arquivo.name}". Não é possível desfazer.`,
      confirmarLabel: "Confirmar",
      perigoso: true,
      onConfirmar: async () => {
        setPending(true);
        const res = await apontarDocumentoParaNovoArquivo(ent.scope, p.recordKind, p.recordId, arquivo);
        setPending(false);
        setPopup(null);
        if (res.error) return mostrarToast(res.error);
        await aposResolver(`Anexo agora aponta para "${arquivo.name}".`);
      },
    });
  }

  const subtitulo = scope === "GLOBAL" ? "Escritório inteiro — todas as pastas com anexo já cadastrado" : (entidades?.[0]?.entidadeLabel ?? "");

  return (
    <ModalShell size="cheio" title="Reorganizar anexos do Drive" subtitle={subtitulo} onClose={onClose}>
      <div className="flex-1 min-h-0 flex flex-col">
        {carregando && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16">
            <RefreshCw size={28} className="text-acao animate-spin" />
            <p className="text-sm text-tx-2">Vasculhando {scope === "GLOBAL" ? "as pastas do escritório" : "a pasta"} no Drive…</p>
          </div>
        )}

        {!carregando && erro && (
          <div className="flex-1 flex items-center justify-center px-6">
            <p className="text-sm font-medium text-urgente bg-urgente-bg border border-urgente/20 rounded-md px-4 py-3 max-w-md text-center">{erro}</p>
          </div>
        )}

        {!carregando && !erro && entidades && !detalhe && (
          <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 space-y-5">
            {totalPendencias === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                <CheckCircle2 size={36} className="text-concluido" />
                <p className="text-sm font-semibold text-tx">
                  {scope === "GLOBAL" ? "Tudo reconciliado — nenhuma pendência no escritório." : "Tudo reconciliado nesta pasta."}
                </p>
                <p className="text-xs text-tx-2">O que está no Drive bate com o que está cadastrado no Lúmen.</p>
              </div>
            ) : (
              <>
                <p className="text-xs text-tx-2">
                  {totalPendencias} pendência{totalPendencias > 1 ? "s" : ""} encontrada{totalPendencias > 1 ? "s" : ""}
                  {scope === "GLOBAL" ? ` em ${entidades.filter((e) => e.pendencias.length > 0).length} pasta(s)` : ""}.
                </p>
                {entidades.map(
                  (ent, entIdx) =>
                    ent.pendencias.length > 0 && (
                      <div key={entIdx} className="space-y-3">
                        {scope === "GLOBAL" && <p className="text-xs font-bold text-tx border-b border-regua pb-1">{ent.entidadeLabel}</p>}
                        {(
                          [
                            { tipo: "SUBSTITUICAO" as const, titulo: "Prováveis substituições — nomes parecidos", icone: RefreshCw, cor: "urgente" },
                            { tipo: "NOVO" as const, titulo: "Documentos novos sem correspondência clara", icone: FilePlus, cor: "aviso" },
                            { tipo: "SUMIDO" as const, titulo: "Anexos com arquivo sumido do Drive", icone: FileQuestion, cor: "tx-2" },
                          ] as const
                        ).map((grupo) => {
                          const itens = ent.pendencias
                            .map((p, pendIdx) => ({ p, pendIdx }))
                            .filter(({ p }) => p.tipo === grupo.tipo);
                          if (itens.length === 0) return null;
                          const Icone = grupo.icone;
                          return (
                            <div key={grupo.tipo}>
                              <p className={`text-[11px] font-bold uppercase tracking-wide flex items-center gap-1.5 mb-2 ${grupo.cor === "urgente" ? "text-urgente" : grupo.cor === "aviso" ? "text-aviso" : "text-tx-2"}`}>
                                <Icone size={13} /> {grupo.titulo} ({itens.length})
                              </p>
                              <div className="border border-regua rounded-lg divide-y divide-regua overflow-hidden">
                                {itens.map(({ p, pendIdx }) => {
                                  let titulo = "";
                                  let extra: React.ReactNode = null;
                                  if (p.tipo === "SUBSTITUICAO") {
                                    titulo = `${p.antigo.name}  →  ${p.novo.name}`;
                                    extra = (
                                      <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-sm bg-urgente-bg text-urgente">
                                        {p.similaridade}% parecido
                                      </span>
                                    );
                                  } else if (p.tipo === "NOVO") {
                                    titulo = p.arquivo.name;
                                  } else {
                                    titulo = p.nome;
                                  }
                                  return (
                                    <button
                                      key={pendIdx}
                                      onClick={() => abrir(entIdx, pendIdx)}
                                      className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-sf-apoio transition-colors text-left"
                                    >
                                      <Icone size={15} className="shrink-0 text-tx-2" />
                                      <span className="text-xs font-medium text-tx truncate flex-1">{titulo}</span>
                                      {p.subpasta && (
                                        <span className="shrink-0 text-[9.5px] font-semibold px-1.5 py-0.5 rounded-full bg-sf-apoio text-tx-2">{p.subpasta}</span>
                                      )}
                                      {extra}
                                      <span className="shrink-0 text-[11px] font-semibold text-acao">Resolver</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )
                )}
              </>
            )}
          </div>
        )}

        {!carregando && !erro && entidadeAtual && pendenciaAtual && detalhe && (
          <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 space-y-4">
            <button onClick={voltarALista} className="inline-flex items-center gap-1 text-xs font-semibold text-tx-2 hover:text-tx">
              <ChevronLeft size={14} /> Voltar à lista
            </button>

            {pendenciaAtual.tipo === "SUBSTITUICAO" && detalhe.estagio === "principal" && (
              <>
                <p className="text-xs text-tx-2">
                  Um arquivo sumiu desta pasta e outro, de nome parecido, apareceu sem vínculo. Provavelmente é o mesmo documento, atualizado.
                </p>
                <div className="flex flex-col sm:flex-row items-stretch gap-3">
                  <CardArquivo nome={pendenciaAtual.antigo.name} legenda="Anexo atual" badge={<BadgeLixeira trashed={pendenciaAtual.antigo.trashed} />} />
                  <div className="flex sm:flex-col items-center justify-center text-tx-3 px-1">
                    <ArrowRight size={18} />
                  </div>
                  <CardArquivo
                    nome={pendenciaAtual.novo.name}
                    legenda="Encontrado no Drive, sem vínculo"
                    badge={
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-sm bg-concluido-bg text-concluido">Novo</span>
                    }
                    destaque
                  />
                </div>
                <p className="text-xs text-center text-tx-2">
                  <span className="font-bold text-tx">{pendenciaAtual.similaridade}% de semelhança no nome</span>
                </p>
                <div className="flex flex-col sm:flex-row gap-2 pt-2">
                  <button
                    disabled={pending}
                    onClick={() => onSubstituirManterNovo(entidadeAtual, pendenciaAtual)}
                    className="flex-1 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold py-2.5 rounded-md transition-colors disabled:opacity-50"
                  >
                    Substituir (manter o novo)
                  </button>
                  <button
                    disabled={pending}
                    onClick={() => onVoltarAnterior(entidadeAtual, pendenciaAtual)}
                    className="flex-1 border border-regua-forte hover:bg-sf-apoio text-tx text-sm font-semibold py-2.5 rounded-md transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <Undo2 size={15} /> Voltar ao documento anterior
                  </button>
                </div>
              </>
            )}

            {pendenciaAtual.tipo === "NOVO" && detalhe.estagio === "principal" && (
              <>
                <CardArquivo
                  nome={pendenciaAtual.arquivo.name}
                  legenda={pendenciaAtual.subpasta ? `Encontrado na pasta "${pendenciaAtual.subpasta}"` : "Encontrado na pasta, sem vínculo"}
                  badge={<span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-sm bg-concluido-bg text-concluido">Novo, sem vínculo</span>}
                  destaque
                />
                {pendenciaAtual.melhorSemelhanca > 0 && (
                  <p className="text-[11px] text-tx-3">
                    Maior semelhança encontrada com um anexo já existente: {pendenciaAtual.melhorSemelhanca}% — abaixo do limite de 60%, por isso foi tratado como
                    documento novo.
                  </p>
                )}
                <p className="text-sm font-semibold text-tx">O que você quer fazer com este arquivo?</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="border border-regua rounded-lg p-3 space-y-2">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-tx">
                      <FilePlus size={16} className="text-acao" /> Adicionar como novo documento
                    </p>
                    <DocumentTypeSelect
                      value={tipoEscolhido}
                      onChange={setTipoEscolhido}
                      className="w-full text-sm border border-regua bg-sf text-tx px-2.5 py-1.5 rounded-md"
                      allowCreate
                    />
                    <button
                      disabled={pending || !tipoEscolhido}
                      onClick={() => onConfirmarTipoEscolhido(entidadeAtual, pendenciaAtual, tipoEscolhido)}
                      className="w-full bg-acao hover:bg-acao-hover text-acao-tx text-xs font-semibold py-2 rounded-md disabled:opacity-40 transition-colors"
                    >
                      Confirmar
                    </button>
                  </div>
                  <button
                    onClick={() => setDetalhe({ estagio: "escolher-existente", entIdx: detalhe.entIdx, pendIdx: detalhe.pendIdx })}
                    className="text-left border border-regua rounded-lg p-3 hover:border-acao/50 hover:bg-sf-apoio transition-colors h-fit"
                  >
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-tx">
                      <RefreshCw size={15} className="text-acao" /> Substituir um documento existente
                    </span>
                    <span className="text-xs text-tx-2 block mt-1">Escolher, de uma lista, qual anexo já cadastrado este arquivo deve substituir.</span>
                  </button>
                </div>
              </>
            )}

            {pendenciaAtual.tipo === "NOVO" && detalhe.estagio === "escolher-existente" && (
              <>
                <p className="text-xs text-tx-2">Qual anexo já cadastrado &quot;{pendenciaAtual.arquivo.name}&quot; deve substituir?</p>
                <div className="border border-regua rounded-lg divide-y divide-regua overflow-hidden">
                  {entidadeAtual.registros.length === 0 ? (
                    <p className="text-xs text-tx-2 px-3 py-2.5">Nenhum documento já cadastrado nesta pasta.</p>
                  ) : (
                    entidadeAtual.registros.map((r) => (
                      <button
                        key={r.recordId}
                        onClick={() => onEscolherSubstituirExistente(entidadeAtual, pendenciaAtual, r)}
                        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-sf-apoio text-left"
                      >
                        <FileText size={14} className="shrink-0 text-tx-2" />
                        <span className="text-xs font-medium text-tx truncate flex-1">{r.name}</span>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}

            {pendenciaAtual.tipo === "SUMIDO" && detalhe.estagio === "principal" && (
              <>
                <CardArquivo nome={pendenciaAtual.nome} legenda="Anexo atual" badge={<BadgeLixeira trashed={pendenciaAtual.trashed} />} />
                <p className="text-xs text-tx-2">
                  Não foi encontrado, nesta pasta, nenhum arquivo novo com nome parecido que possa ser a atualização deste anexo.
                </p>
                <div className="grid sm:grid-cols-2 gap-3">
                  <button
                    disabled={pending}
                    onClick={() => onDesvincular(pendenciaAtual)}
                    className="text-left border border-regua rounded-lg p-3 hover:border-urgente/50 hover:bg-sf-apoio transition-colors disabled:opacity-50"
                  >
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-tx">
                      <Trash2 size={15} className="text-urgente" /> Desvincular este anexo
                    </span>
                    <span className="text-xs text-tx-2 block mt-1">Remove o registro (mesma ação do botão de excluir anexo).</span>
                  </button>
                  <button
                    onClick={() => setDetalhe({ estagio: "apontar-outro", entIdx: detalhe.entIdx, pendIdx: detalhe.pendIdx })}
                    className="text-left border border-regua rounded-lg p-3 hover:border-acao/50 hover:bg-sf-apoio transition-colors"
                  >
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-tx">
                      <Link2 size={15} className="text-acao" /> Apontar para outro arquivo
                    </span>
                    <span className="text-xs text-tx-2 block mt-1">Escolher, entre os arquivos novos desta pasta, qual este anexo passa a representar.</span>
                  </button>
                </div>
              </>
            )}

            {pendenciaAtual.tipo === "SUMIDO" && detalhe.estagio === "apontar-outro" && (
              <>
                <p className="text-xs text-tx-2">Arquivos novos, sem vínculo, encontrados nesta pasta:</p>
                <div className="border border-regua rounded-lg divide-y divide-regua overflow-hidden">
                  {entidadeAtual.pendencias.filter((p): p is PendenciaNovo => p.tipo === "NOVO").length === 0 ? (
                    <p className="text-xs text-tx-2 px-3 py-2.5">Nenhum outro arquivo novo nesta pasta.</p>
                  ) : (
                    entidadeAtual.pendencias
                      .filter((p): p is PendenciaNovo => p.tipo === "NOVO")
                      .map((p) => (
                        <button
                          key={p.arquivo.fileId}
                          onClick={() => onConfirmarApontarOutro(entidadeAtual, pendenciaAtual, p.arquivo)}
                          className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-sf-apoio text-left"
                        >
                          <FileText size={14} className="shrink-0 text-tx-2" />
                          <span className="text-xs font-medium text-tx truncate flex-1">{p.arquivo.name}</span>
                        </button>
                      ))
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {!carregando && !erro && !detalhe && (
          <p className="shrink-0 border-t border-regua px-5 py-2.5 text-[11px] text-tx-3 flex items-start gap-1.5">
            <Info size={13} className="shrink-0 mt-0.5" />
            {scope === "GLOBAL"
              ? "Varre todo processo/caso/atendimento/licitação/assessoria com pelo menos um anexo já cadastrado — nunca cria pasta nova só por rodar esta auditoria."
              : "Verifica só o conteúdo real desta pasta no Drive (inclusive arquivos novos ainda não cadastrados)."}
          </p>
        )}
      </div>

      {popup && (
        <div className="fixed inset-0 z-[60] bg-grafite-900/50 flex items-center justify-center p-4">
          <div className="bg-sf shadow-modal rounded-lg animate-fade-in w-full max-w-sm p-5">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={18} className={popup.perigoso ? "text-urgente" : "text-aviso"} />
              <h4 className="text-sm font-bold text-tx">{popup.titulo}</h4>
            </div>
            <p className="text-xs text-tx-2 leading-relaxed whitespace-pre-wrap">{popup.corpo}</p>
            <div className="mt-4 flex flex-col gap-2">
              {popup.onExtra && popup.extraLabel && (
                <button
                  disabled={pending}
                  onClick={popup.onExtra}
                  className="w-full border border-acao/50 text-acao text-sm font-semibold py-2 rounded-md hover:bg-acao-bg disabled:opacity-50"
                >
                  {popup.extraLabel}
                </button>
              )}
              <button
                disabled={pending}
                onClick={popup.onConfirmar}
                className={`w-full text-sm font-semibold py-2 rounded-md transition-colors disabled:opacity-50 ${
                  popup.perigoso ? "bg-vinho hover:opacity-90 text-white" : "bg-acao hover:bg-acao-hover text-acao-tx"
                }`}
              >
                {popup.confirmarLabel}
              </button>
              <button disabled={pending} onClick={() => setPopup(null)} className="w-full text-tx-2 hover:text-tx text-xs font-semibold py-1.5 disabled:opacity-50">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[70] animate-fade-in">
          <div className="flex items-center gap-2 bg-grafite-800 text-white text-xs font-medium px-4 py-2.5 rounded-md shadow-modal max-w-md">
            <CheckCircle2 size={15} className="text-concluido shrink-0" />
            <span>{toast}</span>
          </div>
        </div>
      )}
    </ModalShell>
  );
}
