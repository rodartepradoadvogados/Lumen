import { readFileSync } from "node:fs";
import { teste, igual, verdade, resumo, corpoDaFuncao } from "./executar";
import { prazoAutomaticoDeFollowUp, DIAS_DE_FOLLOWUP_POR_ESTAGIO } from "@/lib/followUpAutomatico";
import { nomeTemporarioDoLead, nomeEhTemporario, assuntoPadraoWhatsapp } from "@/lib/nomeTemporarioDoLead";
import { lerDecisaoDaAna } from "@/lib/agenteAtendimento";
import { ESTAGIOS_DECIDIDOS, stageOptions } from "@/lib/funil";

// ============================================================================
// FOLLOW-UP AUTOMÁTICO (F5.5) — a regra central de lib/followUpAutomatico.ts, e os três lugares
// que a chamam sem nunca sobrescrever uma data que já existe (lib/whatsapp.ts:
// ingestIncomingWhatsapp, lib/actions/attendance.ts: createAttendance e setAttendanceStage).
// ============================================================================

teste("cada estágio aberto tem um prazo automático maior que zero", () => {
  const referencia = new Date("2026-01-10T12:00:00.000Z");
  for (const stage of Object.keys(DIAS_DE_FOLLOWUP_POR_ESTAGIO)) {
    const prazo = prazoAutomaticoDeFollowUp(stage, referencia);
    verdade(prazo !== null, `${stage} deveria ter prazo automático`);
    verdade((prazo as Date).getTime() > referencia.getTime(), `${stage}: prazo não é depois da referência`);
  }
});

teste("NOVO e AGUARDANDO são 1 dia; QUALIFICACAO 3; PROPOSTA 5", () => {
  const referencia = new Date("2026-03-01T09:00:00.000Z");
  const dias = (stage: string) => {
    const prazo = prazoAutomaticoDeFollowUp(stage, referencia) as Date;
    return Math.round((prazo.getTime() - referencia.getTime()) / (1000 * 60 * 60 * 24));
  };
  igual(dias("NOVO"), 1);
  igual(dias("AGUARDANDO"), 1);
  igual(dias("QUALIFICACAO"), 3);
  igual(dias("PROPOSTA"), 5);
});

teste("FECHADO e PERDIDO nunca ganham follow-up automático — desfecho já decidido", () => {
  for (const stage of ESTAGIOS_DECIDIDOS) {
    igual(prazoAutomaticoDeFollowUp(stage, new Date()), null);
  }
});

teste("um estágio desconhecido não inventa prazo nenhum", () => {
  igual(prazoAutomaticoDeFollowUp("ESTAGIO_QUE_NAO_EXISTE", new Date()), null);
});

teste("todo estágio do funil está decidido nesta régua — ou tem prazo, ou está em ESTAGIOS_DECIDIDOS", () => {
  // Trava de sincronia: um estágio novo em lib/funil.ts que ninguém lembrasse de listar aqui
  // ficaria SEM follow-up automático e sem ninguém perceber — o defeito exato que esta entrega
  // resolve, voltando por outra porta.
  for (const stage of stageOptions) {
    const temPrazo = DIAS_DE_FOLLOWUP_POR_ESTAGIO[stage] !== undefined;
    const decidido = ESTAGIOS_DECIDIDOS.includes(stage);
    verdade(temPrazo || decidido, `estágio ${stage} não tem prazo automático NEM está em ESTAGIOS_DECIDIDOS`);
  }
});

// ============================================================================
// O NOME TEMPORÁRIO DO LEAD (F5.5, item 5) — a pasta do Drive parava de ser genérica quando o
// atendimento nasce com um nome (real ou temporário, mas sempre distinguível por telefone).
// ============================================================================

teste("nomeTemporarioDoLead é legível e único por telefone — nunca o número cru", () => {
  const nome = nomeTemporarioDoLead("556299998888");
  verdade(nome.startsWith("Novo contato"), `nome temporário não começa com o prefixo esperado: ${nome}`);
  verdade(nome !== "556299998888", "o nome temporário não pode ser o número cru");
  // O telefone entra FORMATADO (telefoneLegivel), não em dígitos corridos — confere o DDD e os
  // quatro últimos dígitos, que sobrevivem a qualquer formatação razoável.
  verdade(nome.includes("62") && nome.includes("8888"), `telefone não parece estar no nome: ${nome}`);
});

teste("nomeEhTemporario só reconhece o que a própria função gerou", () => {
  verdade(nomeEhTemporario(nomeTemporarioDoLead("556299998888")), "não reconheceu o próprio nome temporário");
  verdade(!nomeEhTemporario("Maria da Silva"), "um nome de verdade não pode passar por temporário");
  verdade(!nomeEhTemporario(null), "null não é temporário");
  verdade(!nomeEhTemporario(undefined), "undefined não é temporário");
  verdade(!nomeEhTemporario(""), "string vazia não é temporário");
});

teste("assuntoPadraoWhatsapp carrega o nome — é dele que a pasta do Drive nasce", () => {
  verdade(assuntoPadraoWhatsapp("Maria da Silva").includes("Maria da Silva"), "o assunto perdeu o nome");
});

// ============================================================================
// A MARCA [[NOME:...]] — a Ana aprendendo o nome do lead (lib/agenteAtendimento.ts).
// ============================================================================

teste("a marca [[NOME:...]] some da mensagem que vai ao cliente, e o nome é lido", () => {
  const d = lerDecisaoDaAna("Prazer, Maria! Vamos seguir então.\n[[NOME:Maria da Silva]]");
  igual(d.nomeInformado, "Maria da Silva");
  verdade(!d.texto.includes("[[NOME"), "a marca vazou para o texto que vai ao cliente");
  igual(d.texto, "Prazer, Maria! Vamos seguir então.");
});

teste("sem a marca, nomeInformado é null — não inventa nome nenhum", () => {
  const d = lerDecisaoDaAna("Olá! Em que posso ajudar?");
  igual(d.nomeInformado, null);
});

teste("a marca do nome convive com a marca de transferência, cada uma lida por si", () => {
  const d = lerDecisaoDaAna("Já anotei, Maria. Vou te transferir.\n[[NOME:Maria]]\n[[TRANSFERIR:ROTEIRO]]");
  igual(d.nomeInformado, "Maria");
  igual(d.gatilho, "ROTEIRO");
  verdade(!d.texto.includes("[[NOME") && !d.texto.includes("[[TRANSFERIR"), "alguma marca vazou");
});

teste("uma marca de nome absurdamente longa é descartada — provável frase colada por engano", () => {
  const nomeGigante = "A".repeat(200);
  const d = lerDecisaoDaAna(`Certo.\n[[NOME:${nomeGigante}]]`);
  igual(d.nomeInformado, null);
});

// ============================================================================
// ÂNCORA NO CÓDIGO-FONTE, NÃO NO COMENTÁRIO (a armadilha desta casa). As três chamadas abaixo são
// testadas pelo CORPO da função que as faz, com `corpoDaFuncao` (sem comentários) — nunca por uma
// string solta que também aparece na explicação em prosa no topo do arquivo.
// ============================================================================

teste("ingestIncomingWhatsapp preenche nextContactAt ao criar o atendimento novo", () => {
  const corpo = corpoDaFuncao(readFileSync("lib/whatsapp.ts", "utf8"), "ingestIncomingWhatsapp");
  verdade(corpo.length > 0, "ingestIncomingWhatsapp não foi encontrada");
  verdade(corpo.includes("nextContactAt: prazoAutomaticoDeFollowUp("), "a criação do atendimento não preenche nextContactAt automaticamente");
});

teste("createAttendance só usa o automático quando a pessoa não escolheu uma data", () => {
  const corpo = corpoDaFuncao(readFileSync("lib/actions/attendance.ts", "utf8"), "createAttendance");
  verdade(corpo.length > 0, "createAttendance não foi encontrada");
  verdade(
    corpo.includes("data.nextContactAt ? new Date(data.nextContactAt) : prazoAutomaticoDeFollowUp("),
    "createAttendance não prioriza a data escolhida à mão antes do automático",
  );
});

teste("setAttendanceStage nunca sobrescreve uma data de follow-up já existente", () => {
  const corpo = corpoDaFuncao(readFileSync("lib/actions/attendance.ts", "utf8"), "setAttendanceStage");
  verdade(corpo.length > 0, "setAttendanceStage não foi encontrada");
  verdade(
    corpo.includes("atual.nextContactAt ?? prazoAutomaticoDeFollowUp(stage, agora)"),
    "setAttendanceStage não preserva uma data já existente antes de aplicar a automática",
  );
});

resumo("follow-up automático (F5.5)");
