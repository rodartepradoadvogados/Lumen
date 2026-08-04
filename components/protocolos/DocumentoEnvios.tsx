"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Send, Search, Mail, MessageCircle, Trash2, UserRound } from "lucide-react";
import ModalShell from "@/components/ModalShell";
import {
  registrarEnvioDocumentos,
  listarContatosEnvio,
  excluirEnvioDocumentos,
  type ContatoEnvio,
} from "@/lib/actions/documentoEnvios";
import { DOCUMENTO_ENVIO_METODO_LABELS, buildMailtoLink, buildWhatsAppLink, formatEnvioMensagem, type DocumentoEnvioMetodo } from "@/lib/documentoEnvios";
import { looseIncludes } from "@/lib/textNormalize";
import { getDocumentTypeIcon, getDocumentTypeLabel } from "@/lib/documentTypes";
import { formatDate } from "@/components/ui";

// enviadoEm é timestamp de verdade (não data-calendário de <input type="date">, ao contrário de
// ProtocoloLote.protocoladoEm) — formata com hora local, mesmo padrão de TaskDetailModal.tsx.
function formatEnviadoEm(iso: string): string {
  const d = new Date(iso);
  return `${formatDate(d)} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

type AttachmentOption = { id: string; name: string; docType: string };

export type Envio = {
  id: string;
  metodo: string;
  destinatarioNome: string;
  destinatarioContato: string;
  enviadoEm: string;
  enviadoPor: { name: string } | null;
  itens: { id: string; attachmentId: string | null; nomeSnapshot: string; docTypeSnapshot: string }[];
};

const CONTATO_TIPO_LABEL: Record<ContatoEnvio["tipo"], string> = {
  CLIENTE: "Cliente",
  ADVOGADO: "Advogado",
  FORNECEDOR: "Fornecedor",
};

function abrirLink(envio: { metodo: string; destinatarioNome: string; destinatarioContato: string; itens: { nomeSnapshot: string }[] }, caseTitle: string) {
  const mensagem = formatEnvioMensagem(caseTitle, envio.itens.map((i) => i.nomeSnapshot));
  if (envio.metodo === "EMAIL") {
    window.location.href = buildMailtoLink(envio.destinatarioContato, `Documentos — ${caseTitle}`, mensagem);
  } else {
    window.open(buildWhatsAppLink(envio.destinatarioContato, mensagem), "_blank", "noopener,noreferrer");
  }
}

// Botão "Enviar E-mail/WhatsApp" (ao lado de "Novo protocolo") + o modal de seleção — registra
// que um conjunto de documentos do processo foi mandado a alguém (não é protocolo: não vai a
// tribunal/órgão). Ver lib/documentoEnvios.ts para o porquê de não haver envio de verdade daqui.
export function EnviarDocumentosButton({
  caseId,
  caseTitle,
  attachments,
}: {
  caseId: string;
  caseTitle: string;
  attachments: AttachmentOption[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 border border-navy-800/15 dark:border-white/15 hover:bg-cream-100 dark:hover:bg-white/5 text-navy-900 dark:text-cream-50 text-sm font-semibold px-3.5 py-2 rounded-lg transition-colors"
      >
        <Send size={15} /> Enviar E-mail/WhatsApp
      </button>
      {open && <EnvioModal caseId={caseId} caseTitle={caseTitle} attachments={attachments} onClose={() => setOpen(false)} />}
    </>
  );
}

function EnvioModal({
  caseId,
  caseTitle,
  attachments,
  onClose,
}: {
  caseId: string;
  caseTitle: string;
  attachments: AttachmentOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [metodo, setMetodo] = useState<DocumentoEnvioMetodo>("EMAIL");
  const [nome, setNome] = useState("");
  const [contato, setContato] = useState("");
  const [contatoTocado, setContatoTocado] = useState(false); // depois que a pessoa mexe no contato à mão, parar de sobrescrever ao trocar o nome
  const [sugestoesAbertas, setSugestoesAbertas] = useState(false);
  const [contatos, setContatos] = useState<ContatoEnvio[] | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Recarrega a lista de contatos sugeridos sempre que o método muda — um mesmo contato pode ter
  // e-mail cadastrado e não ter telefone (ou vice-versa), então a lista de sugestões depende do
  // método escolhido (ver listarContatosEnvio em lib/actions/documentoEnvios.ts).
  useEffect(() => {
    setContatos(null);
    listarContatosEnvio(caseId, metodo).then(setContatos);
  }, [caseId, metodo]);

  const sugeridos = useMemo(() => {
    if (!contatos || !nome.trim()) return [];
    return contatos.filter((c) => looseIncludes(c.name, nome.trim())).slice(0, 8);
  }, [contatos, nome]);

  function escolherContato(c: ContatoEnvio) {
    setNome(c.name);
    setContato(c.contato);
    setContatoTocado(true);
    setSugestoesAbertas(false);
  }

  const disponiveis = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...attachments].filter((a) => !q || a.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
  }, [attachments, search]);

  const selectedAttachments = useMemo(
    () => selected.map((id) => attachments.find((a) => a.id === id)).filter((a): a is AttachmentOption => Boolean(a)),
    [selected, attachments]
  );

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function handleConfirm() {
    if (!nome.trim()) return setError("Informe o nome do destinatário.");
    if (!contato.trim()) return setError(metodo === "EMAIL" ? "Informe o e-mail do destinatário." : "Informe o telefone do destinatário.");
    if (selected.length === 0) return setError("Selecione ao menos um documento.");

    setLoading(true);
    setError("");
    const res = await registrarEnvioDocumentos({
      caseId,
      metodo,
      destinatarioNome: nome.trim(),
      destinatarioContato: contato.trim(),
      attachmentIds: selected,
    });
    setLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }

    // Registro (o requisito central) já está gravado — a partir daqui é só a conveniência de
    // abrir o cliente de e-mail/WhatsApp com o texto pronto, sem travar o fluxo se o navegador
    // bloquear o popup/redirect por qualquer motivo.
    try {
      abrirLink({ metodo, destinatarioNome: nome.trim(), destinatarioContato: contato.trim(), itens: selectedAttachments.map((a) => ({ nomeSnapshot: a.name })) }, caseTitle);
    } catch {
      // silencioso — o registro já foi salvo, o link é só conveniência
    }

    onClose();
    router.refresh();
  }

  return (
    <ModalShell size="cheio" title="Enviar E-mail/WhatsApp" subtitle="Registra que estes documentos foram enviados a alguém — não é um protocolo." onClose={onClose}>
      <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 items-start">
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60 block mb-1">Método</label>
              <div className="flex gap-1.5 text-xs font-semibold">
                {(["EMAIL", "WHATSAPP"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setMetodo(m);
                      if (!contatoTocado) setContato("");
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${
                      metodo === m
                        ? "bg-navy-900 dark:bg-gold-500 text-white dark:text-navy-950"
                        : "text-navy-800/50 dark:text-cream-50/50 hover:bg-cream-100 dark:hover:bg-white/5 border border-navy-800/12 dark:border-white/15"
                    }`}
                  >
                    {m === "EMAIL" ? <Mail size={13} /> : <MessageCircle size={13} />}
                    {DOCUMENTO_ENVIO_METODO_LABELS[m]}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative">
              <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Destinatário</label>
              <div className="relative mt-1">
                <UserRound size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-navy-800/30 dark:text-cream-50/30" />
                <input
                  value={nome}
                  onChange={(e) => {
                    setNome(e.target.value);
                    setSugestoesAbertas(true);
                  }}
                  onFocus={() => setSugestoesAbertas(true)}
                  onBlur={() => setTimeout(() => setSugestoesAbertas(false), 150)}
                  placeholder="Nome (busque um contato cadastrado ou digite)"
                  className="w-full border border-navy-800/12 dark:border-white/15 rounded-lg pl-7 pr-2.5 py-2 text-sm bg-white dark:bg-navy-800 text-navy-900 dark:text-cream-50"
                />
              </div>
              {sugestoesAbertas && sugeridos.length > 0 && (
                <div className="absolute z-10 left-0 right-0 mt-1 bg-white dark:bg-navy-950 border border-navy-800/12 dark:border-white/15 rounded-lg shadow-pop max-h-48 overflow-y-auto scrollbar-thin">
                  {sugeridos.map((c) => (
                    <button
                      key={`${c.tipo}-${c.id}`}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => escolherContato(c)}
                      className="flex items-center justify-between gap-2 w-full px-3 py-2 text-sm text-left hover:bg-cream-100 dark:hover:bg-white/5"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-navy-900 dark:text-cream-50">{c.name}</span>
                        <span className="block truncate text-[11px] text-navy-800/45 dark:text-cream-50/45">{c.contato}</span>
                      </span>
                      <span className="shrink-0 text-[10px] font-semibold text-navy-800/40 dark:text-cream-50/40 font-mono">{CONTATO_TIPO_LABEL[c.tipo]}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">{metodo === "EMAIL" ? "E-mail" : "Telefone (WhatsApp)"}</label>
              <input
                value={contato}
                onChange={(e) => {
                  setContato(e.target.value);
                  setContatoTocado(true);
                }}
                type={metodo === "EMAIL" ? "email" : "tel"}
                placeholder={metodo === "EMAIL" ? "nome@exemplo.com" : "(62) 99999-9999"}
                className="w-full mt-1 border border-navy-800/12 dark:border-white/15 rounded-lg px-3 py-2 text-sm bg-white dark:bg-navy-800 text-navy-900 dark:text-cream-50"
              />
              <p className="text-[11px] text-navy-800/40 dark:text-cream-50/40 mt-1">
                Não encontrou o contato na busca acima? Pode digitar o {metodo === "EMAIL" ? "e-mail" : "telefone"} direto aqui.
              </p>
            </div>

            {selectedAttachments.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-navy-800/50 dark:text-cream-50/50 uppercase tracking-wide mb-1.5">
                  Documentos selecionados ({selectedAttachments.length})
                </p>
                <div className="border border-navy-800/10 dark:border-white/10 rounded-lg divide-y divide-navy-800/5 dark:divide-white/10">
                  {selectedAttachments.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                      <span className="flex-1 min-w-0 truncate text-navy-900 dark:text-cream-50">{a.name}</span>
                      <button onClick={() => toggle(a.id)} className="p-1 text-navy-800/40 dark:text-cream-50/40 hover:text-bordo-600 dark:hover:text-bordo-400 shrink-0">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && <p className="text-xs font-medium text-bordo-600 dark:text-bordo-400">{error}</p>}
          </div>

          <div>
            <p className="text-xs font-semibold text-navy-800/50 dark:text-cream-50/50 uppercase tracking-wide mb-1.5">Documentos do processo</p>
            <div className="relative mb-2">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-navy-800/30 dark:text-cream-50/30" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome"
                className="w-full text-xs border border-navy-800/12 dark:border-white/15 rounded-lg pl-7 pr-2.5 py-1.5 bg-white dark:bg-navy-800 text-navy-900 dark:text-cream-50"
              />
            </div>
            <div className="border border-navy-800/10 dark:border-white/10 rounded-lg divide-y divide-navy-800/5 dark:divide-white/10 max-h-[50vh] overflow-y-auto scrollbar-thin">
              {disponiveis.length === 0 && <p className="px-3 py-3 text-xs text-navy-800/40 dark:text-cream-50/40">Nenhum documento encontrado.</p>}
              {disponiveis.map((a) => {
                const checked = selected.includes(a.id);
                const Icon = getDocumentTypeIcon(a.docType);
                return (
                  <label key={a.id} className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-cream-100 dark:hover:bg-white/5">
                    <input type="checkbox" checked={checked} onChange={() => toggle(a.id)} className="h-4 w-4 rounded border-navy-800/25 dark:border-white/25 text-gold-600 focus:ring-gold-500/40 shrink-0" />
                    <Icon size={14} className="text-navy-800/40 dark:text-cream-50/40 shrink-0" />
                    <span className="flex-1 min-w-0 truncate text-navy-900 dark:text-cream-50">{a.name}</span>
                    <span className="text-[10px] text-navy-800/40 dark:text-cream-50/40 font-mono shrink-0">{getDocumentTypeLabel(a.docType)}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="shrink-0 flex items-center justify-end gap-2 px-5 py-4 border-t border-navy-800/8 dark:border-white/10 bg-cream-50/60 dark:bg-white/5">
        <button onClick={onClose} className="text-sm font-semibold text-navy-800/50 dark:text-cream-50/50 hover:text-navy-900 dark:hover:text-cream-50 px-3 py-2">
          Cancelar
        </button>
        <button
          onClick={handleConfirm}
          disabled={loading}
          className="flex items-center gap-1.5 bg-navy-900 hover:bg-navy-800 dark:bg-gold-500 dark:hover:bg-gold-600 dark:text-navy-950 text-white text-sm font-semibold rounded-lg px-4 py-2 disabled:opacity-50"
        >
          <Send size={14} /> {loading ? "Registrando..." : "Registrar e abrir " + (metodo === "EMAIL" ? "e-mail" : "WhatsApp")}
        </button>
      </div>
    </ModalShell>
  );
}

// Histórico "Documentos enviados" — mesma ideia visual do histórico de protocolos (LoteCard em
// ProtocolosTab.tsx), só que sem ciclo de vida: um envio já nasce concluído.
export function HistoricoEnvios({ caseTitle, envios }: { caseTitle: string; envios: Envio[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function handleExcluir(id: string) {
    if (!window.confirm("Excluir este registro de envio? Isso não desfaz o e-mail/mensagem já mandado, só apaga o rastro dele aqui no sistema.")) return;
    setPendingId(id);
    await excluirEnvioDocumentos(id);
    setPendingId(null);
    router.refresh();
  }

  return (
    <div className="mt-6 pt-5 border-t border-navy-800/8 dark:border-white/10">
      <h4 className="font-serif font-bold text-navy-900 dark:text-cream-50">Documentos enviados</h4>
      <p className="text-xs font-semibold text-navy-800/40 dark:text-cream-50/40 font-mono mb-3 mt-1">
        {envios.length === 0 ? "Nenhum envio registrado ainda" : `${envios.length} envio${envios.length > 1 ? "s" : ""} registrado${envios.length > 1 ? "s" : ""}`}
      </p>
      {envios.length === 0 ? (
        <p className="text-sm text-navy-800/45 dark:text-cream-50/45 py-2">
          Use &ldquo;Enviar E-mail/WhatsApp&rdquo; acima para registrar quando enviar documentos a um cliente, advogado ou fornecedor fora do protocolo judicial/administrativo.
        </p>
      ) : (
        <div className="space-y-3">
          {envios.map((envio) => (
            <div key={envio.id} className="border border-navy-800/10 dark:border-white/10 rounded-lg p-4 bg-white dark:bg-navy-900">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex items-center gap-2">
                  {envio.metodo === "EMAIL" ? (
                    <Mail size={14} className="text-navy-800/40 dark:text-cream-50/40 shrink-0" />
                  ) : (
                    <MessageCircle size={14} className="text-navy-800/40 dark:text-cream-50/40 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="font-medium text-navy-900 dark:text-cream-50 truncate">
                      Para {envio.destinatarioNome} <span className="text-navy-800/45 dark:text-cream-50/45 font-normal">({envio.destinatarioContato})</span>
                    </p>
                    <p className="text-xs text-navy-800/45 dark:text-cream-50/45 mt-0.5 font-mono">
                      {formatEnviadoEm(envio.enviadoEm)} · {envio.itens.length} documento(s) · {envio.enviadoPor?.name ?? "—"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => abrirLink(envio, caseTitle)}
                    title={envio.metodo === "EMAIL" ? "Abrir e-mail de novo" : "Abrir WhatsApp de novo"}
                    className="flex items-center gap-1 text-[11px] font-semibold text-gold-700 dark:text-gold-400 hover:underline px-2 py-1"
                  >
                    <Send size={11} /> Reabrir
                  </button>
                  <button
                    onClick={() => handleExcluir(envio.id)}
                    disabled={pendingId === envio.id}
                    title="Excluir registro"
                    className="text-navy-800/40 dark:text-cream-50/40 hover:text-bordo-600 dark:hover:text-bordo-400 p-1.5 rounded-lg hover:bg-bordo-50 dark:hover:bg-bordo-950/30 disabled:opacity-50"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              <div className="mt-2 divide-y divide-navy-800/5 dark:divide-white/10 border-t border-navy-800/5 dark:border-white/10">
                {envio.itens.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 py-1.5 text-sm">
                    <span className="flex-1 min-w-0 truncate text-navy-900 dark:text-cream-50" title={item.nomeSnapshot}>
                      {item.nomeSnapshot}
                      {!item.attachmentId && <span className="text-[10px] text-bordo-600 dark:text-bordo-400 ml-1.5">(excluído do processo)</span>}
                    </span>
                    <span className="text-[10px] text-navy-800/40 dark:text-cream-50/40 font-mono shrink-0">{getDocumentTypeLabel(item.docTypeSnapshot)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
