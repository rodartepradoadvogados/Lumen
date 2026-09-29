import { teste, igual, verdade, resumo, codigoDe } from "./executar";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chipsDaLista, digitosDoTermo, hrefDaListaApp, iniciaisDoNome, idsEsperandoResposta, lerFiltroDaLista, montarLinha, termoDeBusca, type LinhaDaListaApp } from "@/lib/conversasDoApp";
import { lerMidia, previaDoCorpo } from "@/lib/mensagensDoChat";
import { compararPorAtividade } from "@/lib/atividadeDoAtendimento";
import { contagensPorFase } from "@/lib/listaDeAtendimentos";

// ============================================================================
// ONDA A DO APLICATIVO DE ATENDIMENTO, ETAPA 2 (lista de Conversas): ordem por atividade, chips de fase,
// "esperando resposta", busca, a linha (prévia, sem resposta, relógio) — regra pura + recorte de dono.
// ============================================================================

const RAIZ = process.cwd();
const le = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf8");
const AGORA = new Date(Date.UTC(2026, 8, 29, 17, 32));
const minAtras = (n: number) => new Date(AGORA.getTime() - n * 60000);


// ── LISTA DE CONVERSAS ──────────────────────────────────────────────────────────────────────────

teste("ORDEM: a lista é por atividade recente, não por criação (o mesmo critério do banco)", () => {
  const velhaQueFalouAgora = { id: "a", createdAt: new Date(Date.UTC(2026, 8, 1)), ultimaAtividadeEm: minAtras(5) };
  const novaParada = { id: "b", createdAt: new Date(Date.UTC(2026, 8, 28)), ultimaAtividadeEm: new Date(Date.UTC(2026, 8, 28)) };
  igual([novaParada, velhaQueFalouAgora].sort(compararPorAtividade).map((x) => x.id), ["a", "b"]);
  const fonte = codigoDe(readFileSync(join(RAIZ, "app/atendimento-app/(shell)/page.tsx"), "utf8"));
  verdade((fonte.match(/orderBy: ORDEM_POR_ATIVIDADE/g) ?? []).length >= 2, "a lista e a consulta de espera usam ORDEM_POR_ATIVIDADE");
});

teste("filtro: só valores conhecidos (fase, esperando, todas); o resto da URL vira Todas", () => {
  igual(lerFiltroDaLista("esperando"), "esperando");
  igual(lerFiltroDaLista("QUALIFICACAO"), "QUALIFICACAO");
  igual(lerFiltroDaLista("AGUARDANDO"), "AGUARDANDO");
  igual(lerFiltroDaLista("AGUARDANDO_RESPOSTA"), "todas"); // o vocabulário que não existe em lib/funil.ts
  igual(lerFiltroDaLista("xyz"), "todas");
  igual(lerFiltroDaLista(undefined), "todas");
  igual(lerFiltroDaLista(["PROPOSTA", "x"]), "PROPOSTA");
});

teste("chips: Todas, Esperando resposta e as seis fases, com as contagens", () => {
  const c = contagensPorFase([
    { stage: "NOVO", _count: 3 },
    { stage: "QUALIFICACAO", _count: 2 },
    { stage: "FECHADO", _count: 1 },
    { stage: "ESTRANHO", _count: 4 }, // desconhecido conta como Novo
  ]);
  const chips = chipsDaLista(c, 5);
  igual(chips.map((x) => x.chave), ["todas", "esperando", "NOVO", "AGUARDANDO", "QUALIFICACAO", "PROPOSTA", "FECHADO", "PERDIDO"]);
  igual(chips.map((x) => x.contagem), [10, 5, 7, 0, 2, 0, 1, 0]);
  igual(chips[1].rotulo, "Esperando resposta");
  igual(chips[3].rotulo, "Aguardando");
});

teste("esperando resposta é FATO: só quem tem a última mensagem do cliente, na ordem recebida", () => {
  const linhas = [
    { id: "1", whatsappMessages: [{ direction: "IN" }] },
    { id: "2", whatsappMessages: [{ direction: "OUT" }] },
    { id: "3", whatsappMessages: [] },
    { id: "4", whatsappMessages: [{ direction: "IN" }] },
  ];
  igual(idsEsperandoResposta(linhas), ["1", "4"]);
});

teste("busca: termo aparado, mínimo de 2 letras; dígitos só a partir de 4", () => {
  igual(termoDeBusca("  Ma  "), "Ma");
  igual(termoDeBusca("M"), "");
  igual(termoDeBusca(undefined), "");
  igual(digitosDoTermo("(62) 99614-2280"), "62996142280");
  igual(digitosDoTermo("12"), "");
  igual(termoDeBusca("x".repeat(200)).length, 80);
});

teste("o endereço da lista leva filtro, busca e arquivados (uma função só)", () => {
  igual(hrefDaListaApp(), "/atendimento-app");
  igual(hrefDaListaApp({ f: "todas" }), "/atendimento-app");
  igual(hrefDaListaApp({ f: "PROPOSTA", q: " Ana ", arq: true }), "/atendimento-app?f=PROPOSTA&q=Ana&arq=1");
  igual(hrefDaListaApp({ q: "a&b" }), "/atendimento-app?q=a%26b");
});

const linha = (o: Partial<LinhaDaListaApp> = {}): LinhaDaListaApp => ({
  id: "att1",
  clientName: "Marilene Souza",
  waPhone: "5562996142280",
  subject: "Inventário do pai",
  stage: "QUALIFICACAO",
  convertedCaseId: null,
  createdAt: minAtras(60 * 24 * 3),
  ultimaAtividadeEm: minAtras(12),
  prazoDeRespostaAte: null,
  agenteResponde: false,
  agenteSilenciadoEm: null,
  responsible: { name: "Dra. Helena" },
  whatsappMessages: [{ direction: "IN", body: "Bom dia, preciso de ajuda", porAgente: false, createdAt: minAtras(12) }],
  ...o,
});

teste("linha: sem resposta com o tempo, fase pelo NOME, prévia do cliente sem prefixo", () => {
  const l = montarLinha(linha(), AGORA, "Ana");
  igual(l.nome, "Marilene Souza");
  igual(l.iniciais, "MS");
  igual(l.quando, "12 min");
  igual(l.prefixo, "");
  igual(l.previa, "Bom dia, preciso de ajuda");
  igual(l.semResposta, { espera: "12 min", relogio: null });
  igual(l.fase, "Qualificação");
  igual(l.href, "/atendimento-app/att1");
  igual(l.quemAtende, "Dra. Helena");
});

teste("linha: respondida por pessoa mostra 'Você:'; pela Ana mostra o nome dela; ninguém espera", () => {
  const eu = montarLinha(linha({ whatsappMessages: [{ direction: "OUT", body: "Pode vir amanhã", porAgente: false, createdAt: minAtras(3) }] }), AGORA, "Ana");
  igual(eu.prefixo, "Você: ");
  igual(eu.semResposta, null);
  const ana = montarLinha(linha({ whatsappMessages: [{ direction: "OUT", body: "Claro!", porAgente: true, createdAt: minAtras(3) }], agenteResponde: true }), AGORA, "Ana");
  igual(ana.prefixo, "Ana: ");
  igual(ana.quemAtende, "Ana");
});

teste("linha: o relógio de 15 min aparece só quando o cliente espera e há prazo correndo ou estourado", () => {
  const correndo = montarLinha(linha({ prazoDeRespostaAte: new Date(AGORA.getTime() + 7 * 60000) }), AGORA, "Ana");
  igual(correndo.semResposta?.relogio, "8 min sem resposta · volta para a fila em 7");
  const estourado = montarLinha(linha({ prazoDeRespostaAte: new Date(AGORA.getTime() - 4 * 60000) }), AGORA, "Ana");
  verdade(/Prazo estourado/.test(estourado.semResposta?.relogio ?? ""), "estourado");
  const respondida = montarLinha(linha({ prazoDeRespostaAte: new Date(AGORA.getTime() + 7 * 60000), whatsappMessages: [{ direction: "OUT", body: "ok", porAgente: false, createdAt: minAtras(1) }] }), AGORA, "Ana");
  igual(respondida.semResposta, null);
});

teste("linha: mídia na prévia vira rótulo legível; sem mensagem, mostra o assunto; nome-número vira número", () => {
  const foto = montarLinha(linha({ whatsappMessages: [{ direction: "IN", body: "[imagem] olha a certidão", porAgente: false, createdAt: minAtras(1) }] }), AGORA, "Ana");
  igual(foto.previa, "Imagem · olha a certidão");
  const doc = montarLinha(linha({ whatsappMessages: [{ direction: "IN", body: "[documento: contrato.pdf]", porAgente: false, createdAt: minAtras(1) }] }), AGORA, "Ana");
  igual(doc.previa, "Documento: contrato.pdf");
  const vazia = montarLinha(linha({ whatsappMessages: [] }), AGORA, "Ana");
  igual(vazia.previa, "Inventário do pai");
  igual(vazia.semResposta, null);
  const semNome = montarLinha(linha({ clientName: "5562996142280" }), AGORA, "Ana");
  verdade(/\(62\) 99614-2280/.test(semNome.nome), `nome vira número legível: ${semNome.nome}`);
  igual(montarLinha(linha({ stage: "ESTRANHO" }), AGORA, "Ana").fase, "Novo");
  igual(montarLinha(linha({ convertedCaseId: "c1" }), AGORA, "Ana").processo, true);
});

teste("iniciais do avatar", () => {
  igual(iniciaisDoNome("Marilene Souza"), "MS");
  igual(iniciaisDoNome("Maria de Fátima Souza Lima"), "ML");
  igual(iniciaisDoNome("Cher"), "CH");
  igual(iniciaisDoNome("  "), "?");
});

// ── CHAT: MÍDIA E ÁUDIO COMO RÓTULO ─────────────────────────────────────────────────────────────

teste("mídia é rótulo: imagem, documento com nome, áudio, vídeo, figurinha e legenda", () => {
  igual(lerMidia("[imagem]"), { tipo: "imagem", rotulo: "Imagem", nome: null, legenda: "" });
  igual(lerMidia("[documento: certidão de óbito.pdf] segue"), { tipo: "documento", rotulo: "Documento", nome: "certidão de óbito.pdf", legenda: "segue" });
  igual(lerMidia("[áudio]")?.tipo, "audio");
  igual(lerMidia("[vídeo]")?.tipo, "video");
  igual(lerMidia("[figurinha]")?.tipo, "figurinha");
  igual(lerMidia("Oi, tudo bem? [imagem] no meio não é rótulo"), null);
  igual(lerMidia("[qualquer coisa]"), null);
  igual(previaDoCorpo("texto comum"), "texto comum");
});

teste("a lista de Conversas parte do recorte por dono em TODA consulta de Attendance", () => {
  const codigo = codigoDe(le("app/atendimento-app/(shell)/page.tsx"));
  verdade(codigo.includes("const recorteDeDono = whereDoAtendimento(viewer)"), "recorte de dono");
  const consultas = codigo.split("prisma.attendance.").slice(1);
  verdade(consultas.length >= 4, "a varredura tem de achar as consultas");
  for (const c of consultas) {
    verdade(/recorteDaConsulta|recorteDeDono/.test(c.slice(0, 200)), `consulta sem recorte: ${c.slice(0, 60)}`);
  }
  verdade(/findAttendanceIdsByLooseName\(q, \{ AND: \[recorteDeDono/.test(codigo), "a busca por nome também leva o recorte de dono");
});

teste("o Funil do app usa o vocabulário de lib/funil.ts e o seletor usa a ação com recorte (não a rota antiga)", () => {
  const funil = codigoDe(le("app/atendimento-app/(shell)/funil/page.tsx"));
  verdade(funil.includes('from "@/lib/funil"'), "funil usa lib/funil");
  verdade(!funil.includes("AGUARDANDO_RESPOSTA"), "o estágio que não existe voltou");
  const sel = codigoDe(le("components/atendimento/EstagioDoLeadSelect.tsx"));
  verdade(sel.includes("setAttendanceStage(") && !sel.includes("/stage"), "o seletor tem de usar setAttendanceStage");
});
teste("nenhum Attendance lido só por officeId na lista nem no funil do app", () => {
  for (const f of ["app/atendimento-app/(shell)/page.tsx", "app/atendimento-app/(shell)/funil/page.tsx"]) {
    const codigo = codigoDe(le(f));
    verdade(!/officeId:\s*viewer\.officeId/.test(codigo.replace(/whereDoAtendimento\([^)]*\)/g, "")) || /whereDoAtendimento|whereDeUmAtendimento/.test(codigo), `${f}: officeId cru`);
  }
});

teste("nada de hex, de fonte fora da rampa nem de sombra nos arquivos novos da lista (só tokens)", () => {
  for (const f of ["components/atendimento-app/ListaDeConversasApp.tsx", "components/atendimento-app/BuscaDaLista.tsx", "app/atendimento-app/(shell)/page.tsx"]) {
    const codigo = codigoDe(le(f));
    verdade(!/#[0-9a-fA-F]{3,8}\b/.test(codigo), `${f}: hex cru`);
    verdade(!new RegExp("text-\\[\\d+" + "px\\]").test(codigo), `${f}: tamanho de fonte fora da rampa`);
    verdade(!/\bshadow-/.test(codigo), `${f}: sombra`);
  }
});

resumo("Atendimento app, onda A — lista de Conversas");
