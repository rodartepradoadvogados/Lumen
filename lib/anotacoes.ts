// Vocabulário e helpers compartilhados do painel global "Anotações" (ver
// components/anotacoes/AnotacoesContext.tsx para o estado do painel e
// lib/actions/anotacoes.ts para os Server Actions que gravam no banco).

export type AnotacaoLinkType =
  | "PROCESSO_JUDICIAL"
  | "PROCESSO_ADMINISTRATIVO"
  | "CASO"
  | "ASSESSORIA"
  | "ATENDIMENTO"
  | "FINANCEIRO"
  | "OUTROS";

export const ANOTACAO_LINK_TYPES: AnotacaoLinkType[] = [
  "PROCESSO_JUDICIAL",
  "PROCESSO_ADMINISTRATIVO",
  "CASO",
  "ASSESSORIA",
  "ATENDIMENTO",
  "FINANCEIRO",
  "OUTROS",
];

export const ANOTACAO_LINK_LABELS: Record<AnotacaoLinkType, string> = {
  PROCESSO_JUDICIAL: "Processo Judicial",
  PROCESSO_ADMINISTRATIVO: "Processo Administrativo",
  CASO: "Caso",
  ASSESSORIA: "Assessoria",
  ATENDIMENTO: "Atendimento",
  FINANCEIRO: "Financeiro",
  OUTROS: "Outros",
};

// Chips que revelam o seletor de entidade específica (EntityPicker) — os outros dois
// (Financeiro/Outros) não têm "página da entidade" nenhuma para vincular.
export function anotacaoLinkNeedsEntity(t: AnotacaoLinkType): boolean {
  return t === "PROCESSO_JUDICIAL" || t === "PROCESSO_ADMINISTRATIVO" || t === "CASO" || t === "ASSESSORIA" || t === "ATENDIMENTO";
}

export function isAnotacaoLinkType(v: string): v is AnotacaoLinkType {
  return (ANOTACAO_LINK_TYPES as string[]).includes(v);
}

// Sanitização/checagem de vazio/conversão de texto simples do editor rico — viviam aqui até virar
// compartilhadas com a Descrição de Tarefa/Evento/Prazo (agosto/2026); ver lib/richText.ts para a
// implementação. Reexportadas com os nomes antigos para não quebrar quem já importava daqui
// (lib/actions/anotacoes.ts, components/mobile/MobileNovaAnotacaoForm.tsx).
export {
  sanitizeRichTextHtml as sanitizeAnotacaoHtml,
  isRichTextEmpty as isAnotacaoContentEmpty,
  plainTextToHtml,
} from "@/lib/richText";

// Formato yyyy-mm-dd em horário LOCAL (não UTC) — mesmo padrão do valor nativo de um
// <input type="date">, usado tanto para inicializar o campo "Consignar em" quanto pelo botão
// "Hoje".
export function todayIsoDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
