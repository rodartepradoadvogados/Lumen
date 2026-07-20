export const PAYMENT_METHOD_OPTIONS = [
  { value: "DEBITO", label: "Débito" },
  { value: "CREDITO", label: "Crédito" },
  { value: "PIX", label: "PIX" },
  { value: "TRANSFERENCIA", label: "Transferência" },
  { value: "BOLETO", label: "Boleto" },
  { value: "OUTROS", label: "Outros" },
] as const;

export const paymentMethodLabels: Record<string, string> = Object.fromEntries(
  PAYMENT_METHOD_OPTIONS.map((o) => [o.value, o.label])
);
