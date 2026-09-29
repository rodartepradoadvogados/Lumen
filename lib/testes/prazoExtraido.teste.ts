import { teste, igual, verdade, resumo } from "./executar";
import { extrairPrazo, extrairMelhorDoGrupo, situacaoPrazo, idadeEmDiasUteis, parseExtenso } from "../prazoExtraido";
import { rotuloPrazo } from "../prazoRotulo";
import { addDiasCorridos, diasUteisEntre } from "../prazos";

// PRAZO EXTRAÍDO DO TEOR (lib/prazoExtraido.ts). Substitui o prazo fixo de 15 dias úteis que a tela
// de Publicações somava a qualquer publicação: no banco de demonstração, 16 de 19 publicações que
// traziam o prazo escrito no texto mostravam data errada. Os textos abaixo são os MODELOS DO SEED
// (seed-gauntlet.ts) mais os casos-âncora do plano — cada um com o que o TEXTO diz.

const PUB = "2026-09-08T15:00:00.000Z"; // terça, 08/09/2026, 12h em Brasília
const P = "Processo 5012345-88.2026.8.09.0051. ";

function prazo(texto: string, kind = "PUBLICACAO", em: string = PUB, extras: { date: string }[] = []) {
  return extrairPrazo(P + texto, kind, em, extras);
}

teste("15 (quinze) dias úteis: algarismo e extenso concordam e diz úteis, confiança alta", () => {
  const r = prazo("DESPACHO. Intime-se a parte autora, na pessoa de seu advogado, para que se manifeste sobre a contestação e documentos que a acompanham, no prazo de 15 (quinze) dias úteis. Cumpra-se.");
  igual([r.tipo, r.dias, r.confianca, r.data], ["PRAZO", 15, 3, "2026-09-29"]);
  verdade(r.trecho && r.trecho.includes("15 (quinze) dias úteis"), "o trecho de origem precisa vir junto");
});

teste("5 (cinco) dias sem 'úteis': confiança média, conta como úteis (CPC 219) e avisa", () => {
  const r = prazo("DECISÃO INTERLOCUTÓRIA. Defiro a prova pericial. Intimem-se as partes para apresentação de quesitos e indicação de assistente técnico no prazo de 5 (cinco) dias.");
  igual([r.tipo, r.dias, r.confianca, r.data], ["PRAZO", 5, 2, "2026-09-15"]);
  verdade(r.notas.some((n) => n.includes("CPC art. 219")), "deve explicar a contagem em dias úteis");
});

teste("intimação: 'em 5 (cinco) dias' (custas de preparo)", () => {
  const r = prazo("Intimação do advogado para, em 5 (cinco) dias, providenciar o recolhimento das custas de preparo recursal, sob pena de deserção (art. 1.007 do CPC).");
  igual([r.tipo, r.dias, r.confianca], ["PRAZO", 5, 2]);
});

teste("10 (dez) dias (bens à penhora)", () => {
  const r = prazo("Vista à parte exequente para que, no prazo de 10 (dez) dias, informe bens passíveis de penhora, sob pena de suspensão da execução nos termos do art. 921 do CPC.");
  igual([r.tipo, r.dias, r.confianca], ["PRAZO", 10, 2]);
});

teste("alvará: 30 dias só em algarismo, confiança baixa e marcado como administrativo", () => {
  const r = prazo("Expedido alvará de levantamento em favor da parte autora, no valor de R$ 8.123,45. Fica o advogado intimado para retirada no prazo de 30 dias.");
  igual([r.tipo, r.dias, r.confianca], ["PRAZO", 30, 1]);
  verdade(r.notas.some((n) => n.includes("administrativo")), "deve sinalizar ato administrativo");
});

teste("contrarrazões: 'prazo legal de 8 (oito) dias' é prazo de 8 dias, não 'prazo legal' sem número", () => {
  const r = prazo("Recebido o recurso ordinário. Intime-se a parte recorrida para apresentar contrarrazões no prazo legal de 8 (oito) dias.");
  igual([r.tipo, r.dias, r.confianca], ["PRAZO", 8, 2]);
});

teste("'prazo legal' sem número: NENHUM, nunca data", () => {
  const r = prazo("Cabível recurso no prazo legal.");
  igual([r.tipo, r.data, r.mencionaPrazo], ["NENHUM", undefined, true]);
  verdade(r.notas[0].includes("prazo legal"), "o motivo precisa dizer que é prazo legal sem número");
});

teste("15 dias só em algarismo com multa de 10%: prazo 15, confiança baixa; o 10% não é prazo", () => {
  const r = prazo("Intime-se o executado para pagamento voluntário no prazo de 15 dias, sob pena de multa de 10% e honorários de 10%.");
  igual([r.tipo, r.dias, r.confianca], ["PRAZO", 15, 1]);
});

teste("'5 (dez) dias': CONFLITO, sem data", () => {
  const r = prazo("Intime-se a parte para manifestação no prazo de 5 (dez) dias, sob pena de preclusão.");
  igual([r.tipo, r.data, r.dias], ["CONFLITO", undefined, undefined]);
  verdade(r.notas[0].includes("dez"), "deve mostrar o que o texto diz nos dois formatos");
});

teste("audiência com data escrita: EVENTO, sem contagem de prazo", () => {
  const r = prazo("ATO ORDINATÓRIO. Fica designada audiência de conciliação para o dia 14/10/2026, às 14:30, a realizar-se por videoconferência. Intimem-se as partes por seus advogados.");
  igual([r.tipo, r.data, r.hora, r.confianca], ["EVENTO", "2026-10-14", "14:30", 3]);
  const r2 = prazo("Designada audiência de conciliação para o dia 14/10/2026, às 14h30, sala 3.");
  igual([r2.tipo, r2.data, r2.hora], ["EVENTO", "2026-10-14", "14:30"]);
});

teste("andamento sem prazo: NENHUM e vira 'só ciência'", () => {
  const r = prazo("Juntada de petição de manifestação.", "ANDAMENTO");
  igual([r.tipo, r.data], ["NENHUM", undefined]);
  igual(situacaoPrazo(r, "ANDAMENTO", "2026-09-29").faixa, "cien");
});

teste("dois prazos no texto: usa o menor, confiança baixa e avisa", () => {
  const r = prazo("Intime-se para responder em 5 dias e, depois, para réplica em 15 dias.");
  igual([r.tipo, r.dias, r.confianca], ["PRAZO", 5, 1]);
  verdade(r.notas.some((n) => n.includes("2 prazos")), "deve avisar que há mais de um prazo");
});

teste("'há 30 dias', 'mais de 30 dias', 'R$ 30 dias' e horas não viram prazo em dias", () => {
  igual(prazo("Petição protocolada há 30 dias sem resposta.").tipo, "NENHUM");
  igual(prazo("Processo parado há mais de 30 dias.").tipo, "NENHUM");
  igual(prazo("Multa arbitrada em R$ 30 dias-multa.").tipo, "NENHUM");
  const h = prazo("Intime-se para cumprir a ordem no prazo de 48 (quarenta e oito) horas.");
  igual([h.tipo, h.data, h.mencionaPrazo], ["NENHUM", undefined, true]);
});

teste("prazo só por extenso ('quinze dias'): aceito com confiança baixa", () => {
  const r = prazo("Intime-se para manifestação em quinze dias.");
  igual([r.tipo, r.dias, r.confianca], ["PRAZO", 15, 1]);
  igual(parseExtenso("vinte e cinco"), 25);
});

teste("dias corridos: 5 corridos que terminam em sábado rolam para segunda", () => {
  // segunda 14/09/2026 + 5 corridos = sábado 19/09 -> segunda 21/09
  const r = prazo("Intime-se para se manifestar em 5 (cinco) dias corridos.", "PUBLICACAO", "2026-09-14T15:00:00.000Z");
  igual([r.tipo, r.corridos, r.data, r.confianca], ["PRAZO", true, "2026-09-21", 2]);
  igual(addDiasCorridos(new Date("2026-09-14T00:00:00Z"), 5).toISOString().slice(0, 10), "2026-09-21");
});

teste("datas: 15 du após 08/09/2026 = 29/09; feriado do escritório e recesso entram na conta", () => {
  igual(prazo("no prazo de 15 (quinze) dias úteis").data, "2026-09-29");
  // publicação 14/10/2026 + 10 du; 28/10 é feriado cadastrado pelo escritório
  const sem = prazo("no prazo de 10 (dez) dias úteis", "PUBLICACAO", "2026-10-14T15:00:00.000Z");
  const com = prazo("no prazo de 10 (dez) dias úteis", "PUBLICACAO", "2026-10-14T15:00:00.000Z", [{ date: "2026-10-28" }]);
  igual([sem.data, com.data], ["2026-10-28", "2026-10-29"]);
  // 12/10 (Aparecida) é feriado nacional: sexta 09/10 + 5 du = 13, 14, 15, 16 e 19/10
  igual(prazo("no prazo de 5 (cinco) dias úteis", "PUBLICACAO", "2026-10-09T15:00:00.000Z").data, "2026-10-19");
  // recesso CPC 220: 18/12/2026 + 5 du salta 20/12 a 20/01
  igual(prazo("no prazo de 5 (cinco) dias úteis", "PUBLICACAO", "2026-12-18T15:00:00.000Z").data, "2027-01-27");
});

teste("dia de Brasília: publicação às 01h UTC do dia 09 ainda é dia 08 em Brasília", () => {
  const r = prazo("no prazo de 5 (cinco) dias úteis", "PUBLICACAO", "2026-09-09T01:00:00.000Z");
  igual(r.base, "2026-09-08");
  igual(r.data, "2026-09-15");
});

teste("situacaoPrazo: vencido, hoje, até 3, até 15, depois; confiança baixa vira 'a confirmar'", () => {
  const hoje = "2026-09-29";
  const alta = prazo("no prazo de 5 (cinco) dias úteis"); // vence 15/09 -> 10 du de atraso
  const s = situacaoPrazo(alta, "PUBLICACAO", hoje);
  igual([s.faixa, s.du, s.aConfirmar], ["venc", -10, false]);
  const baixa = situacaoPrazo(prazo("Intime-se para pagamento no prazo de 5 dias"), "PUBLICACAO", hoje);
  igual([baixa.faixa, baixa.aConfirmar], ["venc", true]);
  igual(situacaoPrazo(prazo("no prazo de 15 (quinze) dias úteis"), "PUBLICACAO", hoje).faixa, "hoje");
  igual(situacaoPrazo(prazo("no prazo de 15 (quinze) dias úteis"), "PUBLICACAO", "2026-09-28").faixa, "d3");
  igual(situacaoPrazo(prazo("no prazo de 15 (quinze) dias úteis"), "PUBLICACAO", "2026-09-20").faixa, "d15");
  igual(situacaoPrazo(prazo("no prazo de 15 (quinze) dias úteis"), "PUBLICACAO", "2026-08-01").faixa, "dep");
  igual(situacaoPrazo(prazo("Cabível recurso no prazo legal."), "PUBLICACAO", hoje).faixa, "sem");
  igual(situacaoPrazo(prazo("Designada audiência para o dia 14/10/2026, às 14h30."), "PUBLICACAO", hoje).faixa, "d15");
  igual(situacaoPrazo(prazo("Designada audiência para o dia 14/09/2026, às 14h30."), "PUBLICACAO", hoje).faixa, "cien");
});

teste("diasUteisEntre e idade em dias úteis (fato, sem extração)", () => {
  igual(diasUteisEntre(new Date("2026-09-15T00:00:00Z"), new Date("2026-09-29T00:00:00Z")), 10);
  igual(diasUteisEntre(new Date("2026-09-29T00:00:00Z"), new Date("2026-09-15T00:00:00Z")), -10);
  igual(diasUteisEntre(new Date("2026-09-29T00:00:00Z"), new Date("2026-09-29T00:00:00Z")), 0);
  igual(idadeEmDiasUteis(PUB, "2026-09-29"), 15);
});

teste("regressão do seed: nenhum modelo com prazo escrito devolve os 15 dias fixos por engano", () => {
  const modelos: { texto: string; esperado: number | null }[] = [
    { texto: "manifeste sobre a contestação, no prazo de 15 (quinze) dias úteis.", esperado: 15 },
    { texto: "para apresentação de quesitos e indicação de assistente técnico no prazo de 5 (cinco) dias.", esperado: 5 },
    { texto: "Intimação do advogado para, em 5 (cinco) dias, providenciar o recolhimento das custas", esperado: 5 },
    { texto: "para que, no prazo de 10 (dez) dias, informe bens passíveis de penhora", esperado: 10 },
    { texto: "intimado para retirada no prazo de 30 dias.", esperado: 30 },
    { texto: "apresentar contrarrazões no prazo legal de 8 (oito) dias.", esperado: 8 },
    { texto: "JULGO PARCIALMENTE PROCEDENTES os pedidos. Custas e honorários advocatícios de 10% sobre o valor da condenação.", esperado: null },
    { texto: "ACÓRDÃO. Acordam os Desembargadores, por unanimidade, em CONHECER e NEGAR PROVIMENTO ao recurso. Publique-se.", esperado: null },
    { texto: "Certifico o trânsito em julgado da sentença. Arquivem-se os autos.", esperado: null },
  ];
  let diferentesDe15 = 0;
  for (const m of modelos) {
    const r = prazo(m.texto);
    igual(r.dias ?? null, m.esperado, `"${m.texto.slice(0, 40)}...": `);
    if (m.esperado == null) igual(r.data, undefined, "sem número no texto nunca tem data: ");
    if (m.esperado != null && m.esperado !== 15) diferentesDe15++;
  }
  igual(diferentesDe15, 5);
});

teste("extrairMelhorDoGrupo: entre fontes do mesmo evento, vale o prazo mais próximo; prazo vence 'nenhum'", () => {
  const r = extrairMelhorDoGrupo([
    { id: "a", content: P + "Juntada de petição.", kind: "ANDAMENTO", publishedAt: PUB },
    { id: "b", content: P + "Intime-se em 5 (cinco) dias úteis.", kind: "PUBLICACAO", publishedAt: PUB },
  ]);
  igual([r.tipo, r.itemId, r.dias], ["PRAZO", "b", 5]);
});

teste("rótulo: vencido só é afirmado com confiança média/alta; baixa vira 'possivelmente'; sem prazo não há data", () => {
  const hoje = "2026-09-29";
  const de = (texto: string, kind = "PUBLICACAO") => {
    const prazoX = prazo(texto, kind);
    return rotuloPrazo({ prazo: prazoX, situacao: situacaoPrazo(prazoX, kind, hoje), registrado: false, tratada: false });
  };
  igual(de("no prazo de 5 (cinco) dias úteis").texto, "VENCIDO há 10 dias úteis");
  igual(de("no prazo de 5 dias").texto, "Possivelmente vencido há 10 dias úteis");
  igual(de("no prazo de 15 (quinze) dias úteis").texto, "VENCE HOJE");
  igual(de("Cabível recurso no prazo legal.").texto, "Prazo não identificado");
  igual(de("Juntada de petição.", "ANDAMENTO").texto, "Só ciência");
  const semData = de("Cabível recurso no prazo legal.");
  verdade(!/\d{2}\/\d{2}/.test(`${semData.texto} ${semData.detalhe ?? ""}`), "sem número no texto a tela nunca mostra data");
  const ex = prazo("no prazo de 5 (cinco) dias úteis");
  igual(rotuloPrazo({ prazo: ex, situacao: situacaoPrazo(ex, "PUBLICACAO", hoje), registrado: true, tratada: false }).texto, "Prazo registrado");
});

resumo("prazoExtraido");
