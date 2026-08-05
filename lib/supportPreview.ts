import { maskReadResult } from "@/lib/supportMaskingApply";
import { SUPPORT_MASK_MAP } from "@/lib/supportMaskingMap";

// Núcleo PURO da "prévia" (Fase C, comprovação nº 1 — "Ver como o suporte vê este escritório").
// Separado de app/(app)/configuracoes/acessos/previa/page.tsx pelo mesmo motivo de
// lib/breakGlass.ts vs lib/actions/breakGlass.ts: lógica sem next/headers, sem cookies(), sem
// JSX, então testável de um script solto (scripts/testar-comprovacao.ts) sem precisar subir o
// Next nem simular uma requisição.
//
// PONTO CRÍTICO DE HONESTIDADE: as duas únicas importações acima — `maskReadResult` e
// `SUPPORT_MASK_MAP` — são EXATAMENTE os módulos que lib/prisma.ts usa dentro da extensão
// "vidro-fosco" para mascarar de verdade toda leitura de uma sessão de suporte (ver o `import`
// idêntico em lib/prisma.ts, linha 3). Não existe aqui nenhuma função de máscara reimplementada,
// nenhuma tabela de campos copiada à mão: `fields` abaixo vem de `Object.keys(SUPPORT_MASK_MAP[...])`
// e `masked` vem de chamar a MESMA função que a extensão chama. Se o mapa mudar amanhã, tanto a
// extensão de produção quanto esta prévia mudam juntas, na mesma hora, porque leem a mesma fonte.

export type PreviewRow = Record<string, unknown>;

export const PREVIEW_SAMPLE_SIZE = 3;

// Modelos oferecidos na prévia — os mais sensíveis, pedidos explicitamente pelo escopo da
// Fase C. Nada impede estender esta lista no futuro; os campos exibidos continuam vindo do mapa,
// nunca escolhidos à mão por model novo que entrar aqui.
export const PREVIEW_MODELS = ["Case", "Client", "Receivable", "Publication"] as const;
export type PreviewModel = (typeof PREVIEW_MODELS)[number];

// Para cada linha real buscada pelo chamador (Server Component, com o `prisma` normal — sem
// cookie de suporte, então o retorno já é o dado real do próprio escritório), devolve os campos
// protegidos daquele model (lidos do mapa, não de uma lista própria) e o par [real, mascarado].
//
// `structuredClone` antes de mascarar porque `maskReadResult` opera IN PLACE (ver o comentário
// em lib/supportMaskingApply.ts) — sem clonar, mascarar destruiria o valor real que também
// precisamos mostrar ao lado.
export function buildMaskedComparison(
  modelName: string,
  rows: PreviewRow[]
): { fields: string[]; pairs: { real: PreviewRow; masked: PreviewRow }[] } {
  const fieldMap = SUPPORT_MASK_MAP[modelName] ?? {};
  const fields = Object.keys(fieldMap);
  const pairs = rows.map((real) => ({
    real,
    masked: maskReadResult(modelName, structuredClone(real)) as PreviewRow,
  }));
  return { fields, pairs };
}

export function maskKindFor(modelName: string, field: string): string | undefined {
  return SUPPORT_MASK_MAP[modelName]?.[field];
}

// Dinheiro nunca aparece, nem como "0" (ver lib/supportMasking.ts:maskMoney e a REGRA DE TIPO em
// lib/supportMaskingApply.ts — um Float obrigatório vira 0 pra não quebrar o tipo, o que seria
// indistinguível de um R$ 0,00 real). Por isso money é rotulado "oculto" pelo `kind` declarado,
// nunca pelo valor observado.
export function formatMaskedValue(kind: string | undefined, value: unknown): string {
  if (kind === "money") return "oculto";
  if (value === null || value === undefined || value === "") return "—";
  if (value instanceof Date) return value.toLocaleDateString("pt-BR");
  return String(value);
}

export function formatRealValue(kind: string | undefined, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (value instanceof Date) return value.toLocaleDateString("pt-BR");
  if (kind === "money" && typeof value === "number") {
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
  return String(value);
}
