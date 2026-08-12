// Domínio dos Envios de Documentos (botão "Enviar E-mail/WhatsApp" — aba Protocolos de um
// Processo, ou aba "Pareceres, Processos e Casos" de uma Assessoria) — ver models DocumentoEnvio
// e DocumentoEnvioItem em prisma/schema.prisma.
//
// Diferença central para um ProtocoloLote (lib/protocolos.ts): um envio não é dirigido a um
// tribunal/órgão, não tem número oficial e não representa nenhum ato processual — é só o rastro
// de "mandei estes documentos para fulano, por e-mail/WhatsApp, no dia tal". Por isso não tem
// ciclo de vida (status EM_PREPARO/PRONTO/...): o registro nasce pronto, no momento da confirmação.
//
// Mesma regra de sempre: nunca guarda arquivo, só referencia Attachment (Processo) ou
// AssessoriaDocumento (Assessoria) — ver DocumentoEnvioItem.
//
// EMAIL e WHATSAPP têm mecanismos bem diferentes por trás, cada um limitado pela própria
// plataforma que usa:
// - EMAIL sai de verdade, com o conteúdo dos documentos anexado (ver
//   lib/actions/documentoEnvios.ts:enviarDocumentosPorEmail + lib/gmailSend.ts/
//   lib/microsoftGraph.ts) — a conta Google/Microsoft que a pessoa conectou em Configurações.
// - WHATSAPP continua sendo um link de conveniência (wa.me) que abre o WhatsApp da própria
//   pessoa com o texto pronto — a URL scheme do WhatsApp não tem como embutir um arquivo binário
//   de verdade (só texto), então a mensagem inclui o LINK de cada documento para o destinatário
//   abrir, não o arquivo em si. Nenhuma integração de envio real acontece por aqui.

export type DocumentoEnvioMetodo = "EMAIL" | "WHATSAPP";

export const DOCUMENTO_ENVIO_METODOS: DocumentoEnvioMetodo[] = ["EMAIL", "WHATSAPP"];

export const DOCUMENTO_ENVIO_METODO_LABELS: Record<DocumentoEnvioMetodo, string> = {
  EMAIL: "E-mail",
  WHATSAPP: "WhatsApp",
};

export function isDocumentoEnvioMetodo(v: string): v is DocumentoEnvioMetodo {
  return DOCUMENTO_ENVIO_METODOS.includes(v as DocumentoEnvioMetodo);
}

// Mantém dígitos, e o "+" quando é o primeiro caractere (formato internacional) — o resto
// (espaço, parênteses, hífen) é só formatação visual de quem digitou o telefone.
export function sanitizePhoneForWhatsApp(raw: string): string {
  const trimmed = raw.trim();
  const plus = trimmed.startsWith("+") ? "+" : "";
  return plus + trimmed.replace(/\D/g, "");
}

// wa.me: link de conveniência que abre o WhatsApp da própria pessoa — NÃO envia nada de verdade
// (ver comentário do topo do arquivo). O registro no banco (DocumentoEnvio) é o que conta como
// "enviado" no histórico; este link é só um atalho para reduzir trabalho manual de quem já
// confirmou que vai mandar.
export function buildWhatsAppLink(phone: string, text: string): string {
  const digits = sanitizePhoneForWhatsApp(phone).replace(/^\+/, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

// Lista de links, um documento por linha — o pedaço que precisa ficar sempre em dia com a seleção
// atual de documentos, mesmo depois que a pessoa já editou a mensagem à mão (ver
// components/DocumentoEnvios.tsx: a mensagem livre e este bloco de links são compostos
// separadamente na hora de enviar, exatamente para a escolha de documentos nunca deixar de
// aparecer só porque a pessoa escreveu um texto antes). `url` pode ser um aviso textual em vez de
// um link de verdade quando o documento original já foi excluído (ver HistoricoEnvios).
export function formatDocumentosLinks(documentos: { nome: string; url: string }[]): string {
  return documentos.map((d) => `- ${d.nome}: ${d.url}`).join("\n");
}

// Texto inicial sugerido para o campo de mensagem — só a introdução, sem a lista de documentos
// (essa vem sempre à parte, ver formatDocumentosLinks acima). `titulo` é neutro de propósito (nome
// do processo ou da empresa da assessoria) — funciona para as duas origens sem precisar saber qual
// é.
export function mensagemPadraoEnvio(titulo: string): string {
  return `Segue(m) o(s) documento(s) referente(s) a "${titulo}":`;
}

// Mensagem completa (introdução + lista) — usada onde não há edição manual em jogo, como ao
// reabrir o WhatsApp de um envio já registrado no histórico (reabrirWhatsApp).
export function formatEnvioMensagem(titulo: string, documentos: { nome: string; url: string }[]): string {
  return `${mensagemPadraoEnvio(titulo)}\n\n${formatDocumentosLinks(documentos)}`;
}
