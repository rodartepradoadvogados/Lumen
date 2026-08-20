// Renderização de template de e-mail (documento 06, Fase 3 — "Editor de template com prévia").
// Módulo puro (sem Prisma) — usado pela prévia ao vivo no editor E pelo envio de teste, garante
// que as duas coisas rendem exatamente igual.

export const TEMPLATE_VARS = ["cliente", "processo", "tribunal", "prazo", "link", "responsavel", "teor"] as const;
export type TemplateVar = (typeof TEMPLATE_VARS)[number];
export type TemplateVarValues = Partial<Record<TemplateVar, string>>;

// Valores de amostra pra prévia/teste — nunca os dados reais de um destinatário (o editor é uma
// tela de configuração, não de envio de verdade).
export const SAMPLE_VARS: Record<TemplateVar, string> = {
  cliente: "Maria da Silva",
  processo: "0001234-56.2026.8.09.0051",
  tribunal: "TJGO",
  prazo: "09/09/2026",
  link: "https://lumen.adv.br/processos/exemplo",
  responsavel: "Jairo Rodarte",
  teor: "Intimação para manifestação em 15 dias.",
};

// "Variável sem valor não deixa linha vazia — a linha desaparece na renderização" (documento
// 06). Opera sobre o texto-fonte linha a linha (a pessoa edita HTML cru, ver TemplateEditor) —
// qualquer linha com pelo menos uma variável sem valor é removida inteira, não só a variável.
export function renderTemplateBody(html: string, vars: TemplateVarValues): string {
  const lines = html.split("\n");
  const kept = lines.filter((line) => {
    const matches = line.match(/\{\{(\w+)\}\}/g);
    if (!matches) return true;
    return matches.every((m) => {
      const key = m.slice(2, -2) as TemplateVar;
      const v = vars[key];
      return Boolean(v);
    });
  });
  return kept.map((line) => line.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key as TemplateVar] ?? "")).join("\n");
}

const NAVY = "#0b1730";
const GOLD = "#c6a05c";

// Rodapé OBRIGATÓRIO (documento 06) — de propósito NÃO é um campo editável do EmailTemplate:
// texto de cancelamento/LGPD não pode ser removido por engano ao editar o corpo. A aba "Rodapé e
// LGPD" do editor mostra este texto fixo, sem campo pra alterá-lo.
export const RODAPE_OBRIGATORIO = "Você recebe este resumo uma vez por dia. Alterar horário ou cancelar em Lúmen &gt; Comunicados.";

// Monta o e-mail completo — cabeçalho com logomarca, corpo renderizado (variáveis + linhas
// vazias removidas), bloco de prazo com filete ouro (só aparece se {{prazo}} tiver valor — é só
// mais uma linha sujeita à mesma regra acima), botão "Abrir no Lúmen" em tinta chapada, rodapé
// obrigatório. Tabela HTML de 600px, sem canto arredondado, Archivo com fallback Helvetica/Arial
// (documento 06) — Archivo não é um webfont carregado no e-mail (clientes de e-mail não buscam
// @font-face de fora de forma confiável), então o `font-family` já lista o fallback primeiro na
// prática: a intenção do documento é "a MESMA família tipográfica do produto quando disponível".
export function buildDigestEmailHtml(params: { subject: string; bodyHtml: string; url?: string; vars: TemplateVarValues }): string {
  const corpo = renderTemplateBody(params.bodyHtml, params.vars);
  const prazoLinha = params.vars.prazo
    ? `<tr><td style="padding:16px 24px 0;"><div style="border-left:3px solid ${GOLD};background:#f9f6ef;padding:10px 14px;font-size:13px;color:${NAVY};">Prazo: <strong>${params.vars.prazo}</strong></div></td></tr>`
    : "";
  const botao = params.url
    ? `<tr><td style="padding:20px 24px;text-align:center;"><a href="${params.url}" style="background:${NAVY};color:#fff;padding:12px 24px;text-decoration:none;font-weight:600;font-size:14px;display:inline-block;">Abrir no Lúmen</a></td></tr>`
    : "";

  return `
<table role="presentation" width="600" style="width:600px;max-width:100%;margin:0 auto;border-collapse:collapse;font-family:'Archivo',Helvetica,Arial,sans-serif;">
  <tr>
    <td style="background:${NAVY};padding:20px 24px;text-align:center;">
      <span style="color:#fff;font-size:18px;font-weight:700;letter-spacing:1px;">LÚMEN</span>
      <div style="height:2px;width:48px;background:${GOLD};margin:8px auto 0;"></div>
    </td>
  </tr>
  <tr>
    <td style="padding:24px 24px 0;">
      <h1 style="font-size:18px;color:${NAVY};margin:0;">${params.subject}</h1>
    </td>
  </tr>
  <tr>
    <td style="padding:12px 24px 0;font-size:14px;line-height:1.6;color:#222;">${corpo}</td>
  </tr>
  ${prazoLinha}
  ${botao}
  <tr>
    <td style="padding:20px 24px;border-top:1px solid #e5e0d5;font-size:11px;color:#888;">${RODAPE_OBRIGATORIO}</td>
  </tr>
</table>`;
}
