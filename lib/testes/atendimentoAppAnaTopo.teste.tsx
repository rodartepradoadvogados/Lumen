import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe } from "./executar";
import DialogoDaAna from "@/components/atendimento-app/DialogoDaAna";
import BarraDoChat from "@/components/atendimento-app/BarraDoChat";
import { abrirPerguntaDeResposta, dialogoDaPilula, pilulaDaAna, textosDoDialogo } from "@/lib/anaNoTopo";
import type { EstadoDoChat } from "@/lib/estadoDoChat";

// ============================================================================
// A ANA NA LINHA DAS ABAS (33): a pílula "Ana: Ligada/Desligada/pausada" abre um pop-up com Sim/Não. Prova: os textos
// EXATOS, o que a pílula diz, o 2º pop-up só quando a última é do cliente, as ações só depois do "Sim", a acessibilidade do
// diálogo, a pílula FORA do tablist, os alvos de 44 px e o relógio de 15 min só quando grave. O comportamento no navegador
// (foco, Esc, toque) foi conferido em Chromium real (ver docs, seção 33). Nenhuma regra de acesso/envio muda aqui.
// ============================================================================

const RAIZ = process.cwd();
const le = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf8");
const AGORA = new Date("2026-09-30T15:00:00.000Z");
const minDepois = (n: number) => new Date(AGORA.getTime() + n * 60_000).toISOString();

function est(o: Partial<EstadoDoChat> = {}): EstadoDoChat {
  return { agenteResponde: true, agenteSilenciadoEm: null, agenteAtivoNoEscritorio: true, prazoDeRespostaAte: null, ultimaDirecao: "OUT", temWhatsapp: true, janela: { aberta: true }, fixada: null, ...o };
}

teste("TEXTOS EXATOS dos pop-ups (com 'Sim' e 'Não')", () => {
  const l = textosDoDialogo("ligar", "Ana");
  igual(l.titulo, "Ao ligar, a Ana passa a responder às mensagens automaticamente. Deseja ligar?");
  const d = textosDoDialogo("desligar", "Ana");
  igual(d.titulo, "Ao desligar, a Ana não responderá às mensagens. Deseja desligar?");
  const r = textosDoDialogo("responder", "Ana");
  igual(r.titulo, "Responder à última mensagem?");
  for (const t of [l, d, r, textosDoDialogo("devolver", "Ana")]) {
    igual(t.sim, "Sim");
    igual(t.nao, "Não");
  }
  const v = textosDoDialogo("devolver", "Ana");
  igual(v.titulo, "Devolver a conversa à Ana?");
  igual(v.texto, "Ela volta a responder a partir da PRÓXIMA mensagem do cliente. O que ficou sem resposta agora continua com você.");
});

teste("PÍLULA: estado em TEXTO (Ligada / Desligada / pausada) e o pop-up que cada estado abre", () => {
  const lig = pilulaDaAna(est(), AGORA, "Ana");
  igual([lig.modo, lig.rotulo, dialogoDaPilula(lig.modo)], ["ligada", "Ana: Ligada", "desligar"]);
  const des = pilulaDaAna(est({ agenteResponde: false }), AGORA, "Ana");
  igual([des.modo, des.rotulo, dialogoDaPilula(des.modo)], ["desligada", "Ana: Desligada", "ligar"]);
  const pau = pilulaDaAna(est({ agenteSilenciadoEm: minDepois(-5), agenteResponde: false }), AGORA, "Ana");
  igual([pau.modo, pau.rotulo, dialogoDaPilula(pau.modo)], ["pausada", "Ana: pausada", "devolver"]);
  const off = pilulaDaAna(est({ agenteAtivoNoEscritorio: false }), AGORA, "Ana");
  igual([off.modo, dialogoDaPilula(off.modo)], ["indisponivel", null]);
});

teste("2º POP-UP: só abre quando a última mensagem é do cliente; 'responder agora' só com a Ana LIGADA e o cliente esperando", () => {
  verdade(abrirPerguntaDeResposta({ ultimaDirecao: "IN" }), "IN abre");
  verdade(!abrirPerguntaDeResposta({ ultimaDirecao: "OUT" }), "OUT não abre");
  verdade(!abrirPerguntaDeResposta({ ultimaDirecao: null }), "sem mensagens não abre");
  verdade(pilulaDaAna(est({ ultimaDirecao: "IN" }), AGORA, "Ana").podeResponderUltima, "ligada + IN");
  verdade(!pilulaDaAna(est({ ultimaDirecao: "OUT" }), AGORA, "Ana").podeResponderUltima, "ligada + OUT");
  verdade(!pilulaDaAna(est({ ultimaDirecao: "IN", agenteSilenciadoEm: minDepois(-1) }), AGORA, "Ana").podeResponderUltima, "pausada nunca");
  verdade(!pilulaDaAna(est({ ultimaDirecao: "IN", agenteAtivoNoEscritorio: false }), AGORA, "Ana").podeResponderUltima, "escritório sem atendente nunca");
});

teste("RELÓGIO de 15 min: só nos últimos 5 minutos ou vencido, curto; fora disso nada", () => {
  const com = (min: number) => pilulaDaAna(est({ ultimaDirecao: "IN", prazoDeRespostaAte: minDepois(min) }), AGORA, "Ana");
  igual(com(12).relogioCurto, null);
  igual(com(6).relogioCurto, null);
  igual(com(5).relogioCurto, "fila em 5 min");
  igual(com(3).relogioCurto, "fila em 3 min");
  igual(com(-4).relogioCurto, "fila vencida");
  verdade(/sem resposta/.test(com(3).relogioLongo ?? "") && /estourado/.test(com(-4).relogioLongo ?? ""), "por extenso no title e no leitor de tela");
  igual(pilulaDaAna(est({ ultimaDirecao: "OUT", prazoDeRespostaAte: minDepois(3) }), AGORA, "Ana").relogioCurto, null);
});

teste("DIÁLOGO: role=dialog, aria-modal, nomeado pelo título, Sim/Não de 44 px, ocupado desabilita e mostra '…', erro com role=alert", () => {
  const h = renderToStaticMarkup(<DialogoDaAna titulo="Ao desligar, a Ana não responderá às mensagens. Deseja desligar?" sim="Sim" nao="Não" aoSim={() => {}} aoNao={() => {}} />);
  verdade(h.includes('role="dialog"') && h.includes('aria-modal="true"') && h.includes('aria-labelledby="dialogo-ana-titulo"') && h.includes('id="dialogo-ana-titulo"'), h);
  verdade(h.includes(">Ao desligar, a Ana não responderá às mensagens. Deseja desligar?<") && h.includes(">Sim<") && h.includes(">Não<"), h);
  const botoes = [...h.matchAll(/<button\b[^>]*class="([^"]*)"/g)].map((m) => m[1]);
  igual(botoes.length, 2);
  for (const c of botoes) verdade(/(^|\s)min-h-11(\s|$)/.test(c), `botão sem 44 px: ${c}`);
  verdade(!h.includes('role="alert"'), "sem erro, sem alerta");
  const oc = renderToStaticMarkup(<DialogoDaAna titulo="Responder à última mensagem?" sim="Sim" nao="Não" ocupado ocupadoTexto="Ana está respondendo…" erro="A Ana não pôde responder: motivo real" aoSim={() => {}} aoNao={() => {}} />);
  verdade(oc.includes("disabled") && oc.includes(">…<") && oc.includes('aria-busy="true"') && oc.includes("Ana está respondendo…"), oc);
  verdade(/role="alert"[^>]*>A Ana não pôde responder: motivo real</.test(oc), "o motivo real fica visível e anunciado");
});

teste("DIÁLOGO (código): foco preso e devolvido, Esc fecha (não enquanto grava), começa no 'Não'", () => {
  const c = codigoDe(le("components/atendimento-app/DialogoDaAna.tsx"));
  verdade(c.includes('e.key === "Escape"') && c.includes('e.key === "Tab"') && c.includes("e.shiftKey"), "Esc e Tab preso");
  verdade(c.includes("botaoNao.current?.focus()") && c.includes("voltarPara.focus()"), "foco começa no Não e volta ao fim");
  verdade(c.includes("ocupadoVivo.current"), "Esc não fecha enquanto grava");
});

teste("AÇÕES só depois do 'Sim': tocar na pílula só abre o pop-up; as três ações moram em confirmar()/responderUltima()", () => {
  const b = codigoDe(le("components/atendimento-app/BarraDoChat.tsx"));
  const clique = b.slice(b.indexOf("onClick={() => {"), b.indexOf("className=", b.indexOf("onClick={() => {")));
  verdade(clique.includes("setDialogo(qual)") && !/Atendente|responderUltima/.test(clique), "o toque na pílula não chama ação: " + clique);
  const conf = b.slice(b.indexOf("async function confirmar"), b.indexOf("async function responderUltima"));
  verdade(conf.includes("definirAtendenteResponde(idDaConversa, novo)") && conf.includes("devolverAtendenteResponde(idDaConversa)"), "ligar/desligar e devolver: mesmas ações com recorte");
  verdade(conf.includes("aoMudar({ agenteResponde: !novo })"), "reverte se a ação recusar");
  verdade(conf.includes("novo && abrirPerguntaDeResposta(estado)") && conf.includes("aoMudarRespostaAberta(true)"), "2º pop-up só depois de LIGAR e só se a última é do cliente");
  verdade(!conf.includes("responderUltimaPergunta"), "ligar não responde sozinho: o 2º pop-up pergunta");
  const resp = b.slice(b.indexOf("async function responderUltima"));
  verdade(resp.includes("responderUltimaPergunta(idDaConversa)") && resp.includes("setErroDaResposta(r.error)") && resp.includes("aoResponder?.()"), "responder: ação com recorte, motivo real, atualiza o chat");
  verdade(codigoDe(b).split("definirAtendenteResponde(").length === 2, "uma só chamada de ligar/desligar");
  verdade(!b.includes("metadata"), "nada de metadata");
});

teste("PÍLULA FORA DO TABLIST, no espaço da linha das abas; 44 px, texto de estado, aria-haspopup, sem só-cor", () => {
  const g = codigoDe(le("components/atendimento-app/GuiasDaConversa.tsx"));
  verdade(g.includes('role="tablist"') && g.includes('aria-label="Seções da conversa"') && g.includes('role="tab"') && g.includes("ArrowRight"), "tablist Chat/Detalhes intacto");
  verdade(/\}\)\}\s*<\/div>\s*(\{\/\*[\s\S]*?\*\/\}\s*)?<div data-slot-da-ana/.test(g), "o espaço da pílula vem depois de fechar o tablist");
  verdade(g.includes(">Chat<") === false && g.includes('rotulo: "Chat"') && g.includes('rotulo: "Detalhes"'), "abas Chat e Detalhes");
  const b = codigoDe(le("components/atendimento-app/BarraDoChat.tsx"));
  verdade(b.includes('aria-haspopup="dialog"') && b.includes("min-h-11") && b.includes("{gravando ? \"…\" : pilula.rotulo}") && b.includes("disabled={gravando}"), "botão que abre diálogo, 44 px, '…' enquanto grava");
  verdade(!b.includes("Ao enviar, você assume") && !b.includes("Responder última mensagem") && !b.includes("data-barra-do-chat"), "a barra e o texto explicativo saíram");
  verdade(b.includes("shrink-0") && g.includes("min-w-0"), "cabe em 360 px: a pílula não encolhe e as abas cedem");
});

teste("BarraDoChat sem espaço na linha (sem portal) não desenha barra nenhuma: só o aviso vivo (sr-only)", () => {
  const h = renderToStaticMarkup(<BarraDoChat idDaConversa="c1" estado={est({ ultimaDirecao: "IN" })} agora={AGORA} nomeDoAtendente="Ana" aoMudar={() => {}} respostaAberta={false} aoMudarRespostaAberta={() => {}} />);
  verdade(!h.includes("<button") && !h.includes("Ao enviar") && h.includes("sr-only"), h);
  const sem = renderToStaticMarkup(<BarraDoChat idDaConversa="c1" estado={est({ temWhatsapp: false })} agora={AGORA} nomeDoAtendente="Ana" aoMudar={() => {}} respostaAberta={false} aoMudarRespostaAberta={() => {}} />);
  igual(sem, "");
  const aberto = renderToStaticMarkup(<BarraDoChat idDaConversa="c1" estado={est({ ultimaDirecao: "IN" })} agora={AGORA} nomeDoAtendente="Ana" aoMudar={() => {}} respostaAberta aoMudarRespostaAberta={() => {}} />);
  verdade(aberto.includes("Responder à última mensagem?") && aberto.includes('role="dialog"'), aberto);
});

teste("'RESPONDER AGORA' (Ana ligada, cliente esperando): item no menu ⋮ só da ÚLTIMA mensagem do cliente; abre o mesmo pop-up; site intacto", () => {
  const a = codigoDe(le("components/atendimento-app/AcoesDaMensagem.tsx"));
  verdade(a.includes("respostaDaAna &&") && a.includes("data-responder-agora") && a.includes("Pedir à {respostaDaAna.nome} que responda agora"), "item condicional no menu");
  const c = codigoDe(le("components/atendimento-app/ChatDaConversa.tsx"));
  verdade(/podeResponderAgora = estado\.temWhatsapp && pilulaDaAna\(estado, agora, nomeDoAtendente\)\.modo === "ligada" && estado\.ultimaDirecao === "IN" && ultima\?\.direction === "IN"/.test(c), "condição");
  verdade(c.includes("ultima?.id === acoesDe.id") && c.includes("aoPedir: () => setRespostaAberta(true)"), "só a última; abre o pop-up de confirmação");
  const site = codigoDe(le("components/AtendenteIaControle.tsx"));
  verdade(site.includes("<InterruptorDaAna") && !site.includes("anaNoTopo"), "o site segue com o interruptor e sem a pílula");
  for (const f of ["components/AtendenteIaControle.tsx", "components/InterruptorDaAna.tsx"]) verdade(!/DialogoDaAna|anaNoTopo/.test(le(f)), `${f}: sem o pop-up do app`);
});

teste("nada de hex, sombra, faixa lateral nem fonte fora da rampa nos arquivos novos", () => {
  for (const f of ["components/atendimento-app/DialogoDaAna.tsx", "components/atendimento-app/BarraDoChat.tsx", "lib/anaNoTopo.ts"]) {
    const c = codigoDe(le(f));
    verdade(!/#[0-9a-fA-F]{3,8}\b/.test(c) && !/\bshadow-/.test(c) && !/border-[lrs]-/.test(c) && !new RegExp("text-\\[\\d+" + "px\\]").test(c), f);
  }
});

resumo("Atendimento app — a Ana na linha das abas (33)");
