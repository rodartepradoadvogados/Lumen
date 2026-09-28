import { teste, igual, verdade, resumo, corpoDaFuncao, codigoDe } from "./executar";
import { readFileSync } from "node:fs";
import {
  LIMITE_DE_TENTATIVAS_DE_PROVISIONAMENTO,
  tentativaEsgotouOLimite,
  situacaoDoProvisionamento,
} from "@/lib/provisionamentoCampanhas";

// ============================================================================
// PROVISIONAMENTO AUTOMÁTICO DO PERFIL DE CAMPANHA (Frente C, §3). As funções puras testadas de
// mesa aqui vivem em lib/provisionamentoCampanhas.ts; o que só existe com Prisma/Hermes/e-mail
// (lib/actions/provisionamentoCampanhas.ts, app/api/cron/campanhas-provisionamento,
// app/api/interno/provisionar-campanha, app/api/asaas/webhook) é coberto por VARREDURA de
// código-fonte, no mesmo estilo de lib/testes/campanhasCobranca.teste.ts — ancorada por regex e
// por corpoDaFuncao sobre código JÁ SEM COMENTÁRIOS (codigoDe), nunca por `includes` ingênuo
// (as duas armadilhas documentadas em lib/testes/executar.ts).
// ============================================================================

// ── 1 · O LIMITE DE TENTATIVAS (§3, item 4 da nota técnica) ─────────────────────────────────

teste("o limite configurado é 3, como a nota técnica sugere", () => {
  igual(LIMITE_DE_TENTATIVAS_DE_PROVISIONAMENTO, 3);
});

teste("tentativaEsgotouOLimite: 1ª e 2ª tentativa ainda NÃO esgotam; a 3ª esgota", () => {
  igual(tentativaEsgotouOLimite(1), false);
  igual(tentativaEsgotouOLimite(2), false);
  igual(tentativaEsgotouOLimite(3), true, "a 3ª tentativa é o limite — depois dela, para de tentar e avisa");
  igual(tentativaEsgotouOLimite(4), true, "acima do limite continua esgotado, nunca 'volta a valer'");
});

// ── 2 · O ESTADO REAL PARA A TELA (nunca um silêncio que pareça sucesso) ────────────────────

teste("situacaoDoProvisionamento: perfil PROVISIONADO é NO_AR, mesmo que sobrem campos de pendência velhos", () => {
  const s = situacaoDoProvisionamento({
    estaProvisionado: true,
    precisaReprovisionar: true, // campo velho, hipoteticamente não limpo — NO_AR nunca deveria depender disso
    numeroDeTentativas: 2,
    falhouDefinitivamente: false,
    ultimoErro: "algo",
  });
  igual(s.situacao, "NO_AR");
});

teste("situacaoDoProvisionamento: DESATIVADO sem pendência é SEM_PENDENCIA — nunca aparenta estar 'tentando'", () => {
  const s = situacaoDoProvisionamento({
    estaProvisionado: false,
    precisaReprovisionar: false,
    numeroDeTentativas: 0,
    falhouDefinitivamente: false,
    ultimoErro: null,
  });
  igual(s.situacao, "SEM_PENDENCIA");
});

teste("situacaoDoProvisionamento: pendente e nenhuma tentativa rodou ainda é PREPARANDO", () => {
  const s = situacaoDoProvisionamento({
    estaProvisionado: false,
    precisaReprovisionar: true,
    numeroDeTentativas: 0,
    falhouDefinitivamente: false,
    ultimoErro: null,
  });
  igual(s.situacao, "PREPARANDO");
});

teste("situacaoDoProvisionamento: já tentou e ainda não esgotou é TENTANDO_DE_NOVO, com o motivo da última falha", () => {
  const s = situacaoDoProvisionamento({
    estaProvisionado: false,
    precisaReprovisionar: true,
    numeroDeTentativas: 2,
    falhouDefinitivamente: false,
    ultimoErro: "DEMORA: o Hermes não respondeu em 120s",
  });
  igual(s.situacao, "TENTANDO_DE_NOVO");
  if (s.situacao === "TENTANDO_DE_NOVO") {
    igual(s.tentativas, 2);
    igual(s.motivo, "DEMORA: o Hermes não respondeu em 120s");
  }
});

teste("situacaoDoProvisionamento: esgotou o limite é FALHOU_DEFINITIVAMENTE, nunca TENTANDO_DE_NOVO de novo", () => {
  const s = situacaoDoProvisionamento({
    estaProvisionado: false,
    precisaReprovisionar: true,
    numeroDeTentativas: 3,
    falhouDefinitivamente: true,
    ultimoErro: "o servidor do Hermes respondeu 500",
  });
  igual(s.situacao, "FALHOU_DEFINITIVAMENTE");
  if (s.situacao === "FALHOU_DEFINITIVAMENTE") igual(s.tentativas, 3);
});

// ============================================================================
// 3 · VARREDURA DE lib/actions/provisionamentoCampanhas.ts — o hard gate central desta frente:
// "nunca marque um perfil como PROVISIONADO sem que a chamada ao Hermes tenha confirmado."
// ============================================================================

const FONTE_ACOES = readFileSync("lib/actions/provisionamentoCampanhas.ts", "utf8");
const CODIGO_ACOES = codigoDe(FONTE_ACOES);

teste("HARD GATE: tentarProvisionarPerfil só escreve estado: PROVISIONADO DEPOIS de chamar provisionarNoHermes", () => {
  const corpo = corpoDaFuncao(CODIGO_ACOES, "tentarProvisionarPerfil");
  verdade(corpo.length > 300, `corpoDaFuncao devolveu ${corpo.length} caracteres — provavelmente não achou a função`);

  const iChamada = corpo.indexOf("await provisionarNoHermes(");
  const iProvisionado = corpo.indexOf('estado: "PROVISIONADO"');
  verdade(iChamada >= 0, "tentarProvisionarPerfil não chama provisionarNoHermes em lugar nenhum");
  verdade(iProvisionado >= 0, "tentarProvisionarPerfil não escreve estado: \"PROVISIONADO\" em lugar nenhum");
  verdade(iChamada < iProvisionado, "a escrita de PROVISIONADO vem ANTES (ou sem relação com) a chamada ao Hermes — um perfil poderia ser marcado provisionado sem confirmação");

  // E a escrita de sucesso não pode estar DENTRO do bloco `catch` (o caminho de falha).
  const iCatch = corpo.indexOf("} catch (erro) {");
  verdade(iCatch >= 0, "tentarProvisionarPerfil perdeu o bloco catch");
  verdade(iProvisionado < iCatch, "a escrita de PROVISIONADO está depois do início do catch — pode estar sendo gravada também (ou só) no caminho de falha");
  verdade(!corpo.slice(iCatch).includes('estado: "PROVISIONADO"'), "o bloco catch (caminho de FALHA) também escreve estado: \"PROVISIONADO\" — isso é o hard gate quebrado");
});

teste("DEMORA é tratada como qualquer outra falha recuperável — o catch NÃO decide por TEXTO do motivo", () => {
  const corpo = corpoDaFuncao(CODIGO_ACOES, "tentarProvisionarPerfil");
  const iCatch = corpo.indexOf("} catch (erro) {");
  verdade(iCatch >= 0, "tentarProvisionarPerfil perdeu o bloco catch");
  const catchBody = corpo.slice(iCatch);
  verdade(
    !/motivo\.(includes|startsWith|match)/.test(catchBody),
    "o catch discrimina por conteúdo de `motivo` (ex.: tratar \"DEMORA\" ou \"não encontrado\" diferente) — a especificação exige que TODA falha do Hermes sofra o MESMO tratamento (incrementa tentativa, tenta de novo até o limite)",
  );
  verdade(/tentativaEsgotouOLimite\(numeroDestaTentativa\)/.test(catchBody), "a decisão de parar não usa mais tentativaEsgotouOLimite — pode ter virado um número mágico solto");
});

teste("passado o limite, tentarProvisionarPerfil avisa Jairo/Rodrigo (avisarDonosDeFalhaDeProvisionamento) — só quando falhouDefinitivamente", () => {
  const corpo = corpoDaFuncao(CODIGO_ACOES, "tentarProvisionarPerfil");
  const iCheck = corpo.indexOf("if (falhouDefinitivamente) {");
  const iAvisa = corpo.indexOf("avisarDonosDeFalhaDeProvisionamento(");
  verdade(iCheck >= 0 && iAvisa >= 0, "tentarProvisionarPerfil perdeu a checagem de limite ou o aviso aos donos");
  verdade(iCheck < iAvisa, "o aviso não está condicionado a falhouDefinitivamente — poderia avisar a cada tentativa, não só ao esgotar o limite");
});

teste("executarProvisionamentoPendente NUNCA processa um perfil que já falhouDefinitivamente (a régua parou de tentar sozinha)", () => {
  const corpo = corpoDaFuncao(CODIGO_ACOES, "executarProvisionamentoPendente");
  verdade(corpo.length > 100, `corpoDaFuncao devolveu ${corpo.length} caracteres`);
  verdade(
    /provisionamentoFalhouDefinitivamente:\s*false/.test(corpo),
    "a busca de pendentes não filtra provisionamentoFalhouDefinitivamente: false — voltaria a tentar perfis que já desistiram e já avisaram os donos",
  );
});

teste("executarProvisionamentoPendente processa UM PERFIL DE CADA VEZ, nunca em paralelo (a VPS tem 3 GB de RAM)", () => {
  const corpo = corpoDaFuncao(CODIGO_ACOES, "executarProvisionamentoPendente");
  verdade(!/Promise\.all/.test(corpo), "executarProvisionamentoPendente dispara tentativas em paralelo (Promise.all) — sobrecarrega a VPS do Hermes durante um pico de pagamentos");
  verdade(/for\s*\(\s*const item of pendentes\s*\)/.test(corpo), "a varredura não está mais num for sequencial — verifique como ela itera");
  verdade(/await tentarProvisionarPerfil\(item\.id\)/.test(corpo), "cada item não é esperado (await) antes do próximo — pode estar disparando várias tentativas ao mesmo tempo");
});

teste("dispararProvisionamentoAssincrono é fail-closed: sem o segredo interno configurado, nem tenta o fetch", () => {
  const corpo = corpoDaFuncao(CODIGO_ACOES, "dispararProvisionamentoAssincrono");
  verdade(corpo.length > 80, `corpoDaFuncao devolveu ${corpo.length} caracteres`);
  const iGuarda = corpo.indexOf("if (!segredo) return;");
  const iFetch = corpo.indexOf("fetch(");
  verdade(iGuarda >= 0 && iFetch >= 0, "dispararProvisionamentoAssincrono perdeu a guarda do segredo ou o fetch");
  verdade(iGuarda < iFetch, "o fetch acontece antes (ou sem relação com) a checagem do segredo — deixaria de ser fail-closed");
});

// ============================================================================
// 4 · O WEBHOOK NUNCA ESPERA O PROVISIONAMENTO — o requisito central da nota técnica.
// ============================================================================

const FONTE_WEBHOOK = readFileSync("app/api/asaas/webhook/route.ts", "utf8");
const CODIGO_WEBHOOK = codigoDe(FONTE_WEBHOOK);

teste("o webhook NUNCA dá await em dispararProvisionamentoAssincrono — senão a chamada síncrona de 120s volta a existir dentro do webhook", () => {
  verdade(
    !/await\s+dispararProvisionamentoAssincrono/.test(CODIGO_WEBHOOK),
    "dispararProvisionamentoAssincrono está sendo esperado (await) — isso reintroduz, dentro do webhook, exatamente a chamada síncrona que a Frente C existe para evitar",
  );
});

teste("o webhook só dispara o provisionamento para o pagamento do MÓDULO — nunca para o slot extra (que não provisiona perfil novo)", () => {
  const ocorrencias = (CODIGO_WEBHOOK.match(/dispararProvisionamentoAssincrono\(/g) || []).length;
  igual(ocorrencias, 1, "dispararProvisionamentoAssincrono deveria aparecer exatamente uma vez no webhook");
  const iCheckModulo = CODIGO_WEBHOOK.indexOf('campanha.tipo === "MODULO"');
  const iDispara = CODIGO_WEBHOOK.indexOf("dispararProvisionamentoAssincrono(");
  verdade(iCheckModulo >= 0 && iDispara >= 0, "o webhook perdeu a checagem de tipo MODULO ou o disparo do provisionamento");
  verdade(iCheckModulo < iDispara, "o disparo do provisionamento não está condicionado a campanha.tipo === \"MODULO\"");
});

// ============================================================================
// 5 · A FRENTE B REGISTRA A 1ª DATA DO SLA (aguardandoProvisionamentoDesde), NO MESMO PONTO EM
// QUE JÁ REGISTRAVA precisaReprovisionar — ligar o que ela já registrou, sem duplicar a régua.
// ============================================================================

teste("confirmarPagamentoMensalidade grava aguardandoProvisionamentoDesde junto com precisaReprovisionar — a 1ª das duas datas do SLA de provisionamento", () => {
  const fonte = readFileSync("lib/actions/campanhasCobranca.ts", "utf8");
  const corpo = corpoDaFuncao(codigoDe(fonte), "confirmarPagamentoMensalidade");
  verdade(corpo.length > 100, `corpoDaFuncao devolveu ${corpo.length} caracteres`);
  verdade(/precisaReprovisionar:\s*true/.test(corpo), "confirmarPagamentoMensalidade não marca mais precisaReprovisionar: true");
  verdade(
    /aguardandoProvisionamentoDesde:\s*paidAt/.test(corpo),
    "confirmarPagamentoMensalidade não grava aguardandoProvisionamentoDesde — sem isto o intervalo pagamento→provisionamento (o número que o dono pediu) não existe",
  );
});

// ============================================================================
// 6 · CRONS FAIL-CLOSED (mesma disciplina de lib/testes/campanhasCobranca.teste.ts) ─────────
// ============================================================================

teste("o cron de campanhas-provisionamento é fail-closed: sem CRON_SECRET configurado, recusa sempre", () => {
  const fonte = readFileSync("app/api/cron/campanhas-provisionamento/route.ts", "utf8");
  const corpo = corpoDaFuncao(codigoDe(fonte), "GET");
  verdade(corpo.length > 80, `corpoDaFuncao devolveu ${corpo.length} caracteres para o GET do cron`);
  verdade(/if\s*\(\s*!secret\s*\|\|/.test(corpo), "o cron não recusa explicitamente quando CRON_SECRET está ausente");
});

teste("a rota interna de provisionamento é fail-closed: sem CAMPANHA_PROVISIONAMENTO_INTERNO_SECRET, recusa", () => {
  const fonte = readFileSync("app/api/interno/provisionar-campanha/route.ts", "utf8");
  const corpo = corpoDaFuncao(codigoDe(fonte), "POST");
  verdade(corpo.length > 80, `corpoDaFuncao devolveu ${corpo.length} caracteres para o POST da rota interna`);
  verdade(/if\s*\(\s*!segredo\s*\)/.test(corpo), "a rota interna não recusa explicitamente quando o segredo está ausente");
});

void resumo("módulo pago de campanhas — provisionamento automático (Frente C, §3)");
