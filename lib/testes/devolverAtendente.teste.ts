import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";

// ============================================================================
// DEVOLVER A CONVERSA PARA A ANA — o dono revertendo uma trava que ele mesmo pediu.
//
// `definirAtendenteResponde` (a chave, em cima da caixa de resposta) sempre recusou religar
// depois que um humano assumiu — de propósito, documentado em dois lugares: "uma chave que aceita
// ser ligada e depois não faz nada é pior que uma chave que diz não" e "o cliente que recebe
// resposta de gente e depois de máquina percebe — e não tem volta". O dono decidiu o contrário, e
// pediu uma saída: um botão À PARTE, "Devolver", com confirmação, que é `devolverAtendenteResponde`
// (lib/actions/attendance.ts).
//
// Esta suíte prova QUATRO coisas, e nenhuma delas é "o botão existe":
//
//   1. A CHAVE ANTIGA NÃO MUDOU DE COMPORTAMENTO. `definirAtendenteResponde` continua recusando
//      religar — devolver é caminho NOVO, não a chave velha aceitando `true` de novo.
//   2. DEVOLVER RECONFERE O MESMO RECORTE de toda ação desta família: id + escritório de quem
//      pediu + recorte por dono. Quem só vê os próprios atendimentos não pode devolver um
//      atendimento que não poderia nem listar.
//   3. DEVOLVER NÃO DISPARA RESPOSTA NENHUMA. Só grava estado; quem decide se a Ana fala é
//      `deveResponder`, chamado no próximo webhook — o mesmo contrato de "vale da próxima
//      mensagem" que a chave já tinha.
//   4. A TELA dá a saída ao lado do aviso, com confirmação antes de valer, e sem apagar a chave
//      antiga escondendo o "responder à última pergunta" que o dono pediu para manter.
// ============================================================================

const RAIZ = process.cwd();
const FONTE_ACOES = readFileSync(join(RAIZ, "lib", "actions", "attendance.ts"), "utf8");
const FONTE_SCHEMA = readFileSync(join(RAIZ, "prisma", "schema.prisma"), "utf8");
const FONTE_COMPONENTE = readFileSync(join(RAIZ, "components", "AtendenteIaControle.tsx"), "utf8");

const DEVOLVER = corpoDaFuncao(FONTE_ACOES, "devolverAtendenteResponde");
const DEFINIR = corpoDaFuncao(FONTE_ACOES, "definirAtendenteResponde");

teste("a varredura achou os dois corpos — senão tudo abaixo passa em cima de vazio", () => {
  verdade(DEVOLVER.length > 200 && DEVOLVER.length < 2000, `corpo de devolverAtendenteResponde com ${DEVOLVER.length} caracteres — não achou, ou transbordou`);
  verdade(DEFINIR.length > 100 && DEFINIR.length < 1500, `corpo de definirAtendenteResponde com ${DEFINIR.length} caracteres — não achou, ou transbordou`);
  verdade(!DEVOLVER.includes("export async function definirAtendenteResponde"), "o corpo de devolverAtendenteResponde transbordou para a função vizinha");
  verdade(!DEFINIR.includes("export async function devolverAtendenteResponde"), "o corpo de definirAtendenteResponde transbordou para a função vizinha");
});

// ── 1. A CHAVE ANTIGA NÃO MUDOU ─────────────────────────────────────────────────────────────────

teste("MUTAÇÃO PRINCIPAL: definirAtendenteResponde continua recusando religar depois do silêncio", () => {
  verdade(/if\s*\(\s*atendimento\.agenteSilenciadoEm\s*&&\s*responde\s*\)/.test(DEFINIR),
    "a chave voltou a aceitar `true` depois do silêncio — a recusa antiga desapareceu, e devolver deixou de ser a ÚNICA porta");
  verdade(/return\s*\{\s*error:/.test(DEFINIR.slice(DEFINIR.search(/if\s*\(\s*atendimento\.agenteSilenciadoEm\s*&&\s*responde\s*\)/))),
    "a recusa de religar não devolve mais `error` — o chamador não saberia que falhou");
});

teste("definirAtendenteResponde não é o caminho que zera agenteSilenciadoEm — só devolverAtendenteResponde pode", () => {
  verdade(!DEFINIR.includes("agenteSilenciadoEm: null"), "definirAtendenteResponde passou a limpar o silêncio por conta própria — a chave virou a porta de volta, e o ato deixou de ser deliberado");
});

// ── 2. O MESMO RECORTE DE SEMPRE ────────────────────────────────────────────────────────────────

teste("MUTAÇÃO DE ISOLAMENTO: devolverAtendenteResponde busca o atendimento com officeId + filtroDoAtendimento", () => {
  verdade(/findFirst\(\s*\{\s*where:\s*\{\s*id:\s*attendanceId\s*,\s*officeId:\s*user\.officeId\s*,\s*\.\.\.filtroDoAtendimento\(\s*user\s*,\s*user\.id\s*\)/.test(DEVOLVER),
    "devolverAtendenteResponde deixou de reconferir officeId + filtroDoAtendimento — quem só vê os próprios atendimentos passaria a devolver o de qualquer um");
});

teste("devolverAtendenteResponde recusa sem sessão e sem nível de acesso, como as outras ações da família", () => {
  verdade(/if\s*\(\s*!user\s*\)\s*return/.test(DEVOLVER), "faltou a checagem de sessão");
  verdade(DEVOLVER.includes("if (!podeVerAtendimentos(user)) return { error: SEM_ACESSO_AO_ATENDIMENTO };"), "faltou a checagem de nível de acesso ao atendimento");
});

teste("a busca vem ANTES do update — nada é gravado sem confirmar que o atendimento existe e é deste escritório", () => {
  const iBusca = DEVOLVER.search(/findFirst\(/);
  const iUpdate = DEVOLVER.search(/prisma\.attendance\.update\(/);
  verdade(iBusca >= 0 && iUpdate > iBusca, `ordem errada (busca ${iBusca}, update ${iUpdate}) — a gravação aconteceria antes da reconferência`);
});

teste("devolver um atendimento que NÃO está silenciado é recusado, e a recusa vem antes do update", () => {
  const iGuarda = DEVOLVER.search(/if\s*\(\s*!atendimento\.agenteSilenciadoEm\s*\)/);
  const iUpdate = DEVOLVER.search(/prisma\.attendance\.update\(/);
  verdade(iGuarda >= 0, "sumiu a checagem de que só se devolve o que está silenciado");
  verdade(iUpdate > iGuarda, "a checagem de silêncio vem DEPOIS do update — devolveria mesmo sem ter o que devolver");
});

// ── 3. NENHUMA RESPOSTA É DISPARADA AQUI ────────────────────────────────────────────────────────

teste("MUTAÇÃO DE CONTRATO: devolver só grava estado — não chama atendenteResponde nem envia mensagem", () => {
  verdade(!DEVOLVER.includes("atendenteResponde("), "devolverAtendenteResponde chama atendenteResponde — a Ana responderia NA HORA à pergunta que a pessoa do escritório pode estar digitando, quebrando o contrato de 'vale da próxima mensagem'");
  verdade(!DEVOLVER.includes("sendWhatsappText("), "devolverAtendenteResponde manda mensagem direto — não é isso que o botão faz");
  verdade(!DEVOLVER.includes("responderUltimaPergunta("), "devolver não deve chamar responderUltimaPergunta por conta própria — elas são DOIS atos separados, o segundo continua exigindo o próprio clique");
});

teste("o update grava exatamente os quatro campos do contrato, e agenteResponde vira true", () => {
  const iUpdate = DEVOLVER.search(/prisma\.attendance\.update\(/);
  const dados = DEVOLVER.slice(iUpdate);
  verdade(/agenteSilenciadoEm:\s*null/.test(dados), "não zera agenteSilenciadoEm — deveResponder continuaria recusando");
  verdade(/agenteResponde:\s*true/.test(dados), "não liga agenteResponde — devolver marcaria a conversa como silenciada-mas-desligada, sem efeito nenhum");
  verdade(/agenteDevolvidoEm:\s*new Date\(\)/.test(dados), "não grava agenteDevolvidoEm — a devolução perde o rastro de auditoria");
  verdade(/agenteDevolvidoPorId:\s*user\.id/.test(dados), "não grava quem devolveu — a devolução perde o rastro de auditoria");
});

// ── 4. O SCHEMA: SÓ ACRESCENTA, NUNCA REMOVE OU ENDURECE ────────────────────────────────────────

teste("agenteSilenciadoEm continua existindo, e continua anulável — nada foi removido", () => {
  verdade(/agenteSilenciadoEm\s+DateTime\?/.test(FONTE_SCHEMA), "agenteSilenciadoEm sumiu do schema, ou deixou de ser anulável — isso apagaria dado de produção");
});

teste("os dois campos novos de auditoria existem e são anuláveis", () => {
  verdade(/agenteDevolvidoEm\s+DateTime\?/.test(FONTE_SCHEMA), "agenteDevolvidoEm não existe ou não é anulável");
  verdade(/agenteDevolvidoPorId\s+String\?/.test(FONTE_SCHEMA), "agenteDevolvidoPorId não existe ou não é anulável — uma coluna obrigatória quebraria toda linha já existente no banco de produção");
});

// ── 5. A TELA ────────────────────────────────────────────────────────────────────────────────────

const CODIGO_COMPONENTE = codigoDe(FONTE_COMPONENTE);
const I_SILENCIADO = CODIGO_COMPONENTE.indexOf("if (silenciado) {");
const I_DEVOLVER_FN = CODIGO_COMPONENTE.indexOf("function devolver(");
const I_ALTERNAR_FN = CODIGO_COMPONENTE.indexOf("function alternar(");
const I_RESPONDER_AGORA_FN = CODIGO_COMPONENTE.indexOf("function responderAgora(");

teste("a varredura achou os quatro pontos de referência da tela", () => {
  verdade(I_SILENCIADO > 0, "sumiu o `if (silenciado)`");
  verdade(I_DEVOLVER_FN >= 0 && I_DEVOLVER_FN < I_SILENCIADO, "a função devolver() não está antes do bloco silenciado");
  verdade(I_ALTERNAR_FN > I_SILENCIADO, "a função alternar() não está depois do bloco silenciado");
  verdade(I_RESPONDER_AGORA_FN > I_ALTERNAR_FN, "responderAgora() não está depois de alternar()");
});

const CORPO_DEVOLVER_FN = CODIGO_COMPONENTE.slice(I_DEVOLVER_FN, I_SILENCIADO);
const BLOCO_SILENCIADO = CODIGO_COMPONENTE.slice(I_SILENCIADO, I_ALTERNAR_FN);
const CORPO_RESPONDER_AGORA = CODIGO_COMPONENTE.slice(I_RESPONDER_AGORA_FN, CODIGO_COMPONENTE.indexOf("return (", I_RESPONDER_AGORA_FN));

teste("devolver() pede confirmação ANTES de chamar a ação, e para se a pessoa recusar", () => {
  const iConfirm = CORPO_DEVOLVER_FN.search(/window\.confirm\(/);
  const iRetorno = CORPO_DEVOLVER_FN.search(/if\s*\(\s*!ok\s*\)\s*return;/);
  const iChamada = CORPO_DEVOLVER_FN.search(/devolverAtendenteResponde\(\s*attendanceId\s*\)/);
  verdade(iConfirm >= 0, "devolver() não pede confirmação — um clique por engano devolveria a conversa sem aviso");
  verdade(iRetorno > iConfirm, "devolver() não para quando a pessoa recusa a confirmação");
  verdade(iChamada > iRetorno, "a ação é chamada ANTES (ou sem) checar a confirmação");
});

teste("o texto da confirmação avisa que vale da PRÓXIMA mensagem, não da que está na tela", () => {
  verdade(/PRÓXIMA mensagem/.test(CORPO_DEVOLVER_FN), "a confirmação não menciona que vale da próxima mensagem — quem clica pode achar que a Ana vai responder na hora à pergunta parada na tela");
});

teste("o botão de devolver fica DENTRO do bloco silenciado, chama devolver() e desliga durante o pedido", () => {
  verdade(/<button[\s\S]*?onClick=\{devolver\}[\s\S]*?<\/button>/.test(BLOCO_SILENCIADO), "não achei um <button onClick={devolver}> dentro do bloco silenciado");
  verdade(/onClick=\{devolver\}[\s\S]{0,120}disabled=\{pendente\}|disabled=\{pendente\}[\s\S]{0,120}onClick=\{devolver\}/.test(BLOCO_SILENCIADO),
    "o botão de devolver não fica desabilitado durante o pedido (disabled={pendente}) — dois cliques rápidos disparariam duas devoluções");
});

teste("o cadeado (a frase do dono) continua no bloco silenciado — a saída fica AO LADO do aviso, não no lugar dele", () => {
  verdade(BLOCO_SILENCIADO.includes("<Lock"), "sumiu o ícone de cadeado");
  verdade(BLOCO_SILENCIADO.includes("assumiu esta conversa"), "sumiu a frase que avisa que um humano assumiu");
  verdade(BLOCO_SILENCIADO.includes("não tem volta"), "sumiu a frase que explica por que o silêncio existe — o dono pediu para mantê-la, só deixou de ser beco sem saída");
});

teste("no bloco silenciado NÃO há mais a chave de ligar/desligar (checkbox) — devolver não é a chave voltando", () => {
  verdade(!BLOCO_SILENCIADO.includes('type="checkbox"'), "o bloco silenciado ganhou de volta o checkbox — devolver deveria ser um botão nomeado, não a chave reaparecendo");
});

teste("responderAgora() continua chamando responderUltimaPergunta — o botão que o dono pediu para manter não foi tocado", () => {
  verdade(CORPO_RESPONDER_AGORA.includes("responderUltimaPergunta(attendanceId)"), "responderAgora() deixou de chamar responderUltimaPergunta");
});

teste("o rótulo 'Responder à última pergunta' só existe no JSX normal, e continua condicionado a ultimaEhDoCliente", () => {
  const iReturnFinal = CODIGO_COMPONENTE.indexOf("return (", I_RESPONDER_AGORA_FN);
  const jsxFinal = CODIGO_COMPONENTE.slice(iReturnFinal);
  const iRotulo = jsxFinal.indexOf("Responder à última pergunta");
  verdade(iRotulo > 0, "sumiu o rótulo 'Responder à última pergunta' do JSX normal");
  const iCondicao = jsxFinal.lastIndexOf("ultimaEhDoCliente &&", iRotulo);
  verdade(iCondicao >= 0 && iRotulo - iCondicao < 600, "o rótulo não está mais sob a condição ultimaEhDoCliente — apareceria sem pergunta pendente");
});

teste("nenhum hex cru entrou no componente", () => {
  verdade(!/#[0-9a-fA-F]{3,8}\b/.test(CODIGO_COMPONENTE), "components/AtendenteIaControle.tsx ganhou hex cru");
});

teste("o modo compacto do telefone também recebe o botão de devolver, com a mesma altura mínima de toque", () => {
  verdade(/compacto\s*\?\s*"min-h-\[36px\]"\s*:\s*"min-h-11"/.test(BLOCO_SILENCIADO),
    "o botão de devolver não tem a régua de altura do modo compacto — no telefone ele pode ficar pequeno demais para tocar, ou (sem o modo compacto) grande demais e empurrar a conversa para fora");
});

resumo("Devolver a conversa para a Ana");
