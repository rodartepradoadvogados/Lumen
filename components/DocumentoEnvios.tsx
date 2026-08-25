"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Send, Search, Mail, MessageCircle, Trash2, UserRound, Loader2 } from "lucide-react";
import ModalShell from "@/components/ModalShell";
import {
  registrarEnvioDocumentos,
  enviarDocumentosPorEmail,
  listarContatosEnvio,
  excluirEnvioDocumentos,
  buscarUrlsDeAnexos,
  buscarUrlsDeDocumentosAssessoria,
  type ContatoEnvio,
  type EnvioOrigem,
} from "@/lib/actions/documentoEnvios";
import {
  DOCUMENTO_ENVIO_METODO_LABELS,
  buildWhatsAppLink,
  formatEnvioMensagem,
  formatDocumentosLinks,
  mensagemPadraoEnvio,
  type DocumentoEnvioMetodo,
} from "@/lib/documentoEnvios";
import { looseIncludes } from "@/lib/textNormalize";
import { getDocumentTypeIcon, getDocumentTypeLabel } from "@/lib/documentTypes";
import { formatDate } from "@/components/ui";

// Botão + modal + histórico "Enviar E-mail/WhatsApp" — genérico o bastante para servir tanto a
// aba Protocolos de um Processo quanto a aba "Pareceres, Processos e Casos" de uma Assessoria
// (ver `entity` abaixo). Antes vivia em components/protocolos/, mas o nome do diretório ficaria
// enganoso agora que também serve Assessoria — por isso foi movido para cá.

// enviadoEm é timestamp de verdade (não data-calendário de <input type="date">, ao contrário de
// ProtocoloLote.protocoladoEm) — formata com hora local, mesmo padrão de TaskDetailModal.tsx.
function formatEnviadoEm(iso: string): string {
  const d = new Date(iso);
  return `${formatDate(d)} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

// Serve tanto Attachment (Processo) quanto AssessoriaDocumento (Assessoria) — os dois models têm
// esses quatro campos em comum, o bastante para esta UI não precisar saber qual é.
type AttachmentOption = { id: string; name: string; docType: string; driveUrl: string };

// Quem é o dono deste envio — decide para qual server action/endpoint apontar e qual rótulo usar
// na UI ("Documentos do processo" vs "Documentos da assessoria" vs "Documentos da licitação").
export type EnvioEntity =
  | { tipo: "CASE"; id: string; titulo: string }
  | { tipo: "ASSESSORIA"; id: string; titulo: string }
  | { tipo: "LICITACAO"; id: string; titulo: string };

function entityOrigem(entity: EnvioEntity): EnvioOrigem {
  return { tipo: entity.tipo, id: entity.id };
}

export type Envio = {
  id: string;
  metodo: string;
  destinatarioNome: string;
  destinatarioContato: string;
  enviadoEm: string;
  enviadoPor: { name: string } | null;
  itens: { id: string; attachmentId: string | null; assessoriaDocumentoId: string | null; nomeSnapshot: string; docTypeSnapshot: string }[];
};

const CONTATO_TIPO_LABEL: Record<ContatoEnvio["tipo"], string> = {
  CLIENTE: "Cliente",
  ADVOGADO: "Advogado",
  FORNECEDOR: "Fornecedor",
};

const DOCUMENTO_EXCLUIDO_TEXTO = "(documento excluído)";

// Reabre o WhatsApp (wa.me) para um envio já registrado no histórico — SÓ existe para WHATSAPP:
// um envio EMAIL já saiu de verdade, reabrir/reenviar sozinho geraria duplicidade sem intenção
// clara da pessoa (ver HistoricoEnvios). DocumentoEnvioItem só guarda nomeSnapshot (snapshot
// proposital, para sobreviver à exclusão do documento original), nunca a URL — por isso busca a
// URL ATUAL de cada documento agora, via attachmentId/assessoriaDocumentoId conforme a origem; um
// documento já excluído simplesmente não tem link.
async function reabrirWhatsApp(envio: Envio, entity: EnvioEntity) {
  // CASE e LICITACAO usam attachmentId (mesmo model Attachment); só ASSESSORIA usa
  // assessoriaDocumentoId — ver comentário em lib/actions/documentoEnvios.ts:itemFkDaOrigem.
  const usaAttachmentId = entity.tipo === "CASE" || entity.tipo === "LICITACAO";
  let urlById: Record<string, string> = {};
  if (usaAttachmentId) {
    const ids = envio.itens.map((i) => i.attachmentId).filter((id): id is string => Boolean(id));
    if (ids.length > 0) urlById = await buscarUrlsDeAnexos(ids);
  } else {
    const ids = envio.itens.map((i) => i.assessoriaDocumentoId).filter((id): id is string => Boolean(id));
    if (ids.length > 0) urlById = await buscarUrlsDeDocumentosAssessoria(ids);
  }
  const documentos = envio.itens.map((i) => {
    const docId = usaAttachmentId ? i.attachmentId : i.assessoriaDocumentoId;
    return { nome: i.nomeSnapshot, url: (docId && urlById[docId]) || DOCUMENTO_EXCLUIDO_TEXTO };
  });
  const mensagem = formatEnvioMensagem(entity.titulo, documentos);
  window.open(buildWhatsAppLink(envio.destinatarioContato, mensagem), "_blank", "noopener,noreferrer");
}

// Botão "Enviar E-mail/WhatsApp" (ao lado de "Novo protocolo" no Processo, ou "Adicionar parecer"
// na Assessoria) + o modal de seleção — para EMAIL, manda o e-mail de verdade (com os documentos
// anexados) na hora da confirmação; para WHATSAPP, registra o envio e abre o wa.me com a mensagem
// pronta (link de conveniência, sem envio real — ver lib/documentoEnvios.ts para o porquê de cada
// método funcionar de um jeito).
export function EnviarDocumentosButton({ entity, attachments }: { entity: EnvioEntity; attachments: AttachmentOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 border border-regua hover:bg-sf-apoio text-tx text-sm font-semibold px-3.5 py-2 transition-colors"
      >
        <Send size={15} /> Enviar E-mail/WhatsApp
      </button>
      {open && <EnvioModal entity={entity} attachments={attachments} onClose={() => setOpen(false)} />}
    </>
  );
}

function EnvioModal({ entity, attachments, onClose }: { entity: EnvioEntity; attachments: AttachmentOption[]; onClose: () => void }) {
  const router = useRouter();
  const [metodo, setMetodo] = useState<DocumentoEnvioMetodo>("EMAIL");
  const [nome, setNome] = useState("");
  const [contato, setContato] = useState("");
  const [contatoTocado, setContatoTocado] = useState(false); // depois que a pessoa mexe no contato à mão, parar de sobrescrever ao trocar o nome
  const [sugestoesAbertas, setSugestoesAbertas] = useState(false);
  const [contatos, setContatos] = useState<ContatoEnvio[] | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  // Só a introdução, digitável livremente — a lista de links dos documentos NUNCA mora aqui: ela é
  // sempre recalculada a partir de `selected` e colada embaixo na hora de enviar (ver
  // mensagemFinal), pra escolher documentos continuar funcionando mesmo depois que a pessoa já
  // escreveu um texto próprio. Antes essa lista vinha misturada dentro do mesmo campo e parava de
  // se atualizar assim que a pessoa tocava no texto — bug relatado: "seleciono os documentos e os
  // links não estão indo".
  const [mensagem, setMensagem] = useState(() => mensagemPadraoEnvio(entity.titulo));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Recarrega a lista de contatos sugeridos sempre que o método muda — um mesmo contato pode ter
  // e-mail cadastrado e não ter telefone (ou vice-versa), então a lista de sugestões depende do
  // método escolhido (ver listarContatosEnvio em lib/actions/documentoEnvios.ts).
  useEffect(() => {
    setContatos(null);
    listarContatosEnvio(entityOrigem(entity), metodo).then(setContatos);
  }, [entity, metodo]);

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

  // Sempre em dia com a seleção atual, independente do que a pessoa escreveu em `mensagem` — é o
  // pedaço colado embaixo na hora de enviar (ver mensagemFinal).
  const linksBlock = useMemo(
    () => formatDocumentosLinks(selectedAttachments.map((a) => ({ nome: a.name, url: a.driveUrl }))),
    [selectedAttachments]
  );
  const mensagemFinal = linksBlock ? `${mensagem.trim()}\n\n${linksBlock}` : mensagem.trim();

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function handleConfirm() {
    if (!nome.trim()) return setError("Informe o nome do destinatário.");
    if (!contato.trim()) return setError(metodo === "EMAIL" ? "Informe o e-mail do destinatário." : "Informe o telefone do destinatário.");
    if (selected.length === 0) return setError("Selecione ao menos um documento.");

    setLoading(true);
    setError("");

    if (metodo === "EMAIL") {
      // Envio de verdade — a partir daqui o e-mail JÁ SAI, com os documentos anexados (ver
      // lib/actions/documentoEnvios.ts:enviarDocumentosPorEmail). Só grava o histórico se o envio
      // realmente funcionou.
      const res = await enviarDocumentosPorEmail({
        origem: entityOrigem(entity),
        destinatarioNome: nome.trim(),
        destinatarioContato: contato.trim(),
        documentoIds: selected,
        mensagem: mensagemFinal,
      });
      setLoading(false);
      if (res.error) {
        setError(res.error);
        return;
      }
      onClose();
      router.refresh();
      return;
    }

    // WHATSAPP: continua sendo registro + link de conveniência (wa.me) — nunca envia nada de
    // verdade (ver lib/documentoEnvios.ts).
    const res = await registrarEnvioDocumentos({
      origem: entityOrigem(entity),
      metodo,
      destinatarioNome: nome.trim(),
      destinatarioContato: contato.trim(),
      documentoIds: selected,
    });
    setLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    try {
      window.open(buildWhatsAppLink(contato.trim(), mensagemFinal), "_blank", "noopener,noreferrer");
    } catch {
      // silencioso — o registro já foi salvo, o link é só conveniência
    }
    onClose();
    router.refresh();
  }

  return (
    <ModalShell size="cheio" title="Enviar E-mail/WhatsApp" subtitle="Registra que estes documentos foram enviados a alguém." onClose={onClose}>
      <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 items-start">
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-tx-2 block mb-1">Método</label>
              <div className="flex gap-1.5 text-xs font-semibold">
                {(["EMAIL", "WHATSAPP"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setMetodo(m);
                      if (!contatoTocado) setContato("");
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 ${
                      metodo === m
                        ? "bg-acao text-acao-tx"
                        : "text-tx-2 hover:bg-sf-apoio border border-regua"
                    }`}
                  >
                    {m === "EMAIL" ? <Mail size={13} /> : <MessageCircle size={13} />}
                    {DOCUMENTO_ENVIO_METODO_LABELS[m]}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-tx-3 mt-1.5">
                {metodo === "EMAIL"
                  ? "Os documentos selecionados são anexados de verdade e o e-mail sai imediatamente ao confirmar."
                  : "O WhatsApp não permite anexar arquivo por link direto — a mensagem vai incluir o link de cada documento para o destinatário abrir. Isto abre o WhatsApp da própria pessoa; nada sai do sistema sozinho."}
              </p>
            </div>

            <div className="relative">
              <label className="text-xs font-medium text-tx-2">Destinatário</label>
              <div className="relative mt-1">
                <UserRound size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-tx-3" />
                <input
                  value={nome}
                  onChange={(e) => {
                    setNome(e.target.value);
                    setSugestoesAbertas(true);
                  }}
                  onFocus={() => setSugestoesAbertas(true)}
                  onBlur={() => setTimeout(() => setSugestoesAbertas(false), 150)}
                  placeholder="Nome (busque um contato cadastrado ou digite)"
                  className="w-full border border-regua pl-7 pr-2.5 py-2 text-sm bg-sf text-tx"
                />
              </div>
              {sugestoesAbertas && sugeridos.length > 0 && (
                <div className="absolute z-10 left-0 right-0 mt-1 bg-sf border border-regua shadow-pop max-h-48 overflow-y-auto scrollbar-thin">
                  {sugeridos.map((c) => (
                    <button
                      key={`${c.tipo}-${c.id}`}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => escolherContato(c)}
                      className="flex items-center justify-between gap-2 w-full px-3 py-2 text-sm text-left hover:bg-sf-apoio"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-tx">{c.name}</span>
                        <span className="block truncate text-[11px] text-tx-2">{c.contato}</span>
                      </span>
                      <span className="shrink-0 text-[10px] font-semibold text-tx-3 font-mono">{CONTATO_TIPO_LABEL[c.tipo]}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-tx-2">{metodo === "EMAIL" ? "E-mail" : "Telefone (WhatsApp)"}</label>
              <input
                value={contato}
                onChange={(e) => {
                  setContato(e.target.value);
                  setContatoTocado(true);
                }}
                type={metodo === "EMAIL" ? "email" : "tel"}
                placeholder={metodo === "EMAIL" ? "nome@exemplo.com" : "(62) 99999-9999"}
                className="w-full mt-1 border border-regua px-3 py-2 text-sm bg-sf text-tx"
              />
              <p className="text-[11px] text-tx-3 mt-1">
                Não encontrou o contato na busca acima? Pode digitar o {metodo === "EMAIL" ? "e-mail" : "telefone"} direto aqui.
              </p>
            </div>

            <div>
              <label className="text-xs font-medium text-tx-2">Mensagem</label>
              <textarea
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                rows={4}
                placeholder="Escreva a introdução da mensagem"
                className="w-full mt-1 border border-regua px-3 py-2 text-sm bg-sf text-tx resize-y"
              />
              <p className="text-[11px] text-tx-3 mt-1">
                {metodo === "EMAIL" ? "Vira o corpo do e-mail." : "Vira o texto da mensagem do WhatsApp."} O link de cada documento
                selecionado é colado logo abaixo automaticamente, sempre em dia com a seleção atual — revise tudo antes de confirmar.
              </p>
              {linksBlock && (
                <pre className="mt-1.5 whitespace-pre-wrap break-all text-[11px] text-tx-2 bg-sf-apoio border border-regua px-2.5 py-2 font-mono">
                  {linksBlock}
                </pre>
              )}
            </div>

            {selectedAttachments.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-tx-2 uppercase tracking-wide mb-1.5">
                  Documentos selecionados ({selectedAttachments.length})
                </p>
                <div className="border border-regua divide-y divide-regua">
                  {selectedAttachments.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                      <span className="flex-1 min-w-0 truncate text-tx">{a.name}</span>
                      <button onClick={() => toggle(a.id)} className="p-1 text-tx-3 hover:text-atencao shrink-0">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && <p className="text-xs font-medium text-urgente">{error}</p>}
          </div>

          <div>
            <p className="text-xs font-semibold text-tx-2 uppercase tracking-wide mb-1.5">
              {entity.tipo === "CASE"
                ? "Documentos do processo"
                : entity.tipo === "LICITACAO"
                  ? "Documentos da licitação"
                  : "Documentos da assessoria"}
            </p>
            <div className="relative mb-2">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-tx-3" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome"
                className="w-full text-xs border border-regua pl-7 pr-2.5 py-1.5 bg-sf text-tx"
              />
            </div>
            <div className="border border-regua divide-y divide-regua max-h-[50vh] overflow-y-auto scrollbar-thin">
              {disponiveis.length === 0 && <p className="px-3 py-3 text-xs text-tx-3">Nenhum documento encontrado.</p>}
              {disponiveis.map((a) => {
                const checked = selected.includes(a.id);
                const Icon = getDocumentTypeIcon(a.docType);
                return (
                  <label key={a.id} className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-sf-apoio">
                    <input type="checkbox" checked={checked} onChange={() => toggle(a.id)} className="h-4 w-4 rounded border-regua text-acao focus:ring-acao/40 shrink-0" />
                    <Icon size={14} className="text-tx-3 shrink-0" />
                    <span className="flex-1 min-w-0 truncate text-tx">{a.name}</span>
                    <span className="text-[10px] text-tx-3 font-mono shrink-0">{getDocumentTypeLabel(a.docType)}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="shrink-0 flex items-center justify-end gap-2 px-5 py-4 border-t border-regua bg-sf-apoio">
        <button onClick={onClose} className="text-sm font-semibold text-tx-2 hover:text-tx px-3 py-2">
          Cancelar
        </button>
        <button
          onClick={handleConfirm}
          disabled={loading}
          className="flex items-center gap-1.5 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-4 py-2 disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 size={14} className="animate-spin" /> {metodo === "EMAIL" ? "Enviando e-mail..." : "Registrando..."}
            </>
          ) : (
            <>
              <Send size={14} /> {metodo === "EMAIL" ? "Enviar e-mail" : "Registrar e abrir WhatsApp"}
            </>
          )}
        </button>
      </div>
    </ModalShell>
  );
}

// Histórico "Documentos enviados" — mesma ideia visual do histórico de protocolos (LoteCard em
// ProtocolosTab.tsx), só que sem ciclo de vida: um envio já nasce concluído.
export function HistoricoEnvios({ entity, envios }: { entity: EnvioEntity; envios: Envio[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [reabrindoId, setReabrindoId] = useState<string | null>(null);

  async function handleExcluir(id: string) {
    if (!window.confirm("Excluir este registro de envio? Isso não desfaz o e-mail/mensagem já mandado, só apaga o rastro dele aqui no sistema.")) return;
    setPendingId(id);
    await excluirEnvioDocumentos(id);
    setPendingId(null);
    router.refresh();
  }

  async function handleReabrir(envio: Envio) {
    setReabrindoId(envio.id);
    try {
      await reabrirWhatsApp(envio, entity);
    } finally {
      setReabrindoId(null);
    }
  }

  return (
    <div className="mt-6 pt-5 border-t border-regua">
      <h4 className=" font-bold text-tx">Documentos enviados</h4>
      <p className="text-xs font-semibold text-tx-3 font-mono mb-3 mt-1">
        {envios.length === 0 ? "Nenhum envio registrado ainda" : `${envios.length} envio${envios.length > 1 ? "s" : ""} registrado${envios.length > 1 ? "s" : ""}`}
      </p>
      {envios.length === 0 ? (
        <p className="text-sm text-tx-2 py-2">
          {entity.tipo === "CASE"
            ? 'Use "Enviar E-mail/WhatsApp" acima para mandar documentos a um cliente, advogado ou fornecedor fora do protocolo judicial/administrativo.'
            : entity.tipo === "LICITACAO"
              ? 'Use "Enviar E-mail/WhatsApp" acima para mandar documentos desta licitação a um cliente, advogado ou fornecedor.'
              : 'Use "Enviar E-mail/WhatsApp" acima para mandar documentos desta empresa a um cliente, advogado ou fornecedor.'}
        </p>
      ) : (
        <div className="space-y-3">
          {envios.map((envio) => (
            <div key={envio.id} className="border border-regua p-4 bg-sf">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex items-center gap-2">
                  {envio.metodo === "EMAIL" ? (
                    <Mail size={14} className="text-tx-3 shrink-0" />
                  ) : (
                    <MessageCircle size={14} className="text-tx-3 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="font-medium text-tx truncate">
                      Para {envio.destinatarioNome} <span className="text-tx-2 font-normal">({envio.destinatarioContato})</span>
                    </p>
                    <p className="text-xs text-tx-2 mt-0.5 font-mono">
                      {formatEnviadoEm(envio.enviadoEm)} · {envio.itens.length} documento(s) · {envio.enviadoPor?.name ?? "—"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {/* Reabrir só existe para WHATSAPP — um envio EMAIL já saiu de verdade, e
                      reabrir/reenviar sozinho geraria duplicidade sem intenção clara da pessoa. */}
                  {envio.metodo === "WHATSAPP" && (
                    <button
                      onClick={() => handleReabrir(envio)}
                      disabled={reabrindoId === envio.id}
                      title="Abrir WhatsApp de novo"
                      className="flex items-center gap-1 text-[11px] font-semibold text-marca-tx hover:underline px-2 py-1 disabled:opacity-50"
                    >
                      <Send size={11} /> {reabrindoId === envio.id ? "Abrindo..." : "Reabrir"}
                    </button>
                  )}
                  <button
                    onClick={() => handleExcluir(envio.id)}
                    disabled={pendingId === envio.id}
                    title="Excluir registro"
                    className="text-tx-3 hover:text-atencao p-1.5 hover:bg-atencao/10 disabled:opacity-50"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              <div className="mt-2 divide-y divide-regua border-t border-regua">
                {envio.itens.map((item) => {
                  const excluido =
                    entity.tipo === "CASE" || entity.tipo === "LICITACAO"
                      ? !item.attachmentId
                      : !item.assessoriaDocumentoId;
                  return (
                    <div key={item.id} className="flex items-center gap-2 py-1.5 text-sm">
                      <span className="flex-1 min-w-0 truncate text-tx" title={item.nomeSnapshot}>
                        {item.nomeSnapshot}
                        {excluido && <span className="text-[10px] text-atencao ml-1.5">(excluído)</span>}
                      </span>
                      <span className="text-[10px] text-tx-3 font-mono shrink-0">{getDocumentTypeLabel(item.docTypeSnapshot)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
