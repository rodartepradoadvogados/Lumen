import { readFileSync } from "node:fs";
import { teste, igual, verdade, resumo } from "./executar";
import {
  ehAvisoDeLead,
  sobrancelhaDoLead,
  linhaDoLead,
  esperaPorExtenso,
  resumoDoLead,
  LIMITE_DO_RESUMO,
} from "@/lib/leadNoSino";

// ============================================================================
// O LEAD NO SINO.
//
// O que precisa estar certo: o aviso não pode inventar espera, não pode cortar o resumo no meio de
// uma palavra, e não pode aparecer em duplicata — o mesmo atendimento não pode contar como "lead
// novo" e "lead sem atendimento" ao mesmo tempo, porque aí o número do sino passa a mentir.
// ============================================================================

teste("só os dois avisos de lead ganham forma própria", () => {
  igual(ehAvisoDeLead("LEAD_TRANSFERIDO"), true);
  igual(ehAvisoDeLead("LEAD_SEM_RESPOSTA"), true);
  igual(ehAvisoDeLead("PRAZO_VENCIDO"), false);
  igual(ehAvisoDeLead("RESPOSTA_PRAZO_ESTOURADO"), false);
  igual(ehAvisoDeLead(""), false);
});

teste("a sobrancelha diz se o lead é seu", () => {
  igual(sobrancelhaDoLead("LEAD_TRANSFERIDO", true), "Lead novo para você");
  igual(sobrancelhaDoLead("LEAD_TRANSFERIDO", false), "Lead novo no escritório");
  // No lead que já passou por todos, de quem é deixou de ser a pergunta — não é de ninguém, e é
  // exatamente esse o problema.
  igual(sobrancelhaDoLead("LEAD_SEM_RESPOSTA", true), "Lead sem atendimento");
  igual(sobrancelhaDoLead("LEAD_SEM_RESPOSTA", false), "Lead sem atendimento");
});

teste("a linha do lead reaproveita o motivo que o advogado recebeu no WhatsApp", () => {
  igual(linhaDoLead("ROTEIRO", "Erro médico — parto"), "A triagem terminou · Erro médico — parto");
  igual(linhaDoLead("PEDIDO", null), "O cliente pediu para falar com um advogado");
});

teste("gatilho desconhecido não vira frase quebrada", () => {
  igual(linhaDoLead("GATILHO_NOVO", "Inventário"), "Passou para o escritório · Inventário");
  igual(linhaDoLead(null, null), "Passou para o escritório");
});

teste("a espera vem por extenso, com singular e plural", () => {
  igual(esperaPorExtenso(0), "Chegou agora");
  igual(esperaPorExtenso(1), "Esperando há 1 minuto");
  igual(esperaPorExtenso(11), "Esperando há 11 minutos");
  igual(esperaPorExtenso(59), "Esperando há 59 minutos");
  igual(esperaPorExtenso(120), "Esperando há 2h");
});

teste("sem ninguém esperando, o aviso não inventa espera", () => {
  // O caso que importa: o lead foi repassado, a pessoa respondeu, e o aviso continua na lista até
  // o relógio zerar. "Esperando há 3 horas" ali seria falso e faria alguém correr à toa.
  igual(esperaPorExtenso(null), null);
});

teste("o resumo é cortado no espaço, nunca no meio da palavra", () => {
  const texto =
    "Cesárea em março de 2026, dores fortes desde então, procurou o hospital três vezes e todas foram registradas no prontuário. " +
    "O plano de saúde negou a cobertura da revisão e ela ainda não conseguiu a negativa por escrito para juntar ao processo.";
  const curto = resumoDoLead(texto);
  verdade(curto !== null, "deveria devolver resumo");
  verdade(curto!.length <= LIMITE_DO_RESUMO + 1, `o resumo passou do limite: ${curto!.length}`);
  verdade(curto!.endsWith("…"), "resumo cortado deveria terminar em reticências");
  verdade(!/\s…$/.test(curto!), "não deveria sobrar espaço antes das reticências");
  // A prova de que cortou no espaço: o trecho sem as reticências é um prefixo do original que
  // termina onde havia um espaço.
  const semReticencias = curto!.slice(0, -1);
  verdade(texto.startsWith(semReticencias), "o resumo deveria ser um prefixo do original");
  verdade(texto[semReticencias.length] === " " || ".,;:".includes(texto[semReticencias.length]), "cortou no meio de uma palavra");
});

teste("resumo curto não ganha reticências à toa", () => {
  igual(resumoDoLead("Quer saber se cabe inventário extrajudicial."), "Quer saber se cabe inventário extrajudicial.");
});

teste("resumo vazio é nulo, e espaços não viram resumo", () => {
  igual(resumoDoLead(null), null);
  igual(resumoDoLead("   \n  "), null);
});

teste("uma palavra gigante ainda é cortada", () => {
  // Uma URL colada na descrição não tem espaço nenhum: sem tratamento, o resumo sairia inteiro e
  // estouraria a largura do aviso.
  const gigante = "a".repeat(400);
  const r = resumoDoLead(gigante);
  verdade(r !== null && r.length <= LIMITE_DO_RESUMO + 1, `uma palavra gigante passou: ${r?.length}`);
});

// ── AS DUAS TRAVAS DO NÚMERO DO SINO ────────────────────────────────────────

teste("o número do sino e a lista usam o MESMO where", () => {
  // O defeito clássico deste arquivo: o critério escrito duas vezes diverge, o número diz 6 e a
  // gaveta mostra 5, e ninguém descobre olhando o código — só olhando a tela.
  const fonte = readFileSync("lib/alerts.ts", "utf8");
  const usos = (fonte.match(/whereLeadTransferido\(/g) || []).length;
  const usosSem = (fonte.match(/whereLeadSemResposta\(/g) || []).length;
  // Uma definição + um uso na lista + um uso na contagem.
  verdade(usos >= 3, `whereLeadTransferido deveria ser usado na lista E na contagem (achei ${usos})`);
  verdade(usosSem >= 3, `whereLeadSemResposta deveria ser usado na lista E na contagem (achei ${usosSem})`);
  verdade(fonte.includes("leadsTransferidosCount +"), "a contagem não soma os leads transferidos");
  verdade(fonte.includes("leadsSemRespostaCount"), "a contagem não soma os leads sem resposta");
});

teste("o mesmo atendimento nunca conta como os dois avisos ao mesmo tempo", () => {
  // `semRespostaEm: null` no primeiro where é o que garante isso. Sem ele, um lead que fechou a
  // volta apareceria duas vezes no sino e o número seria o dobro do que existe.
  const fonte = readFileSync("lib/alerts.ts", "utf8");
  const bloco = fonte.slice(fonte.indexOf("export function whereLeadTransferido"), fonte.indexOf("export function whereLeadSemResposta"));
  verdade(bloco.includes("semRespostaEm: null"), "whereLeadTransferido não exclui quem já fechou a volta");
});

teste("sem recorte de atendimento, nenhum aviso de lead escapa", () => {
  // O padrão é `null` — quem não pode ver o Atendimento não pode receber pelo sino o nome de quem
  // procurou o escritório. A varredura garante que as duas consultas novas respeitem isso.
  const fonte = readFileSync("lib/alerts.ts", "utf8");
  for (const nome of ["whereLeadTransferido(officeId, recorteAtendimento)", "whereLeadSemResposta(officeId, recorteAtendimento)"]) {
    const i = fonte.indexOf(nome);
    verdade(i > 0, `${nome} não foi encontrado`);
    // Nos 400 caracteres anteriores tem de haver a guarda ternária do recorte.
    verdade(fonte.slice(Math.max(0, i - 400), i).includes("recorteAtendimento"), `${nome} roda sem checar o recorte`);
  }
});

resumo("O lead no sino");
