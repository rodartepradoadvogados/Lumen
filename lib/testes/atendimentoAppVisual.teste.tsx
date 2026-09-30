import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe } from "./executar";
import { montarLinha, type LinhaDaListaApp, type LinhaPronta } from "@/lib/conversasDoApp";
import { contagensPorFase } from "@/lib/listaDeAtendimentos";
import Avatar from "@/components/atendimento-app/ui/Avatar";
import { CampoPilula } from "@/components/atendimento-app/ui/Pilula";
import FiltroPilula from "@/components/atendimento-app/ui/FiltroPilula";
import SeloContagem, { textoDoSelo } from "@/components/atendimento-app/ui/SeloContagem";
import Selinho from "@/components/atendimento-app/ui/Selinho";
import TituloDeTela from "@/components/atendimento-app/ui/TituloDeTela";
import BotaoFlutuante from "@/components/atendimento-app/ui/BotaoFlutuante";
import ListaDeConversasApp from "@/components/atendimento-app/ListaDeConversasApp";
import BarraInferior from "@/components/atendimento-app/BarraInferior";

// ============================================================================
// ACABAMENTO WHATSAPP DO APLICATIVO DE ATENDIMENTO (etapa 1, 30/09/2026): tokens (existem, contrastam AA em
// Dia e Noite, ficam só no app), componentes comuns, casca (barra de 4 alvos com pílula, botão flutuante),
// lista (negrito só se esperando, sem divisória, alvos de 44 px). A regra de ACESSO/RECORTE da barra está
// provada em atendimentoAppCasca.teste.ts; aqui não se afrouxa nada dela.
// ============================================================================

const RAIZ = process.cwd();
const le = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf8");
const css = le("app/globals.css");

// ── CONTRASTE (WCAG 2.x, calculado a partir do CSS de HOJE) ─────────────────────────────────────

const canal = (c: number) => ((c / 255) <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
function lum(hex: string): number {
  const h = hex.replace("#", "");
  return 0.2126 * canal(parseInt(h.slice(0, 2), 16)) + 0.7152 * canal(parseInt(h.slice(2, 4), 16)) + 0.0722 * canal(parseInt(h.slice(4, 6), 16));
}
const contraste = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

function bloco(seletor: string): string {
  const i = css.indexOf(`\n${seletor} {`);
  if (i < 0) throw new Error(`bloco ${seletor} não encontrado`);
  return css.slice(i, css.indexOf("\n}\n", i));
}
const DIA = bloco(".atendimento-shell");
const NOITE = bloco(".atendimento-dark");

/** O valor de um token no tema, seguindo `var(--outro)` (a Noite herda o que não redefine do Dia). */
function valor(tema: "dia" | "noite", nome: string, profundidade = 0): string {
  if (profundidade > 6) throw new Error(`ciclo em --${nome}`);
  const re = new RegExp(`--${nome}:\\s*([^;]+);`);
  const bruto = (tema === "noite" ? NOITE.match(re) : null)?.[1] ?? DIA.match(re)?.[1];
  if (!bruto) throw new Error(`token --${nome} não existe (${tema})`);
  const v = bruto.trim();
  const ref = v.match(/^var\(--([a-z0-9-]+)\)$/);
  return ref ? valor(tema, ref[1], profundidade + 1) : v;
}
const hex = (tema: "dia" | "noite", nome: string) => {
  const v = valor(tema, nome);
  if (!/^#[0-9a-fA-F]{6}$/.test(v)) throw new Error(`--${nome} (${tema}) não é #hex: ${v}`);
  return v;
};

const TOKENS_NOVOS = [
  "atd-tela", "atd-linha-bg", "atd-linha-hover", "atd-pilula-bg", "atd-pilula-bg-2", "atd-pilula-borda", "atd-ouro-suave",
  "atd-texto-ouro", "atd-hora-destaque", "atd-cinza-previa", "atd-cinza-terciario", "atd-tinta", "atd-selo-bg", "atd-selo-tx",
  "atd-etiqueta-bg", "atd-etiqueta-tx", "atd-etiqueta-fase-bg", "atd-etiqueta-fase-tx", "atd-avatar-bg", "atd-avatar-tx",
  "atd-sombra-flutuante", "atd-barra-borda", "atd-raio-pilula", "atd-raio-balao", "atd-raio-etiqueta", "atd-raio-flutuante",
];

teste("TOKENS: todos existem em Dia e em Noite (resolvem a um valor)", () => {
  for (const t of ["dia", "noite"] as const) for (const n of TOKENS_NOVOS) verdade(valor(t, n).length > 0, `--${n} (${t})`);
});

teste("TOKENS: valores aprovados pelo dono (fundo Noite, ouros, texto-ouro, raios)", () => {
  igual(valor("noite", "atd-tela"), "#14151c");
  igual(valor("dia", "atd-ouro"), "#c9962f");
  igual(valor("noite", "atd-ouro"), "#d4a83a");
  igual(hex("dia", "atd-texto-ouro"), "#7a5810");
  igual(hex("noite", "atd-texto-ouro"), "#e3bf5c");
  igual(valor("dia", "atd-raio-balao"), "14px");
  igual(valor("dia", "atd-raio-etiqueta"), "5px");
  igual(valor("dia", "atd-raio-flutuante"), "18px");
  verdade(/^\d+px$|^9999px$/.test(valor("dia", "atd-raio-pilula")), "pílula totalmente arredondada");
});

teste("TOKENS: existem no tailwind.config (cores atd.*, raios, sombra e tamanhos do app)", () => {
  const t = le("tailwind.config.ts");
  for (const c of ["tela", "pilula", "pilula-2", "ouro-suave", "texto-ouro", "hora", "previa", "terciario", "selo", "selo-tx", "etiqueta", "etiqueta-fase", "avatar", "linha-hover"])
    verdade(t.includes(`"${c}": "var(--atd-`) || t.includes(` ${c}: "var(--atd-`), `cor atd.${c}`);
  for (const r of ["atd-pilula", "atd-balao", "atd-etiqueta", "atd-flutuante"]) verdade(t.includes(`"${r}": "var(--atd-raio-`), `raio ${r}`);
  verdade(t.includes('"atd-flutuante": "var(--atd-sombra-flutuante)"'), "sombra do botão flutuante");
  for (const f of ["app-titulo", "app-nome", "app-previa", "app-meta", "app-tag"]) verdade(t.includes(`"${f}":`), `tamanho ${f}`);
});

teste("TOKENS: ficam no escopo do app — o :root e o site não os definem", () => {
  const i = css.indexOf(":root");
  const antes = css.slice(0, css.indexOf("\n.atendimento-shell {"));
  for (const n of TOKENS_NOVOS) verdade(!antes.includes(`--${n}:`), `--${n} definido fora do app`);
  verdade(i >= 0, "há :root");
});

// [texto, fundo, o que é] — todo texto que o app escreve sobre cada fundo
const PARES: [string, string, string][] = [
  ["atd-texto-ouro", "atd-ouro-suave", "filtro ativo / aba ativa"],
  ["atd-texto-ouro", "atd-tela", "hora em destaque"],
  ["atd-texto-ouro", "atd-pilula-bg", "texto em ouro sobre a pílula"],
  ["atd-hora-destaque", "atd-tela", "hora da conversa esperando"],
  ["atd-cinza-previa", "atd-tela", "prévia"],
  ["atd-cinza-previa", "atd-pilula-bg", "texto sobre a pílula"],
  ["atd-cinza-terciario", "atd-tela", "hora, contagem, subtítulo"],
  ["atd-cinza-terciario", "atd-pilula-bg", "placeholder da busca"],
  ["atd-tinta", "atd-tela", "nome / prévia forte"],
  ["atd-selo-tx", "atd-selo-bg", "selo de contagem"],
  ["atd-ouro-tx", "atd-ouro", "botão flutuante / envio / play"],
  ["atd-etiqueta-fase-tx", "atd-etiqueta-fase-bg", "selinho de fase"],
  ["atd-etiqueta-tx", "atd-etiqueta-bg", "selinho neutro"],
  ["atd-avatar-tx", "atd-avatar-bg", "iniciais do avatar"],
];
for (const tema of ["dia", "noite"] as const) {
  teste(`CONTRASTE AA (>= 4,5:1) em ${tema === "dia" ? "Dia" : "Noite"}: todo texto do acabamento sobre o seu fundo`, () => {
    for (const [tx, bg, o] of PARES) {
      const c = contraste(hex(tema, tx), hex(tema, bg));
      verdade(c >= 4.5, `${o}: --${tx} sobre --${bg} mede ${c.toFixed(2)}:1 em ${tema}`);
    }
  });
}

// ── COMPONENTES ─────────────────────────────────────────────────────────────────────────────────

teste("Avatar: iniciais em tom suave; com fotoUrl mostra a foto; sem foto cai nas iniciais; decorativo por padrão", () => {
  const sem = renderToStaticMarkup(<Avatar nome="Marina Costa" />);
  verdade(sem.includes(">MC<") && sem.includes("bg-atd-avatar") && sem.includes("text-atd-avatar-tx") && sem.includes("rounded-full"), sem);
  verdade(sem.includes('aria-hidden="true"') && !sem.includes("<img"), "decorativo, sem imagem");
  const com = renderToStaticMarkup(<Avatar nome="Marina Costa" fotoUrl="https://exemplo.test/f.jpg" />);
  verdade(com.includes('<img src="https://exemplo.test/f.jpg"') && !com.includes(">MC<"), com);
  const nula = renderToStaticMarkup(<Avatar nome="Carlos Lima" fotoUrl={null} />);
  verdade(nula.includes(">CL<"), "fotoUrl nula = iniciais");
  const nomeado = renderToStaticMarkup(<Avatar nome="Marina Costa" rotulo="Foto de Marina" />);
  verdade(nomeado.includes('role="img"') && nomeado.includes('aria-label="Foto de Marina"'), nomeado);
  verdade(renderToStaticMarkup(<Avatar nome="A B" tamanho="md" />).includes("h-[52px]"), "md = 52px");
  const fonte = le("components/atendimento-app/ui/Avatar.tsx");
  verdade(fonte.includes("onError={() => setFalhou(true)}"), "foto que falha volta às iniciais");
});

teste("SeloContagem: ouro cheio com tinta escura; 99+; sem número é um ponto com texto para leitor de tela", () => {
  const n = renderToStaticMarkup(<SeloContagem valor={3} rotulo="não lidas" />);
  verdade(n.includes("bg-atd-selo") && n.includes("text-atd-selo-tx") && n.includes(">3<") && n.includes("3 não lidas"), n);
  igual(textoDoSelo(120), "99+");
  igual(textoDoSelo(0), "0");
  const p = renderToStaticMarkup(<SeloContagem rotulo="Esperando resposta" />);
  verdade(p.includes("h-2.5 w-2.5") && p.includes("Esperando resposta") && p.includes("sr-only"), p);
});

teste("Selinho: caixa alta, raio de 5px, tons fase / neutro / alerta", () => {
  const f = renderToStaticMarkup(<Selinho tom="fase">Novo</Selinho>);
  verdade(f.includes("uppercase") && f.includes("rounded-atd-etiqueta") && f.includes("bg-atd-etiqueta-fase") && f.includes("text-app-tag"), f);
  verdade(renderToStaticMarkup(<Selinho>Ana</Selinho>).includes("bg-atd-etiqueta "), "neutro é o padrão");
  verdade(renderToStaticMarkup(<Selinho tom="alerta">x</Selinho>).includes("bg-urgente-bg"), "alerta");
});

teste("FiltroPilula: ativo em ouro suave (sem contorno), repouso com contorno fino, alvo de 44px, acessível", () => {
  const a = renderToStaticMarkup(<FiltroPilula rotulo="Todas" contagem={7} ativo href="/atendimento-app" />);
  verdade(a.includes("bg-atd-ouro-suave") && a.includes("text-atd-texto-ouro") && a.includes('aria-current="true"') && a.includes("min-h-11") && a.includes("rounded-atd-pilula"), a);
  verdade(!a.includes("border-atd-pilula-borda"), "ativo não tem contorno");
  const r = renderToStaticMarkup(<FiltroPilula rotulo="Novo" contagem={4} href="/atendimento-app?f=NOVO" />);
  verdade(r.includes("border-atd-pilula-borda") && !r.includes("aria-current") && !r.includes("bg-atd-ouro-suave"), r);
  const b = renderToStaticMarkup(<FiltroPilula rotulo="X" ativo onClick={() => {}} />);
  verdade(b.includes("<button") && b.includes('aria-pressed="true"'), b);
});

teste("CampoPilula: rótulo para leitor de tela, ícone decorativo, fundo de pílula, 44px; 'x' só com texto", () => {
  const vazio = renderToStaticMarkup(<CampoPilula id="c" rotulo="Buscar" icone={<i />} value="" onChange={() => {}} aoLimpar={() => {}} />);
  verdade(vazio.includes('<label for="c" class="sr-only">Buscar</label>') && vazio.includes("bg-atd-pilula") && vazio.includes("min-h-11") && vazio.includes('aria-hidden="true"'), vazio);
  verdade(!vazio.includes("<button"), "sem texto, sem botão de limpar");
  const cheio = renderToStaticMarkup(<CampoPilula id="c" rotulo="Buscar" value="ab" onChange={() => {}} aoLimpar={() => {}} rotuloDoLimpar="Limpar a busca" />);
  verdade(cheio.includes('aria-label="Limpar a busca"') && cheio.includes("h-11 w-11"), cheio);
});

teste("TituloDeTela: 26px/700, subtítulo discreto, sem filete nem faixa", () => {
  const t = renderToStaticMarkup(<TituloDeTela titulo="Atendimento" subtitulo="Rodarte Prado Advogados" acao={<b>ação</b>} />);
  verdade(t.includes("<h1") && t.includes("text-app-titulo") && t.includes("font-bold") && t.includes("Rodarte Prado Advogados") && t.includes("ação"), t);
  verdade(!/border-|bg-atd-hdr/.test(t), "sem filete, sem faixa");
  verdade(!renderToStaticMarkup(<TituloDeTela titulo="A" comoH1={false} />).includes("<h1"), "comoH1={false}");
});

teste("BotaoFlutuante: ouro cheio, raio 18px, sombra, 58px, com nome acessível", () => {
  const b = renderToStaticMarkup(<BotaoFlutuante href="/atendimento-app/novo" rotulo="Nova conversa" icone={<i />} />);
  verdade(b.includes('href="/atendimento-app/novo"') && b.includes("bg-atd-ouro") && b.includes("rounded-atd-flutuante") && b.includes("shadow-atd-flutuante") && b.includes("h-[58px] w-[58px]") && b.includes("Nova conversa"), b);
});

// ── CASCA: BARRA COM PÍLULA E CABEÇALHO ─────────────────────────────────────────────────────────

teste("BARRA: 4 alvos no total, 3 nos próprios, nenhuma no nível nenhum; a ativa tem a PÍLULA suave; alvos de 56px", () => {
  const total = renderToStaticMarkup(<BarraInferior nivel="total" />);
  for (const r of ["Conversas", "Funil", "Triagem", "Mais"]) verdade(total.includes(`>${r}<`), `total sem ${r}`);
  igual((total.match(/<li /g) ?? []).length, 4);
  verdade(total.includes('data-pilula-da-aba="ativa"') && total.includes("bg-atd-ouro-suave") && total.includes("text-atd-texto-ouro"), "pílula suave atrás do ícone ativo");
  igual((total.match(/data-pilula-da-aba="ativa"/g) ?? []).length, 1);
  verdade(total.includes("min-h-14") && total.includes("border-atd-barra-borda") && !total.includes("border-t-2") && !total.includes("bg-ouro-acento"), "56px, linha fina, sem ouro cheio na barra");
  const proprios = renderToStaticMarkup(<BarraInferior nivel="proprios" />);
  igual((proprios.match(/<li /g) ?? []).length, 3);
  verdade(!proprios.includes(">Funil<") && !proprios.includes("/atendimento-app/funil"), "próprios sem Funil (corte por nível mantido)");
  igual(renderToStaticMarkup(<BarraInferior nivel="nenhum" />), "");
});

teste("BARRA: selo de contagem só aparece quando a contagem é passada (ponto de extensão)", () => {
  verdade(!renderToStaticMarkup(<BarraInferior nivel="total" />).includes("data-selo"), "sem contagem, sem selo");
  const com = renderToStaticMarkup(<BarraInferior nivel="total" contagens={{ triagem: 3 }} />);
  verdade(com.includes("data-selo") && com.includes("3 para ver"), com);
});

teste("CABEÇALHO: título grande + subtítulo + botão Dia/Noite sem caixa, sem filete de ouro nem faixa grafite", () => {
  const f = codigoDe(le("components/atendimento-app/CabecalhoDoApp.tsx"));
  verdade(f.includes("TituloDeTela") && f.includes('titulo="Atendimento"') && f.includes("subtitulo={officeName}"), "título e subtítulo");
  verdade(!/border-b|border-ouro|bg-atd-hdr|text-atd-hdr|atd-hdr/.test(f), "sem filete nem faixa grafite");
  verdade(f.includes("h-11 w-11") && !/\bborder\b/.test(f), "botão de 44px sem caixa");
});

// ── LISTA ───────────────────────────────────────────────────────────────────────────────────────

const AGORA = new Date(Date.UTC(2026, 8, 30, 17, 32));
const atras = (n: number) => new Date(AGORA.getTime() - n * 60000);
const dado = (o: Partial<LinhaDaListaApp> = {}): LinhaDaListaApp => ({
  id: "a1", clientName: "Marina Costa", waPhone: "5562996142280", subject: "Inventário", stage: "QUALIFICACAO", convertedCaseId: null,
  createdAt: atras(600), ultimaAtividadeEm: atras(5), prazoDeRespostaAte: null, agenteResponde: false, agenteSilenciadoEm: null, responsible: null,
  whatsappMessages: [{ direction: "IN", body: "Boa tarde!", porAgente: false, createdAt: atras(5) }],
  ...o,
});
const renderLista = (linhas: LinhaPronta[]) =>
  renderToStaticMarkup(
    <ListaDeConversasApp linhas={linhas} contagens={contagensPorFase([{ stage: "NOVO", _count: 2 }])} esperando={1} filtro="todas" recorte={{}} totalNaLista={linhas.length} ocultos={0} soOsMeus={false} haConversas />,
  );

teste("LINHA (dados): esperando = última do cliente; mídia, enviada, falhou, Ana e fixada vêm de dados que existem", () => {
  const esp = montarLinha(dado(), AGORA, "Ana");
  igual([esp.esperando, esp.midia, esp.enviada, esp.falhou, esp.anaAtende, esp.fixada], [true, null, false, false, false, false]);
  const foto = montarLinha(dado({ whatsappMessages: [{ direction: "IN", body: "[imagem] olha", porAgente: false, createdAt: atras(1) }] }), AGORA, "Ana");
  igual(foto.midia, "imagem");
  igual(montarLinha(dado({ whatsappMessages: [{ direction: "IN", body: "[áudio]", porAgente: false, createdAt: atras(1) }] }), AGORA, "Ana").midia, "audio");
  const enviada = montarLinha(dado({ whatsappMessages: [{ direction: "OUT", body: "ok", porAgente: false, createdAt: atras(1), status: "SENT" }] }), AGORA, "Ana");
  igual([enviada.esperando, enviada.enviada, enviada.falhou], [false, true, false]);
  const falhou = montarLinha(dado({ whatsappMessages: [{ direction: "OUT", body: "ok", porAgente: false, createdAt: atras(1), status: "FAILED" }] }), AGORA, "Ana");
  igual([falhou.enviada, falhou.falhou], [false, true]);
  const ana = montarLinha(dado({ agenteResponde: true, mensagemFixada: { id: "m1" } }), AGORA, "Ana");
  igual([ana.anaAtende, ana.fixada], [true, true]);
  igual(montarLinha(dado({ agenteResponde: true, agenteSilenciadoEm: atras(2) }), AGORA, "Ana").anaAtende, false);
});

teste("LISTA: nome em NEGRITO só quando a conversa espera resposta; a hora em ouro só nela; ponto de ouro só nela", () => {
  const espera = renderLista([montarLinha(dado(), AGORA, "Ana")]);
  verdade(/text-app-nome text-tx font-bold/.test(espera) && espera.includes("text-atd-hora") && espera.includes("data-selo"), espera);
  const resp = renderLista([montarLinha(dado({ whatsappMessages: [{ direction: "OUT", body: "Combinado", porAgente: false, createdAt: atras(1), status: "SENT" }] }), AGORA, "Ana")]);
  verdade(resp.includes("font-normal") && !resp.includes("font-bold"), "respondida: nome normal");
  verdade(!resp.includes("text-atd-hora") && !resp.includes("data-selo"), "respondida: hora cinza, sem selo");
  verdade(resp.includes("Você: ") && resp.includes('aria-label="Enviada"'), "prefixo Você e ✓✓");
});

teste("LISTA: SEM divisória entre linhas, sem contorno de linha, alvo de 72px, avatar circular de iniciais", () => {
  const html = renderLista([montarLinha(dado(), AGORA, "Ana"), montarLinha(dado({ id: "a2", clientName: "Carlos Lima" }), AGORA, "Ana")]);
  verdade(!/divide-|border-b|border-t\b|border-regua/.test(html), "sem divisória");
  verdade(html.includes("min-h-[72px]") && html.includes(">MC<") && html.includes(">CL<") && html.includes("rounded-full"), "72px e avatares");
  const fonte = codigoDe(le("components/atendimento-app/ListaDeConversasApp.tsx"));
  verdade(!/divide-|border-b|border-t|border-regua/.test(fonte), "o fonte da lista não tem divisória");
});

teste("LISTA: prévia com ícone de mídia, selinhos de fase e 'Ana', alfinete só se há mensagem fixada", () => {
  const voz = renderLista([montarLinha(dado({ agenteResponde: true, whatsappMessages: [{ direction: "IN", body: "[áudio]", porAgente: false, createdAt: atras(1) }] }), AGORA, "Ana")]);
  verdade(voz.includes("lucide-mic") && voz.includes('data-tom="fase"') && voz.includes("Qualificação") && voz.includes(">Ana<"), voz);
  const fixada = renderLista([montarLinha(dado({ mensagemFixada: { id: "m" }, whatsappMessages: [{ direction: "OUT", body: "x", porAgente: false, createdAt: atras(1), status: "SENT" }] }), AGORA, "Ana")]);
  verdade(fixada.includes("lucide-pin") && fixada.includes("Tem mensagem fixada"), "alfinete");
  const sem = renderLista([montarLinha(dado({ whatsappMessages: [{ direction: "OUT", body: "x", porAgente: false, createdAt: atras(1), status: "SENT" }] }), AGORA, "Ana")]);
  verdade(!sem.includes("lucide-pin"), "sem alfinete sem mensagem fixada");
});

teste("LISTA: os filtros são pílulas com contagem, o ativo em ouro suave; nenhum alvo abaixo de 44px", () => {
  const html = renderLista([montarLinha(dado(), AGORA, "Ana")]);
  verdade((html.match(/data-filtro-pilula/g) ?? []).length === 8, "oito filtros: Todas, Esperando e as seis fases");
  verdade(html.includes("bg-atd-ouro-suave"), "ativo suave");
  verdade(!html.includes("bg-ouro-acento") && !html.includes("border-ouro-acento"), "nada de ouro cheio nos filtros");
  verdade((html.match(/min-h-11/g) ?? []).length >= 8, "cada filtro tem alvo de 44px");
});

teste("NADA de ouro cheio fora de selo, botão flutuante, envio e play; nada de sombra fora do botão flutuante", () => {
  for (const f of ["ListaDeConversasApp.tsx", "BarraInferior.tsx", "CabecalhoDoApp.tsx", "BuscaDaLista.tsx", "ui/FiltroPilula.tsx", "ui/Pilula.tsx", "ui/Selinho.tsx", "ui/TituloDeTela.tsx", "ui/Avatar.tsx"]) {
    const c = codigoDe(le("components/atendimento-app", f));
    verdade(!/bg-atd-ouro(?!-suave)|bg-ouro-acento|bg-atd-selo\b/.test(c), `${f}: ouro cheio`);
    verdade(!/\bshadow-/.test(c), `${f}: sombra`);
    verdade(!/#[0-9a-fA-F]{3,8}\b/.test(c), `${f}: hex cru`);
  }
});

teste("SITE INTACTO: nada fora de /atendimento-app importa o cabeçalho, a barra ou os componentes do acabamento", () => {
  const varrer = (dir: string, achados: string[]) => {
    for (const e of readdirSync(join(RAIZ, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) {
        if (["node_modules", ".next", "atendimento-app"].includes(e.name)) continue;
        varrer(rel, achados);
      } else if (/\.(ts|tsx)$/.test(e.name) && !rel.startsWith("lib/testes/")) {
        if (/components\/atendimento-app\/(ui|CabecalhoDoApp|BarraInferior|ListaDeConversasApp)/.test(readFileSync(join(RAIZ, rel), "utf8"))) achados.push(rel);
      }
    }
  };
  const achados: string[] = [];
  for (const d of ["app", "components", "lib"]) varrer(d, achados);
  // as próprias telas do app (app/atendimento-app) ficam de fora da varredura; o resto do produto não pode usar
  igual(achados.filter((f) => !f.startsWith("components/atendimento-app/")), []);
});

resumo("Atendimento app — acabamento WhatsApp (etapa 1)");
