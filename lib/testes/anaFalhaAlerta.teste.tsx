import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe } from "./executar";
import { causaAlertaOsDonos, deveAlertarOsDonosAgora, deveAlertarAnaHoje, caminhoDaConversaDoAtendimento, type CausaDaFalhaDaAna } from "@/lib/alertaDaAnaSemResposta";
import { deveEnviarAvisoHoje } from "@/lib/campanhasCobranca";
import { alertarDonosQueAAnaFalhou, type DependenciasDoAlerta, type FalhaDaAna } from "@/lib/actions/alertaDaAnaSemResposta";
import { motivoDeFalhaNoEnvio, motivoDaFalhaDoHermes, motivoDePonteNaoConfigurada } from "@/lib/motivoDoAtendente";
import { FalhaDoHermes } from "@/lib/hermesPonte";
import { fraseDoAvisoDaAna, chaveDoAvisoDaAna } from "@/lib/notaDaConversa";
import { registrarAvisoDaAna, type RepositorioDeNotas } from "@/lib/notaDaConversaDb";
import { textoDeEsperaDaAna, ESPERA_LONGA_DA_ANA_MS } from "@/lib/esperaDaAna";
import DialogoDaAna from "@/components/atendimento-app/DialogoDaAna";

// ============================================================================
// INCIDENTE DE 15 A 17/10/2026: o Hermes ficou lento, toda chamada estourou e a Ana ficou dois dias sem responder sem que
// ninguém soubesse. Prova das três frentes da correção:
//   1. o AVISO NO CHAT é registrado (e só) quando a Ana decidiu responder e falhou;
//   2. o E-MAIL aos donos sai no máximo UMA vez por dia, só para falha de infraestrutura, sem dado de cliente;
//   3. o texto de espera do botão "Responder à última mensagem".
// `atendenteResponde` inteira precisa de banco: a ordem e os casos dela são provados por varredura de código-fonte.
// ============================================================================

const RAIZ = process.cwd();
const le = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf8");

// ── 2 · A RÉGUA PURA ─────────────────────────────────────────────────────────────────────────────

teste("só falha de INFRAESTRUTURA alerta os donos; a resposta vazia vira aviso no chat, nunca e-mail", () => {
  const manda: CausaDaFalhaDaAna[] = ["hermes", "ponte-nao-configurada", "envio", "inesperada"];
  for (const c of manda) igual(causaAlertaOsDonos(c), true, c);
  igual(causaAlertaOsDonos("vazia"), false);
});

teste("UM E-MAIL POR DIA: a régua é literalmente a do alerta de memória (deveEnviarAvisoHoje), no dia de Brasília", () => {
  verdade(deveAlertarAnaHoje === deveEnviarAvisoHoje, "deveAlertarAnaHoje deixou de ser a mesma função que deveEnviarAvisoHoje");
  const manha = new Date("2026-10-16T12:00:00Z"); // 09h em Brasília
  const noite = new Date("2026-10-16T23:30:00Z"); // 20h30 em Brasília, mesmo dia
  const depoisDaMeiaNoiteDeBrasilia = new Date("2026-10-17T03:30:00Z"); // 00h30 de 17/10 em Brasília
  igual(deveAlertarOsDonosAgora("hermes", null, manha), true, "nunca alertou");
  igual(deveAlertarOsDonosAgora("hermes", "2026-10-16", noite), false, "já alertou hoje");
  igual(deveAlertarOsDonosAgora("hermes", "2026-10-16", depoisDaMeiaNoiteDeBrasilia), true, "virou o dia em Brasília (00h30 de 17/10)");
  igual(deveAlertarOsDonosAgora("hermes", "2026-10-15", manha), true, "alertou ontem");
  igual(deveAlertarOsDonosAgora("vazia", null, manha), false, "causa que não alerta nunca alerta, mesmo sem registro");
});

teste("o caminho da conversa aponta para a tela do aplicativo, onde o aviso aparece", () => {
  igual(caminhoDaConversaDoAtendimento("abc123"), "/atendimento-app/abc123");
});

// ── 2 · A AÇÃO (com repositório e e-mail em memória) ──────────────────────────────────────────────

function mundo(opcoes: { donos?: string[]; envioFalha?: boolean; ultimo?: string | null } = {}) {
  const estado = { existe: opcoes.ultimo !== undefined, ultimo: opcoes.ultimo ?? null };
  const enviados: { para: string; texto: string }[] = [];
  const deps: DependenciasDoAlerta = {
    async lerUltimo() {
      return { ...estado };
    },
    async reivindicar(existe, ultimoLido, hoje) {
      if (existe !== estado.existe || ultimoLido !== estado.ultimo) return false; // perdeu a corrida
      estado.existe = true;
      estado.ultimo = hoje;
      return true;
    },
    async devolver(hoje, anterior) {
      if (estado.ultimo === hoje) estado.ultimo = anterior;
    },
    async nomeDoEscritorio() {
      return "Escritório Teste";
    },
    async emailsDosDonos() {
      return opcoes.donos ?? ["a@exemplo.com", "b@exemplo.com"];
    },
    async enviar(para, dados) {
      if (opcoes.envioFalha) return { sent: false, reason: "SMTP fora" };
      enviados.push({ para, texto: JSON.stringify(dados) });
      return { sent: true };
    },
  };
  return { deps, estado, enviados };
}

const falha = (o: Partial<FalhaDaAna> = {}): FalhaDaAna => ({ officeId: "of-1", attendanceId: "atd-1", causa: "hermes", motivo: "o assistente não respondeu a tempo (105 s). Tente de novo em instantes", ...o });
const SEG = new Date("2026-10-16T13:00:00Z");

teste("DEZ falhas no mesmo dia mandam UM e-mail por dono (e não dez): a primeira alerta, as outras não", async () => {
  const m = mundo();
  const r1 = await alertarDonosQueAAnaFalhou(falha(), SEG, m.deps);
  igual(r1.alertou, true);
  igual(m.enviados.length, 2, "um e-mail para cada um dos dois donos");
  for (let i = 0; i < 9; i++) {
    const r = await alertarDonosQueAAnaFalhou(falha({ attendanceId: `atd-${i + 2}` }), new Date(SEG.getTime() + (i + 1) * 3_600_000), m.deps);
    igual(r.alertou, false, `falha ${i + 2}: ${r.motivo}`);
  }
  igual(m.enviados.length, 2, "nenhum e-mail novo no mesmo dia");
});

teste("no DIA SEGUINTE (Brasília) alerta de novo", async () => {
  const m = mundo({ ultimo: "2026-10-16" });
  igual((await alertarDonosQueAAnaFalhou(falha(), new Date("2026-10-16T22:00:00Z"), m.deps)).alertou, false);
  igual((await alertarDonosQueAAnaFalhou(falha(), new Date("2026-10-17T13:00:00Z"), m.deps)).alertou, true);
  igual(m.estado.ultimo, "2026-10-17");
});

teste("duas falhas SIMULTÂNEAS (a Ana caída falha em todas as mensagens ao mesmo tempo): só uma ganha a vez", async () => {
  const m = mundo();
  const rs = await Promise.all([alertarDonosQueAAnaFalhou(falha(), SEG, m.deps), alertarDonosQueAAnaFalhou(falha({ attendanceId: "atd-2" }), SEG, m.deps)]);
  igual(rs.filter((r) => r.alertou).length, 1);
  igual(m.enviados.length, 2, "dois donos, um alerta");
});

teste("resposta VAZIA não manda e-mail nem lê o estado", async () => {
  const m = mundo();
  let leu = false;
  const deps = { ...m.deps, async lerUltimo() { leu = true; return { existe: false, ultimo: null }; } };
  igual((await alertarDonosQueAAnaFalhou(falha({ causa: "vazia" }), SEG, deps)).alertou, false);
  igual([m.enviados.length, leu], [0, false]);
});

teste("se NENHUM e-mail sai (SMTP fora), o dia é devolvido: a próxima falha tenta de novo, em vez de gastar o único alerta do dia", async () => {
  const falho = mundo({ envioFalha: true });
  const r = await alertarDonosQueAAnaFalhou(falha(), SEG, falho.deps);
  igual(r.alertou, false);
  igual(falho.estado.ultimo, null, "a marca de hoje foi desfeita");
  const semDonos = mundo({ donos: [] });
  igual((await alertarDonosQueAAnaFalhou(falha(), SEG, semDonos.deps)).alertou, false);
  igual(semDonos.estado.ultimo, null);
});

teste("a ação NUNCA lança, mesmo com o banco fora do ar", async () => {
  const m = mundo();
  const deps = { ...m.deps, async lerUltimo(): Promise<{ existe: boolean; ultimo: string | null }> { throw new Error("banco fora"); } };
  const origem = console.error;
  console.error = () => {};
  try {
    igual((await alertarDonosQueAAnaFalhou(falha(), SEG, deps)).alertou, false);
  } finally {
    console.error = origem;
  }
});

teste("LGPD: o e-mail leva escritório, hora, motivo e caminho — e NADA do cliente", async () => {
  const m = mundo({ donos: ["a@exemplo.com"] });
  await alertarDonosQueAAnaFalhou(falha(), SEG, m.deps);
  const dados = JSON.parse(m.enviados[0].texto) as Record<string, string>;
  igual(Object.keys(dados).sort(), ["caminhoDaConversa", "motivo", "officeName", "quando"]);
  igual(dados.quando, "16/10/2026 10:00");
  const email = codigoDe(le("lib/email.ts"));
  const corpo = email.slice(email.indexOf("export async function sendAlertaAnaSemRespostaEmail"), email.indexOf("Resumo diário por e-mail"));
  verdade(corpo.length > 200 && !/clientName|waPhone|\.body|telefone do cliente|phone/i.test(corpo), "o e-mail da Ana não pode tocar em nome, telefone nem texto do cliente");
  verdade(corpo.includes("escapeHtml(dados.motivo)") && corpo.includes("escapeHtml(dados.officeName)"), "motivo e escritório entram escapados");
  verdade(corpo.includes("getAppUrl()"), "endereço absoluto só por getAppUrl()");
});

// ── 1 · O MOTIVO NUNCA CARREGA SEGREDO NEM TELEFONE ───────────────────────────────────────────────

teste("motivoDeFalhaNoEnvio: sem endereço, sem Bearer, sem telefone, sem token comprido, com teto", () => {
  const cru = "Falha ao contatar a API do WhatsApp: request to https://graph.facebook.com/v20.0/1234567890/messages failed, to +55 (31) 99999-8888 Bearer EAAGm0PX4ZCpsBAKabcdefghijklmnopqrstuvwxyz0123";
  const m = motivoDeFalhaNoEnvio(cru);
  verdade(!m.includes("graph.facebook.com") && !m.includes("99999") && !m.includes("EAAGm0") && !/Bearer EAA/.test(m), m);
  verdade(m.startsWith("não foi possível enviar a resposta pelo WhatsApp"), m);
  verdade(motivoDeFalhaNoEnvio("x".repeat(500) + " y").length < 270, "teto de tamanho");
  igual(motivoDeFalhaNoEnvio(undefined), "não foi possível enviar a resposta pelo WhatsApp");
  igual(motivoDeFalhaNoEnvio("(#131030) Recipient phone number not in allowed list"), "não foi possível enviar a resposta pelo WhatsApp ((#131030) Recipient phone number not in allowed list)");
});

teste("as frases do Hermes nunca ecoam o token nem o endereço da ponte (as que o aviso e o e-mail usam)", () => {
  process.env.HERMES_TOKEN = "token-super-secreto-1234";
  process.env.HERMES_URL = "https://hermes.interno.exemplo/ponte";
  const frases = [
    motivoDaFalhaDoHermes(new FalhaDoHermes("401 Bearer token-super-secreto-1234 em https://hermes.interno.exemplo/ponte", 401, "recusou")),
    motivoDaFalhaDoHermes(new FalhaDoHermes("o servidor do Hermes respondeu 500: falha em https://hermes.interno.exemplo/ponte com token-super-secreto-1234", 500, "erro-da-ponte")),
    motivoDaFalhaDoHermes(new FalhaDoHermes("DEMORA: sem resposta em 105 s", null, "demora")),
    motivoDePonteNaoConfigurada(),
  ];
  for (const f of frases) verdade(!f.includes("token-super-secreto-1234") && !f.includes("hermes.interno.exemplo"), f);
});

teste("o aviso do chat tem teto de tamanho e continua com a frase de sempre", () => {
  igual(fraseDoAvisoDaAna("  já houve resposta.  "), "A Ana não respondeu: já houve resposta.");
  verdade(fraseDoAvisoDaAna("a".repeat(2000)).length < 440, "teto");
});

// ── 1 · O AVISO NO CHAT: grava para as falhas, uma vez por pergunta, como SISTEMA ─────────────────

function repositorio() {
  const linhas: { chave: string; tipo: string; texto: string; attendanceId: string; officeId: string }[] = [];
  const repo: RepositorioDeNotas = {
    async achar(officeId, chave) {
      const l = linhas.find((x) => x.officeId === officeId && x.chave === chave);
      return l ? ({ id: "n", tipo: l.tipo, autorNome: null, texto: l.texto, clientMessageId: chave, createdAt: new Date(), officeId, attendanceId: l.attendanceId, textoHash: "h" } as never) : null;
    },
    async criar(d) {
      linhas.push({ chave: d.clientMessageId, tipo: d.tipo, texto: d.texto, attendanceId: d.attendanceId, officeId: d.officeId });
      return { id: "n", tipo: d.tipo, autorNome: null, texto: d.texto, clientMessageId: d.clientMessageId, createdAt: new Date(), officeId: d.officeId, attendanceId: d.attendanceId, textoHash: d.textoHash };
    },
  };
  return { repo, linhas };
}

teste("falha do Hermes na MESMA pergunta, repetida (várias rodadas / 'responder agora'): UM aviso; outra pergunta do cliente, outro aviso", async () => {
  const { repo, linhas } = repositorio();
  const atd = { id: "atd-1", officeId: "of-1" };
  const motivo = motivoDaFalhaDoHermes(new FalhaDoHermes("DEMORA: sem resposta em 105 s", null, "demora"));
  igual(await registrarAvisoDaAna(atd, "msg-1", motivo, { repo }), true);
  igual(await registrarAvisoDaAna(atd, "msg-1", motivo, { repo }), false);
  igual(await registrarAvisoDaAna(atd, "msg-2", motivo, { repo }), true);
  igual(linhas.length, 2);
  igual(linhas[0].tipo, "SISTEMA");
  verdade(linhas[0].texto.startsWith("A Ana não respondeu: o assistente não respondeu a tempo"), linhas[0].texto);
  verdade(chaveDoAvisoDaAna("msg-1").startsWith("sistema:"), "chave de sistema");
});

// ── 1 · QUANDO O AVISO É E NÃO É REGISTRADO (varredura de atendenteResponde) ──────────────────────

teste("avisarQueAAnaFalhou só é chamado nas 5 falhas, na ordem do fluxo, e SÓ depois de a Ana ter decidido responder", () => {
  const c = codigoDe(le("lib/atendenteResponde.ts"));
  const corpo = c.slice(c.indexOf("export async function atendenteResponde("), c.indexOf("export async function silenciarAtendente("));
  const chamadas = [...corpo.matchAll(/avisarQueAAnaFalhou\(\s*alvo,\s*"([a-z-]+)"/g)].map((m) => m[1]);
  igual(chamadas, ["ponte-nao-configurada", "hermes", "vazia", "envio", "inesperada"]);

  const iAlvo = corpo.indexOf("alvo = {");
  verdade(iAlvo > 0, "alvo nunca é preenchido");
  // As recusas de TRAVA (escolhas do escritório) vêm todas ANTES de alvo existir — e nenhuma delas avisa.
  for (const recusa of ["atendimento sem WhatsApp vinculado", "WhatsApp não configurado", "o atendente de IA está desligado neste escritório", "veredito.motivo", "a última mensagem não é do cliente"]) {
    const i = corpo.indexOf(recusa);
    verdade(i > 0 && i < iAlvo, `a recusa "${recusa}" tem de vir antes de a Ana ter decidido responder`);
  }
  verdade(corpo.slice(0, iAlvo).indexOf("avisarQueAAnaFalhou(") === -1, "nenhum aviso antes de `alvo` (recusas de trava não avisam)");
  // `alvo` ancora o aviso na última mensagem real do cliente.
  verdade(/alvo = \{ attendanceId, officeId: atendimento\.officeId, perguntaId: ultima\.id \}/.test(corpo), "o aviso usa o id da última mensagem do cliente");
  // A ponte não configurada fica DEPOIS de `alvo` (e de `ultima` existir), não mais antes de ler as mensagens.
  verdade(corpo.indexOf("if (!hermesConfigurado())") > iAlvo, "ponte não configurada só avisa depois da pergunta pendente");
});

teste("a falha inesperada só avisa se há `alvo` E a mensagem ainda não saiu; o retorno de cada caminho NÃO mudou", () => {
  const c = codigoDe(le("lib/atendenteResponde.ts"));
  verdade(/if \(alvo && !jaEnviou\) await avisarQueAAnaFalhou\(alvo, "inesperada"/.test(c), "guarda do catch final");
  const iOk = c.indexOf("jaEnviou = true;");
  const iEnvio = c.indexOf("await sendWhatsappText(");
  const iRegistra = c.indexOf("await registrarMensagem(");
  verdade(iEnvio < iOk && iOk < iRegistra, "jaEnviou vira verdadeiro logo depois do envio ok e antes de qualquer gravação que possa lançar");
  for (const r of ['motivo: "o agente devolveu resposta vazia"', 'motivo: envio.error || "falha ao enviar"', 'motivo: "falha inesperada ao responder"']) verdade(c.includes(r), `retorno mudou: ${r}`);
  verdade(/return \{ respondeu: false, motivo \};/.test(c), "retornos das falhas do Hermes e da ponte devolvem o mesmo motivo que foi avisado");
});

teste("a nota de sistema nunca vai ao cliente nem entra na leitura da Ana: atendenteResponde só importa o registro, e o alerta não toca em mensagem", () => {
  const a = codigoDe(le("lib/atendenteResponde.ts"));
  verdade(!/notaDaConversa\./.test(a) && !/prisma\.notaDaConversa/.test(a), "atendenteResponde consulta a tabela de notas");
  const acao = codigoDe(le("lib/actions/alertaDaAnaSemResposta.ts"));
  verdade(!/sendWhatsapp|registrarMensagem|whatsappMessage|silenciarAtendente|clientName|waPhone/.test(acao), "o alerta alcança envio/mensagem/dado de cliente");
  verdade(acao.indexOf("deps.reivindicar(") < acao.indexOf("enviarAosDonos(falha"), "o dia é gravado ANTES de enviar (trava de corrida)");
});

teste("o schema tem a tabela do 'já alertei hoje' (aditiva, uma linha, chave fixa)", () => {
  const s = le("prisma", "schema.prisma");
  const m = s.slice(s.indexOf("model AlertaDaAnaEstado"));
  verdade(/chave\s+String\s+@id @default\("ANA_SEM_RESPOSTA"\)/.test(m) && /ultimoAlertaDiarioEm\s+String\?/.test(m), "modelo do alerta da Ana");
});

// ── 3 · O TEXTO DE ESPERA DO BOTÃO ────────────────────────────────────────────────────────────────

teste("espera: começa dizendo que pode levar até 2 minutos; depois de ~30 s troca para 'Ainda esperando o assistente'", () => {
  igual(textoDeEsperaDaAna("Ana", false), "Ana está respondendo… pode levar até 2 minutos.");
  igual(textoDeEsperaDaAna("Ana", true), "Ainda esperando o assistente — pode levar até 2 minutos.");
  igual(ESPERA_LONGA_DA_ANA_MS, 30_000);
  igual(textoDeEsperaDaAna("Clara", false), "Clara está respondendo… pode levar até 2 minutos.");
});

teste("o diálogo mostra os dois textos no mesmo <p role=status> (leitor de tela anuncia a troca); o erro final segue em role=alert", () => {
  const props = { titulo: "Responder à última mensagem?", sim: "Sim", nao: "Não", ocupado: true, erro: null, aoSim: () => {}, aoNao: () => {} };
  const curta = renderToStaticMarkup(<DialogoDaAna {...props} ocupadoTexto={textoDeEsperaDaAna("Ana", false)} />);
  const longa = renderToStaticMarkup(<DialogoDaAna {...props} ocupadoTexto={textoDeEsperaDaAna("Ana", true)} />);
  verdade(curta.includes('role="status"') && curta.includes("pode levar até 2 minutos"), curta);
  verdade(longa.includes('role="status"') && longa.includes("Ainda esperando o assistente"), longa);
  const comErro = renderToStaticMarkup(<DialogoDaAna {...props} ocupado={false} erro="A Ana não pôde responder: motivo real" />);
  verdade(comErro.includes('role="alert"') && comErro.includes("motivo real"), "o erro final não mudou");
});

teste("os dois pontos de uso (aplicativo e site/PWA) usam o mesmo texto e o mesmo relógio, e o relógio é limpo", () => {
  for (const f of ["components/atendimento-app/BarraDoChat.tsx", "components/AtendenteIaControle.tsx"]) {
    const c = codigoDe(le(f));
    verdade(c.includes("useEsperaLongaDaAna(respondendo)") && c.includes("textoDeEsperaDaAna(nomeDoAtendente, esperaLonga)"), `${f} não usa o texto de espera`);
  }
  const h = codigoDe(le("components/useEsperaLongaDaAna.ts"));
  verdade(h.includes("setTimeout(() => setLonga(true), ESPERA_LONGA_DA_ANA_MS)") && h.includes("clearTimeout(relogio)") && h.includes("setLonga(false)"), "o relógio precisa ser limpo e zerado");
  const site = codigoDe(le("components/AtendenteIaControle.tsx"));
  verdade(site.includes('role="status"') && /finally \{\s*setRespondendo\(false\)/.test(site), "texto de espera com aria-live e estado sempre desfeito");
});

resumo("Ana: falha avisada no chat, alerta diário aos donos e texto de espera");
