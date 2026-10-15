import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, verdade, igual, resumo } from "./executar";

// ============================================================================
// CONTRASTE DA CENTRAL NA IDENTIDADE DO APP (15/10/2026, DESIGN.md §9.1).
//
// Esta suíte media o "polish do fundo azul" (F5.5): os hex próprios da Central (--list-bg, a moldura
// azul-marinho fixa, o acento #569ad2). Em 15/10/2026 o dono aprovou levar a identidade do app de
// Atendimento à Central, e aqueles hex saíram — a folha da Central passou a APONTAR para os tokens do
// app (--atd-*, app/globals.css). O que continua valendo é a regra da casa (PRODUCT.md: WCAG AA como
// piso), agora medida nos PARES que a Central de fato pinta, a partir dos hex que estão HOJE nos dois
// blocos do app (Dia e Noite) — nunca de número citado em comentário.
// ============================================================================

const RAIZ = process.cwd();
const GLOBAL = readFileSync(join(RAIZ, "app", "globals.css"), "utf8");
const CENTRAL = readFileSync(join(RAIZ, "app", "atendimento-central", "atendimento-central.css"), "utf8");

function canal(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
function luminancia(hex: string): number {
  const h = hex.replace("#", "");
  return 0.2126 * canal(parseInt(h.slice(0, 2), 16)) + 0.7152 * canal(parseInt(h.slice(2, 4), 16)) + 0.0722 * canal(parseInt(h.slice(4, 6), 16));
}
function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** O corpo do bloco que começa em `cabecalho` (até a primeira `}` em início de linha). */
function bloco(cabecalho: string): string {
  const i = GLOBAL.indexOf(cabecalho);
  if (i < 0) throw new Error(`não achei o bloco ${cabecalho.trim()}`);
  return GLOBAL.slice(i, GLOBAL.indexOf("\n}", i));
}
const DIA = bloco("\n.atendimento-shell {");
const NOITE = bloco(".atendimento-dark {");

/** Resolve `--nome` no tema: hex direto, ou `var(--outro)` que leva a um hex (o Noite herda do Dia o que não redeclara). */
function cor(tema: "dia" | "noite", nome: string, profundidade = 0): string {
  const fontes = tema === "noite" ? [NOITE, DIA] : [DIA];
  for (const f of fontes) {
    const m = f.match(new RegExp(`--${nome}:\\s*([^;]+);`));
    if (!m) continue;
    const v = m[1].trim();
    if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
    const ref = v.match(/^var\(--([a-z0-9-]+)\)$/);
    if (ref && profundidade < 4) return cor(tema, ref[1], profundidade + 1);
  }
  throw new Error(`--${nome} sem hex no tema ${tema}`);
}

const AA = 4.5;
const CONTROLE = 3;

// [texto, fundo, onde aparece na Central]
const PARES_DE_TEXTO: [string, string, string][] = [
  ["atd-tinta", "atd-tela", "nome do cliente, título de 26px"],
  ["atd-cinza-previa", "atd-tela", "prévia da última mensagem, alvo inativo do trilho"],
  ["atd-cinza-terciario", "atd-tela", "hora, assunto, contagem"],
  ["atd-texto-ouro", "atd-ouro-suave", "filtro/alvo ativo, 'N esperando resposta', etiqueta de fase"],
  ["atd-tinta", "atd-ouro-suave", "a linha selecionada da lista"],
  ["atd-texto-ouro", "atd-tela", "hora de quem espera, anel de foco"],
  ["atd-selo-tx", "atd-ouro", "selo do trilho, botão Enviar, Iniciar conversa"],
  ["atd-cinza-terciario", "atd-pilula-bg", "placeholder da busca e da resposta"],
  ["atd-balao-out-tx", "atd-balao-out", "texto do balão enviado"],
  ["atd-balao-out-sec", "atd-balao-out", "hora e tiques no balão enviado"],
];

for (const tema of ["dia", "noite"] as const) {
  const nome = tema === "dia" ? "Dia" : "Noite";
  teste(`AA em ${nome}: todo texto que a Central escreve passa de 4,5:1 sobre o próprio fundo`, () => {
    for (const [tx, bg, onde] of PARES_DE_TEXTO) {
      const c = contraste(cor(tema, tx), cor(tema, bg));
      verdade(c >= AA, `${nome}: --${tx} sobre --${bg} (${onde}) mede ${c.toFixed(2)}:1`);
    }
  });
  teste(`${nome}: a borda do campo em foco passa de 3:1 contra a tela (WCAG 1.4.11)`, () => {
    const c = contraste(cor(tema, "atd-campo-borda"), cor(tema, "atd-tela"));
    verdade(c >= CONTROLE, `${nome}: --atd-campo-borda sobre --atd-tela mede ${c.toFixed(2)}:1`);
  });
}

teste("a folha da Central não tem cor própria: os tokens dela apontam para os do app", () => {
  verdade(!/#[0-9a-fA-F]{3,8}\b/.test(CENTRAL.replace(/\/\*[\s\S]*?\*\//g, "")), "atendimento-central.css voltou a ter hex próprio");
  for (const t of ["frame-bg", "frame-accent", "frame-accent-bg", "list-bg", "work-bg", "atd-border"]) {
    verdade(new RegExp(`--${t}:\\s*var\\(--atd-`).test(CENTRAL), `--${t} não aponta para um token do app`);
  }
  // O acento em TEXTO é o ouro escuro (legível); o ouro cheio só como fundo de selo e de envio.
  igual(CENTRAL.match(/--frame-accent:\s*([^;]+);/)?.[1], "var(--atd-texto-ouro)");
});

teste("o azul aposentado não volta: nem #569ad2, nem a moldura #090d14", () => {
  verdade(!/#569ad2|#090d14/i.test(CENTRAL.replace(/\/\*[\s\S]*?\*\//g, "")), "a cor da moldura antiga voltou para a Central");
});

resumo("Central de Atendimento — contraste na identidade do app (15/10/2026)");
