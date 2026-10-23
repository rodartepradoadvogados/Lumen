"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, ArrowRight, ChevronLeft, AlertTriangle, FilePlus, Link2, Trash2, CheckCircle2, FileQuestion, Undo2, FileText, Info, Save, CheckCircle } from "lucide-react";
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
  type Pendencia,
  type RecordKind,
  type DriveFileRef,
} from "@/lib/actions/attachmentReconciliation";

// Card padrão de arquivo (usado na comparação e nas telas de decisão) — mesmo vocabulário visual
// do resto do produto (bg-sf-apoio, borda em regua/acao conforme o papel do card).
function CardArquivo({ nome, legenda, badge, destaque }: { nome: string; legenda: string; badge?: React.ReactNode; destaque?: boolean }) {
  return (
    <div className={`flex-1 min-w-0 border rounded-lg p-3 bg-sf-apoio ${destaque ? "border-marca-tx" : "border-regua"}`}>
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
      <span className="inline-flex items-center gap-1 text-etiqueta font-semibold px-1.5 py-0.5 rounded-sm bg-aviso-bg text-aviso">
        <Trash2 size={11} /> Na lixeira do Drive
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-etiqueta font-semibold px-1.5 py-0.5 rounded-sm bg-urgente-bg text-urgente">
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

// Decisão tomada na tela e ainda NÃO aplicada — só vira ação de verdade (Drive/banco) quando a
// pessoa clica em "Salvar" na lista. Cada pendência tem no máximo uma decisão.
type Decisao =
  | { acao: "ADICIONAR"; tipo: string }
  | { acao: "SUBSTITUIR_NOVO" }
  | { acao: "RESTAURAR" }
  | { acao: "SUBSTITUIR_EXISTENTE"; existente: { recordKind: RecordKind; recordId: string; name: string } }
  | { acao: "DESVINCULAR" }
  | { acao: "APONTAR"; arquivo: DriveFileRef };

const chavePend = (entIdx: number, pendIdx: number) => `${entIdx}:${pendIdx}`;

function resumoDecisao(d: Decisao): string {
  switch (d.acao) {
    case "ADICIONAR":
      return `Adicionar como "${getDocumentTypeLabel(d.tipo)}"`;
    case "SUBSTITUIR_NOVO":
      return "Substituir (manter o novo)";
    case "RESTAURAR":
      return "Voltar ao documento anterior";
    case "SUBSTITUIR_EXISTENTE":
      return `Substituir "${d.existente.name}"`;
    case "DESVINCULAR":
      return "Desvincular anexo";
    case "APONTAR":
      return `Apontar para "${d.arquivo.name}"`;
  }
}

// Registro e arquivo do Drive "ocupados" por uma decisão — usado para impedir duas decisões que
// mexem no mesmo registro/arquivo (ex.: dois arquivos novos substituindo o mesmo anexo).
function recursosDe(p: Pendencia, d: Decisao): { registro: string | null; arquivo: string | null } {
  if (p.tipo === "SUBSTITUICAO") return { registro: `${p.recordKind}:${p.recordId}`, arquivo: p.novo.fileId };
  if (p.tipo === "SUMIDO") return { registro: `${p.recordKind}:${p.recordId}`, arquivo: d.acao === "APONTAR" ? d.arquivo.fileId : null };
  return {
    registro: d.acao === "SUBSTITUIR_EXISTENTE" ? `${d.existente.recordKind}:${d.existente.recordId}` : null,
    arquivo: p.arquivo.fileId,
  };
}

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
  const [decisoes, setDecisoes] = useState<Record<string, Decisao>>({});
  const [falhas, setFalhas] = useState<string[]>([]);

  async function carregar() {
    setCarregando(true);
    setErro(null);
    setDetalhe(null);
    setTipoEscolhido("");
    setDecisoes({});
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

  const totalPendencias = entidades?.reduce((n, e) => n + e.pendencias.length, 0) ?? 0;
  const entidadeAtual = detalhe ? entidades?.[detalhe.entIdx] : undefined;
  const pendenciaAtual = detalhe && entidadeAtual ? entidadeAtual.pendencias[detalhe.pendIdx] : undefined;

  const totalDecisoes = Object.keys(decisoes).length;

  function abrir(entIdx: number, pendIdx: number) {
    const p = entidades?.[entIdx]?.pendencias[pendIdx];
    const d = decisoes[chavePend(entIdx, pendIdx)];
    // Arquivo novo: o seletor já nasce com o tipo da pasta onde ele está (ou o já escolhido
    // antes), então "Confirmar" fica habilitado de cara.
    setTipoEscolhido(p?.tipo === "NOVO" ? (d?.acao === "ADICIONAR" ? d.tipo : p.tipoPadraoKey) : "");
    setDetalhe({ estagio: "principal", entIdx, pendIdx });
  }
  function voltarALista() {
    setDetalhe(null);
  }

  // Registro/arquivo já usados por OUTRA decisão da mesma pasta — duas decisões não podem mexer no
  // mesmo anexo nem no mesmo arquivo do Drive.
  function ocupados(entIdx: number, exceto: string) {
    const registros = new Set<string>();
    const arquivos = new Set<string>();
    entidades?.[entIdx]?.pendencias.forEach((p, i) => {
      const k = chavePend(entIdx, i);
      const d = decisoes[k];
      if (!d || k === exceto) return;
      const r = recursosDe(p, d);
      if (r.registro) registros.add(r.registro);
      if (r.arquivo) arquivos.add(r.arquivo);
    });
    return { registros, arquivos };
  }

  // Só REGISTRA a decisão e volta para a lista — nada vai ao Drive/banco antes do "Salvar".
  function decidir(alvo: Alvo, d: Decisao) {
    const p = entidades?.[alvo.entIdx]?.pendencias[alvo.pendIdx];
    if (!p) return;
    const k = chavePend(alvo.entIdx, alvo.pendIdx);
    const r = recursosDe(p, d);
    const oc = ocupados(alvo.entIdx, k);
    setPopup(null);
    if ((r.registro && oc.registros.has(r.registro)) || (r.arquivo && oc.arquivos.has(r.arquivo))) {
      return mostrarToast("Outra decisão desta pasta já usa este anexo/arquivo. Desfaça-a antes.");
    }
    setDecisoes((atual) => ({ ...atual, [k]: d }));
    setDetalhe(null);
    mostrarToast("Registrado. Será aplicado quando você clicar em Salvar.");
  }
  function desfazer(entIdx: number, pendIdx: number) {
    setDecisoes((atual) => {
      const resto = { ...atual };
      delete resto[chavePend(entIdx, pendIdx)];
      return resto;
    });
  }

  function onVoltarAnterior(alvo: Alvo, p: PendenciaSubstituicao) {
    if (p.antigo.trashed === "definitivo") {
      setPopup({
        titulo: "Não é possível recuperar",
        corpo: `"${p.antigo.name}" foi removido em definitivo do Drive (não só movido pra Lixeira) — não há como restaurá-lo. A única opção é manter o documento novo.`,
        confirmarLabel: "Manter o novo mesmo assim",
        onConfirmar: () => decidir(alvo, { acao: "SUBSTITUIR_NOVO" }),
      });
      return;
    }
    setPopup({
      titulo: "Restaurar o documento anterior?",
      corpo: `Ao salvar, isso vai restaurar "${p.antigo.name}" da Lixeira do Drive e excluir em definitivo "${p.novo.name}", o arquivo anexado por engano. Não é possível desfazer.`,
      confirmarLabel: "Registrar esta decisão",
      perigoso: true,
      onConfirmar: () => decidir(alvo, { acao: "RESTAURAR" }),
    });
  }

  function onConfirmarTipoEscolhido(alvo: Alvo, p: PendenciaNovo, tipo: string) {
    if (p.tipoSugeridoKey && p.tipoSugeridoKey !== tipo) {
      setPopup({
        titulo: "Possível incompatibilidade de tipo",
        corpo: p.subpasta
          ? `Este arquivo está na pasta "${p.subpasta}" do Drive, mas você selecionou o tipo "${getDocumentTypeLabel(tipo)}". Isso deixa a organização inconsistente.`
          : `Os outros documentos já cadastrados aqui são do tipo "${p.tipoSugeridoLabel}". Você selecionou "${getDocumentTypeLabel(tipo)}" — pode ser proposital, mas vale confirmar.`,
        confirmarLabel: `Manter "${getDocumentTypeLabel(tipo)}" mesmo assim`,
        extraLabel: `Usar "${p.tipoSugeridoLabel}" (sugerido)`,
        onConfirmar: () => decidir(alvo, { acao: "ADICIONAR", tipo }),
        onExtra: () => decidir(alvo, { acao: "ADICIONAR", tipo: p.tipoSugeridoKey! }),
      });
      return;
    }
    decidir(alvo, { acao: "ADICIONAR", tipo });
  }

  function onEscolherSubstituirExistente(alvo: Alvo, p: PendenciaNovo, existente: { recordKind: RecordKind; recordId: string; name: string }) {
    setPopup({
      titulo: "Substituir documento existente?",
      corpo: `Ao salvar, isso vai excluir do Drive o arquivo atual de "${existente.name}" e usar "${p.arquivo.name}" em seu lugar, mantendo o mesmo registro. Não é possível desfazer.`,
      confirmarLabel: "Registrar esta decisão",
      perigoso: true,
      onConfirmar: () => decidir(alvo, { acao: "SUBSTITUIR_EXISTENTE", existente }),
    });
  }

  function onDesvincular(alvo: Alvo) {
    setPopup({
      titulo: "Desvincular este anexo?",
      corpo: "Ao salvar, o registro quebrado será removido. Se o documento fizer parte de protocolo já concluído, o protocolo continua no histórico com o nome do documento, mas o arquivo deixa de existir.",
      confirmarLabel: "Registrar esta decisão",
      perigoso: true,
      onConfirmar: () => decidir(alvo, { acao: "DESVINCULAR" }),
    });
  }

  function onConfirmarApontarOutro(alvo: Alvo, p: PendenciaSumido, arquivo: DriveFileRef) {
    setPopup({
      titulo: "Apontar para este arquivo?",
      corpo: `Ao salvar, "${p.nome}" passa a apontar para "${arquivo.name}". Não é possível desfazer.`,
      confirmarLabel: "Registrar esta decisão",
      perigoso: true,
      onConfirmar: () => decidir(alvo, { acao: "APONTAR", arquivo }),
    });
  }

  // Aplica, em sequência, todas as decisões registradas. Uma que falha não impede as outras: o
  // que não foi aplicado reaparece como pendência na nova varredura, e os erros ficam na lista.
  async function salvarTudo() {
    if (!entidades) return;
    setPending(true);
    setPopup(null);
    const erros: string[] = [];
    let aplicadas = 0;
    for (const [k, d] of Object.entries(decisoes)) {
      const [entIdx, pendIdx] = k.split(":").map(Number);
      const ent = entidades[entIdx];
      const p = ent?.pendencias[pendIdx];
      if (!ent || !p) continue;
      let res: { error?: string } = {};
      try {
        if (d.acao === "ADICIONAR" && p.tipo === "NOVO") res = await adicionarComoAnexo(ent.scope, p.arquivo, d.tipo);
        else if (d.acao === "SUBSTITUIR_NOVO" && p.tipo === "SUBSTITUICAO") res = await apontarDocumentoParaNovoArquivo(ent.scope, p.recordKind, p.recordId, p.novo);
        else if (d.acao === "RESTAURAR" && p.tipo === "SUBSTITUICAO") res = await restaurarDocumentoAntigo(ent.scope, p.recordKind, p.recordId, p.novo.fileId);
        else if (d.acao === "SUBSTITUIR_EXISTENTE" && p.tipo === "NOVO")
          res = await apontarDocumentoParaNovoArquivo(ent.scope, d.existente.recordKind, d.existente.recordId, p.arquivo);
        else if (d.acao === "DESVINCULAR" && p.tipo === "SUMIDO") res = await desvincularPendenciaSumida(p.recordKind, p.recordId, true);
        else if (d.acao === "APONTAR" && p.tipo === "SUMIDO") res = await apontarDocumentoParaNovoArquivo(ent.scope, p.recordKind, p.recordId, d.arquivo);
      } catch {
        res = { error: "falha inesperada" };
      }
      if (res.error) erros.push(`${resumoDecisao(d)}: ${res.error}`);
      else aplicadas++;
    }
    setPending(false);
    router.refresh();
    await carregar();
    setFalhas(erros);
    mostrarToast(erros.length === 0 ? `${aplicadas} alteração(ões) salva(s).` : `${aplicadas} salva(s); ${erros.length} com erro — veja a lista.`);
  }

  function onSalvar() {
    setPopup({
      titulo: `Salvar ${totalDecisoes} alteração${totalDecisoes > 1 ? "ões" : ""}?`,
      corpo: "Todas as decisões registradas serão aplicadas agora no Drive e no Lúmen. Substituições e remoções excluem arquivos do Drive em definitivo e não podem ser desfeitas.",
      confirmarLabel: "Salvar tudo",
      onConfirmar: salvarTudo,
    });
  }

  function tentarFechar() {
    if (totalDecisoes === 0 || pending) return onClose();
    setPopup({
      titulo: "Descartar decisões não salvas?",
      corpo: `Há ${totalDecisoes} decisão(ões) registrada(s) que ainda não foram salvas. Se fechar agora, elas serão perdidas.`,
      confirmarLabel: "Descartar e fechar",
      perigoso: true,
      onConfirmar: onClose,
    });
  }

  const subtitulo = scope === "GLOBAL" ? "Escritório inteiro — todas as pastas com anexo já cadastrado" : (entidades?.[0]?.entidadeLabel ?? "");

  return (
    <ModalShell size="cheio" title="Reorganizar anexos do Drive" subtitle={subtitulo} onClose={tentarFechar}>
      <div className="flex-1 min-h-0 flex flex-col">
        {carregando && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16">
            <RefreshCw size={28} className="text-marca-tx animate-spin" />
            <p className="text-sm text-tx-2">Vasculhando {scope === "GLOBAL" ? "as pastas do escritório" : "a pasta"} no Drive…</p>
          </div>
        )}

        {!carregando && erro && (
          <div className="flex-1 flex items-center justify-center px-6">
            <p className="text-sm font-medium text-urgente bg-urgente-bg border border-linha-urgente rounded-md px-4 py-3 max-w-md text-center">{erro}</p>
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
                {falhas.length > 0 && (
                  <div className="text-xs text-urgente bg-urgente-bg border border-linha-urgente rounded-md px-3 py-2 space-y-0.5">
                    <p className="font-semibold">Não foi possível aplicar:</p>
                    {falhas.map((f, i) => (
                      <p key={i}>• {f}</p>
                    ))}
                  </div>
                )}
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
                              <p className={`text-etiqueta font-bold uppercase tracking-wide flex items-center gap-1.5 mb-2 ${grupo.cor === "urgente" ? "text-urgente" : grupo.cor === "aviso" ? "text-aviso" : "text-tx-2"}`}>
                                <Icone size={13} /> {grupo.titulo} ({itens.length})
                              </p>
                              <div className="border border-regua rounded-lg divide-y divide-regua overflow-hidden">
                                {itens.map(({ p, pendIdx }) => {
                                  let titulo = "";
                                  let extra: React.ReactNode = null;
                                  if (p.tipo === "SUBSTITUICAO") {
                                    titulo = `${p.antigo.name}  →  ${p.novo.name}`;
                                    extra = (
                                      <span className="shrink-0 text-etiqueta font-bold px-1.5 py-0.5 rounded-sm bg-urgente-bg text-urgente">
                                        {p.similaridade}% parecido
                                      </span>
                                    );
                                  } else if (p.tipo === "NOVO") {
                                    titulo = p.arquivo.name;
                                  } else {
                                    titulo = p.nome;
                                  }
                                  const decisao = decisoes[chavePend(entIdx, pendIdx)];
                                  const tipoChip =
                                    p.tipo === "NOVO" ? getDocumentTypeLabel(decisao?.acao === "ADICIONAR" ? decisao.tipo : p.tipoPadraoKey) : null;
                                  return (
                                    <div key={pendIdx} className={`flex items-center gap-2 px-3 py-2.5 ${decisao ? "bg-concluido-bg" : "hover:bg-sf-apoio"} transition-colors`}>
                                      {decisao ? <CheckCircle size={15} className="shrink-0 text-concluido" /> : <Icone size={15} className="shrink-0 text-tx-2" />}
                                      <span className="min-w-0 flex-1">
                                        <span className="block text-xs font-medium text-tx truncate">{titulo}</span>
                                        {decisao && <span className="block text-etiqueta font-semibold text-concluido truncate">{resumoDecisao(decisao)}</span>}
                                      </span>
                                      {tipoChip && (
                                        <span className="shrink-0 text-etiqueta font-semibold px-1.5 py-0.5 rounded-full bg-acao-bg text-marca-tx">{tipoChip}</span>
                                      )}
                                      {p.subpasta && (
                                        <span className="shrink-0 text-etiqueta font-semibold px-1.5 py-0.5 rounded-full bg-sf-apoio text-tx-2">{p.subpasta}</span>
                                      )}
                                      {extra}
                                      {decisao && (
                                        <button disabled={pending} onClick={() => desfazer(entIdx, pendIdx)} className="shrink-0 text-etiqueta font-semibold text-tx-2 hover:text-tx disabled:opacity-50">
                                          Desfazer
                                        </button>
                                      )}
                                      <button disabled={pending} onClick={() => abrir(entIdx, pendIdx)} className="shrink-0 text-etiqueta font-semibold text-marca-tx disabled:opacity-50">
                                        {decisao ? "Alterar" : "Resolver"}
                                      </button>
                                    </div>
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
                      <span className="inline-flex items-center gap-1 text-etiqueta font-semibold px-1.5 py-0.5 rounded-sm bg-concluido-bg text-concluido">Novo</span>
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
                    onClick={() => decidir(detalhe, { acao: "SUBSTITUIR_NOVO" })}
                    className="flex-1 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold py-2.5 rounded-md transition-colors disabled:opacity-50"
                  >
                    Substituir (manter o novo)
                  </button>
                  <button
                    disabled={pending}
                    onClick={() => onVoltarAnterior(detalhe, pendenciaAtual)}
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
                  badge={<span className="inline-flex items-center gap-1 text-etiqueta font-semibold px-1.5 py-0.5 rounded-sm bg-concluido-bg text-concluido">Novo, sem vínculo</span>}
                  destaque
                />
                {pendenciaAtual.melhorSemelhanca > 0 && (
                  <p className="text-etiqueta text-tx-3">
                    Maior semelhança encontrada com um anexo já existente: {pendenciaAtual.melhorSemelhanca}% — abaixo do limite de 60%, por isso foi tratado como
                    documento novo.
                  </p>
                )}
                <p className="text-sm font-semibold text-tx">O que você quer fazer com este arquivo?</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="border border-regua rounded-lg p-3 space-y-2">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-tx">
                      <FilePlus size={16} className="text-marca-tx" /> Adicionar como novo documento
                    </p>
                    <DocumentTypeSelect
                      value={tipoEscolhido}
                      onChange={setTipoEscolhido}
                      className="w-full text-sm border border-regua bg-sf text-tx px-2.5 py-1.5 rounded-md"
                      allowCreate
                    />
                    <button
                      disabled={pending || !tipoEscolhido}
                      onClick={() => onConfirmarTipoEscolhido(detalhe, pendenciaAtual, tipoEscolhido)}
                      className="w-full bg-acao hover:bg-acao-hover text-acao-tx text-xs font-semibold py-2 rounded-md disabled:opacity-40 transition-colors"
                    >
                      Confirmar
                    </button>
                  </div>
                  <button
                    onClick={() => setDetalhe({ estagio: "escolher-existente", entIdx: detalhe.entIdx, pendIdx: detalhe.pendIdx })}
                    className="text-left border border-regua rounded-lg p-3 hover:border-marca-tx hover:bg-sf-apoio transition-colors h-fit"
                  >
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-tx">
                      <RefreshCw size={15} className="text-marca-tx" /> Substituir um documento existente
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
                    entidadeAtual.registros.map((r) => {
                      const emUso = ocupados(detalhe.entIdx, chavePend(detalhe.entIdx, detalhe.pendIdx)).registros.has(`${r.recordKind}:${r.recordId}`);
                      return (
                        <button
                          key={r.recordId}
                          disabled={emUso}
                          onClick={() => onEscolherSubstituirExistente(detalhe, pendenciaAtual, r)}
                          className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-sf-apoio text-left disabled:opacity-50 disabled:hover:bg-transparent"
                        >
                          <FileText size={14} className="shrink-0 text-tx-2" />
                          <span className="text-xs font-medium text-tx truncate flex-1">{r.name}</span>
                          {emUso && <span className="shrink-0 text-etiqueta text-tx-3">já tem decisão</span>}
                        </button>
                      );
                    })
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
                    onClick={() => onDesvincular(detalhe)}
                    className="text-left border border-regua rounded-lg p-3 hover:border-linha-urgente hover:bg-sf-apoio transition-colors disabled:opacity-50"
                  >
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-tx">
                      <Trash2 size={15} className="text-urgente" /> Desvincular este anexo
                    </span>
                    <span className="text-xs text-tx-2 block mt-1">Remove o registro (mesma ação do botão de excluir anexo).</span>
                  </button>
                  <button
                    onClick={() => setDetalhe({ estagio: "apontar-outro", entIdx: detalhe.entIdx, pendIdx: detalhe.pendIdx })}
                    className="text-left border border-regua rounded-lg p-3 hover:border-marca-tx hover:bg-sf-apoio transition-colors"
                  >
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-tx">
                      <Link2 size={15} className="text-marca-tx" /> Apontar para outro arquivo
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
                      .map((p) => {
                        const emUso = ocupados(detalhe.entIdx, chavePend(detalhe.entIdx, detalhe.pendIdx)).arquivos.has(p.arquivo.fileId);
                        return (
                          <button
                            key={p.arquivo.fileId}
                            disabled={emUso}
                            onClick={() => onConfirmarApontarOutro(detalhe, pendenciaAtual, p.arquivo)}
                            className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-sf-apoio text-left disabled:opacity-50 disabled:hover:bg-transparent"
                          >
                            <FileText size={14} className="shrink-0 text-tx-2" />
                            <span className="text-xs font-medium text-tx truncate flex-1">{p.arquivo.name}</span>
                            {emUso && <span className="shrink-0 text-etiqueta text-tx-3">já tem decisão</span>}
                          </button>
                        );
                      })
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {!carregando && !erro && !detalhe && (
          <div className="shrink-0 border-t border-regua px-5 py-2.5 flex items-center gap-3">
            <p className="flex-1 text-etiqueta text-tx-3 flex items-start gap-1.5">
              <Info size={13} className="shrink-0 mt-0.5" />
              {scope === "GLOBAL"
                ? "Varre todo processo/caso/atendimento/licitação/assessoria com pelo menos um anexo já cadastrado — nunca cria pasta nova só por rodar esta auditoria."
                : "Verifica só o conteúdo real desta pasta no Drive (inclusive arquivos novos ainda não cadastrados)."}
            </p>
            {totalPendencias > 0 && (
              <button
                disabled={pending || totalDecisoes === 0}
                onClick={onSalvar}
                className="shrink-0 inline-flex items-center gap-1.5 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-4 py-2 rounded-md disabled:opacity-40 transition-colors"
              >
                {pending ? <RefreshCw size={15} className="animate-spin" /> : <Save size={15} />}
                {pending ? "Salvando…" : totalDecisoes > 0 ? `Salvar (${totalDecisoes})` : "Salvar"}
              </button>
            )}
          </div>
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
                  className="w-full border border-marca-tx text-marca-tx text-sm font-semibold py-2 rounded-md hover:bg-acao-bg disabled:opacity-50"
                >
                  {popup.extraLabel}
                </button>
              )}
              <button
                disabled={pending}
                onClick={popup.onConfirmar}
                className={`w-full text-sm font-semibold py-2 rounded-md transition-colors disabled:opacity-50 ${
                  popup.perigoso ? "bg-vinho hover:opacity-90 text-rotulo" : "bg-acao hover:bg-acao-hover text-acao-tx"
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
