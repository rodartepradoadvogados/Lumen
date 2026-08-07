// Grau de jurisdição atual de um processo (Case.currentInstance/instance) — ver proposta de
// "Recurso → tribunal superior" aprovada em 2026-08-07. Só existem estes 3 valores fixos porque é
// o que qualquer processo brasileiro tem: 1º grau, 2º grau (TJ/TRF/TRT/TRE em recurso ordinário)
// e 3º grau/instância extraordinária (STJ/STF/TST/TSE/STM).
export const INSTANCIA_OPTIONS: { value: string; label: string }[] = [
  { value: "PRIMEIRO_GRAU", label: "Primeiro grau de jurisdição" },
  { value: "SEGUNDO_GRAU", label: "Segundo grau de jurisdição" },
  { value: "TERCEIRO_GRAU", label: "Terceiro grau de jurisdição" },
];

const INSTANCIA_LABELS: Record<string, string> = Object.fromEntries(INSTANCIA_OPTIONS.map((o) => [o.value, o.label]));

export function instanciaLabel(value: string | null | undefined): string {
  if (!value) return "Não definida";
  return INSTANCIA_LABELS[value] || value;
}

// Sugestão automática ao escolher um tribunal no pop-up de recurso (lib/tribunaisCatalog.ts
// categoria) — só um ponto de partida, o campo continua um <select> livre para o usuário trocar.
export function suggestInstanceForCategoria(categoria: string): string {
  return categoria === "Tribunais Superiores" ? "TERCEIRO_GRAU" : "SEGUNDO_GRAU";
}
