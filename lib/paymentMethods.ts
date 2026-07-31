export const PAYMENT_METHOD_OPTIONS = [
  { value: "DEBITO", label: "Débito" },
  { value: "CREDITO", label: "Crédito" },
  { value: "PIX", label: "PIX" },
  { value: "TRANSFERENCIA", label: "Transferência" },
  { value: "BOLETO", label: "Boleto" },
  // Adicionado na Fase 2 do Lançamento de Honorários (bloco Recebimento) — FinancePayment já
  // previa DINHEIRO no seu comentário de schema desde a Fase 1, mas esta lista compartilhada
  // (também usada por Contas a Pagar/Receber) ainda não tinha a opção.
  { value: "DINHEIRO", label: "Dinheiro" },
  { value: "OUTROS", label: "Outros" },
] as const;

export const paymentMethodLabels: Record<string, string> = Object.fromEntries(
  PAYMENT_METHOD_OPTIONS.map((o) => [o.value, o.label])
);
