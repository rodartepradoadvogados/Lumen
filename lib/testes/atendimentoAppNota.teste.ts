import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe } from "./executar";
import { hashDoTexto } from "@/lib/hashDoTexto";
import {
  chaveDoAvisoDaAna,
  fraseDoAvisoDaAna,
  lerModoDoPedido,
  prepararNota,
  resultadoDaNota,
  validarPedidoDeNota,
} from "@/lib/notaDaConversa";
import { registrarAvisoDaAna, salvarNotaDoApp, type RepositorioDeNotas } from "@/lib/notaDaConversaDb";
import { despacharPedidoDoChat } from "@/lib/pedidoDoChatDb";
import { mesclarMensagens } from "@/lib/mensagensDoChat";
import { validarPedidoDeEnvio } from "@/lib/envioDeMensagem";
import { gravarRascunho, lerRascunho, limparRastrosDoAparelho, novoPendente, pendenteComoMensagem, restaurarPendentes, semOsJaConfirmados } from "@/lib/filaDoChat";
import { deveBuscarAgora, fraseDoAviso, INTERVALO_EM_SEGUNDO_PLANO_MS, novasDoCliente, rotuloDoBotaoDeNovas, tituloComAviso } from "@/lib/avisoDeMensagemNova";
import type { SendResult } from "@/lib/whatsapp";

// ============================================================================
// NOTA INTERNA, AVISO "A ANA NÃO RESPONDEU" E AVISO DE MENSAGEM NOVA (proposta v2: PR 7 e PR 11 sem push).
//
// O que se prova: a nota NUNCA chega ao provedor (provedor falso + fetch falso), idempotência por chave, recorte
// (outra conversa, outro escritório, aviso de sistema), a Ana desistindo sem repetir o aviso, rascunhos separados,
// e as travas de código (nenhum código de envio conhece a tabela). NÃO se prova aqui: banco real (o repositório é
// em memória) nem o navegador.
// ============================================================================

const RAIZ = process.cwd();
const le = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf8");
const AGORA = new Date(Date.UTC(2026, 8, 29, 17, 32));

// ── O REPOSITÓRIO EM MEMÓRIA (a costura de banco) ───────────────────────────────────────────────────

type Linha = { id: string; officeId: string; attendanceId: string; tipo: string; userId: string | null; autorNome: string | null; texto: string; clientMessageId: string; textoHash: string; createdAt: Date };

function repositorioEmMemoria(opcoes: { perdeACorridaUmaVez?: boolean; quebra?: boolean } = {}) {
  const linhas: Linha[] = [];
  let n = 0;
  let corridaPendente = opcoes.perdeACorridaUmaVez ?? false;
  const repo: RepositorioDeNotas = {
    async achar(officeId, clientMessageId) {
      if (opcoes.quebra) throw new Error("banco fora do ar");
      return linhas.find((l) => l.officeId === officeId && l.clientMessageId === clientMessageId) ?? null;
    },
    async criar(dados) {
      if (opcoes.quebra) throw new Error("banco fora do ar");
      if (corridaPendente) {
        // Outro pedido com a mesma chave gravou entre o `achar` e o `criar`.
        corridaPendente = false;
        linhas.push({ ...dados, id: `nota-vencedora-${++n}`, createdAt: AGORA });
        return null;
      }
      if (linhas.some((l) => l.officeId === dados.officeId && l.clientMessageId === dados.clientMessageId)) return null;
      const l: Linha = { ...dados, id: `nota-${++n}`, createdAt: new Date(AGORA.getTime() + n * 1000) };
      linhas.push(l);
      return l;
    },
  };
  return { repo, linhas };
}

const A = { officeId: "office-a", userId: "user-1", autorNome: "Marilene Souza", attendance: { id: "atd-1" } };
const CHAVE = "chave-da-nota-0001";

// ── O MODO E A VALIDAÇÃO ────────────────────────────────────────────────────────────────────────────

teste("MODO: ausente ou 'mensagem' = envio ao cliente (como sempre); 'nota' = nota; QUALQUER outro valor é inválido (nunca 'na dúvida, envia')", () => {
  igual(lerModoDoPedido({ clientMessageId: CHAVE, texto: "oi" }), "mensagem");
  igual(lerModoDoPedido({ modo: "mensagem" }), "mensagem");
  igual(lerModoDoPedido({ modo: "nota" }), "nota");
  for (const ruim of ["NOTA", "Nota", "interna", "", null, 1, true, ["nota"], { modo: "nota" }]) {
    igual(lerModoDoPedido({ modo: ruim }), null, `modo ${JSON.stringify(ruim)}`);
  }
  igual(lerModoDoPedido(null), "mensagem", "corpo nulo cai na validação do envio (que recusa)");
});

teste("NOTA: mesma chave e mesmo limite do envio; a frase de erro fala de NOTA, não de mensagem", () => {
  const ok = validarPedidoDeNota({ clientMessageId: CHAVE, texto: "  Cliente pediu retorno amanhã  ", modo: "nota" });
  igual(ok.ok && ok.texto, "Cliente pediu retorno amanhã");
  const vazio = validarPedidoDeNota({ clientMessageId: CHAVE, texto: "   " });
  igual(vazio.ok, false);
  verdade(!vazio.ok && vazio.erro === "Digite a nota antes de salvar.", "frase da nota");
  const longa = validarPedidoDeNota({ clientMessageId: CHAVE, texto: "x".repeat(4097) });
  verdade(!longa.ok && longa.erro.includes("A nota passa de 4096"), "limite");
  igual(validarPedidoDeNota({ clientMessageId: "curta", texto: "oi" }).ok, false);
  igual(validarPedidoDeNota({ clientMessageId: "sistema:ana-desistiu:x", texto: "oi" }).ok, false, "':' não passa: nenhuma nota digitada colide com a chave do aviso de sistema");
  igual(validarPedidoDeEnvio({ clientMessageId: chaveDoAvisoDaAna("abc12345"), texto: "oi" }).ok, false);
});

// ── SALVAR: IDEMPOTÊNCIA, RECORTE, CORRIDA ──────────────────────────────────────────────────────────

teste("SALVAR: grava a nota com autor e hora de Brasília; volta como 'nota' (não como mensagem do cliente nem do escritório)", async () => {
  const { repo, linhas } = repositorioEmMemoria();
  const r = await salvarNotaDoApp(A, { clientMessageId: CHAVE, texto: "Ligar depois das 14 h" }, { agora: AGORA, repo });
  igual(r.status, 200);
  const corpo = r.corpo as { ok: true; jaTinhaSaido: boolean; mensagem: ReturnType<typeof prepararNota> };
  igual([corpo.ok, corpo.jaTinhaSaido, corpo.mensagem.tipo, corpo.mensagem.autor, corpo.mensagem.texto, corpo.mensagem.clientMessageId], [true, false, "nota", "Marilene Souza", "Ligar depois das 14 h", CHAVE]);
  igual(corpo.mensagem.hora, "14:32");
  igual([corpo.mensagem.midia, corpo.mensagem.falhou, corpo.mensagem.enviada, corpo.mensagem.transcricao], [null, false, false, null]);
  igual([linhas.length, linhas[0].tipo, linhas[0].userId, linhas[0].officeId, linhas[0].attendanceId], [1, "NOTA", "user-1", "office-a", "atd-1"]);
});

teste("IDEMPOTÊNCIA: a mesma chave duas vezes (duplo toque, fila, reconexão) devolve a MESMA nota; nunca grava outra", async () => {
  const { repo, linhas } = repositorioEmMemoria();
  const um = await salvarNotaDoApp(A, { clientMessageId: CHAVE, texto: "Nota única" }, { agora: AGORA, repo });
  const dois = await salvarNotaDoApp(A, { clientMessageId: CHAVE, texto: "Nota única" }, { agora: AGORA, repo });
  const tres = await salvarNotaDoApp(A, { clientMessageId: CHAVE, texto: "Nota única" }, { agora: AGORA, repo });
  igual(linhas.length, 1, "uma linha só");
  const ids = [um, dois, tres].map((x) => (x.corpo as { mensagem: { id: string } }).mensagem.id);
  igual(new Set(ids).size, 1, "sempre a mesma nota");
  igual([(um.corpo as { jaTinhaSaido: boolean }).jaTinhaSaido, (dois.corpo as { jaTinhaSaido: boolean }).jaTinhaSaido], [false, true]);
});

teste("IDEMPOTÊNCIA: perdeu a corrida (dois pedidos juntos) -> devolve a nota de quem ganhou, sem segunda linha", async () => {
  const { repo, linhas } = repositorioEmMemoria({ perdeACorridaUmaVez: true });
  const r = await salvarNotaDoApp(A, { clientMessageId: CHAVE, texto: "Corrida" }, { agora: AGORA, repo });
  igual(r.status, 200);
  igual(linhas.length, 1);
  igual((r.corpo as { mensagem: { id: string } }).mensagem.id, "nota-vencedora-1");
  igual((r.corpo as { jaTinhaSaido: boolean }).jaTinhaSaido, true);
});

teste("IDEMPOTÊNCIA: a mesma chave com OUTRO texto é erro do aparelho (409), nunca 'a nota foi salva'", async () => {
  const { repo, linhas } = repositorioEmMemoria();
  await salvarNotaDoApp(A, { clientMessageId: CHAVE, texto: "Primeira" }, { agora: AGORA, repo });
  const r = await salvarNotaDoApp(A, { clientMessageId: CHAVE, texto: "Outra coisa" }, { agora: AGORA, repo });
  igual([r.status, (r.corpo as { codigo?: string }).codigo], [409, "CHAVE_REUTILIZADA"]);
  igual(linhas.length, 1);
});

teste("RECORTE: a chave já usada em OUTRA conversa não devolve a nota alheia (409); em outro escritório é outra nota (multi-tenant)", async () => {
  const { repo, linhas } = repositorioEmMemoria();
  await salvarNotaDoApp(A, { clientMessageId: CHAVE, texto: "Segredo do caso A" }, { agora: AGORA, repo });
  const outraConversa = await salvarNotaDoApp({ ...A, attendance: { id: "atd-2" } }, { clientMessageId: CHAVE, texto: "Segredo do caso A" }, { agora: AGORA, repo });
  igual([outraConversa.status, (outraConversa.corpo as { codigo?: string }).codigo], [409, "CHAVE_REUTILIZADA"]);
  verdade(!JSON.stringify(outraConversa.corpo).includes("Segredo"), "o 409 não devolve o texto da nota alheia");
  const outroEscritorio = await salvarNotaDoApp({ ...A, officeId: "office-b", attendance: { id: "atd-9" } }, { clientMessageId: CHAVE, texto: "Nota do escritório B" }, { agora: AGORA, repo });
  igual(outroEscritorio.status, 200);
  igual(linhas.map((l) => [l.officeId, l.attendanceId]), [["office-a", "atd-1"], ["office-b", "atd-9"]]);
  const b = outroEscritorio.corpo as { mensagem: { texto: string }; jaTinhaSaido: boolean };
  igual([b.jaTinhaSaido, b.mensagem.texto], [false, "Nota do escritório B"]);
});

teste("RECORTE: uma nota nunca 'reaproveita' a chave de um aviso de sistema", async () => {
  const { repo, linhas } = repositorioEmMemoria();
  await registrarAvisoDaAna({ id: "atd-1", officeId: "office-a" }, "perg-1", "uma pessoa do escritório assumiu enquanto ela redigia", { repo });
  const chave = linhas[0].clientMessageId;
  const r = await salvarNotaDoApp(A, { clientMessageId: chave, texto: linhas[0].texto }, { agora: AGORA, repo });
  igual([r.status, (r.corpo as { codigo?: string }).codigo], [409, "CHAVE_REUTILIZADA"]);
  igual(linhas.length, 1);
});

teste("AUTOR: sem nome cadastrado a nota fica com 'Equipe' (nunca vazio)", async () => {
  const { repo, linhas } = repositorioEmMemoria();
  await salvarNotaDoApp({ ...A, autorNome: "  " }, { clientMessageId: CHAVE, texto: "x" }, { agora: AGORA, repo });
  igual(linhas[0].autorNome, "Equipe");
});

// ── A NOTA NUNCA CHEGA AO PROVEDOR (provedor falso) ─────────────────────────────────────────────────

teste("PROVEDOR FALSO: modo 'nota' não chama o envio do WhatsApp nem a rede; o atendimento COM telefone e Ana ligada continua intacto", async () => {
  const chamadas: string[] = [];
  const enviar = async (_o: string, para: string, texto: string): Promise<SendResult> => {
    chamadas.push(`${para}:${texto}`);
    return { ok: true, waMessageId: "wamid.FALSO" };
  };
  const { repo, linhas } = repositorioEmMemoria();
  const fetchOriginal = globalThis.fetch;
  let idas = 0;
  globalThis.fetch = (async () => {
    idas++;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    const atendimento = { id: "atd-1", waPhone: "5562999990000", firstResponseAt: null };
    for (const texto of ["Nota 1", "Cliente é o Edmar, prazo dia 30", "x".repeat(4000)]) {
      const r = await despacharPedidoDoChat(
        { officeId: "office-a", userId: "user-1", autorNome: "Marilene", attendance: atendimento },
        { modo: "nota", clientMessageId: `chave-${hashDoTexto(texto).slice(0, 12)}`, texto },
        { agora: AGORA, enviar, repositorioDeNotas: repo },
      );
      igual(r.status, 200);
    }
    // repetição da mesma chave: também não envia
    await despacharPedidoDoChat({ officeId: "office-a", userId: "user-1", autorNome: "Marilene", attendance: atendimento }, { modo: "nota", clientMessageId: `chave-${hashDoTexto("Nota 1").slice(0, 12)}`, texto: "Nota 1" }, { agora: AGORA, enviar, repositorioDeNotas: repo });
  } finally {
    globalThis.fetch = fetchOriginal;
  }
  igual(chamadas, [], "o provedor falso NÃO foi chamado");
  igual(idas, 0, "nenhuma chamada de rede");
  igual(linhas.length, 3, "as três notas ficaram guardadas");
});

teste("PROVEDOR FALSO: modo inválido é 400 e não envia NADA; sem modo cai no envio ao cliente (que recusa sem WhatsApp, antes de qualquer banco)", async () => {
  let chamadas = 0;
  const enviar = async (): Promise<SendResult> => {
    chamadas++;
    return { ok: true, waMessageId: "x" };
  };
  const { repo, linhas } = repositorioEmMemoria();
  const semFone = { id: "atd-1", waPhone: null, firstResponseAt: null };
  const a = { officeId: "office-a", userId: "user-1", autorNome: "M", attendance: semFone };
  const ruim = await despacharPedidoDoChat(a, { modo: "interna", clientMessageId: CHAVE, texto: "oi" }, { enviar, repositorioDeNotas: repo });
  igual(ruim.status, 400);
  const vazio = await despacharPedidoDoChat(a, { modo: "nota", clientMessageId: CHAVE, texto: "  " }, { enviar, repositorioDeNotas: repo });
  igual(vazio.status, 400);
  const envio = await despacharPedidoDoChat(a, { clientMessageId: CHAVE, texto: "oi" }, { enviar, repositorioDeNotas: repo });
  igual([envio.status, (envio.corpo as { codigo: string }).codigo], [422, "SEM_WHATSAPP"], "sem `modo` é o caminho do envio");
  igual(chamadas, 0);
  igual(linhas.length, 0, "nada virou nota por engano");
});

teste("NOTA sem WhatsApp e sem janela: salvar não depende de telefone, provedor nem janela de 24 h", async () => {
  const { repo, linhas } = repositorioEmMemoria();
  const r = await despacharPedidoDoChat({ officeId: "office-a", userId: "user-1", autorNome: "M", attendance: { id: "atd-1", waPhone: null, firstResponseAt: null } }, { modo: "nota", clientMessageId: CHAVE, texto: "Cliente sem WhatsApp" }, { repositorioDeNotas: repo, agora: AGORA });
  igual(r.status, 200);
  igual(linhas.length, 1);
});

// ── O AVISO "A ANA NÃO RESPONDEU" ───────────────────────────────────────────────────────────────────

teste("AVISO DA ANA: frase em português claro com o motivo; uma vez por pergunta, ainda que ela tente várias vezes", async () => {
  const { repo, linhas } = repositorioEmMemoria();
  const atendimento = { id: "atd-1", officeId: "office-a" };
  const motivo = "uma pessoa do escritório assumiu enquanto ela redigia";
  igual(await registrarAvisoDaAna(atendimento, "msg-pergunta-1", motivo, { repo }), true);
  igual(await registrarAvisoDaAna(atendimento, "msg-pergunta-1", motivo, { repo }), false, "segunda tentativa na mesma pergunta");
  igual(await registrarAvisoDaAna(atendimento, "msg-pergunta-1", "já houve resposta depois da mensagem do cliente", { repo }), false, "outro motivo, mesma pergunta: não repete");
  igual(linhas.length, 1);
  igual(linhas[0].texto, "A Ana não respondeu: uma pessoa do escritório assumiu enquanto ela redigia.");
  igual([linhas[0].tipo, linhas[0].userId, linhas[0].autorNome], ["SISTEMA", null, null]);
  igual(await registrarAvisoDaAna(atendimento, "msg-pergunta-2", motivo, { repo }), true, "outra pergunta do cliente é outro fato");
  igual(linhas.length, 2);
});

teste("AVISO DA ANA: é 'sistema' na tela (sem autor, sem chave), não é mensagem do cliente nem do escritório", async () => {
  const { repo, linhas } = repositorioEmMemoria();
  await registrarAvisoDaAna({ id: "atd-1", officeId: "office-a" }, "msg-1", "o atendimento foi arquivado enquanto ela redigia.", { repo });
  const m = prepararNota(linhas[0], AGORA);
  igual([m.tipo, m.autor, m.clientMessageId, m.texto], ["sistema", null, null, "A Ana não respondeu: o atendimento foi arquivado enquanto ela redigia."]);
  igual(fraseDoAvisoDaAna("  já houve resposta.  "), "A Ana não respondeu: já houve resposta.");
  igual(fraseDoAvisoDaAna(""), "A Ana não respondeu: ela desistiu de enviar.");
});

teste("AVISO DA ANA: um banco fora do ar NUNCA derruba a Ana (a função não lança)", async () => {
  const { repo } = repositorioEmMemoria({ quebra: true });
  // (o registro do erro vai ao console; não se silencia console.error aqui porque as suítes rodam entrelaçadas)
  igual(await registrarAvisoDaAna({ id: "atd-1", officeId: "office-a" }, "msg-1", "x", { repo }), false);
});

teste("AVISO DA ANA: aparece quando a releitura manda desistir, depois dela e fora do trecho que antecede o envio", () => {
  const c = codigoDe(le("lib/atendenteResponde.ts"));
  verdade(c.includes("registrarAvisoDaAna"), "atendenteResponde não grava o aviso");
  const iRele = c.indexOf("relerAntesDeEnviar(attendanceId");
  const iAviso = c.indexOf("return desistirComAviso(attendanceId");
  const iEnvio = c.indexOf("await sendWhatsappText(");
  verdade(iRele > 0 && iAviso > iRele && iEnvio > iAviso, "o aviso vem depois da releitura, dentro do `if (!releitura.envia)`");
  verdade(/if \(!releitura\.envia\) \{\s*return desistirComAviso\(/.test(c), "o aviso só na desistência");
  const desiste = c.slice(c.indexOf("async function desistirComAviso("));
  verdade(desiste.slice(0, desiste.indexOf("\n}\n")).includes("registrarAvisoDaAna("), "o auxiliar grava o aviso");
});

// ── TRAVAS DE CÓDIGO: nenhum código de envio conhece a nota ─────────────────────────────────────────

const VE_NOTA = /notaDaConversa|NotaDaConversa|lib\/notaDaConversa/;

teste("A NOTA NÃO TEM CAMINHO AO WHATSAPP: os arquivos que gravam nota não importam envio, agente, nem tocam em Attendance", () => {
  for (const f of ["lib/notaDaConversaDb.ts", "lib/notaDaConversa.ts"]) {
    const c = codigoDe(le(f));
    verdade(!/lib\/whatsapp"|registrarMensagem|hermesPonte|atendenteResponde|sendWhatsapp|silenciarAtendente|envioDeMensagemDb/.test(c), `${f} alcança envio/agente/assumir`);
    verdade(!/attendance\.(update|updateMany|create)|whatsappMessage\./.test(c), `${f} escreve em Attendance ou WhatsappMessage`);
    verdade(!/waLastMessageAt|firstResponseAt|ultimaAtividadeEm|prazoDeRespostaAte|agenteSilenciadoEm/.test(c), `${f} mexe em relógio/assumir`);
  }
});

teste("NENHUM código de envio ou de leitura da Ana conhece a tabela de notas (só o aviso da Ana grava, e só ele)", () => {
  for (const f of [
    "lib/whatsapp.ts",
    "lib/hermesPonte.ts",
    "lib/registrarMensagem.ts",
    "lib/envioDeMensagemDb.ts",
    "lib/envioDeMensagem.ts",
    "lib/anaReleOSilencio.ts",
    "lib/estadoDoChatDb.ts",
    "lib/estadoDoChat.ts",
    "lib/janelaDe24h.ts",
    "lib/transcricao.ts",
    "lib/transcricaoDeAudio.ts",
    "lib/transferirLead.ts",
  ]) {
    verdade(!VE_NOTA.test(codigoDe(le(f))), `${f} conhece NotaDaConversa`);
  }
  const atende = codigoDe(le("lib/atendenteResponde.ts"));
  const usos = atende.match(/notaDaConversa\w*|NotaDaConversa\w*/g) ?? [];
  igual([...new Set(usos)], ["notaDaConversaDb"], "atendenteResponde só importa o registro do aviso, nunca lê a tabela");
  verdade(!/notaDaConversa\./.test(atende), "atendenteResponde consulta a tabela");
});

teste("o despacho: só o modo 'mensagem' chega em enviarMensagemDoApp; a rota chama a guarda ANTES de tudo e não decide o modo sozinha", () => {
  const d = codigoDe(le("lib/pedidoDoChatDb.ts"));
  const iModo = d.indexOf("lerModoDoPedido(corpo)");
  const iInvalido = d.indexOf("modo === null");
  const iNota = d.indexOf('modo === "nota"');
  const iSalva = d.indexOf("salvarNotaDoApp(");
  const iEnvio = d.indexOf("enviarMensagemDoApp(");
  verdade(iModo > 0 && iInvalido > iModo && iNota > iInvalido && iSalva > iNota && iEnvio > iSalva, "ordem: modo -> inválido -> nota -> (só então) envio");
  verdade(d.slice(iNota, iEnvio).includes("return salvarNotaDoApp("), "a nota RETORNA antes de chegar ao envio");
  const rota = codigoDe(le("app/api/atendimento/[id]/mensagens/route.ts"));
  const post = rota.slice(rota.indexOf("export async function POST"));
  verdade(post.indexOf("atendimentoDaRota(params.id)") > 0 && post.indexOf("atendimentoDaRota") < post.indexOf("req.json"), "guarda antes do corpo");
  verdade(post.includes("despacharPedidoDoChat(") && !post.includes("enviarMensagemDoApp") && !post.includes("sendWhatsapp"), "a rota não envia por conta própria");
  verdade(post.includes("autorNome: viewer.name"), "o autor vem da sessão, não do corpo");
  verdade(!/corpo\.(autor|userId|officeId)/.test(post), "o autor/escritório nunca vêm do corpo do pedido");
});

teste("LEITURA: toda consulta de nota tem a conversa E o escritório no where (o id da conversa já veio autorizado pela guarda)", () => {
  const c = codigoDe(le("lib/mensagensDoChatDb.ts"));
  const consultas = c.match(/notaDaConversa\.findMany\(\{[^\n]*\n?/g) ?? [];
  igual(consultas.length, 2, "duas leituras: a página e a atualização");
  for (const q of consultas) verdade(/where: \{ attendanceId, officeId,/.test(q), `consulta sem o recorte: ${q}`);
  const db = codigoDe(le("lib/notaDaConversaDb.ts"));
  verdade(db.includes("officeId_clientMessageId: { officeId, clientMessageId }"), "a chave é única por escritório");
  verdade(db.includes("existente.officeId !== a.officeId") && db.includes("existente.attendanceId !== a.attendance.id"), "a nota alheia nunca é devolvida");
  const pagina = codigoDe(le("app/atendimento-app/(shell)/[id]/page.tsx"));
  const dados = codigoDe(le("app/atendimento-app/(shell)/[id]/dados.ts"));
  verdade(dados.includes("whereDeUmAtendimento") && pagina.includes("carregarConversaDoApp(params.id)"), "a tela abre a conversa pelo recorte de dono");
  verdade(pagina.indexOf("if (!c) return <SemAcessoAConversa") < pagina.indexOf("carregarPaginaDoChat("), "as mensagens e notas só são lidas DEPOIS de a conversa existir para quem pediu");
  verdade(!/notaDaConversa\./.test(pagina), "a página não consulta notas por conta própria");
});

teste("SCHEMA: NotaDaConversa é ADITIVO (tabela nova; nenhuma coluna alterada), única por escritório+chave, some com a conversa", () => {
  const s = le("prisma/schema.prisma");
  const m = /model NotaDaConversa \{[\s\S]*?\n\}/.exec(s)?.[0] ?? "";
  verdade(m.length > 0, "modelo ausente");
  verdade(m.includes("@@unique([officeId, clientMessageId])") && m.includes("onDelete: Cascade") && m.includes("@@index([attendanceId, createdAt, id])"), "chave única, cascata e índice de leitura");
  verdade(/tipo\s+String\s+@default\("NOTA"\)/.test(m) && /textoHash\s+String/.test(m), "tipo e hash");
  verdade(/notasDaConversa\s+NotaDaConversa\[\]/.test(s), "o lado de Attendance");
  verdade(!/model WhatsappMessage \{[\s\S]*?interna/i.test(s.slice(s.indexOf("model WhatsappMessage {"), s.indexOf("model PedidoDeEnvioWhatsapp"))), "WhatsappMessage NÃO ganhou campo 'interna'");
});

teste("a nota não move a atividade da lista nem o relógio: a lista, o estado do chat e o relógio continuam lendo só mensagens", () => {
  const estado = codigoDe(le("lib/estadoDoChatDb.ts"));
  verdade(estado.includes("whatsappMessage.findFirst") && !VE_NOTA.test(estado), "o 'esperando resposta' é fato de mensagem de WhatsApp");
  const lista = codigoDe(le("app/atendimento-app/(shell)/page.tsx"));
  verdade(!VE_NOTA.test(lista), "a prévia da lista não pode mostrar nota (proposta 7.3 e mockup 13)");
});

teste("o que vai ao navegador não importa módulo de servidor (as regras da nota e do aviso são puras)", () => {
  for (const f of ["lib/notaDaConversa.ts", "lib/avisoDeMensagemNova.ts", "lib/filaDoChat.ts", "lib/mensagensDoChat.ts"]) {
    verdade(!/node:|from "crypto"|prisma|hashDoTexto/.test(codigoDe(le(f)).replace(/@prisma/g, "")), `${f} vai ao navegador e importa módulo de servidor`);
  }
});

// ── A TELA: mensagem e nota jamais se confundem ─────────────────────────────────────────────────────

teste("BALÃO da nota: rótulo 'Nota interna · só a equipe', cadeado, borda TRACEJADA, autor e hora; aviso de sistema centralizado e rotulado", () => {
  const b = codigoDe(le("components/atendimento-app/BolhaDaMensagem.tsx"));
  verdade(b.includes("Nota interna · só a equipe") && b.includes("<Lock"), "rótulo e ícone (não só cor)");
  verdade(b.includes("border-dashed border-atd-ardosia bg-atd-ardosia-bg"), "borda tracejada de ardósia");
  verdade(b.includes("m.autor") && b.includes("<time dateTime={m.criadoEm}>{m.hora}</time>"), "autor e hora");
  verdade(b.includes("Nota interna, só da equipe, de "), "o leitor de tela ouve de quem é a nota");
  verdade(b.includes("Aviso do sistema · só a equipe") && b.includes("Aviso do sistema, só da equipe: ") && b.includes('data-tipo="sistema"') && b.includes("justify-center"), "aviso de sistema rotulado e centralizado");
  verdade(!/border-l-|border-r-|border-s-/.test(b), "sem faixa lateral colorida");
});

teste("CAMPO: dois botões sempre à vista (aria-pressed), 'Salvar nota' com cadeado, borda tracejada, rascunho SEPARADO por modo; sem WhatsApp/janela a nota continua livre", () => {
  const c = codigoDe(le("components/atendimento-app/CompositorDoChat.tsx"));
  igual((c.match(/aria-pressed=/g) ?? []).length, 2, "dois botões de modo");
  verdade(c.includes("Nota interna") && c.includes("Salvar nota") && c.includes("<Lock") && c.includes("border-dashed"), "texto, ícone e borda dizem o modo");
  verdade(c.includes("Só a equipe vê. Não é enviada ao cliente, e a Ana não lê."), "a linha de apoio diz o que a nota é");
  verdade(c.includes("lerRascunho(idDaConversa, nota)") && c.includes("gravarRascunho(idDaConversa, e.target.value, nota)") && c.includes('gravarRascunho(idDaConversa, "", nota)'), "rascunho por modo");
  verdade(c.includes("aoEnviar(t, nota)"), "o pai sabe se é nota");
  verdade(c.includes("bloqueio && !nota"), "o bloqueio (sem WhatsApp / janela) só vale para a mensagem ao cliente");
  verdade(c.includes("useState(false)") && !/sessionStorage|localStorage/.test(c), "o modo abre sempre em 'ao cliente' e não fica gravado");
  verdade(c.split("min-h-11").length - 1 >= 3, "alvos de 44 px");
});

teste("CHAT: a nota vai com modo 'nota', NÃO assume a conversa (a Ana continua), tem estado próprio e o aviso de sistema é anunciado", () => {
  const c = codigoDe(le("components/atendimento-app/ChatDaConversa.tsx"));
  verdade(c.includes('modo: "nota"') && c.includes("resultadoDaNota("), "modo e resultado próprios");
  verdade(/if \(!ehNota\) setEstado\(/.test(c), "nota não silencia a Ana na barra");
  verdade(c.includes("Salvando nota…") && c.includes("Nota salva.") && c.includes("Aviso do sistema:"), "avisos ao leitor de tela");
  verdade(c.includes("!ehNota && eraRetentativaIncerta"), "nota nunca pede 'enviar mesmo assim' (não há duplicata para temer)");
  verdade(c.includes('aria-live="off"') && (c.match(/aria-live=/g) ?? []).length === 2, "o log continua sem aria-live; só a região de status é viva");
});

teste("CONTRASTE da nota (Dia e Noite): texto de ardósia sobre a nota >= 4,5:1; borda tracejada >= 3:1 contra o fundo do chat", () => {
  const css = le("app/globals.css");
  const tokens = (seletor: string) => {
    const bloco = new RegExp(`\\n${seletor.replace(".", "\\.")}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(css)?.[1] ?? "";
    return Object.fromEntries([...bloco.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6});/g)].map((m) => [m[1], m[2]]));
  };
  const canal = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
  const lum = (h: string) => 0.2126 * canal(parseInt(h.slice(1, 3), 16)) + 0.7152 * canal(parseInt(h.slice(3, 5), 16)) + 0.0722 * canal(parseInt(h.slice(5, 7), 16));
  const razao = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  for (const [nome, t] of [["Dia", tokens(".atendimento-shell")], ["Noite", tokens(".atendimento-dark")]] as const) {
    verdade(t["atd-ardosia"] && t["atd-ardosia-bg"] && t["atd-chat-fundo"], `${nome}: tokens ausentes`);
    const texto = razao(t["atd-ardosia"], t["atd-ardosia-bg"]);
    const borda = razao(t["atd-ardosia"], t["atd-chat-fundo"]);
    verdade(texto >= 4.5, `${nome}: rótulo da nota ${texto.toFixed(2)}:1`);
    verdade(borda >= 3, `${nome}: borda da nota ${borda.toFixed(2)}:1`);
  }
});

teste("sem hex cru, fonte fora da rampa, sombra nem faixa lateral nos arquivos novos", () => {
  for (const f of ["components/atendimento-app/CompositorDoChat.tsx", "components/atendimento-app/BolhaDaMensagem.tsx", "components/atendimento-app/ChatDaConversa.tsx", "components/atendimento-app/useAvisoDeMensagemNova.ts"]) {
    const c = codigoDe(le(f));
    verdade(!/#[0-9a-fA-F]{3,8}\b/.test(c), `${f}: hex cru`);
    verdade(!new RegExp("text-\\[\\d+" + "px\\]").test(c), `${f}: tamanho de fonte fora da rampa`);
    verdade(!/\bshadow-/.test(c), `${f}: sombra`);
    verdade(!/border-[lrs]-/.test(c), `${f}: faixa lateral`);
  }
});

// ── FILA E RASCUNHOS DO APARELHO ────────────────────────────────────────────────────────────────────

teste("FILA: a nota pendente vira balão 'nota'; a que sobrou de página recarregada é 'não salva' com 'tentar de novo' seguro (nunca 'pode ter sido enviada')", () => {
  const p = novoPendente("chave-nota-0001", "lembrar do RG", AGORA, true);
  igual(p.nota, true);
  const m = pendenteComoMensagem(p, AGORA);
  igual([m.tipo, m.direction, m.texto, m.envioLocal?.estado], ["nota", "OUT", "lembrar do RG", "enviando"]);
  const msg = pendenteComoMensagem(novoPendente("chave-msg-0002", "oi", AGORA), AGORA);
  igual(msg.tipo, undefined, "mensagem ao cliente não ganha tipo");
  const r = restaurarPendentes([{ clientMessageId: "chave-nota-0001", texto: "lembrar do RG", criadoEm: AGORA.toISOString(), estado: "enviando", nota: true }, { clientMessageId: "chave-msg-0002", texto: "oi", criadoEm: AGORA.toISOString(), estado: "enviando" }], AGORA);
  igual(r.map((x) => [x.clientMessageId, x.nota ?? false, x.estado, x.podeTentarDeNovo]), [["chave-nota-0001", true, "falhou", true], ["chave-msg-0002", false, "sem-confirmacao", true]]);
  verdade(!/enviada/i.test(r[0].erro ?? ""), "a nota não fala em 'pode ter sido enviada'");
  igual(semOsJaConfirmados([p], [{ clientMessageId: "chave-nota-0001" }]).length, 0, "o servidor devolveu a nota: some o balão local");
});

teste("RESULTADO da nota: 200 salva; rede caída/5xx = tentar de novo (não duplica); sem acesso não oferece tentar de novo", () => {
  igual(resultadoDaNota(200, null).estado, "enviada");
  for (const s of [null, 500, 502, 504]) {
    const r = resultadoDaNota(s, null);
    igual([r.estado, r.podeTentarDeNovo], ["falhou", true], `status ${s}`);
    verdade(r.erro?.includes("não duplica") ?? false, "diz que repetir não duplica");
  }
  igual(resultadoDaNota(403, null).podeTentarDeNovo, false);
  igual(resultadoDaNota(404, null).podeTentarDeNovo, false);
  igual(resultadoDaNota(400, { codigo: "INVALIDO", erro: "Digite a nota antes de salvar." }).erro, "Digite a nota antes de salvar.");
  igual(resultadoDaNota(401, null).podeTentarDeNovo, true);
});

teste("RASCUNHO: o da nota é separado do da mensagem (trocar de modo não leva o texto); Sair apaga os dois", () => {
  const guardado = new Map<string, string>();
  const armazem = {
    get length() {
      return guardado.size;
    },
    key: (i: number) => [...guardado.keys()][i] ?? null,
    getItem: (k: string) => guardado.get(k) ?? null,
    setItem: (k: string, v: string) => void guardado.set(k, v),
    removeItem: (k: string) => void guardado.delete(k),
  };
  const g = globalThis as unknown as { window?: unknown };
  const antes = g.window;
  g.window = { sessionStorage: armazem };
  try {
    gravarRascunho("atd-1", "texto ao cliente");
    gravarRascunho("atd-1", "texto da nota", true);
    igual([lerRascunho("atd-1"), lerRascunho("atd-1", true)], ["texto ao cliente", "texto da nota"]);
    gravarRascunho("atd-1", "", true);
    igual([lerRascunho("atd-1"), lerRascunho("atd-1", true)], ["texto ao cliente", ""], "esvaziar a nota não mexe no rascunho da mensagem");
    gravarRascunho("atd-1", "outra nota", true);
    limparRastrosDoAparelho();
    igual([lerRascunho("atd-1"), lerRascunho("atd-1", true), guardado.size], ["", "", 0], "Sair apaga o rascunho da nota também");
  } finally {
    g.window = antes;
  }
});

teste("LISTA: a nota entra na ordem da conversa (instante, id) junto das mensagens, sem repetir", () => {
  const base = { direction: "IN" as const, porAgente: false, midia: null, falhou: false, enviada: false, dia: "2026-09-29", rotuloDoDia: "Hoje", transcricao: null, clientMessageId: null };
  const msg = { ...base, id: "m1", texto: "oi", criadoEm: "2026-09-29T17:00:00.000Z", hora: "14:00" };
  const nota = { ...base, direction: "OUT" as const, id: "n1", texto: "anotei", criadoEm: "2026-09-29T17:01:00.000Z", hora: "14:01", tipo: "nota" as const, autor: "Marilene" };
  const depois = { ...base, id: "m2", texto: "ok?", criadoEm: "2026-09-29T17:02:00.000Z", hora: "14:02" };
  igual(mesclarMensagens([depois, msg], [nota, nota]).map((m) => m.id), ["m1", "n1", "m2"]);
});

// ── AVISO DE MENSAGEM NOVA (PR 11, sem push) ────────────────────────────────────────────────────────

teste("TÍTULO DA ABA: '(N) Nova mensagem · título' sem nome nem texto; N=0 restaura; não empilha prefixo; cai em 99+", () => {
  igual(tituloComAviso("Atendimento", 1), "(1) Nova mensagem · Atendimento");
  igual(tituloComAviso("Atendimento", 3), "(3) Novas mensagens · Atendimento");
  igual(tituloComAviso("(3) Novas mensagens · Atendimento", 4), "(4) Novas mensagens · Atendimento", "não empilha");
  igual(tituloComAviso("(3) Novas mensagens · Atendimento", 0), "Atendimento", "zero restaura");
  igual(tituloComAviso("Atendimento", 250), "(99+) Novas mensagens · Atendimento");
  igual(tituloComAviso("Atendimento", Number.NaN), "Atendimento");
  igual([fraseDoAviso(1), fraseDoAviso(2)], ["Nova mensagem", "Novas mensagens"]);
  verdade(tituloComAviso.length === 2, "a função não recebe nome nem conteúdo do cliente");
});

teste("CONTAGEM: só mensagem do CLIENTE conta; nota, aviso de sistema e mensagem do escritório não acendem o aviso", () => {
  igual(novasDoCliente([{ direction: "IN" }, { direction: "IN" }, { direction: "OUT" }, { direction: "OUT", tipo: "nota" }, { direction: "OUT", tipo: "sistema" }]), 2);
  igual(novasDoCliente([]), 0);
});

teste("BUSCA EM SEGUNDO PLANO: à vista sempre busca; fora de vista só a cada 1 min", () => {
  igual(deveBuscarAgora(true, 0), true);
  igual(deveBuscarAgora(false, 15_000), false);
  igual(deveBuscarAgora(false, INTERVALO_EM_SEGUNDO_PLANO_MS - 1), false);
  igual(deveBuscarAgora(false, INTERVALO_EM_SEGUNDO_PLANO_MS), true);
});

teste("BOTÃO '↓ N novas': rótulo acessível que diz o que faz; a seta é enfeite (aria-hidden); o único aria-live do componente segue sendo o contador", () => {
  igual(rotuloDoBotaoDeNovas(1), "Ir para o fim da conversa: 1 nova mensagem");
  igual(rotuloDoBotaoDeNovas(5), "Ir para o fim da conversa: 5 novas mensagens");
  const r = codigoDe(le("components/atendimento/RolarParaOFim.tsx"));
  verdade(r.includes("aria-label={novas === 1 ?") && r.includes('<span aria-hidden="true">↓ </span>'), "rótulo e seta escondida");
  igual((r.match(/aria-live=/g) ?? []).length, 1, "só o contador é aria-live");
});

teste("O GANCHO do aviso: só com a aba fora de vista, título + selo do app em try/catch, tudo desfeito ao voltar e ao sair; sem gravar nada", () => {
  const h = codigoDe(le("components/atendimento-app/useAvisoDeMensagemNova.ts"));
  verdade(h.includes('document.visibilityState === "visible"'), "só fora de vista");
  verdade(h.includes("document.title = tituloComAviso(") && h.includes("setAppBadge") && h.includes("clearAppBadge"), "título e selo");
  verdade((h.match(/try \{/g) ?? []).length >= 2, "o selo é opcional: falha em silêncio");
  verdade(h.includes('addEventListener("visibilitychange"') && h.includes("removeEventListener") && h.includes("limpar();"), "limpa ao voltar e ao desmontar");
  verdade(!/localStorage|sessionStorage|indexedDB|caches/.test(h), "não guarda nada");
  const c = codigoDe(le("components/atendimento-app/ChatDaConversa.tsx"));
  verdade(c.includes("avisarEmSegundoPlano(novasDoCliente(dados.mensagens))"), "o chat acende o aviso com as mensagens do cliente");
  verdade(c.includes("deveBuscarAgora(visivel"), "a busca em segundo plano é a de 1 min");
});

teste("HONESTIDADE: a tela Mais diz que o aviso com o app FECHADO ainda não existe ('a construir'); nada promete push", () => {
  const m = codigoDe(le("app/atendimento-app/(shell)/mais/page.tsx"));
  verdade(m.includes("Avisos de mensagem nova · a construir") && m.includes("Com o aplicativo fechado o aviso ainda não existe"), "diz o que falta");
  verdade(!/Notification\.requestPermission|pushManager|subscribe\(/.test(codigoDe(le("components/atendimento-app/useAvisoDeMensagemNova.ts")) + m), "não pede permissão nem inscreve push");
});

resumo("Atendimento app — nota interna, aviso da Ana e aviso de mensagem nova");
