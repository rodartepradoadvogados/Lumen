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

// Tags permitidas no HTML salvo — exatamente o que o editor (negrito/itálico/sublinhado/lista
// com marcadores/lista numerada) e a conversão de texto simples (formulário mobile) produzem.
// Qualquer outra tag é removida (mantendo o texto interno); os atributos são sempre descartados
// (inclusive de tags permitidas), o que já elimina on*="", style="" e afins sem precisar de uma
// lista de atributos bloqueados.
const ALLOWED_TAGS = new Set(["b", "strong", "i", "em", "u", "ul", "ol", "li", "br", "p", "div", "span"]);

// Sanitização simples baseada em regex (sem dependência nova — ver decisão do editor em
// components/anotacoes/RichTextEditor.tsx). Roda sempre no servidor, tanto para o HTML vindo do
// editor rico (desktop) quanto para o texto simples convertido do formulário mobile
// (plainTextToHtml abaixo) — ponto único de defesa, não confia na origem da chamada.
export function sanitizeAnotacaoHtml(html: string): string {
  if (!html) return "";
  let out = html;
  // Remove por completo tags perigosas e todo o conteúdo interno delas.
  out = out.replace(/<(script|style|iframe|object|embed|link|meta|form|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  out = out.replace(/<(script|style|iframe|object|embed|link|meta|form|svg)\b[^>]*\/?>/gi, "");
  // Qualquer outra tag fora da lista permitida é removida, mas o texto interno é preservado;
  // tags permitidas perdem todos os atributos.
  out = out.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (match, tagName: string) => {
    const tag = tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    return match.startsWith("</") ? `</${tag}>` : `<${tag}>`;
  });
  return out.trim();
}

// Considera "vazio" um HTML que, depois de remover as tags, não sobra nenhum caractere visível
// (o editor contentEditable costuma deixar um <p><br></p> ou similar quando o usuário apaga tudo).
export function isAnotacaoContentEmpty(html: string): boolean {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length === 0;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Usado pelo formulário simples do app mobile (textarea, sem editor rico — ver decisão de
// escopo mobile no relatório da entrega) para gerar o mesmo formato de HTML salvo pelo editor
// desktop, preservando quebras de linha como parágrafos.
export function plainTextToHtml(text: string): string {
  const lines = text.split(/\r?\n/);
  return lines.map((line) => `<p>${line.trim() ? escapeHtml(line) : "<br>"}</p>`).join("");
}

// Formato yyyy-mm-dd em horário LOCAL (não UTC) — mesmo padrão do valor nativo de um
// <input type="date">, usado tanto para inicializar o campo "Consignar em" quanto pelo botão
// "Hoje".
export function todayIsoDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
