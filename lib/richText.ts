// Helpers do editor de texto rico (components/RichTextEditor.tsx — negrito/itálico/sublinhado/
// lista com marcadores/lista numerada, contentEditable + document.execCommand, sem dependência
// nova) e do HTML que ele produz. Nasceu em lib/anotacoes.ts (só para o painel Anotações) e
// virou compartilhado quando o mesmo editor passou a ser usado também na Descrição de
// Tarefa/Evento/Prazo/Compromisso (agosto/2026) — lib/anotacoes.ts reexporta estas funções pelos
// nomes antigos para não quebrar quem já as importava de lá.

// Tags permitidas no HTML salvo — exatamente o que o editor (negrito/itálico/sublinhado/lista
// com marcadores/lista numerada) e a conversão de texto simples (formulário mobile) produzem.
// Qualquer outra tag é removida (mantendo o texto interno); os atributos são sempre descartados
// (inclusive de tags permitidas), o que já elimina on*="", style="" e afins sem precisar de uma
// lista de atributos bloqueados.
const ALLOWED_TAGS = new Set(["b", "strong", "i", "em", "u", "ul", "ol", "li", "br", "p", "div", "span"]);

// Sanitização simples baseada em regex (sem dependência nova). Rodar sempre no servidor, tanto
// para o HTML vindo do editor rico (desktop) quanto para o texto simples convertido do
// formulário mobile (plainTextToHtml abaixo) — ponto único de defesa, não confia na origem da
// chamada.
export function sanitizeRichTextHtml(html: string): string {
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
export function isRichTextEmpty(html: string): boolean {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length === 0;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Usado por formulários simples sem editor rico (ex.: app mobile, textarea) para gerar o mesmo
// formato de HTML salvo pelo editor desktop, preservando quebras de linha como parágrafos.
export function plainTextToHtml(text: string): string {
  const lines = text.split(/\r?\n/);
  return lines.map((line) => `<p>${line.trim() ? escapeHtml(line) : "<br>"}</p>`).join("");
}
