// Domínio dos Envios de Documentos (botão "Enviar E-mail/WhatsApp" na aba Protocolos) — ver
// models DocumentoEnvio e DocumentoEnvioItem em prisma/schema.prisma.
//
// Diferença central para um ProtocoloLote (lib/protocolos.ts): um envio não é dirigido a um
// tribunal/órgão, não tem número oficial e não representa nenhum ato processual — é só o rastro
// de "mandei estes documentos para fulano, por e-mail/WhatsApp, no dia tal". Por isso não tem
// ciclo de vida (status EM_PREPARO/PRONTO/...): o registro nasce pronto, no momento da confirmação.
//
// Mesma regra de sempre: nunca guarda arquivo, só referencia Attachment (DocumentoEnvioItem).

export type DocumentoEnvioMetodo = "EMAIL" | "WHATSAPP";

export const DOCUMENTO_ENVIO_METODOS: DocumentoEnvioMetodo[] = ["EMAIL", "WHATSAPP"];

export const DOCUMENTO_ENVIO_METODO_LABELS: Record<DocumentoEnvioMetodo, string> = {
  EMAIL: "E-mail",
  WHATSAPP: "WhatsApp",
};

export function isDocumentoEnvioMetodo(v: string): v is DocumentoEnvioMetodo {
  return DOCUMENTO_ENVIO_METODOS.includes(v as DocumentoEnvioMetodo);
}

// ---------------------------------------------------------------------------
// Links de conveniência (mailto:/wa.me) — NÃO enviam nada de verdade, só abrem o cliente de
// e-mail/WhatsApp do próprio usuário já com o texto pronto. O registro no banco (DocumentoEnvio)
// é o que conta como "enviado" no histórico; estes links são só um atalho para reduzir trabalho
// manual de quem já confirmou que vai mandar.
// ---------------------------------------------------------------------------

// Mantém dígitos, e o "+" quando é o primeiro caractere (formato internacional) — o resto
// (espaço, parênteses, hífen) é só formatação visual de quem digitou o telefone.
export function sanitizePhoneForWhatsApp(raw: string): string {
  const trimmed = raw.trim();
  const plus = trimmed.startsWith("+") ? "+" : "";
  return plus + trimmed.replace(/\D/g, "");
}

export function buildMailtoLink(to: string, subject: string, body: string): string {
  const params = new URLSearchParams({ subject, body });
  // URLSearchParams usa "+" para espaço; mailto: espera "%20" — troca depois de montar a string.
  return `mailto:${encodeURIComponent(to)}?${params.toString().replace(/\+/g, "%20")}`;
}

export function buildWhatsAppLink(phone: string, text: string): string {
  const digits = sanitizePhoneForWhatsApp(phone).replace(/^\+/, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

// Texto padrão da mensagem/e-mail — lista os documentos enviados, um por linha. Compartilhado
// entre o mailto: (corpo) e o wa.me (texto da mensagem) para não duplicar a formatação.
export function formatEnvioMensagem(caseTitle: string, nomesDocumentos: string[]): string {
  const lista = nomesDocumentos.map((n) => `- ${n}`).join("\n");
  return `Segue(m) o(s) documento(s) referente(s) ao processo "${caseTitle}":\n\n${lista}`;
}
