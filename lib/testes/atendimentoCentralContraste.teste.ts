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

resumo("polish do fundo azul da Central (F5.5)");
