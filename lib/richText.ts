// Helpers do editor de texto rico (components/RichTextEditor.tsx — negrito/itálico/sublinhado/
// lista com marcadores/lista numerada, contentEditable + document.execCommand, sem dependência
// nova) e do HTML que ele produz. Nasceu em lib/anotacoes.ts (só para o painel Anotações) e
// virou compartilhado quando o mesmo editor passou a ser usado também na Descrição de
// Tarefa/Evento/Prazo/Compromisso (agosto/2026) — lib/anotacoes.ts reexporta estas funções pelos
// nomes antigos para não quebrar quem já as importava de lá.
import sanitizeHtml from "sanitize-html";

// Tags permitidas no HTML salvo — exatamente o que o editor (negrito/itálico/sublinhado/lista
// com marcadores/lista numerada) e a conversão de texto simples (formulário mobile) produzem.
// Qualquer outra tag é removida (mantendo o texto interno); os atributos são sempre descartados
// (inclusive de tags permitidas, allowedAttributes: {} abaixo), o que já elimina on*="", style="" e
// afins sem precisar de uma lista de atributos bloqueados.
const ALLOWED_TAGS = ["b", "strong", "i", "em", "u", "ul", "ol", "li", "br", "p", "div", "span"];

// SEGURANÇA (achado V9, auditoria de 05/09/2026): antes, sanitização por regex artesanal (sem
// parser HTML de verdade) — nenhum bypass foi confirmado na auditoria, mas essa classe de solução
// é reconhecidamente frágil contra mutation-XSS (a OWASP desaconselha sanitizar HTML só com
// regex), e a superfície coberta cresceu de "só Anotações" para também Descrição de
// Tarefa/Evento/Prazo/Compromisso. sanitize-html analisa uma árvore de verdade (via htmlparser2),
// em vez de uma sequência de replace() sobre a string crua — sem depender de jsdom (o pacote usado
// antes, isomorphic-dompurify, puxava jsdom, que por sua vez puxa um pacote ESM-only incompatível
// com o empacotamento CJS das Server Actions/rotas na Vercel — travava em runtime com
// ERR_REQUIRE_ESM em qualquer página que renderiza o painel Anotações, ou seja, o app inteiro).
// Roda sempre no servidor, tanto para o HTML vindo do editor rico (desktop) quanto para o texto
// simples convertido do formulário mobile (plainTextToHtml abaixo) — ponto único de defesa, não
// confia na origem da chamada.
export function sanitizeRichTextHtml(html: string): string {
  if (!html) return "";
  return sanitizeHtml(html, { allowedTags: ALLOWED_TAGS, allowedAttributes: {} }).trim();
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
