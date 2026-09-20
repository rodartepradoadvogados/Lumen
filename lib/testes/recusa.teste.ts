import { readFileSync } from "node:fs";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";
import {
  montarCartaDeRecusa,
  primeiroNome,
  motivoEmMinuscula,
  situacaoDaRecusa,
  podeReverter,
  podeArquivar,
  tokenValido,
  enderecoDaCarta,
  TAMANHO_DO_TOKEN,
} from "@/lib/recusaDoLead";

// ============================================================================
// A RECUSA DE UM LEAD.
//
// A carta serve a dois propósitos ao mesmo tempo — prova e relação — e o jeito de estragar os dois
// é o mesmo: dizer mais do que se pode. Uma carta de recusa que opina sobre o mérito é um parecer
// dado a quem o escritório acabou de recusar.
//
// Por isso metade dos casos aqui não testa o que a carta DIZ, e sim o que ela NÃO PODE dizer.
// ============================================================================

const CARTA = montarCartaDeRecusa({
  nome: "Maria Aparecida Silva",
  escritorio: "Rodarte Prado Advogados",
  motivo: "Fora das matérias que o escritório atende",
  registradaEm: new Date("2026-09-20T14:30:00-03:00"),
});

const tudo = (c: ReturnType<typeof montarCartaDeRecusa>) =>
  [c.titulo, ...c.paragrafos, ...c.avisos.flatMap((a) => [a.titulo, a.texto]), c.fecho, c.rodape].join("\n");

// ── O QUE A CARTA PRECISA DIZER ─────────────────────────────────────────────

teste("a carta diz as três coisas que a defendem", () => {
  const texto = tudo(CARTA);
  verdade(/não há contrato nem procuração/i.test(texto), "falta dizer que não há representação");
  verdade(/nenhum advogado nosso está acompanhando prazos/i.test(texto), "falta dizer que ninguém acompanha prazos");
  verdade(/nada do que conversamos[^.]*é parecer ou orientação jurídica/i.test(texto), "falta dizer que a conversa não foi parecer");
  verdade(/prazo não espera/i.test(texto), "falta o aviso de que o prazo corre");
});

teste("a carta é acolhedora, e o motivo entra no meio da frase", () => {
  igual(CARTA.titulo, "Não vamos poder cuidar do seu caso");
  verdade(CARTA.paragrafos[0].startsWith("Maria, obrigado"), `abertura errada: ${CARTA.paragrafos[0]}`);
  verdade(
    CARTA.paragrafos[1].includes("— fora das matérias que o escritório atende."),
    `o motivo não entrou como frase: ${CARTA.paragrafos[1]}`,
  );
});

teste("a carta carimba data e hora de Brasília", () => {
  igual(CARTA.rodape, "Registrado em 20/09/2026 14:30.");
});

// ── O QUE A CARTA NÃO PODE DIZER ────────────────────────────────────────────

teste("a carta não opina sobre o caso nem promete nada", () => {
  // O limite inteiro desta tela em uma linha: ela comunica uma decisão, não dá um parecer. Palavra
  // de mérito aqui vira parecer escrito, entregue a quem o escritório acabou de recusar.
  const texto = tudo(CARTA).toLowerCase();
  for (const proibida of [
    "prescri", // prescrição / prescrito — afirmar isso é dar parecer
    "decad",
    "seu direito",
    "você tem direito",
    "não tem direito",
    "ganharia",
    "perderia",
    "chance",
    "provavelmente",
    "recomendamos que você",
  ]) {
    verdade(!texto.includes(proibida), `a carta usa "${proibida}", que é opinião sobre o caso`);
  }
});

teste("a carta não culpa o lead", () => {
  const texto = tudo(CARTA).toLowerCase();
  for (const proibida of ["infelizmente você", "você deveria", "seu erro", "por sua culpa"]) {
    verdade(!texto.includes(proibida), `a carta usa "${proibida}"`);
  }
});

// ── O NOME, QUANDO NÃO É UM NOME ────────────────────────────────────────────

teste("telefone no lugar do nome não vira vocativo", () => {
  // Acontece de verdade: quando o WhatsApp não manda o perfil, `clientName` nasce com o número.
  // "5562999998888, obrigado por ter procurado" é pior do que não chamar pelo nome.
  igual(primeiroNome("5562999998888"), "Olá");
  igual(primeiroNome("+55 (62) 99999-8888"), "Olá");
  igual(primeiroNome("   "), "Olá");
  igual(primeiroNome("Maria Aparecida Silva"), "Maria");
  igual(primeiroNome("Rubens"), "Rubens");
});

teste("o motivo é rebaixado, menos quando começa por sigla", () => {
  igual(motivoEmMinuscula("Fora da nossa área"), "fora da nossa área");
  igual(motivoEmMinuscula("Fora da nossa área."), "fora da nossa área");
  // "OAB negou o registro" não pode virar "oAB negou o registro".
  igual(motivoEmMinuscula("OAB exige inscrição na seccional"), "OAB exige inscrição na seccional");
  igual(motivoEmMinuscula("   "), "o caso não se encaixa no que atendemos");
});

// ── O ESTADO E O LINK ───────────────────────────────────────────────────────

teste("a situação da recusa diz a verdade, e o que prova mais ganha", () => {
  const base = { estado: "EM_ANALISE" as const, enviadaEm: null, abertaEm: null, revisitaEm: null };
  igual(situacaoDaRecusa(base), "Carta pronta, ainda não enviada");
  igual(situacaoDaRecusa({ ...base, enviadaEm: new Date() }), "Carta enviada, ainda não aberta");
  // Abrir prova mais do que enviar: quando as duas existem, a tela conta a que vale.
  igual(situacaoDaRecusa({ ...base, enviadaEm: new Date(), abertaEm: new Date() }), "O lead abriu a carta");
  // E o estado final ganha do trânsito.
  igual(situacaoDaRecusa({ ...base, abertaEm: new Date(), estado: "ARQUIVADA" }), "Arquivada");
  igual(situacaoDaRecusa({ ...base, abertaEm: new Date(), estado: "REVERTIDA" }), "Recusa desfeita — o lead voltou para a fila");
});

teste("desfazer e arquivar só valem enquanto a recusa está em análise", () => {
  igual(podeReverter({ estado: "EM_ANALISE" }), true);
  igual(podeReverter({ estado: "ARQUIVADA" }), false);
  igual(podeReverter({ estado: "REVERTIDA" }), false);
  igual(podeArquivar({ estado: "EM_ANALISE" }), true);
  igual(podeArquivar({ estado: "ARQUIVADA" }), false);
});

teste("o link é impossível de adivinhar, e formato errado não passa", () => {
  // Um link sequencial deixaria qualquer um passear pelas recusas do escritório trocando um número.
  igual(tokenValido("a".repeat(TAMANHO_DO_TOKEN)), true);
  igual(tokenValido("A".repeat(TAMANHO_DO_TOKEN)), false, "maiúscula não é o alfabeto do token: ");
  igual(tokenValido("1"), false);
  igual(tokenValido("g".repeat(TAMANHO_DO_TOKEN)), false, "fora do hexadecimal: ");
  igual(tokenValido("../../etc/passwd"), false);
  igual(tokenValido(null), false);
  igual(enderecoDaCarta("a".repeat(32)), `/recusa/${"a".repeat(32)}`);
});

// ── AS TRAVAS DO FLUXO ──────────────────────────────────────────────────────

const ACAO = readFileSync("lib/actions/recusaDoLead.ts", "utf8");
const PAGINA = readFileSync("app/recusa/[token]/page.tsx", "utf8");

// Sem os comentários: o comentário desta página diz "sem dangerouslySetInnerHTML em lugar nenhum",
// e era isso que a varredura achava. Ver a nota em lib/testes/executar.ts.
const PAGINA_CODIGO = codigoDe(PAGINA);

teste("recusar exige motivo e congela o texto dele", () => {
  // O catálogo muda; a carta que o lead recebeu, não. Se a carta lesse o motivo pelo id na hora de
  // exibir, corrigir uma frase no Painel Mestre reescreveria cartas já entregues.
  verdade(ACAO.includes('if (!motivoTexto) return { erro: "Escolha ou escreva o motivo da recusa." };'), "recusa sem motivo passa");
  verdade(ACAO.includes("motivoTexto,"), "a recusa não congela o texto do motivo");
  verdade(PAGINA.includes("motivoTexto: true"), "a carta lê o motivo do catálogo em vez do texto congelado");
});

teste("recusar não manda a carta sozinho", () => {
  // Gerar o link é parte de recusar; mandar é um segundo ato, de uma pessoa.
  const corpo = corpoDaFuncao(ACAO, "recusarLead");
  verdade(corpo.length > 0, "recusarLead não existe");
  verdade(!corpo.includes("enviadaEm"), "recusarLead está carimbando o envio — ele não manda nada");
});

teste("a página pública não vaza a existência de ninguém", () => {
  // Token inválido e token inexistente dão a MESMA resposta. Um link de recusa não pode virar um
  // jeito de descobrir se uma pessoa procurou aquele escritório.
  verdade(PAGINA.includes("if (!tokenValido(params.token)) notFound();"), "formato inválido não é 404");
  verdade(PAGINA.includes("if (!recusa) notFound();"), "token inexistente não é 404");
  verdade(PAGINA.includes('if (recusa.estado === "REVERTIDA") notFound();'), "recusa desfeita ainda mostra carta");
  verdade(!/dangerouslySetInnerHTML/.test(PAGINA_CODIGO), "a carta não pode ser montada com HTML cru");
});

teste("o lead recusado sai das listas ativas, em todas elas", () => {
  // Quatro lugares filtram status de atendimento. Um que esqueça RECUSADO deixa o lead cobrando
  // resposta que o escritório já decidiu não dar.
  const lugares: [string, string][] = [
    ["lib/esperaDoAtendimento.ts", "FORA_DA_FILA"],
    ["lib/alerts.ts", "FORA_DO_ATENDIMENTO"],
    ["lib/repassarLead.ts", "notIn"],
    ["app/(app)/atendimento/funil/page.tsx", "notIn"],
  ];
  for (const [caminho] of lugares) {
    verdade(readFileSync(caminho, "utf8").includes("RECUSADO"), `${caminho} não exclui o lead recusado`);
  }
});

teste("a carta é pública — o middleware não pode mandá-la para a propaganda", () => {
  // Achado no navegador: sem esta rota liberada, o link que o escritório manda ao lead abria a
  // homepage de marketing com status 200. A pessoa clica na carta de recusa e vê "SOFTWARE DE
  // GESTÃO · Começar". É pior do que um erro, porque parece que deu certo.
  const mw = readFileSync("middleware.ts", "utf8");
  verdade(mw.includes('pathname.startsWith("/recusa/")'), "a carta de recusa não está entre as rotas públicas");
});

// ── A FILA DE RECUSADOS ─────────────────────────────────────────────────────

teste("trazer de volta NÃO reinicia o relógio de quinze minutos", () => {
  // O relógio existe para o lead que acabou de escrever. Um lead recuperado três dias depois com
  // "volta para a fila em 15" seria alarme falso — e alarme falso ensina a ignorar alarme.
  const corpo = corpoDaFuncao(ACAO, "reverterRecusa");
  verdade(corpo.length > 0, "reverterRecusa não existe");
  verdade(corpo.includes("prazoDeRespostaAte: null"), "reverter está deixando o relógio correr");
  // E volta para TRIAGEM, não para "novo": ele já passou por triagem uma vez.
  verdade(corpo.includes('status: "EM_TRIAGEM"'), "o lead recuperado deveria voltar para triagem");
});

teste("quem analisa a fila é quem vê o escritório inteiro", () => {
  // Decisão do dono contra a minha recomendação: sócio E recepção. A consequência que veio junto é
  // que reverter passou a ter mais de um autor possível — então quem reverteu fica gravado.
  const corpo = corpoDaFuncao(ACAO, "quemAnalisa");
  verdade(corpo.length > 0, "quemAnalisa não existe");
  verdade(corpo.includes("veTodoOAtendimento(viewer)"), "a fila de recusados aceita quem só vê os próprios atendimentos");
  verdade(corpo.includes('estado: "EM_ANALISE"'), "aceita mexer em recusa já arquivada ou revertida");

  for (const [nome, campo] of [["reverterRecusa", "revertidaPorId"], ["arquivarRecusa", "arquivadaPorId"]]) {
    const c = corpoDaFuncao(ACAO, nome);
    verdade(c.length > 0, `${nome} não existe`);
    verdade(c.includes(`${campo}: r.viewer.id`), `${nome} não registra quem fez`);
  }
});

teste("a fila de recusados só mostra quem espera decisão", () => {
  const pagina = readFileSync("app/(app)/atendimento/funil/page.tsx", "utf8");
  verdade(pagina.includes('estado: "EM_ANALISE"'), "a fila traria recusas arquivadas e revertidas");
  // Arquivar tira da fila E do atendimento ativo — senão o lead encerrado voltaria a aparecer
  // como atendimento aberto em outra tela.
  verdade(corpoDaFuncao(ACAO, "arquivarRecusa").includes('data: { status: "ARQUIVADO" }'), "arquivar não encerra o atendimento");
});

resumo("Recusa do lead");
