import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe } from "./executar";
import { contar, palavra } from "@/lib/plural";

// ============================================================================
// CORREÇÕES RÁPIDAS DA GESTÃO — as regras que quebravam o celular e o Noite, provadas.
// Consolidado da Gestão (gauntlet), R7, R8, R4, R13, R14, R18.
// ============================================================================

const RAIZ = process.cwd();
const ler = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");

teste("plural: 1 tarefa, 2 tarefas, 0 tarefas, forma irregular", () => {
  igual(contar(1, "tarefa"), "1 tarefa");
  igual(contar(2, "tarefa"), "2 tarefas");
  igual(contar(0, "tarefa"), "0 tarefas");
  igual(contar(1, "publicação nova", "publicações novas"), "1 publicação nova");
  igual(contar(3, "publicação nova", "publicações novas"), "3 publicações novas");
  igual(palavra(1, "ativo"), "ativo");
  igual(palavra(5, "ativo"), "ativos");
});

teste("R7: o CSS mobile não tem mais seletor genérico que empilha a barra de abas nem esconde botões", () => {
  const css = ler("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");
  verdade(!/\.flex\.gap-4\.overflow-x-auto/.test(css), "`.flex.gap-4.overflow-x-auto` voltou: empilha PageSectionTabs no celular");
  verdade(!/\.flex\.gap-2\.flex-wrap/.test(css), "`.flex.gap-2.flex-wrap` voltou: força nowrap e esconde botões de formulário no celular");
  verdade(/\.quadro-empilha/.test(css), "a regra explícita .quadro-empilha sumiu");
});

teste("R7: os quadros que dependiam da regra antiga se declaram quadro-empilha", () => {
  verdade(/quadro-empilha/.test(ler("components/KanbanBoard.tsx")), "KanbanBoard perdeu quadro-empilha");
  verdade(/quadro-empilha/.test(ler("components/atendimento/QuadroDoFunil.tsx")), "QuadroDoFunil perdeu quadro-empilha");
});

teste("R8: o botão deslizante do interruptor de Comunicados fica dentro do trilho (left-0) e o botão é área de toque", () => {
  const f = codigoDe(ler("components/comunicados/ComunicadosForm.tsx"));
  verdade(/absolute left-0/.test(f), "o botão deslizante voltou a ser absolute sem left-0");
  verdade(/role="switch"/.test(f) && /aria-label="Resumo diário"/.test(f), "o interruptor perdeu role=switch ou o nome");
});

teste("R8: a prévia do e-mail é papel branco fixo nos dois temas", () => {
  const f = codigoDe(ler("components/comunicados/TemplateEditor.tsx"));
  verdade(/bg-white p-3 max-w-\[440px\]/.test(f), "a prévia do e-mail voltou ao fundo do tema (invisível no Noite)");
});

teste("R8: a coluna dos templates encolhe (min-w-0 / minmax(0,1fr)) e não estoura a largura", () => {
  const p = codigoDe(ler("app/(app)/configuracoes/comunicados/page.tsx"));
  verdade(/minmax\(0,1fr\)/.test(p) && /min-w-0/.test(p), "a coluna direita de Comunicados voltou a estourar");
});

teste("R14: ModalShell é um diálogo nomeado, com foco preso e devolução do foco", () => {
  const m = codigoDe(ler("components/ModalShell.tsx"));
  verdade(/role="dialog"/.test(m) && /aria-modal="true"/.test(m) && /aria-labelledby/.test(m), "ModalShell perdeu role/aria-modal/aria-labelledby");
  verdade(/e\.key !== "Tab"/.test(m), "ModalShell perdeu o foco preso");
  verdade(/anterior\.focus\(\)/.test(m), "ModalShell não devolve o foco ao gatilho");
  verdade(/aria-label="Fechar"/.test(m), "o X do ModalShell perdeu o nome");
});

teste("R14: a barra de seção é <nav> e marca a aba ativa com aria-current", () => {
  const t = codigoDe(ler("components/PageSectionTabs.tsx"));
  verdade(/<nav/.test(t) && /aria-current=/.test(t), "PageSectionTabs perdeu nav/aria-current");
  verdade(!/font-extrabold/.test(t), "aba ativa voltou ao peso 800");
});

teste("R4: existe UMA Produtividade — Relatórios não tem a seção e redireciona o link antigo", () => {
  const r = codigoDe(ler("app/(app)/relatorios/page.tsx"));
  verdade(!/key: "produtividade"/.test(r), "Relatórios voltou a ter a seção Produtividade");
  verdade(/redirect\("\/produtividade"\)/.test(r), "o link antigo ?secao=produtividade não redireciona mais");
  const n = codigoDe(ler("lib/navSections.ts"));
  verdade(!/label: "Produtividade", value/.test(n), "o chip Relatórios>Produtividade voltou em navSections");
});

teste("R12: as barras de Relatórios não são bordô", () => {
  const r = codigoDe(ler("app/(app)/relatorios/page.tsx"));
  verdade(/const NAVY = "var\(--faixa-ardosia\)"/.test(r), "as barras de Relatórios voltaram a usar a cor de ação");
});

teste("R13: no Noite os três tokens de risco são os clareados e há foco/borda de campo neutros", () => {
  const css = ler("app/globals.css");
  const i = css.indexOf(".portal-shell {");
  const j = css.indexOf(".portal-shell.portal-light {");
  const noite = css.slice(i, j);
  verdade(noite.includes("--risco-vencido: #ee8891;") && noite.includes("--risco-hoje: #e0a020;") && noite.includes("--risco-em-dia: #4fbf98;"), "tokens de risco do Noite fora do medido");
  verdade(noite.includes("--foco: #e9ebef;") && noite.includes("--campo-borda: #6b7684;"), "foco/borda de campo do Noite ausentes");
  const dia = css.slice(j, css.indexOf("/* Único glow do sistema"));
  verdade(dia.includes("--foco: #14161a;") && dia.includes("--campo-borda: #7f8b99;"), "foco/borda de campo do Dia ausentes");
});

teste("R18: 'Funil comercial' no menu e sem '(s)' nas telas de Gestão", () => {
  const n = codigoDe(ler("lib/navSections.ts"));
  verdade(n.includes('"Funil comercial"') && !n.includes('label: "Triagem"'), "o rótulo do funil voltou a ser Triagem");
  for (const rel of ["app/(app)/relatorios/page.tsx", "app/(app)/produtividade/page.tsx", "app/(app)/contatos/clientes/page.tsx", "app/(app)/conexoes/page.tsx"]) {
    verdade(!/\w\(s\)/.test(codigoDe(ler(rel))), `${rel} voltou a ter "(s)"`);
  }
  verdade(!/capitalize/.test(codigoDe(ler("app/(app)/produtividade/page.tsx"))), "o mês da Produtividade voltou a usar capitalize (Setembro De 2026)");
});

resumo("Gestão — correções rápidas");
