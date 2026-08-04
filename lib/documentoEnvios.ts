// Domínio dos Envios de Documentos (botão "Enviar E-mail/WhatsApp" na aba Protocolos) — ver
// models DocumentoEnvio e DocumentoEnvioItem em prisma/schema.prisma.
//
// Diferença central para um ProtocoloLote (lib/protocolos.ts): um envio não é dirigido a um
// tribunal/órgão, não tem número oficial e não representa nenhum ato processual — é só o rastro
// de "mandei estes documentos para fulano, por e-mail/WhatsApp, no dia tal". Por isso não tem
// ciclo de vida (status EM_PREPARO/PRONTO/...): o registro nasce pronto, no momento da confirmação.
//
// Mesma regra de sempre: nunca guarda arquivo, só referencia Attachment (DocumentoEnvioItem).
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

// Texto padrão da mensagem — lista cada documento com o respectivo link (Attachment.driveUrl),
// não só o nome, para o destinatário conseguir abrir o arquivo a partir da própria mensagem
// (essencial no WhatsApp, que não anexa arquivo de verdade; inofensivo/redundante no e-mail, que
// já leva o arquivo anexado de verdade — mas serve de referência mesmo assim, e a mensagem é
// editável antes de confirmar em ambos os métodos). `url` pode ser um aviso textual em vez de um
// link de verdade quando o documento original já foi excluído (ver HistoricoEnvios).
export function formatEnvioMensagem(caseTitle: string, documentos: { nome: string; url: string }[]): string {
  const lista = documentos.map((d) => `- ${d.nome}: ${d.url}`).join("\n");
  return `Segue(m) o(s) documento(s) referente(s) ao processo "${caseTitle}":\n\n${lista}`;
}
