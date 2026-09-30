import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { teste, verdade, resumo, codigoDe } from "./executar";
import { BlocoRecolhivel, cx } from "@/components/atendimento-app/detalhes/base";

// ============================================================================
// ACABAMENTO WHATSAPP, ETAPA 3 (30/09/2026): a aba DETALHES da conversa e a tela MAIS (com Perfil, Equipe, Tema,
// Respostas rápidas e Sair). Só o visual mudou — as regras (ações, recortes, Desfazer, idempotência) estão
// provadas nas suítes de sempre (atendimentoAppDetalhes, atendimentoAppRespostas, atendimentoAppEnvio...).
// Aqui: cartões preenchidos sem contorno, campos em pílula, botão primário em ouro com texto escuro AA, sem
// faixa lateral, alvos de 44 px, e o contraste dos pares NOVOS (cartão/painel/aviso) em Dia e Noite.
// ============================================================================

const RAIZ = process.cwd();
const le = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf8");
const CSS = le("app/globals.css");

// ── contraste ───────────────────────────────────────────────────────────────────────────────────

const canal = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
const lum = (h: string) => 0.2126 * canal(parseInt(h.slice(1, 3), 16)) + 0.7152 * canal(parseInt(h.slice(3, 5), 16)) + 0.0722 * canal(parseInt(h.slice(5, 7), 16));
const contraste = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
function declaracoes(seletor: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = new RegExp(`(?:^|\\n)${seletor.replace(/[.]/g, "\\.")}\\s*\\{([\\s\\S]*?)\\n\\}`, "g");
  for (const m of CSS.matchAll(re)) for (const d of m[1].matchAll(/--([\w-]+):\s*([^;]+);/g)) out[d[1]] = d[2].trim();
  return out;
}
function tema(...blocos: string[]) {
  const mapa: Record<string, string> = Object.assign({}, ...blocos.map(declaracoes));
  const bruto = (nome: string, n = 0): string => {
    const v = mapa[nome];
    if (v === undefined || n > 8) throw new Error(`token --${nome} não resolvido`);
    const ref = v.match(/^var\(--([\w-]+)\)$/);
    return ref ? bruto(ref[1], n + 1) : v;
  };
  /** Cor opaca em #hex. Um rgba() é composto sobre `sobre` (o fundo em que o painel está). */
  return (nome: string, sobre?: string) => {
    const v = bruto(nome);
    if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
    const m = v.match(/^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)$/);
    if (!m || !sobre) throw new Error(`--${nome} = ${v} não é #hex (e não há fundo para compor)`);
    const a = Number(m[4]);
    const fundo = [1, 3, 5].map((i) => parseInt(sobre.slice(i, i + 2), 16));
    const r = [Number(m[1]), Number(m[2]), Number(m[3])].map((c, i) => Math.round(c * a + fundo[i] * (1 - a)));
    return `#${r.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
  };
}
const TEMAS = {
  Dia: tema(":root", ".atendimento-shell"),
  Noite: tema(":root", ".atendimento-shell", ".atendimento-dark"),
} as const;

for (const [nome, t] of Object.entries(TEMAS)) {
  teste(`CONTRASTE ${nome}: todo texto da aba Detalhes e da tela Mais sobre o SEU fundo (cartão, painel, gaveta, aviso) >= 4,5:1`, () => {
    const tela = t("atd-tela");
    const cartao = t("atd-pilula-bg");
    const painel = t("atd-pilula-bg-2");
    const conferir = (texto: string, fundo: string, o: string, minimo = 4.5) => {
      const c = contraste(texto, fundo);
      verdade(c >= minimo, `${nome}: ${o} mede ${c.toFixed(2)}:1 (${texto} sobre ${fundo})`);
    };
    for (const [fundo, onde] of [[tela, "a tela/gaveta"], [cartao, "o cartão"], [painel, "o painel/campo"]] as const) {
      conferir(t("tx"), fundo, `texto principal sobre ${onde}`);
      conferir(t("atd-cinza-previa"), fundo, `texto de apoio sobre ${onde}`);
      conferir(t("atd-cinza-terciario"), fundo, `dica/placeholder/título de seção sobre ${onde}`);
    }
    conferir(t("atd-texto-ouro"), painel, "ícone e link em ouro sobre o painel");
    conferir(t("atd-texto-ouro"), cartao, "link em ouro sobre o cartão");
    conferir(t("atd-texto-ouro"), tela, "‹ Mais em ouro sobre a tela");
    conferir(t("atd-texto-ouro"), t("atd-ouro-suave"), "índice ativo, resumo e opção escolhida (ouro suave)");
    conferir(t("tx"), t("atd-ouro-suave"), "texto principal sobre a opção escolhida");
    conferir(t("acao-tx"), t("acao"), "botão primário (texto escuro sobre ouro)");
    conferir(t("atd-hdr-tx"), t("atd-hdr"), "aviso: texto");
    conferir(t("atd-hdr-foco"), t("atd-hdr"), "aviso: Desfazer");
    conferir(t("atd-hdr-tx2"), t("atd-hdr"), "aviso: fechar");
    // painéis de significado (rgba compostos sobre o que está atrás)
    for (const [fundo, onde] of [[tela, "a tela (Mais, gaveta)"], [cartao, "o cartão (bloco)"]] as const) {
      const alerta = t("urgente-bg", fundo);
      conferir(t("tx"), alerta, `texto do painel de alerta sobre ${onde}`);
      conferir(t("urgente"), alerta, `texto em vermelho no painel de alerta sobre ${onde}`);
      conferir(t("atd-cinza-previa"), alerta, `apoio do painel de alerta sobre ${onde}`);
      const ok = t("concluido-bg", fundo);
      conferir(t("tx"), ok, `texto do painel de "convertido" sobre ${onde}`);
      conferir(t("atd-cinza-previa"), ok, `apoio do painel de "convertido" sobre ${onde}`);
    }
    // contorno do indicador (caixinha redonda, bolinha do rádio): >= 3:1 (WCAG 1.4.11) sobre cartão e painel
    for (const [fundo, onde] of [[cartao, "o cartão"], [painel, "o painel"], [tela, "a gaveta"]] as const) conferir(t("atd-campo"), fundo, `contorno da caixinha sobre ${onde}`, 3);
  });
}

// ── o código dos arquivos migrados ─────────────────────────────────────────────────────────────

const DIR_DETALHES = "components/atendimento-app/detalhes";
const ARQUIVOS = [
  ...readdirSync(join(RAIZ, DIR_DETALHES)).filter((n) => n.endsWith(".tsx")).map((n) => `${DIR_DETALHES}/${n}`),
  "app/atendimento-app/(shell)/mais/page.tsx",
  "app/atendimento-app/(shell)/perfil/page.tsx",
  "app/atendimento-app/(shell)/equipe/page.tsx",
  "app/atendimento-app/(shell)/tema/page.tsx",
  "app/atendimento-app/(shell)/respostas-rapidas/page.tsx",
  "app/atendimento-app/(shell)/sair/page.tsx",
  "app/atendimento-app/(shell)/[id]/detalhes/loading.tsx",
  "components/atendimento-app/ManterRespostasRapidas.tsx",
  "components/atendimento-app/FormularioDeSair.tsx",
  "components/atendimento-app/VoltarParaMais.tsx",
];

teste("VISUAL: nenhum arquivo de Detalhes/Mais usa canto de 2px, contorno de cartão, faixa lateral, hex cru ou fonte fora da rampa", () => {
  for (const f of ARQUIVOS) {
    const c = codigoDe(le(f));
    verdade(!/rounded-\[2px\]/.test(c), `${f}: canto de 2px (o app usa rounded-atd-*)`);
    verdade(!/border-l-|border-r-|border-s-|border-e-|\bborder-l\b|\bborder-r\b/.test(c), `${f}: faixa lateral colorida`);
    verdade(!/border-(regua|regua-forte|urgente|acao)\b/.test(c) && !/\bborder border-concluido/.test(c), `${f}: contorno de cartão/painel (a hierarquia é por fundo)`);
    verdade(!/\bborder-(t|b)\b/.test(c) && !/divide-/.test(c), `${f}: divisória entre linhas`);
    verdade(!/#[0-9a-fA-F]{3,8}\b/.test(c), `${f}: hex cru`);
    verdade(!new RegExp("text-\\[\\d+" + "px\\]").test(c), `${f}: fonte fora da rampa`);
    verdade(!/\bbg-sf(-apoio|-fundo)?\b/.test(c), `${f}: superfície do site (bg-sf*) dentro do app`);
    verdade(!/window\.confirm|alert\(/.test(c), `${f}: confirm/alert nativo`);
  }
});

teste("VISUAL: sombra só no aviso que flutua (shadow-atd-flutuante); nada mais do app tem sombra", () => {
  for (const f of ARQUIVOS) {
    const c = codigoDe(le(f));
    const usos = c.match(/\bshadow-[\w-]+/g) ?? [];
    if (f.endsWith("detalhes/base.tsx")) verdade(usos.length === 1 && usos[0] === "shadow-atd-flutuante", `${f}: só o aviso flutuante pode ter sombra (achou ${usos.join(", ")})`);
    else verdade(usos.length === 0, `${f}: sombra ${usos.join(", ")}`);
  }
});

teste("CONTROLES: primário em ouro com texto escuro, secundário preenchido suave, campo em pílula preenchida — todos com 44 px", () => {
  verdade(/bg-acao\b/.test(cx.primario) && /text-acao-tx/.test(cx.primario) && /rounded-atd-pilula/.test(cx.primario), "primário: ouro (--acao) + texto escuro + pílula");
  verdade(/bg-atd-pilula-2/.test(cx.secundario) && /rounded-atd-pilula/.test(cx.secundario) && !/border/.test(cx.secundario), "secundário: preenchido suave, sem contorno");
  verdade(/rounded-atd-balao/.test(cx.campo) && /bg-atd-pilula-2/.test(cx.campo) && !/border/.test(cx.campo), "campo: preenchido, sem contorno");
  for (const k of ["campo", "primario", "secundario", "discreto"] as const) verdade(/min-h-11/.test(cx[k]), `cx.${k} sem alvo de 44 px`);
  verdade(/disabled:opacity-60/.test(cx.primario + cx.secundario + cx.campo), "estado desligado visível");
  verdade(/uppercase/.test(cx.etiqueta) && /text-app-tag/.test(cx.etiqueta) && /font-semibold/.test(cx.etiqueta), "título de seção: caixa alta discreta 11px/600");
  for (const k of ["cartao", "painel", "painelAlerta", "painelOk"] as const) verdade(/rounded-atd-balao/.test(cx[k]) && !/border/.test(cx[k]), `cx.${k}: raio do app, sem contorno`);
});

teste("BLOCO: abre e fecha como cartão preenchido; cabeçalho de 52 px com aria-expanded/aria-controls; fechado fica hidden", () => {
  const fechado = renderToStaticMarkup(<BlocoRecolhivel chave="triagem" titulo="Triagem" meta="2 a confirmar" aberto={false} aoAlternar={() => {}}><p>conteúdo</p></BlocoRecolhivel>);
  verdade(fechado.includes("bg-atd-pilula") && fechado.includes("rounded-atd-balao") && !/border/.test(fechado), "cartão preenchido sem contorno");
  verdade(fechado.includes('aria-expanded="false"') && fechado.includes('aria-controls="corpo-triagem"') && fechado.includes("min-h-[52px]"), "cabeçalho: estado, controle e alvo");
  verdade(/hidden=""/.test(fechado) && !fechado.includes("conteúdo"), "fechado: corpo escondido e sem conteúdo no HTML");
  verdade(fechado.includes("uppercase") && fechado.includes("2 a confirmar"), "título em caixa alta + meta");
  const aberto = renderToStaticMarkup(<BlocoRecolhivel chave="triagem" titulo="Triagem" aberto aoAlternar={() => {}}><p>conteúdo</p></BlocoRecolhivel>);
  verdade(aberto.includes('aria-expanded="true"') && aberto.includes("conteúdo") && aberto.includes("rotate-180"), "aberto: conteúdo e seta girada");
});

teste("AVISO E GAVETA: aviso sem faixa lateral, com Desfazer em ouro e fechar de 44 px; gaveta como folha arredondada no pé", () => {
  const b = codigoDe(le(`${DIR_DETALHES}/base.tsx`));
  const aviso = b.slice(b.indexOf("export function ProvedorDeAvisos"), b.indexOf("// ── executar uma ação com feedback"));
  verdade(aviso.includes("rounded-atd-balao") && aviso.includes("bg-atd-hdr") && !/border/.test(aviso), "aviso: balão sem contorno nem faixa");
  verdade(aviso.includes("Desfazer") && aviso.includes("text-atd-hdr-foco") && aviso.includes('aria-live="polite"') && aviso.includes('role="status"'), "Desfazer em ouro e região viva");
  verdade((aviso.match(/min-h-11|h-11 w-11/g) ?? []).length >= 2, "Desfazer e Fechar com 44 px");
  const g = b.slice(b.indexOf("export function Gaveta"), b.indexOf("// ── bloco que abre e fecha"));
  verdade(g.includes("rounded-t-atd-flutuante") && g.includes("bg-atd-tela") && !/border-(t|b)/.test(g), "gaveta: folha arredondada, sem divisórias");
  verdade(g.includes("showModal()") && g.includes("onCancel") && g.includes("h-11 w-11"), "continua diálogo de verdade, fecha com Esc, botão de 44 px");
});

teste("ÍNDICE FIXO: pílulas de 44 px de alvo, a ativa em ouro suave com aria-current, preso ao topo; o 'Voltar ao chat' segue à vista", () => {
  const d = codigoDe(le(`${DIR_DETALHES}/DetalhesDoApp.tsx`));
  verdade(d.includes("sticky top-0") && d.includes("bg-atd-tela"), "índice preso ao topo sobre a tela");
  verdade(d.includes('aria-current={ativo === b.chave ? "true" : undefined}') && d.includes("bg-atd-ouro-suave") && d.includes("text-atd-texto-ouro"), "ativa em ouro suave");
  verdade(d.includes("inline-flex min-h-11 items-center") && d.includes("rounded-atd-pilula"), "pílula com alvo de 44 px");
  verdade(d.includes("data-voltar-ao-chat") && d.includes("Voltar ao chat"), "Voltar ao chat");
  verdade(d.includes("ProvedorDeAvisos") && d.includes("abrirEIr"), "avisos e navegação do índice preservados");
});

teste("MAIS: título grande, cartão preenchido com as cinco linhas (alvo de 56 px), aviso honesto e Sair — mesma porta de acesso", () => {
  const m = codigoDe(le("app/atendimento-app/(shell)/mais/page.tsx"));
  verdade(m.includes("await exigirAcessoAoAtendimentoNaTela()"), "a porta de acesso continua");
  verdade(m.includes('<TituloDeTela titulo="Mais" />'), "título grande do app");
  for (const h of ["/atendimento-app/perfil", "/atendimento-app/equipe", "/atendimento-app/respostas-rapidas", "/atendimento-app/tema", "/atendimento-app/sair", 'href="/"']) verdade(m.includes(h), `linha ${h}`);
  verdade(m.includes("min-h-14") && m.includes("bg-atd-pilula") && m.includes("rounded-atd-balao"), "linhas de 56 px em cartão preenchido");
  verdade(m.includes("bg-urgente-bg") && m.includes("text-urgente"), "Sair em vermelho suave");
  verdade(m.includes("<AvisosDeMensagemNova />"), "o cartão de avisos de mensagem nova (estado real) continua na tela");
});

teste("FILHAS DE MAIS: cada tela tem '‹ Mais' (44 px) e título grande; o Sair continua usando o formulário que limpa o aparelho", () => {
  for (const f of ["perfil", "equipe", "tema", "respostas-rapidas", "sair"]) {
    const c = codigoDe(le(`app/atendimento-app/(shell)/${f}/page.tsx`));
    verdade(c.includes("<VoltarParaMais />") && c.includes("<TituloDeTela"), `${f}: voltar e título`);
  }
  const v = codigoDe(le("components/atendimento-app/VoltarParaMais.tsx"));
  verdade(v.includes("min-h-11") && v.includes("/atendimento-app/mais"), "voltar: 44 px e destino");
  const s = codigoDe(le("components/atendimento-app/FormularioDeSair.tsx"));
  verdade(s.includes("limparRastrosDoAparelho") && s.includes("bg-acao") && s.includes("min-h-11") && s.includes("rounded-atd-pilula"), "Sair: limpa, ouro, pílula, 44 px");
  const r = codigoDe(le("components/atendimento-app/ManterRespostasRapidas.tsx"));
  verdade(r.includes("Excluir “{i.titulo}” para todo o escritório?") && r.includes("rounded-atd-pilula") && r.includes("rounded-atd-balao"), "respostas rápidas: confirmação de exclusão e novo visual");
});

resumo("Atendimento app — acabamento WhatsApp: Detalhes e Mais (etapa 3)");
