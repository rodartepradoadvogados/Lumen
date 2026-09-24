import { readFileSync } from "node:fs";
import { teste, verdade, resumo } from "./executar";

// ============================================================================
// O POLISH DO FUNDO AZUL DA CENTRAL (F5.5, item 7) — "o fundo azul do atendimento está muito
// pálido [...] ficou meio parecendo sem profissionalismo". A correção (ver o comentário extenso em
// app/atendimento-central/atendimento-central.css) subiu a SATURAÇÃO de --list-bg/--list-bg-hover/
// --work-bg-raised/--frame-accent mantendo a luminosidade parecida — mas "parecida" não é "igual",
// e QUALQUER refinamento de cor nesta casa que reduza contraste de texto abaixo do piso WCAG AA
// (PRODUCT.md: "WCAG AA como piso da casa") seria trocar um defeito estético por um de
// acessibilidade. Este teste CALCULA a luminância relativa e o contraste de verdade (fórmula WCAG
// 2.x) a partir dos hex que estão HOJE no arquivo — não confia em número comentado, que pode ficar
// desatualizado no próximo ajuste de cor sem que ninguém perceba.
// ============================================================================

function canal(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminancia(hex: string): number {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

function contraste(a: string, b: string): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  const [maior, menor] = la >= lb ? [la, lb] : [lb, la];
  return (maior + 0.05) / (menor + 0.05);
}

/** Lê `--nome: #hex;` do CSS — regex simples, mas o arquivo é pequeno e as declarações são
 * sempre nesta forma (conferido lendo o arquivo: nenhuma delas usa `rgb()`/`hsl()` para as que
 * este teste precisa). */
function tokenHex(fonte: string, nome: string): string {
  const m = fonte.match(new RegExp(`--${nome}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  if (!m) throw new Error(`token --${nome} não encontrado (ou não é #hex) no CSS`);
  return m[1];
}

const PISO_AA_TEXTO_NORMAL = 4.5;

const fonte = readFileSync("app/atendimento-central/atendimento-central.css", "utf8");
// tinta-3 (lib/globals.css, tema claro) é a tinta mais clara do sistema — a que primeiro reprova
// contraste. Testar com ela é o pior caso: qualquer texto mais escuro (tinta/tinta-2) passa também.
const TINTA_3 = "#585c63";

teste("--list-bg (tema claro) mantém AA para texto normal, mesmo depois do polish", () => {
  const c = contraste(TINTA_3, tokenHex(fonte, "list-bg"));
  verdade(c >= PISO_AA_TEXTO_NORMAL, `--list-bg mede ${c.toFixed(2)}:1, abaixo do piso de ${PISO_AA_TEXTO_NORMAL}:1`);
});

teste("--list-bg-hover (tema claro) mantém AA para texto normal", () => {
  const c = contraste(TINTA_3, tokenHex(fonte, "list-bg-hover"));
  verdade(c >= PISO_AA_TEXTO_NORMAL, `--list-bg-hover mede ${c.toFixed(2)}:1, abaixo do piso de ${PISO_AA_TEXTO_NORMAL}:1`);
});

teste("--work-bg-raised (tema claro) mantém AA para texto normal", () => {
  const c = contraste(TINTA_3, tokenHex(fonte, "work-bg-raised"));
  verdade(c >= PISO_AA_TEXTO_NORMAL, `--work-bg-raised mede ${c.toFixed(2)}:1, abaixo do piso de ${PISO_AA_TEXTO_NORMAL}:1`);
});

teste("o polish de fato mudou o valor DECLARADO de --list-bg — não é só o valor citado num comentário", () => {
  // ANCORADO NA DECLARAÇÃO (via tokenHex, mesma extração usada nos testes de contraste acima), não
  // num `includes` solto no arquivo inteiro: o comentário desta mesma entrega CITA o hex antigo
  // (#d7dce4) para explicar a conta de saturação — um `!fonte.includes("#d7dce4")` ingênuo
  // reprovaria o arquivo por causa do próprio comentário que documenta a mudança, a armadilha de
  // ancorar em texto que também aparece fora do alvo.
  const atual = tokenHex(fonte, "list-bg");
  verdade(atual !== "#d7dce4", "--list-bg voltou a ser DECLARADO com o tom pálido de antes do polish (F5.5)");
});

teste("--frame-accent (moldura, fixa nos dois temas) continua acima do piso AA contra --frame-bg", () => {
  const c = contraste(tokenHex(fonte, "frame-accent"), tokenHex(fonte, "frame-bg"));
  verdade(c >= PISO_AA_TEXTO_NORMAL, `--frame-accent sobre --frame-bg mede ${c.toFixed(2)}:1, abaixo do piso`);
});

// ── O EIXO QUE FALTAVA: SATURAÇÃO ─────────────────────────────────────────────────────────────
//
// Este arquivo nasceu guardando CONTRASTE, e o contraste nunca reprovou — nem quando a tela ficou
// "pálida", nem quando ficou "azul claro pouco profissional". São eixos diferentes: contraste mede
// luminosidade entre texto e fundo; não mede se uma superfície de um terço da tela virou cor de
// marca. Em 24/09/2026 um ajuste subiu --list-bg de 19% para 58% de saturação, passou neste
// arquivo inteiro, e o dono rejeitou olhando a tela.
//
// A régua da casa é o resto do produto: --papel, --ficha-alt, --linha e --linha-forte
// (app/globals.css) ficam todos entre 16 e 17% de saturação. SUPERFÍCIE DE REPOUSO É NEUTRA; cor
// com intenção mora no acento, e só nele — é o que o Telegram faz (lista e conversa são o mesmo
// branco no tema claro) e é o que "manter o azul só na barra superior" quer dizer.

function saturacao(hex: string): number {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return 0;
  return ((max - min) / (l > 0.5 ? 2 - max - min : max + min)) * 100;
}

teste("as superfícies de repouso do tema claro ficam NEUTRAS, na régua do resto do produto", () => {
  const css = readFileSync("app/atendimento-central/atendimento-central.css", "utf8");
  // ÂNCORA NA REGRA, E NÃO NA PRIMEIRA MENÇÃO: ".dark .atd-central" aparece ANTES, dentro de um
  // comentário explicativo — recortar por indexOf() media o comentário e perdia os tokens do tema
  // claro inteiros. A regra de verdade começa em coluna zero.
  const iRegra = css.search(/^\.dark \.atd-central\s*\{/m);
  verdade(iRegra > 0, "não achei a regra do tema escuro — o recorte do tema claro seria o arquivo todo");
  const claro = css.slice(0, iRegra);
  // TETO: 22%. O resto do Lúmen vive em 16-17%; 22 dá folga para ajuste fino sem abrir espaço para
  // um pastel. O que reprovou antes (--list-bg a 58%) fica MUITO acima disto.
  const TETO = 22;
  for (const token of ["--list-bg", "--list-bg-hover", "--work-bg-raised", "--atd-border", "--atd-border-strong"]) {
    const m = claro.match(new RegExp(token + ":\\s*(#[0-9a-fA-F]{6});"));
    verdade(Boolean(m), `não achei ${token} no tema claro`);
    const s = saturacao(m![1]);
    verdade(
      s <= TETO,
      `${token} está em ${s.toFixed(1)}% de saturação (${m![1]}), acima do teto de ${TETO}% — superfície de repouso voltou a ser cor de marca`,
    );
  }
});

teste("o acento da moldura é a ÚNICA cor com intenção, e continua legível", () => {
  const css = readFileSync("app/atendimento-central/atendimento-central.css", "utf8");
  const m = css.match(/--frame-accent:\s*(#[0-9a-fA-F]{6});/);
  verdade(Boolean(m), "não achei --frame-accent");
  const s = saturacao(m![1]);
  // O acento é o oposto das superfícies: ele PRECISA ser saturado, senão não marca estado nenhum.
  verdade(s >= 40, `--frame-accent caiu para ${s.toFixed(1)}% — sem saturação ele deixa de marcar o que está ativo`);
  const bg = css.match(/--frame-bg:\s*(#[0-9a-fA-F]{6});/);
  verdade(contraste(m![1], bg![1]) >= 4.5, "o acento deixou de ser legível sobre a moldura");
});


resumo("polish do fundo azul da Central (F5.5)");
