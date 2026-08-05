import { SUPPORT_MASK_MAP } from "@/lib/supportMaskingMap";
import type { MaskKind } from "@/lib/supportMasking";

// Metadados PUROS do quebra-vidro POR REGISTRO (Fase B) — sem `prisma`, sem `next/headers`, sem
// nada server-only. Existe separado de lib/recordScope.ts justamente para poder ser importado
// por Client Components (ex.: components/BreakGlassReveal.tsx): se este arquivo importasse
// lib/prisma.ts (que puxa @prisma/client), o bundler tentaria colocar o client do Prisma no
// bundle do navegador e quebraria o build.

// Lista fechada. NUNCA aceitar um scopeType que não esteja aqui — validar contra este array (via
// isRecordScopeType) é a única defesa contra alguém mandar um valor inventado a partir do client.
// Mesmo universo previsto pelo schema (ver comentário de AccessRequest.scopeType/scopeId em
// prisma/schema.prisma: "CASE | PAYABLE | RECEIVABLE | ATTENDANCE").
export const RECORD_SCOPE_TYPES = ["CASE", "PAYABLE", "RECEIVABLE", "ATTENDANCE"] as const;
export type RecordScopeType = (typeof RECORD_SCOPE_TYPES)[number];

export function isRecordScopeType(value: string): value is RecordScopeType {
  return (RECORD_SCOPE_TYPES as readonly string[]).includes(value);
}

// Model do Prisma correspondente a cada scopeType — usado para ler SUPPORT_MASK_MAP (os campos
// que a Fase A esconde daquele model, e que o quebra-vidro revela) sem duplicar a lista de campos
// à mão num segundo lugar.
export const RECORD_SCOPE_MODEL: Record<RecordScopeType, keyof typeof SUPPORT_MASK_MAP> = {
  CASE: "Case",
  PAYABLE: "Payable",
  RECEIVABLE: "Receivable",
  ATTENDANCE: "Attendance",
};

// Rótulo em português (minúsculo, para compor frase — "dados reais do processo X").
export const RECORD_SCOPE_LABEL: Record<RecordScopeType, string> = {
  CASE: "processo",
  PAYABLE: "conta a pagar",
  RECEIVABLE: "conta a receber",
  ATTENDANCE: "atendimento",
};

// Campos escalares que o quebra-vidro revela para este scopeType: exatamente os campos que
// SUPPORT_MASK_MAP esconde para o model correspondente — nunca mais que isso (ver o comentário
// no topo de lib/supportMaskingMap.ts sobre o que fica de fora: id, FK, status, data, contador —
// esses o suporte já enxerga sem quebra-vidro nenhum).
export function revealFieldsFor(scopeType: RecordScopeType): string[] {
  return Object.keys(SUPPORT_MASK_MAP[RECORD_SCOPE_MODEL[scopeType]] ?? {});
}

// Mesmo mapa, mas campo -> MaskKind (para a UI saber, por exemplo, formatar "money" como moeda em
// vez de jogar o número cru). Nenhuma informação sensível aqui — só os NOMES dos campos e o TIPO
// de máscara, os mesmos que já são públicos em lib/supportMaskingMap.ts.
export function revealFieldKinds(scopeType: RecordScopeType): Record<string, MaskKind> {
  return SUPPORT_MASK_MAP[RECORD_SCOPE_MODEL[scopeType]] ?? {};
}

// Rótulo em português de cada campo revelável, para exibição na UI do quebra-vidro. Só precisa
// cobrir os campos que aparecem em revealFieldsFor(...) para os 4 scopeTypes suportados — campos
// mascarados de outros models (Client, Attachment, GoogleCredential...) não entram aqui porque a
// Fase B não expõe quebra-vidro para eles ainda (ver limitações no relatório).
export const FIELD_LABELS: Record<string, string> = {
  // Case
  title: "Título",
  description: "Descrição",
  decision: "Decisão",
  outcome: "Desfecho",
  processNumber: "Número do processo",
  folder: "Pasta",
  tags: "Etiquetas",
  sourceUrl: "Link de origem",
  caseValue: "Valor da causa",
  convictionValue: "Valor da condenação",
  economicBenefitValue: "Proveito econômico",
  agreementValue: "Valor do acordo",
  opposingPartyName: "Parte adversa — nome",
  opposingPartyDocument: "Parte adversa — CPF/CNPJ",
  opposingPartyAddress: "Parte adversa — endereço",
  lastHistoryDesc: "Último andamento",
  // Payable / Receivable
  supplier: "Fornecedor",
  amount: "Valor",
  paidAmount: "Valor pago",
  discount: "Desconto",
  surcharge: "Acréscimo",
  percentual: "Percentual",
  documentNumber: "Nº do documento",
  paymentReceiptNumber: "Nº do comprovante",
  installmentBoleto: "Boleto da parcela",
  notes: "Observações",
  payerName: "Pagador",
  // Attendance
  clientName: "Nome do cliente",
  contact: "Contato",
  contactPhone: "Telefone de contato",
  clientEmail: "E-mail do cliente",
  waPhone: "WhatsApp",
  subject: "Assunto",
  lostReason: "Motivo de perda",
  estimatedValue: "Valor estimado",
  feePercentual: "Percentual de honorário pretendido",
};
