// Vocabulário fechado das Pendências do Atendimento (Fase 5) — o "quê" pedir ao lead e o "quê"
// mandar para ele, nas duas direções independentes (ver model AtendimentoPendencia,
// prisma/schema.prisma). Usado tanto pelo formulário de Novo Atendimento (marcar ao criar) quanto
// pela tela de detalhe (marcar depois, e ver o que falta).
export type PendenciaDirection = "SOLICITAR" | "ENVIAR";

export type PendenciaKindOption = {
  kind: string;
  label: string;
  // Só os tipos "em aberto" (Documentos/Informações "quais?" e Outros, dos dois lados) pedem uma
  // descrição livre além da caixinha marcada — os demais já são autoexplicativos pelo próprio rótulo.
  needsDescription?: boolean;
};

export const SOLICITAR_KIND_OPTIONS: PendenciaKindOption[] = [
  { kind: "DOCUMENTOS", label: "Documentos (quais)", needsDescription: true },
  { kind: "INFORMACOES", label: "Informações (quais)", needsDescription: true },
  { kind: "DOCUMENTO_IDENTIDADE", label: "Documento de identidade" },
  { kind: "COMPROVANTE_RESIDENCIA", label: "Comprovante de residência" },
  { kind: "PROCURACAO_ASSINADA", label: "Procuração assinada" },
  { kind: "COMPROVANTE_RENDA", label: "Comprovante de renda" },
  { kind: "OUTROS", label: "Outros", needsDescription: true },
];

export const ENVIAR_KIND_OPTIONS: PendenciaKindOption[] = [
  { kind: "PROCURACAO", label: "Procuração" },
  { kind: "DECLARACAO_HIPOSSUFICIENCIA", label: "Declaração de hipossuficiência" },
  { kind: "CONTRATO_HONORARIOS", label: "Contrato de honorários" },
  { kind: "PROPOSTA_HONORARIOS", label: "Proposta de honorários" },
  { kind: "LISTA_DOCUMENTOS", label: "Lista de documentos necessários" },
  { kind: "ORIENTACOES_INICIAIS", label: "Orientações iniciais" },
  { kind: "OUTROS", label: "Outros", needsDescription: true },
];

export const PENDENCIA_DIRECTION_LABELS: Record<PendenciaDirection, string> = {
  SOLICITAR: "Solicitar ao lead",
  ENVIAR: "Enviar ao lead",
};

export function pendenciaKindLabel(direction: string, kind: string): string {
  const options = direction === "ENVIAR" ? ENVIAR_KIND_OPTIONS : SOLICITAR_KIND_OPTIONS;
  return options.find((o) => o.kind === kind)?.label || kind;
}

export function pendenciaKindNeedsDescription(direction: string, kind: string): boolean {
  const options = direction === "ENVIAR" ? ENVIAR_KIND_OPTIONS : SOLICITAR_KIND_OPTIONS;
  return Boolean(options.find((o) => o.kind === kind)?.needsDescription);
}

// Resolução automática (item 3 da Fase 5): quando um anexo é registrado no atendimento com um
// destes tipos de documento (lib/documentTypes.ts), a pendência de ENVIAR equivalente fecha
// sozinha (status CONCLUIDA + completedAt), porque o documento em si É a prova de que aquele item
// foi entregue ao lead. São EXATAMENTE estes três porque são os únicos tipos do catálogo de
// documentos com correspondência 1:1 clara e inequívoca com um kind de "Enviar ao lead" — todo o
// resto (Documentos/Informações "quais?", Documento de identidade, Comprovante de residência,
// Procuração assinada, Comprovante de renda do lado Solicitar; Proposta de honorários, Lista de
// documentos necessários, Orientações iniciais e "Outros" dos dois lados) não tem um docType
// específico o bastante no catálogo para fechar sozinho sem risco de casar errado — essas
// continuam sendo fechadas à mão pelo próprio usuário na tela do atendimento.
export const DOC_TYPE_TO_PENDENCIA_ENVIAR: Record<string, string> = {
  PROCURACAO: "PROCURACAO",
  CONTRATO_HONORARIOS: "CONTRATO_HONORARIOS",
  DECLARACAO_HIPOSSUFICIENCIA: "DECLARACAO_HIPOSSUFICIENCIA",
};
