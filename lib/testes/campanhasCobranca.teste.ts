import { teste, igual, verdade, resumo, corpoDaFuncao, codigoDe } from "./executar";
import { readFileSync } from "node:fs";
import {
  prepararCobrancaDaMensalidade,
  prepararCobrancaDoSlotExtra,
  deveEnviarAvisoHoje,
  decidirAcaoDoCiclo,
  slotPrecisaSerInterrompido,
  proximoVencimentoMensal,
  MOTIVO_FORMA_DE_PAGAMENTO_AUSENTE,
} from "@/lib/campanhasCobranca";
import { MOTIVO_PRECO_NAO_CONFIGURADO, DIAS_DE_CARENCIA } from "@/lib/moduloCampanhas";

// ============================================================================
// MÓDULO PAGO DE CAMPANHAS — cobrança e régua de inadimplência (Frente B, §2 e §7). As funções
// puras testadas de mesa aqui vivem em lib/campanhasCobranca.ts; o que só existe com Prisma/
// Asaas/e-mail/WhatsApp (lib/actions/campanhasCobranca.ts) é coberto por varredura de
// código-fonte, no mesmo estilo de lib/testes/peticionamentoHardGates.teste.ts — ancorada por
// regex e por corpoDaFuncao, nunca por `includes` ingênuo (as duas armadilhas documentadas em
// lib/testes/executar.ts).
// ============================================================================

const NOME_DO_ESCRITORIO = "Escritório Teste Advogados";

// ── 1 · HARD GATE — preço ausente NUNCA vira cobrança (§2) ──────────────────────────────────

teste("mensalidade: preço ausente é RECUSADA, nunca R$ 0,00", () => {
  const r = prepararCobrancaDaMensalidade({ mensalidadeModulo: null, precoSlotExtra: null }, 0, "BOLETO", NOME_DO_ESCRITORIO);
  igual(r.recusado, true);
  verdade("motivo" in r && r.motivo === MOTIVO_PRECO_NAO_CONFIGURADO, "motivo da recusa não é o mesmo da Frente A");
  verdade(!("valor" in r), "uma cobrança recusada não pode carregar um `valor` — nem que seja zero");
});

teste("mensalidade: só um dos dois preços configurado AINDA é recusada (nunca cobrança pela metade)", () => {
  const r1 = prepararCobrancaDaMensalidade({ mensalidadeModulo: 500, precoSlotExtra: null }, 0, "BOLETO", NOME_DO_ESCRITORIO);
  igual(r1.recusado, true);
  const r2 = prepararCobrancaDaMensalidade({ mensalidadeModulo: null, precoSlotExtra: 200 }, 0, "BOLETO", NOME_DO_ESCRITORIO);
  igual(r2.recusado, true);
});

teste("slot extra: preço ausente é RECUSADA, nunca R$ 0,00", () => {
  const r = prepararCobrancaDoSlotExtra({ mensalidadeModulo: null, precoSlotExtra: null }, 1, "PIX_QRCODE", NOME_DO_ESCRITORIO);
  igual(r.recusado, true);
  verdade(!("valor" in r), "uma cobrança recusada não pode carregar um `valor`");
});

teste("forma de pagamento ausente também recusa, mesmo com preço configurado", () => {
  const r = prepararCobrancaDaMensalidade({ mensalidadeModulo: 500, precoSlotExtra: 200 }, 0, null, NOME_DO_ESCRITORIO);
  igual(r.recusado, true);
  igual((r as { motivo: string }).motivo, MOTIVO_FORMA_DE_PAGAMENTO_AUSENTE);
});

teste("com os dois preços e a forma de pagamento configurados: a mensalidade cobra o valor CHEIO, nunca somado aos slots", () => {
  const r = prepararCobrancaDaMensalidade({ mensalidadeModulo: 500, precoSlotExtra: 200 }, 3, "PIX_AUTOMATICO", NOME_DO_ESCRITORIO);
  igual(r.recusado, false);
  if (!r.recusado) {
    igual(r.valor, 500, "a cobrança da mensalidade não pode incluir o valor dos slots — cada slot tem cobrança própria");
    verdade(r.descricao.includes(NOME_DO_ESCRITORIO), "a descrição da cobrança perdeu o nome do escritório");
  }
});

teste("o slot extra cobra o valor FIXO de precoSlotExtra, o mesmo não importa quantos slots já existam (§2: não escalona)", () => {
  const r2 = prepararCobrancaDoSlotExtra({ mensalidadeModulo: 500, precoSlotExtra: 200 }, 2, "BOLETO", NOME_DO_ESCRITORIO);
  const r5 = prepararCobrancaDoSlotExtra({ mensalidadeModulo: 500, precoSlotExtra: 200 }, 5, "BOLETO", NOME_DO_ESCRITORIO);
  igual(r2.recusado, false);
  igual(r5.recusado, false);
  if (!r2.recusado && !r5.recusado) igual(r2.valor, r5.valor, "o preço do slot extra não pode variar com a quantidade de slots já ativos");
});

// ── 2 · UM AVISO POR DIA, NÃO UM POR EXECUÇÃO (§7) — o defeito mais provável desta frente ──

teste("nunca avisou: deve avisar hoje", () => {
  igual(deveEnviarAvisoHoje(null, new Date("2026-09-15T12:00:00Z")), true);
});

teste("já avisou HOJE: NÃO deve avisar de novo — mesmo dia, rodando duas vezes", () => {
  const manha = new Date("2026-09-15T09:00:00Z");
  const noite = new Date("2026-09-15T23:00:00Z"); // ainda dia 15 em Brasília (23h UTC = 20h em Brasília)
  const diaJaGravado = "2026-09-15";
  igual(deveEnviarAvisoHoje(diaJaGravado, manha), false, "rodada da manhã não devia reavisar — ");
  igual(deveEnviarAvisoHoje(diaJaGravado, noite), false, "rodada da noite do MESMO dia não devia avisar de novo — ");
});

teste("virou o dia: deve avisar de novo", () => {
  igual(deveEnviarAvisoHoje("2026-09-15", new Date("2026-09-16T12:00:00Z")), true);
});

// ── 3 · AS DUAS FRONTEIRAS DO 10º DIA (§7), reaproveitando estadoPorVencimento da Frente A ──

const FUSO = "America/Sao_Paulo";
const VENCIMENTO = new Date(Date.UTC(2026, 8, 1, 12, 0, 0));
function diasDepois(base: Date, dias: number): Date {
  return new Date(base.getTime() + dias * 24 * 60 * 60 * 1000);
}

teste("FRONTEIRA — dia 10 de atraso: ainda CARENCIA, avisa hoje, NÃO desativa", () => {
  const agora = diasDepois(VENCIMENTO, DIAS_DE_CARENCIA);
  const acao = decidirAcaoDoCiclo({ estadoGravado: "CARENCIA", vencimento: VENCIMENTO, agora, ultimoAvisoDiarioEm: null, fuso: FUSO });
  igual(acao.estadoNovo, "CARENCIA");
  igual(acao.avisarHoje, true);
  igual(acao.desativarAgora, false);
});

teste("FRONTEIRA — dia 11 de atraso: DESATIVADO agora, e é a TRANSIÇÃO (desativarAgora true)", () => {
  const agora = diasDepois(VENCIMENTO, DIAS_DE_CARENCIA + 1);
  const acao = decidirAcaoDoCiclo({ estadoGravado: "CARENCIA", vencimento: VENCIMENTO, agora, ultimoAvisoDiarioEm: "2026-09-10", fuso: FUSO });
  igual(acao.estadoNovo, "DESATIVADO");
  igual(acao.desativarAgora, true, "o 11º dia é exatamente o instante da desativação — ");
  igual(acao.avisarHoje, false, "depois de desativado não é mais carência — não avisa mais o aviso diário");
});

teste("dia 12, 13... de DESATIVADO: desativarAgora é false (a ação já aconteceu, não repete todo dia)", () => {
  const agora = diasDepois(VENCIMENTO, DIAS_DE_CARENCIA + 3);
  const acao = decidirAcaoDoCiclo({ estadoGravado: "DESATIVADO", vencimento: VENCIMENTO, agora, ultimoAvisoDiarioEm: null, fuso: FUSO });
  igual(acao.estadoNovo, "DESATIVADO");
  igual(acao.desativarAgora, false, "a régua não pode tentar desativar de novo todo santo dia depois da primeira vez — ");
});

teste("dia 1 de atraso: entra em CARENCIA vindo de ATIVO — É a transição, mas desativarAgora só existe para DESATIVADO", () => {
  const agora = diasDepois(VENCIMENTO, 1);
  const acao = decidirAcaoDoCiclo({ estadoGravado: "ATIVO", vencimento: VENCIMENTO, agora, ultimoAvisoDiarioEm: null, fuso: FUSO });
  igual(acao.estadoNovo, "CARENCIA");
  igual(acao.desativarAgora, false);
  igual(acao.avisarHoje, true);
});

// ── 4 · PAGAMENTO DENTRO DA CARÊNCIA RESTAURA O ESTADO ───────────────────────────────────────

teste("assim que o vencimento avança um ciclo (pagamento confirmado), o mesmo dia volta a ser ATIVO", () => {
  const agoraDoPagamento = diasDepois(VENCIMENTO, 5); // pagou no meio da carência
  const novoVencimento = proximoVencimentoMensal(agoraDoPagamento);
  const acao = decidirAcaoDoCiclo({ estadoGravado: "CARENCIA", vencimento: novoVencimento, agora: agoraDoPagamento, ultimoAvisoDiarioEm: "2026-09-05", fuso: FUSO });
  igual(acao.estadoNovo, "ATIVO", "com o vencimento empurrado pro futuro, o mesmo instante já é ATIVO de novo — ");
  igual(acao.avisarHoje, false);
  igual(acao.desativarAgora, false);
});

teste("proximoVencimentoMensal empurra exatamente um mês, a partir de QUANDO PAGOU (não do vencimento antigo)", () => {
  const pagouEm = new Date(Date.UTC(2026, 8, 20, 12, 0, 0)); // 20/09/2026
  const proximo = proximoVencimentoMensal(pagouEm);
  igual(proximo.getUTCFullYear(), 2026);
  igual(proximo.getUTCMonth(), 9); // outubro (0-indexado)
  igual(proximo.getUTCDate(), 20);
});

// ── 5 · SLOT FINALIZADO NUNCA MAIS OCUPA LUGAR NEM É INTERROMPIDO DE NOVO ───────────────────

teste("slotPrecisaSerInterrompido: SOLICITADO/APROVADO/ATIVO precisam parar; FINALIZADO/RECUSADO já pararam", () => {
  igual(slotPrecisaSerInterrompido("SOLICITADO"), true);
  igual(slotPrecisaSerInterrompido("APROVADO"), true);
  igual(slotPrecisaSerInterrompido("ATIVO"), true);
  igual(slotPrecisaSerInterrompido("FINALIZADO"), false);
  igual(slotPrecisaSerInterrompido("RECUSADO"), false);
});

// ── 6 · lib/campanhasCobranca.ts REUSA a Frente A, não reimplementa a regra de preço/carência ──

teste("lib/campanhasCobranca.ts importa precoAMostrar e estadoPorVencimento de lib/moduloCampanhas — não duplica a regra", () => {
  const fonte = readFileSync("lib/campanhasCobranca.ts", "utf8");
  verdade(/import\s*\{[^}]*\bprecoAMostrar\b[^}]*\}\s*from\s*["']@\/lib\/moduloCampanhas["']/.test(fonte), "precoAMostrar não é importado de lib/moduloCampanhas");
  verdade(/import\s*\{[^}]*\bestadoPorVencimento\b[^}]*\}\s*from\s*["']@\/lib\/moduloCampanhas["']/.test(fonte), "estadoPorVencimento não é importado de lib/moduloCampanhas");
  const corpoMensalidade = corpoDaFuncao(fonte, "prepararCobrancaDaMensalidade");
  verdade(corpoMensalidade.length > 60, "corpoDaFuncao devolveu corpo vazio para prepararCobrancaDaMensalidade");
  verdade(/precoAMostrar\(/.test(corpoMensalidade), "prepararCobrancaDaMensalidade não chama precoAMostrar — pode ter reimplementado a regra");
});

// ============================================================================
// 7 · VARREDURA DE lib/actions/campanhasCobranca.ts — o que só existe com Prisma/Asaas/e-mail,
// coberto por leitura de código (mesmo motivo de lib/testes/peticionamentoHardGates.teste.ts):
// rodar de verdade exigiria banco, Asaas e SMTP configurados, que este ambiente não tem.
// ============================================================================

const FONTE_DAS_ACOES = readFileSync("lib/actions/campanhasCobranca.ts", "utf8");
const CODIGO_DAS_ACOES = codigoDe(FONTE_DAS_ACOES); // sem comentários — evita a armadilha do comentário que cita a trava

teste("assinarModuloDeCampanhas CHECA o hard gate de preço ANTES de criar a assinatura no banco", () => {
  const corpo = corpoDaFuncao(CODIGO_DAS_ACOES, "assinarModuloDeCampanhas");
  verdade(corpo.length > 200, `corpoDaFuncao devolveu ${corpo.length} caracteres — provavelmente não achou a função`);
  const iRecusa = corpo.indexOf("pedido.recusado");
  const iCreate = corpo.indexOf("prisma.assinaturaModuloCampanhas.create");
  verdade(iRecusa >= 0, "assinarModuloDeCampanhas não checa pedido.recusado");
  verdade(iCreate >= 0, "assinarModuloDeCampanhas não cria a assinatura em nenhum lugar — teste desatualizado");
  verdade(iRecusa < iCreate, "a checagem do hard gate de preço vem DEPOIS de já ter criado a assinatura — cobrança poderia nascer sem preço");
});

teste("aprovarCampanhaSlotPago RECUSA a aprovação (nunca gera cobrança) quando o preço não está configurado", () => {
  const corpo = corpoDaFuncao(CODIGO_DAS_ACOES, "aprovarCampanhaSlotPago");
  verdade(corpo.length > 200, `corpoDaFuncao devolveu ${corpo.length} caracteres`);
  const iRecusa = corpo.indexOf("pedido.recusado");
  const iCobranca = corpo.indexOf("criarCobrancaNaAsaas");
  verdade(iRecusa >= 0 && iCobranca >= 0, "aprovarCampanhaSlotPago perdeu a checagem de hard gate ou a chamada de cobrança");
  verdade(iRecusa < iCobranca, "a checagem do hard gate vem DEPOIS de já ter chamado a Asaas");
});

teste("a régua diária só busca slot em APROVADO/ATIVO — um slot FINALIZADO nunca mais é cobrado nem avisado", () => {
  verdade(/estado:\s*\{\s*in:\s*\[\s*"APROVADO",\s*"ATIVO"\s*\]\s*\}/.test(CODIGO_DAS_ACOES), "a query da régua de slots não filtra mais por APROVADO/ATIVO — pode estar processando slots já FINALIZADOS");
});

teste("desativarAssinaturaEInterromperCampanhas NUNCA escreve em `instrucoes` — o treinamento é intocável (§7)", () => {
  const corpo = corpoDaFuncao(CODIGO_DAS_ACOES, "desativarAssinaturaEInterromperCampanhas");
  verdade(corpo.length > 200, `corpoDaFuncao devolveu ${corpo.length} caracteres — provavelmente não achou a função`);
  verdade(!/instrucoes/.test(corpo), "a função que desativa o perfil por inadimplência TOCA em `instrucoes` — isso é proibido pela especificação (§7)");
  verdade(/estado:\s*"DESATIVADO"/.test(corpo), "a função não está de fato desativando o perfil (estado: \"DESATIVADO\" sumiu)");
});

teste("confirmarPagamentoMensalidade NUNCA escreve em `instrucoes` nem religa o perfil sozinho — reprovisionar é Frente C", () => {
  const corpo = corpoDaFuncao(CODIGO_DAS_ACOES, "confirmarPagamentoMensalidade");
  verdade(corpo.length > 200, `corpoDaFuncao devolveu ${corpo.length} caracteres`);
  verdade(!/instrucoes/.test(corpo), "confirmarPagamentoMensalidade toca em `instrucoes`");
  verdade(!/estado:\s*"PROVISIONADO"/.test(corpo), "confirmarPagamentoMensalidade marca o perfil como PROVISIONADO sozinho — reprovisionar de verdade é a Frente C");
  verdade(/precisaReprovisionar:\s*true/.test(corpo), "confirmarPagamentoMensalidade não registra que o perfil precisa subir de novo");
});

teste("enviarAvisoDiarioDeAssinatura grava o dia do aviso ANTES de mandar o e-mail (evita duplicar sob concorrência)", () => {
  const corpo = corpoDaFuncao(CODIGO_DAS_ACOES, "enviarAvisoDiarioDeAssinatura");
  verdade(corpo.length > 200, `corpoDaFuncao devolveu ${corpo.length} caracteres`);
  const iGuarda = corpo.indexOf("updateMany");
  const iEmail = corpo.indexOf("sendCampanhaCarenciaEmail");
  verdade(iGuarda >= 0 && iEmail >= 0, "enviarAvisoDiarioDeAssinatura perdeu a trava de dia ou o envio de e-mail");
  verdade(iGuarda < iEmail, "o e-mail é enviado ANTES de gravar a trava do dia — duas execuções concorrentes mandariam o aviso em dobro");
  verdade(/ultimoAvisoDiarioEm:\s*assinatura\.ultimoAvisoDiarioEm/.test(corpo), "a trava não repete o valor LIDO no `where` — sem isso a condição de corrida não é fechada (mesmo padrão de lib/whatsapp.ts:ehMensagemDaEquipe)");
});

teste("enviarAvisoDiarioDeSlot tem a MESMA trava de dia, com o mesmo padrão", () => {
  const corpo = corpoDaFuncao(CODIGO_DAS_ACOES, "enviarAvisoDiarioDeSlot");
  verdade(corpo.length > 200, `corpoDaFuncao devolveu ${corpo.length} caracteres`);
  const iGuarda = corpo.indexOf("updateMany");
  const iEmail = corpo.indexOf("sendCampanhaCarenciaEmail");
  verdade(iGuarda >= 0 && iEmail >= 0 && iGuarda < iEmail, "enviarAvisoDiarioDeSlot não trava o dia antes de enviar");
  verdade(/ultimoAvisoDiarioEm:\s*slot\.ultimoAvisoDiarioEm/.test(corpo), "a trava de enviarAvisoDiarioDeSlot não repete o valor lido no `where`");
});

teste("o cron de campanhas-carencia é fail-closed: sem CRON_SECRET configurado, recusa sempre", () => {
  const fonte = readFileSync("app/api/cron/campanhas-carencia/route.ts", "utf8");
  const corpo = corpoDaFuncao(codigoDe(fonte), "GET");
  verdade(corpo.length > 80, `corpoDaFuncao devolveu ${corpo.length} caracteres para o GET do cron`);
  verdade(/if\s*\(\s*!secret\s*\|\|/.test(corpo), "o cron não recusa explicitamente quando CRON_SECRET está ausente — pode estar tratando \"sem segredo\" como \"aceita\"");
});

// ACHADOS DA SUPERVISÃO — o valor e a forma de pagamento do SLOT não tinham teste nenhum.
// A cobrança da mensalidade tinha os dois; a do slot extra, nenhum dos dois. Cobertura assimétrica
// entre duas funções gêmeas é onde o defeito se esconde: trocar `preco.precoSlotExtra` por
// `preco.mensalidadeModulo` cobrava o valor ERRADO do escritório e a suíte passava verde.
teste("o slot extra cobra o PREÇO DO SLOT, nunca o valor da mensalidade do módulo", () => {
  const parametros = { mensalidadeModulo: 400, precoSlotExtra: 120 };
  const pedido = prepararCobrancaDoSlotExtra(parametros, 1, "BOLETO", "Escritório Teste");
  verdade(!pedido.recusado, "não deveria recusar com preço e forma de pagamento presentes");
  if (!pedido.recusado) {
    igual(pedido.valor, 120);
    verdade(pedido.valor !== 400, "cobrou o valor da mensalidade no lugar do preço do slot");
    verdade(pedido.valor !== 520, "cobrou a soma (mensalidade + slot) na cobrança do slot");
  }
});

teste("o slot extra NÃO é cobrado sem forma de pagamento escolhida — mesma régua da mensalidade", () => {
  const parametros = { mensalidadeModulo: 400, precoSlotExtra: 120 };
  const pedido = prepararCobrancaDoSlotExtra(parametros, 1, null, "Escritório Teste");
  igual(pedido.recusado, true);
  if (pedido.recusado) igual(pedido.motivo, MOTIVO_FORMA_DE_PAGAMENTO_AUSENTE);
});

// Mesma classe de achado da Frente A: a trava diária é um DIA DE CALENDÁRIO, e nenhum teste caía
// na janela de três horas em que Brasília e UTC estão em dias diferentes — trocar o fuso padrão
// por UTC passava verde. Na prática: um escritório avisado às 20h receberia o MESMO aviso de novo
// às 21h30, porque em UTC já teria virado o dia.
teste("FUSO: aviso já enviado às 20h de Brasília não sai de novo às 23h do mesmo dia", () => {
  const noiteDoMesmoDia = new Date("2026-09-12T02:00:00Z"); // 11/09 23h em Brasília, 12/09 em UTC
  igual(deveEnviarAvisoHoje("2026-09-11", noiteDoMesmoDia), false);
  // O contraste que prova que o relógio escolhido muda a resposta — não é decoração:
  igual(deveEnviarAvisoHoje("2026-09-11", noiteDoMesmoDia, "UTC"), true);
});

// ACHADO DA SUPERVISÃO, provado por execução: `setUTCMonth(mes + 1)` sozinho pedia "31 de
// fevereiro", que o JavaScript normaliza para 3 de março. Um escritório que pagasse em 31/01
// ganhava três dias de graça, e o dia do vencimento andava para frente a cada mês curto
// (31/08 virava 01/10). A casa já conhecia a armadilha — `Office.billingDueDay` é documentado
// no schema como "1-28, pra não cair em mês sem o dia" — e esta função a repetia.
teste("FRONTEIRA DE MÊS: quem paga em 31/01 vence em 28/02, nunca em março", () => {
  igual(proximoVencimentoMensal(new Date("2026-01-31T12:00:00Z")).toISOString(), "2026-02-28T12:00:00.000Z");
});

teste("FRONTEIRA DE MÊS: ano bissexto usa o dia 29, não o 28 nem o 1º de março", () => {
  igual(proximoVencimentoMensal(new Date("2028-01-31T12:00:00Z")).toISOString(), "2028-02-29T12:00:00.000Z");
});

teste("FRONTEIRA DE MÊS: 31 de agosto vence em 30 de setembro, e 31/12 vira 31/01 do ano seguinte", () => {
  igual(proximoVencimentoMensal(new Date("2026-08-31T12:00:00Z")).toISOString(), "2026-09-30T12:00:00.000Z");
  igual(proximoVencimentoMensal(new Date("2026-12-31T12:00:00Z")).toISOString(), "2027-01-31T12:00:00.000Z");
});

teste("o dia do mês NUNCA anda para frente em doze meses seguidos de cobrança", () => {
  // O defeito não aparece num mês só: ele acumula. Partindo do dia 31, um ano de cobranças
  // seguidas não pode deixar o vencimento escorregar para o começo do mês seguinte.
  let d = new Date("2026-01-31T12:00:00Z");
  for (let i = 0; i < 12; i++) {
    d = proximoVencimentoMensal(d);
    const dia = d.getUTCDate();
    const ultimoDoMes = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    verdade(dia >= 28 || dia === ultimoDoMes, `mês ${i + 1}: vencimento caiu no dia ${dia} (${d.toISOString()})`);
  }
});

void resumo("módulo pago de campanhas — cobrança e carência (Frente B)");
