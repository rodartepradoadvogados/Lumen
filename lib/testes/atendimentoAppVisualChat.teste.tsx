import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe } from "./executar";
import BolhaDaMensagem from "@/components/atendimento-app/BolhaDaMensagem";
import MidiaDaBolha from "@/components/atendimento-app/MidiaDaBolha";
import FaixaDaJanelaFechada from "@/components/atendimento-app/FaixaDaJanelaFechada";
import InterruptorDaAna from "@/components/InterruptorDaAna";
import type { MensagemDoChat } from "@/lib/mensagensDoChat";

// ============================================================================
// ACABAMENTO WHATSAPP, ETAPA 2 (30/09/2026): O CHAT. Prova o que é VISUAL e não se pode perder: tokens do chat (existem,
// contrastam AA em Dia e Noite, ficam só no app), balão de 14 px, hora e ✓✓ dentro do balão, nota interna distinguível por
// TEXTO e ÍCONE (não só cor), estados de envio com texto e botões, alvos de 44 px em todos os controles. A segurança, o
// acesso, a idempotência e a rota de mídia continuam provados nos testes de cada PR (Envio, Nota, Mídia, Janela, Respostas).
// ============================================================================

const RAIZ = process.cwd();
const le = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf8");
const css = le("app/globals.css");
const C = (f: string) => codigoDe(le("components/atendimento-app", f));

// ── CONTRASTE (WCAG 2.x), calculado a partir do CSS de HOJE ─────────────────────────────────────
const canal = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
const lum = (h: string) => {
  const x = h.replace("#", "");
  return 0.2126 * canal(parseInt(x.slice(0, 2), 16)) + 0.7152 * canal(parseInt(x.slice(2, 4), 16)) + 0.0722 * canal(parseInt(x.slice(4, 6), 16));
};
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
function valor(tema: "dia" | "noite", nome: string, prof = 0): string {
  if (prof > 6) throw new Error(`ciclo em --${nome}`);
  const re = new RegExp(`--${nome}:\\s*([^;]+);`);
  const bruto = (tema === "noite" ? NOITE.match(re) : null)?.[1] ?? DIA.match(re)?.[1];
  if (!bruto) throw new Error(`token --${nome} não existe (${tema})`);
  const v = bruto.trim();
  const ref = v.match(/^var\(--([a-z0-9-]+)\)$/);
  return ref ? valor(tema, ref[1], prof + 1) : v;
}
const hex = (tema: "dia" | "noite", nome: string) => {
  const v = valor(tema, nome);
  if (!/^#[0-9a-fA-F]{6}$/.test(v)) throw new Error(`--${nome} (${tema}) não é #hex: ${v}`);
  return v;
};

const TOKENS_DO_CHAT = ["atd-balao-in", "atd-balao-out", "atd-balao-out-tx", "atd-balao-out-sec", "atd-nota-bg", "atd-nota-borda"];

teste("TOKENS DO CHAT: existem em Dia e Noite e ficam dentro do app (o :root e o site não os definem)", () => {
  for (const t of ["dia", "noite"] as const) for (const n of TOKENS_DO_CHAT) verdade(/^#[0-9a-fA-F]{6}$/.test(valor(t, n)), `--${n} (${t})`);
  const antes = css.slice(0, css.indexOf(".atendimento-shell {"));
  for (const n of TOKENS_DO_CHAT) verdade(!antes.includes(`--${n}:`), `--${n} definido fora do app`);
  const tw = le("tailwind.config.ts");
  for (const c of ["balao-in", "balao-out", "balao-out-tx", "balao-out-sec", "nota", "nota-borda"]) verdade(tw.includes(`"var(--atd-${c === "nota" ? "nota-bg" : c})"`), `cor atd.${c} no tailwind`);
});

// [texto, fundo, o que é] — todo texto que o chat escreve sobre cada fundo
const PARES: [string, string, string][] = [
  ["atd-tinta", "atd-balao-in", "texto do balão recebido"],
  ["atd-cinza-previa", "atd-balao-in", "apoio no balão recebido"],
  ["atd-cinza-terciario", "atd-balao-in", "hora do balão recebido"],
  ["atd-texto-ouro", "atd-balao-in", "rótulo em ouro no balão recebido"],
  ["atd-balao-out-tx", "atd-balao-out", "texto do balão enviado"],
  ["atd-balao-out-sec", "atd-balao-out", "hora e ✓✓ do balão enviado"],
  ["atd-texto-ouro", "atd-balao-out", "nome da Ana no balão enviado"],
  ["atd-tinta", "atd-nota-bg", "texto da nota interna"],
  ["atd-texto-ouro", "atd-nota-bg", "rótulo 'Nota interna · só a equipe'"],
  ["atd-cinza-previa", "atd-nota-bg", "autor e hora da nota"],
  ["atd-tinta", "atd-pilula-bg", "aviso da Ana, seletor, citação"],
  ["atd-cinza-previa", "atd-pilula-bg", "texto de apoio na pílula"],
  ["atd-cinza-terciario", "atd-pilula-bg", "placeholder do campo e aba do modo"],
  ["atd-texto-ouro", "atd-pilula-bg", "'Fixada' e citação"],
  ["atd-tinta", "atd-pilula-bg-2", "modo selecionado e cartão de mídia"],
  ["atd-cinza-previa", "atd-pilula-bg-2", "detalhe do cartão de mídia"],
  ["atd-tinta", "atd-ouro-suave", "faixa da janela fechada"],
  ["atd-cinza-previa", "atd-ouro-suave", "apoio da faixa da janela fechada"],
  ["atd-cinza-terciario", "atd-tela", "guia inativa, hora do separador"],
  ["atd-tinta", "atd-tela", "guia ativa e nome"],
  ["atd-ouro-tx", "atd-ouro", "play e envio; pílula 'Ana: Ligada' e o 'Sim' dos pop-ups da Ana"],
  ["atd-tinta", "atd-pilula-bg", "pílula 'Ana: Desligada/pausada'"],
  ["atd-tinta", "atd-pilula-bg-2", "botão 'Não' dos pop-ups da Ana"],
  ["atd-cinza-previa", "atd-tela", "texto do pop-up da Ana (devolver)"],
];
for (const tema of ["dia", "noite"] as const) {
  teste(`CONTRASTE AA (>= 4,5:1) em ${tema === "dia" ? "Dia" : "Noite"}: todo texto do chat sobre o seu fundo`, () => {
    for (const [tx, bg, o] of PARES) {
      const c = contraste(hex(tema, tx), hex(tema, bg));
      verdade(c >= 4.5, `${o}: --${tx} sobre --${bg} mede ${c.toFixed(2)}:1 em ${tema}`);
    }
  });
  teste(`CONTRASTE de borda em ${tema === "dia" ? "Dia" : "Noite"}: a borda da pílula da Ana (>= 3:1 contra a tela)`, () => {
    verdade(contraste(hex(tema, "atd-campo"), hex(tema, "atd-tela")) >= 3, "pílula desligada/pausada");
    verdade(contraste(hex(tema, "atd-ouro-texto"), hex(tema, "atd-tela")) >= 3, "pílula ligada");
  });
  teste(`CONTRASTE de borda em ${tema === "dia" ? "Dia" : "Noite"}: a borda tracejada da nota >= 3:1 contra a tela e contra o fundo da nota`, () => {
    verdade(contraste(hex(tema, "atd-nota-borda"), hex(tema, "atd-tela")) >= 3, "borda contra a tela");
    verdade(contraste(hex(tema, "atd-nota-borda"), hex(tema, "atd-nota-bg")) >= 3, "borda contra a nota");
  });
}

// ── O BALÃO ─────────────────────────────────────────────────────────────────────────────────────

const base: MensagemDoChat = {
  id: "m1", direction: "IN", porAgente: false, texto: "Boa tarde!", midia: null, falhou: false, enviada: false, criadoEm: "2026-09-30T20:52:00.000Z",
  hora: "17:52", dia: "2026-09-30", rotuloDoDia: "Hoje", transcricao: null, clientMessageId: null,
};
const bolha = (m: Partial<MensagemDoChat>, extra: Partial<React.ComponentProps<typeof BolhaDaMensagem>> = {}) =>
  renderToStaticMarkup(<BolhaDaMensagem m={{ ...base, ...m }} idDaConversa="c1" nomeDoAtendente="Ana" {...extra} />);

/** Todo <button>/<a> do HTML tem alvo de 44 px (classe de altura de 44/48 px). */
function alvosPequenos(html: string): string[] {
  const ruins: string[] = [];
  for (const m of html.matchAll(/<(button|a)\b[^>]*?class="([^"]*)"/g)) {
    if (!/(^|\s)(min-h-11|h-11|h-12|min-h-12|min-h-\[46px\])(\s|$)/.test(m[2])) ruins.push(m[0].slice(0, 90));
  }
  return ruins;
}

teste("BALÃO: raio de 14 px (rounded-atd-balao), recebido em balao-in com o canto do rabicho, enviado em balao-out; sem raio de 2 px nem token antigo", () => {
  const recebido = bolha({});
  verdade(recebido.includes("rounded-atd-balao") && recebido.includes("bg-atd-balao-in") && recebido.includes("rounded-bl-[4px]"), recebido);
  const enviado = bolha({ direction: "OUT", enviada: true });
  verdade(enviado.includes("bg-atd-balao-out") && enviado.includes("text-atd-balao-out-tx") && enviado.includes("rounded-br-[4px]"), enviado);
  const fonte = C("BolhaDaMensagem.tsx");
  verdade(!/rounded-\[2px\]/.test(fonte), "raio de 2 px no balão");
  verdade(!/atd-bolha-|atd-ardosia|atd-borda-(in|out)|atd-chat-fundo/.test(fonte), "token antigo do chat no balão");
});

teste("BALÃO: a hora fica DENTRO do balão (junto do texto) e a marca da enviada sem retorno de status é ✓ cinza, com texto para leitor de tela ('Enviada'), sem prometer 'lida' (o ciclo entregue/lida está em atendimentoAppEntrega)", () => {
  const html = bolha({ direction: "OUT", enviada: true, texto: "Confirmado" });
  const ini = html.indexOf("Confirmado");
  verdade(ini > 0 && html.indexOf("17:52") > ini && html.indexOf("</p>", ini) > html.indexOf("17:52"), "a hora tem de estar no mesmo parágrafo do texto");
  verdade(html.includes('lucide-check"') && !html.includes("lucide-check-check") && html.includes(">Enviada<"), "✓ e 'Enviada'");
  verdade(html.includes("text-atd-balao-out-sec") && !/text-(blue|sky|cyan)/.test(html), "cinza, não azul (não existe 'lida')");
  verdade(!/>\s*lidas?\s*</i.test(html) && !/aria-label="[^"]*\blida\b/i.test(html), "não fala em 'lida'");
});

teste("NOTA INTERNA: distinguível por TEXTO e ÍCONE (não só cor): rótulo, cadeado, borda tracejada, fundo de ouro suave, autor; nunca com ✓✓", () => {
  const n = bolha({ tipo: "nota", direction: "OUT", texto: "Pedir a certidão", autor: "Dr. Rodrigo" });
  verdade(n.includes("Nota interna · só a equipe") && n.includes("lucide-lock"), "rótulo e cadeado");
  verdade(n.includes("border-dashed") && n.includes("border-atd-nota-borda") && n.includes("bg-atd-nota"), "borda tracejada em ouro, fundo suave");
  verdade(n.includes("Nota interna, só da equipe, de Dr. Rodrigo: ") && n.includes("Dr. Rodrigo"), "leitor de tela e autor");
  verdade(!n.includes("lucide-check-check"), "nota não leva ✓✓ de envio ao cliente");
  const comum = bolha({ direction: "OUT", texto: "Pedir a certidão" });
  verdade(!comum.includes("Nota interna") && !comum.includes("border-dashed") && !comum.includes("lucide-lock"), "mensagem ao cliente não tem marca de nota");
});

teste("AVISO DO SISTEMA ('A Ana não respondeu'): pílula central, com o rótulo 'só a equipe' e ícone, começo em destaque", () => {
  const a = bolha({ tipo: "sistema", direction: "OUT", texto: "A Ana não respondeu: pedido fora do roteiro." });
  verdade(a.includes("justify-center") && a.includes("bg-atd-pilula") && a.includes("rounded-atd-balao"), "pílula central");
  verdade(a.includes("Aviso do sistema · só a equipe") && a.includes("lucide-info") && a.includes("Aviso do sistema, só da equipe: "), "rótulo, ícone e leitor de tela");
  verdade(a.includes("<b") && a.includes("A Ana não respondeu:"), "começo em destaque");
});

teste("ESTADOS DE ENVIO: enviando, não enviada e sem confirmação mantêm o TEXTO, o ícone e os botões de 44 px", () => {
  const enviando = bolha({ direction: "OUT", clientMessageId: "k1", envioLocal: { estado: "enviando", erro: null, podeTentarDeNovo: false } });
  verdade(enviando.includes("Enviando…") && enviando.includes("lucide-clock"), "enviando");
  const falhou = bolha({ direction: "OUT", falhou: true, clientMessageId: "k2", envioLocal: { estado: "falhou", erro: "O WhatsApp recusou.", podeTentarDeNovo: true } });
  verdade(falhou.includes("Não enviada") && falhou.includes("O WhatsApp recusou.") && falhou.includes("Tentar de novo") && falhou.includes("Descartar") && falhou.includes('role="alert"'), "falhou: texto e botões");
  verdade(falhou.includes("lucide-triangle-alert") || falhou.includes("lucide-alert-triangle"), "falhou: ícone");
  igual(alvosPequenos(falhou), []);
  const duvida = bolha({ direction: "OUT", clientMessageId: "k3", envioLocal: { estado: "sem-confirmacao", erro: "Pode ter sido enviada: confira antes de repetir.", podeTentarDeNovo: true } });
  verdade(duvida.includes("Sem confirmação") && duvida.includes("Conferir e tentar de novo") && duvida.includes("Descartar") && /lucide-(circle-help|help-circle|circle-question-mark)/.test(duvida), "sem confirmação");
  igual(alvosPequenos(duvida), []);
  const reenvio = bolha({ direction: "OUT", clientMessageId: "k3", envioLocal: { estado: "sem-confirmacao", erro: "x", podeTentarDeNovo: true } }, { confirmandoReenvio: true });
  verdade(reenvio.includes("Enviar mesmo assim") && reenvio.includes("Cancelar") && reenvio.includes("chegar duas vezes"), "confirmação do reenvio");
  igual(alvosPequenos(reenvio), []);
  const salva = bolha({ tipo: "nota", direction: "OUT", clientMessageId: "k4", autor: "Eu", envioLocal: { estado: "falhou", erro: "Sem rede.", podeTentarDeNovo: true } });
  verdade(salva.includes("Não salva") && salva.includes("Tentar de novo"), "nota que falhou diz 'Não salva'");
});

teste("BALÃO: o botão 'Mais ações' segue nomeado e com 44 px; Ana leva o nome e o ícone em cima", () => {
  const html = bolha({ direction: "OUT", porAgente: true, texto: "Olá!" }, { aoAbrirAcoes: () => {} });
  verdade(html.includes('aria-label="Mais ações da mensagem de Ana, 17:52"') && html.includes("h-11 w-11"), html);
  verdade(html.includes(">Ana<") && html.includes("text-atd-texto-ouro"), "nome da Ana");
  igual(alvosPequenos(html), []);
});

// ── MÍDIA NO BALÃO ──────────────────────────────────────────────────────────────────────────────

const midia = (tipo: "imagem" | "audio" | "video" | "documento" | "figurinha", extra = {}) =>
  renderToStaticMarkup(<MidiaDaBolha idDaConversa="c1" idDaMensagem="m9" midia={{ tipo, rotulo: tipo, nome: tipo === "documento" ? "certidao.pdf" : null, legenda: "", bytes: 120000, mime: null, ...extra }} recebida />);

teste("ÁUDIO: play em ouro (44 px), forma de onda, posição acessível, tempo escrito; segue sem baixar nada (preload none)", () => {
  const a = midia("audio");
  verdade(a.includes("data-player-de-audio") && a.includes('preload="none"') && !/\scontrols[\s=>]/.test(a.slice(a.indexOf("<audio"), a.indexOf(">", a.indexOf("<audio")))), "audio sem controles nativos, preload none");
  verdade(a.includes("bg-atd-ouro") && a.includes("text-atd-ouro-tx") && a.includes("rounded-full") && a.includes("h-11 w-11"), "play em ouro de 44 px");
  verdade(a.includes('aria-label="Ouvir áudio do cliente, 117 KB"') && a.includes('aria-pressed="false"'), "botão nomeado");
  verdade(a.includes('type="range"') && a.includes('aria-label="Posição do áudio"') && a.includes("disabled"), "posição: campo acessível (desligado até saber a duração)");
  verdade(a.includes('aria-hidden="true"') && (a.match(/w-\[3px\]/g) ?? []).length === 30, "30 barras decorativas");
  verdade(a.includes("117 KB"), "sem duração, mostra o tamanho");
  igual(alvosPequenos(a), []);
  const fonte = C("MidiaDaBolha.tsx");
  verdade(fonte.includes("onError={aoFalhar}") && fonte.includes("Áudio indisponível") && fonte.includes("Tentar de novo"), "erro com texto e nova tentativa");
});

teste("IMAGEM, VÍDEO, DOCUMENTO E FIGURINHA: acabamento novo (sem raio de 2 px, cartão preenchido, botão em pílula), textos e alvos", () => {
  const img = midia("imagem");
  verdade(img.includes("loading=\"lazy\"") && img.includes("Ampliar imagem") && img.includes("rounded-[11px]") && !img.includes("sr-only\" loading"), "imagem: lazy, ampliar, 11 px");
  igual(alvosPequenos(img), []);
  const vid = midia("video", { nome: "casa.mp4" });
  verdade(vid.includes("casa.mp4") && vid.includes("Carregar vídeo") && vid.includes("rounded-atd-pilula") && !vid.includes("<video"), "vídeo só sob toque");
  igual(alvosPequenos(vid), []);
  const doc = midia("documento", { mime: "application/pdf" });
  verdade(doc.includes("certidao.pdf") && doc.includes("Abrir") && doc.includes('rel="noopener noreferrer"') && doc.includes("bg-atd-pilula-2"), "documento");
  igual(alvosPequenos(doc), []);
  const fig = midia("figurinha");
  verdade(fig.includes("O Lúmen não guarda figurinhas.") && fig.includes("lucide-smile"), "figurinha");
  const fonte = C("MidiaDaBolha.tsx");
  verdade(!/rounded-\[2px\]/.test(fonte) && !/atd-hdr|bg-sf-apoio|border-regua/.test(fonte), "resto do visual antigo na mídia");
});

// ── CABEÇALHO, GUIAS, BARRA, FIXADA ─────────────────────────────────────────────────────────────

teste("CABEÇALHO: sem faixa grafite nem filete de ouro, avatar de iniciais do app, voltar e ligar em 44 px; nome e número num só link", () => {
  const c = C("CabecalhoDaConversa.tsx");
  verdade(!/bg-atd-hdr|border-b-2|border-ouro|atd-hdr\b/.test(c), "faixa grafite ou filete");
  verdade(c.includes("bg-atd-tela") && c.includes("<Avatar") && c.includes('tamanho="sm"') && c.includes('tom="claro"'), "sobre a tela, com Avatar");
  verdade(c.includes("h-11 w-11") && c.includes("tel:+") && c.includes("Ligar para") && c.includes("/detalhes"), "ligar de 44 px e link para os Detalhes");
  const v = C("BotaoVoltar.tsx");
  verdade(v.includes("h-11 w-11") && v.includes('tom = "grafite"'), "voltar: 44 px e as telas ainda não migradas seguem grafite por padrão");
});

teste("GUIAS: continuam tablist com setas/Home/End e só a aberta no Tab; sublinhado de 2 px em ouro na ativa, sutis, 44 px", () => {
  const g = C("GuiasDaConversa.tsx");
  verdade(g.includes('role="tablist"') && g.includes('role="tab"') && g.includes("aria-selected={acesa}") && g.includes("aria-controls") && g.includes("tabIndex={acesa ? 0 : -1}"), "papéis e roving tabindex");
  verdade(g.includes("ArrowRight") && g.includes("ArrowLeft") && g.includes('"Home"') && g.includes('"End"'), "teclado por setas");
  verdade(g.includes("border-b-2") && g.includes("border-atd-ouro") && !g.includes("border-b-4") && !g.includes("atd-hdr"), "sublinhado de 2 px em ouro");
  verdade(g.includes("min-h-11") && g.includes("font-semibold") && g.includes("data-oculta-com-teclado"), "44 px, peso da ativa, recolhe com o teclado");
});

teste("PÍLULA DA ANA (33): fora da barra antiga, no espaço da linha das abas fora do tablist; 44 px, borda de 2 px, texto do estado; o interruptor em pílula do componente compartilhado segue válido", () => {
  const b = C("BarraDoChat.tsx");
  verdade(!/data-barra-do-chat|Ao enviar, você assume|Responder última mensagem/.test(b), "a barra e o botão avulso saíram");
  verdade(b.includes("createPortal") && b.includes("[data-slot-da-ana]"), "a pílula é desenhada no espaço da linha das abas");
  verdade(b.includes("min-h-11") && b.includes("border-2") && b.includes("rounded-atd-pilula") && b.includes('aria-haspopup="dialog"') && b.includes("aria-expanded"), "44 px, borda de 2 px, abre diálogo");
  const g = C("GuiasDaConversa.tsx");
  verdade(/\}\)\}\s*<\/div>\s*(\{\/\*[\s\S]*?\*\/\}\s*)?<div data-slot-da-ana/.test(g), "o espaço da pílula fica depois de fechar o tablist (as abas seguem intactas)");
  const i = renderToStaticMarkup(<InterruptorDaAna ligado nome="Ana" aoAlternar={() => {}} bordaLigada="border-atd-ouro-texto" bordaDesligada="border-atd-campo" pilula />);
  verdade(i.includes("rounded-atd-pilula") && i.includes("min-h-11") && i.includes("border-2") && i.includes('role="switch"') && i.includes('aria-checked="true"') && i.includes("Ana responde:"), i);
  const site = renderToStaticMarkup(<InterruptorDaAna ligado={false} nome="Ana" aoAlternar={() => {}} bordaLigada="border-tx" bordaDesligada="border-tx-3" />);
  verdade(site.includes("rounded-[2px]") && !site.includes("rounded-atd-pilula"), "o interruptor do SITE segue com canto de 2 px");
});

teste("FIXADA: pílula 'Fixada' + trecho de uma linha, alvo de 44 px para ir à mensagem e para desafixar; autor no leitor de tela", () => {
  const f = C("FixadaDoChat.tsx");
  verdade(f.includes("rounded-atd-balao") && f.includes("bg-atd-pilula") && f.includes("truncate") && f.includes(">Fixada<") , "pílula de uma linha");
  verdade((f.match(/min-h-11/g) ?? []).length >= 2 && f.includes('aria-label="Desafixar mensagem"') && f.includes("Toque para ir até a mensagem."), "alvos e nomes");
  verdade(f.includes("sr-only") && f.includes("fixada.autor"), "autor para leitor de tela");
  verdade(!/border-b|bg-sf-apoio|border-regua/.test(f), "faixa antiga");
});

teste("SEPARADOR DE DIA e chat: pílula central em vez de caixa de 2 px; fundo é a tela (sem o fundo cinza-azulado antigo)", () => {
  const c = C("ChatDaConversa.tsx");
  verdade(c.includes("rounded-atd-pilula bg-atd-pilula") && c.includes("text-atd-previa"), "separador em pílula");
  verdade(c.includes("bg-atd-tela") && !c.includes("atd-chat-fundo") && !/rounded-\[2px\]/.test(c), "fundo da tela, sem canto de 2 px");
  verdade(c.includes('aria-live="off"') && (c.match(/aria-live=/g) ?? []).length === 2, "aria-live segue como estava");
  verdade(c.includes("bg-atd-pilula") && c.includes("min-h-11"), "'Carregar mensagens anteriores' em pílula de 44 px");
});

// ── CAMPO DE MENSAGEM ───────────────────────────────────────────────────────────────────────────

teste("CAMPO: pílula com respostas rápidas dentro e envio ouro CIRCULAR; alternador 'Mensagem | Nota interna' com 44 px; nota em pílula tracejada com cadeado", () => {
  const c = C("CompositorDoChat.tsx");
  verdade(c.includes("rounded-[23px]") && c.includes("bg-atd-pilula") && c.includes("Respostas rápidas") && c.includes("<Zap"), "campo em pílula com raio");
  verdade(c.includes("rounded-full bg-atd-ouro text-atd-ouro-tx") && c.includes("h-12 w-12"), "envio ouro circular de 48 px");
  verdade(c.includes('aria-label={nota ? "Salvar nota interna"') && c.includes("`Enviar mensagem a ${nomeNoCampo}`"), "botão nomeado (sem texto visível)");
  verdade(c.includes("border-dashed border-atd-nota-borda bg-atd-nota") && c.includes("<Lock"), "nota: tracejada e cadeado");
  verdade(c.includes("Só a equipe vê. Não é enviada ao cliente, e a Ana não lê."), "linha de apoio da nota");
  verdade(c.includes("atd-campo-de-mensagem") && c.includes("focus-within:ring-2") && c.includes("focus:outline-none"), "16 px e foco visível na pílula");
  verdade(c.includes("rounded-atd-balao bg-atd-pilula") && c.includes('aria-label="Cancelar a citação"') && c.includes("h-11 w-11"), "citação em pílula, com cancelar de 44 px");
  // R3: o clipe voltou porque agora há envio de mídia (AnexarMidia); só no modo ao cliente, nunca na nota.
  verdade(c.includes("AnexarMidia") && /!nota && aoEnviarMidia/.test(c), "o clipe existe e só no modo ao cliente");
  const clipe = C("AnexarMidia.tsx");
  verdade(clipe.includes("h-11 w-11") && clipe.includes('aria-label="Anexar arquivo"') && clipe.includes("min-h-14"), "clipe de 44 px com nome; linhas do menu de 56 px");
});

teste("FAIXA DA JANELA FECHADA: o app usa cartão de ouro suave e botões em pílula de 44 px; o SITE segue igual (2 px, sem token do app)", () => {
  const props = { idDaConversa: "c1", janela: { aberta: false as const, horasDesdeAUltimaEntrada: 30 }, nomeDoContato: "Marina Costa", primeiroNome: "Marina", nomeTemporario: false, telefone: "5562991234567" };
  const app = renderToStaticMarkup(<FaixaDaJanelaFechada {...props} />);
  verdade(app.includes("bg-atd-ouro-suave") && app.includes("rounded-atd-balao") && app.includes("rounded-atd-pilula") && app.includes("Ligar") && app.includes("Criar tarefa") && app.includes("Como reabrir?") && app.includes("Abrir no meu WhatsApp"), "app");
  igual(alvosPequenos(app), []);
  const site = renderToStaticMarkup(<FaixaDaJanelaFechada {...props} tema="site" />);
  verdade(!/atd-/.test(site) && site.includes("rounded-[2px]") && site.includes("bg-aviso-bg"), "o site não pode ganhar o acabamento do app");
  igual(alvosPequenos(site), []);
});

teste("RESPOSTAS RÁPIDAS e MENU DA MENSAGEM: folhas arredondadas com botões em pílula/cartão de 44 px; busca reaproveita o CampoPilula", () => {
  const r = C("RespostasRapidasDoChat.tsx");
  verdade(r.includes("rounded-t-[20px]") && r.includes("bg-atd-tela") && r.includes("CampoPilula") && r.includes("rounded-atd-balao bg-atd-pilula") && r.includes("min-h-11"), "respostas rápidas");
  verdade(r.includes("aoInserir(i.texto)") && !/enviar\(|fetch\(/.test(r), "inserir nunca envia");
  const a = C("AcoesDaMensagem.tsx");
  verdade(a.includes("rounded-t-[20px]") && a.includes("rounded-atd-balao bg-atd-pilula") && a.includes("min-h-11") && a.includes("h-11 w-11"), "menu da mensagem");
  for (const f of [r, a]) verdade(!/rounded-\[2px\]|border-regua|bg-sf\b|bg-sf-apoio/.test(f), "visual antigo");
});

teste("NADA de hex cru, sombra, faixa lateral, fonte fora da rampa nem token antigo nos arquivos do chat; ouro cheio só em play, envio e sublinhado", () => {
  const arquivos = ["CabecalhoDaConversa", "GuiasDaConversa", "BarraDoChat", "BolhaDaMensagem", "MidiaDaBolha", "ChatDaConversa", "CompositorDoChat", "FaixaDaJanelaFechada", "AcoesDaMensagem", "RespostasRapidasDoChat", "FixadaDoChat", "TelaCheiaDaConversa", "PainelDaConversa"];
  for (const f of arquivos) {
    const c = C(`${f}.tsx`);
    verdade(!/#[0-9a-fA-F]{3,8}\b/.test(c), `${f}: hex cru`);
    verdade(!/\bshadow-/.test(c), `${f}: sombra`);
    verdade(!/border-[lrs]-/.test(c), `${f}: faixa lateral`);
    verdade(!new RegExp("text-\\[\\d+" + "px\\]").test(c), `${f}: fonte fora da rampa`);
    verdade(!/atd-bolha-|atd-ardosia|atd-chat-fundo|atd-borda-(in|out)/.test(c), `${f}: token antigo do chat`);
  }
  for (const f of ["ChatDaConversa", "FixadaDoChat", "CabecalhoDaConversa", "AcoesDaMensagem", "RespostasRapidasDoChat"]) {
    verdade(!/bg-atd-ouro(?!-suave)|bg-ouro-acento|bg-acao/.test(C(`${f}.tsx`)), `${f}: ouro cheio`);
  }
  // Bolha: o único ouro cheio é o "Enviar mesmo assim" (é um envio). Guias: só o sublinhado (borda), nunca fundo.
  verdade((C("BolhaDaMensagem.tsx").match(/bg-atd-ouro(?!-suave)/g) ?? []).length === 1, "BolhaDaMensagem: ouro cheio além do envio");
  verdade(!/bg-atd-ouro(?!-suave)|bg-acao/.test(C("GuiasDaConversa.tsx")), "GuiasDaConversa: fundo de ouro cheio");
});

teste("SITE INTACTO: nenhum arquivo fora do app importa os componentes do chat; tokens novos não vazam", () => {
  const dono = readFileSync(join(RAIZ, "components/InterruptorDaAna.tsx"), "utf8");
  verdade(dono.includes('pilula = false') && dono.includes('pilula ? "rounded-atd-pilula" : "rounded-[2px]"'), "o interruptor só vira pílula quando o app pede");
  const site = le("components/WhatsappReplyBox.tsx");
  verdade(!/atd-balao|atd-nota|rounded-atd/.test(site), "a caixa de resposta do site ganhou classe do app");
});

resumo("Atendimento app — acabamento WhatsApp (etapa 2, o chat)");
