import { teste, igual, verdade, resumo } from "./executar";
import { montarListaDeCitacoes, extrairTrechosSoltos, hashDeTexto, normalizarTextoCitacao } from "../peticionamentoCitacoes";

// A LISTA DE VALIDAÇÃO DE CITAÇÕES — decisão do dono (22/09/2026). A parte difícil é achar os
// TRECHOS SOLTOS (referência a julgado/súmula/tema no corpo, sem estar estruturada como ementa) —
// "os mais perigosos, porque hoje escapam inteiros da lista de jurisprudência". Este arquivo
// cobre especificamente os casos estranhos que o dono pediu para testar com cuidado.

teste("ementas citadas passam direto, com as DUAS fontes quando o agente informou as duas", () => {
  const lista = montarListaDeCitacoes({
    jurisprudenciaCitada: [{ texto: "STJ, REsp 1.874.782/SP (Tema 990)", fonte: "https://stj.jus.br/x", fonteSecundaria: "https://conjur.com.br/y" }],
    minutaTexto: "Conforme STJ, REsp 1.874.782/SP (Tema 990), o pedido procede.",
  });
  const ementas = lista.filter((c) => c.tipo === "EMENTA");
  igual(ementas.length, 1);
  igual(ementas[0].texto, "STJ, REsp 1.874.782/SP (Tema 990)");
  igual(ementas[0].fonteUrl, "https://stj.jus.br/x");
  igual(ementas[0].fonteSecundariaUrl, "https://conjur.com.br/y");
});

teste("uma ementa reproduzida literalmente no corpo NÃO vira também um trecho solto duplicado", () => {
  const lista = montarListaDeCitacoes({
    jurisprudenciaCitada: [{ texto: "STJ, REsp 1.874.782/SP (Tema 990)", fonte: "https://stj.jus.br/x" }],
    minutaTexto: "Conforme decidiu o STJ, REsp 1.874.782/SP (Tema 990), o pedido procede.",
  });
  igual(lista.filter((c) => c.tipo === "TRECHO").length, 0, "o mesmo texto da ementa não deveria reaparecer como trecho");
});

teste("EDGE CASE: número de processo CNJ quebrado em duas linhas ainda é reconhecido inteiro", () => {
  const minuta = "Vide os autos do processo 1234567-89.2020.8.09.\n0051, em trâmite na comarca.";
  const trechos = extrairTrechosSoltos(minuta, []);
  igual(trechos.length, 1);
  verdade(trechos[0].texto.replace(/\s+/g, "") === "1234567-89.2020.8.09.0051", `número não reconstituído: "${trechos[0].texto}"`);
});

teste("EDGE CASE: súmula citada SEM a palavra 'súmula' — via 'Enunciado' — ainda é encontrada", () => {
  const trechos = extrairTrechosSoltos("Nesse sentido, o Enunciado 297 do STJ é claro sobre o tema.", []);
  igual(trechos.length, 1);
  verdade(/enunciado\s*297/i.test(trechos[0].texto), `trecho não capturou o enunciado: "${trechos[0].texto}"`);
});

teste("EDGE CASE: 'SV' como abreviação de Súmula Vinculante também é encontrada", () => {
  const trechos = extrairTrechosSoltos("A matéria já foi pacificada pela SV 4 do STF.", []);
  igual(trechos.length, 1);
  verdade(/sv\s*4/i.test(trechos[0].texto), `trecho não capturou a SV: "${trechos[0].texto}"`);
});

teste("Súmula escrita por extenso continua reconhecida (caminho feliz)", () => {
  const trechos = extrairTrechosSoltos("Aplica-se a Súmula nº 297 do STJ ao presente caso.", []);
  igual(trechos.length, 1);
  verdade(/s[uú]mula/i.test(trechos[0].texto), `trecho não capturou a súmula: "${trechos[0].texto}"`);
});

teste("Tema do STF/STJ citado solto no corpo é encontrado", () => {
  const trechos = extrairTrechosSoltos("O Tema 1069 do STJ trata exatamente desta hipótese.", []);
  igual(trechos.length, 1);
  verdade(/tema\s*1069/i.test(trechos[0].texto), `trecho não capturou o tema: "${trechos[0].texto}"`);
});

teste("REsp com número pontuado e barra de UF é encontrado, mesmo sem estar em jurisprudenciaCitada", () => {
  const trechos = extrairTrechosSoltos("Nesse sentido: REsp 1.874.782/SP.", []);
  igual(trechos.length, 1);
  verdade(trechos[0].texto.includes("1.874.782/SP"), `trecho perdeu o sufixo de UF: "${trechos[0].texto}"`);
});

teste("recurso e tema citados lado a lado se fundem num único item (mesma menção, não duas)", () => {
  const trechos = extrairTrechosSoltos("Vide REsp 1.234.567/SP (Tema 990/STJ), julgado em repetitivo.", []);
  igual(trechos.length, 1, `esperava um único item fundido, veio: ${JSON.stringify(trechos.map((t) => t.texto))}`);
  verdade(trechos[0].texto.includes("1.234.567/SP") && trechos[0].texto.includes("990"), `item fundido incompleto: "${trechos[0].texto}"`);
});

teste("a MESMA referência citada duas vezes no corpo vira UM item, não dois", () => {
  const trechos = extrairTrechosSoltos("Tema 990 já foi citado. Mais adiante, repete-se: Tema 990 novamente.", []);
  igual(trechos.length, 1);
});

teste("referências DIFERENTES no corpo viram itens separados", () => {
  const trechos = extrairTrechosSoltos("Vide o Tema 990 e também a Súmula 297 do STJ, em pontos distintos do texto.", []);
  igual(trechos.length, 2);
});

teste("trecho solto nunca vem com fonte — a ausência é um fato mostrado, nunca inventado", () => {
  const trechos = extrairTrechosSoltos("Tema 990 do STJ.", []);
  igual(trechos[0].fonteUrl, null);
  igual(trechos[0].fonteSecundariaUrl, null);
});

teste("minuta sem nenhuma citação solta não gera trecho nenhum", () => {
  igual(extrairTrechosSoltos("Texto qualquer sem nenhuma referência a jurisprudência.", []), []);
});

teste("minutaTexto nulo/vazio nunca quebra a extração", () => {
  igual(extrairTrechosSoltos(null, []), []);
  igual(extrairTrechosSoltos("", []), []);
  igual(extrairTrechosSoltos(undefined, []), []);
});

teste("sem jurisprudência estruturada nenhuma, a lista tem só os trechos soltos", () => {
  const lista = montarListaDeCitacoes({ jurisprudenciaCitada: [], minutaTexto: "Vide o Tema 990 do STJ." });
  igual(lista.length, 1);
  igual(lista[0].tipo, "TRECHO");
});

// ── hashDeTexto / normalizarTextoCitacao — a base de "editar invalida a confirmação" ──────────

teste("hashDeTexto é estável para o MESMO texto e ignora diferença de espaço/quebra de linha", () => {
  const a = hashDeTexto("Tema 990 do STJ");
  const b = hashDeTexto("Tema   990   do STJ");
  const c = hashDeTexto("Tema 990\ndo STJ");
  igual(a, b);
  igual(a, c);
});

teste("hashDeTexto MUDA quando o conteúdo da citação de fato muda", () => {
  const a = hashDeTexto("Tema 990 do STJ");
  const b = hashDeTexto("Tema 991 do STJ");
  verdade(a !== b, "hashes deveriam ser diferentes para textos diferentes");
});

teste("normalizarTextoCitacao colapsa espaço e ignora caixa", () => {
  igual(normalizarTextoCitacao("  Tema   990  "), "tema 990");
});

resumo("Peticionamento — lista de validação de citações (decisão do dono, 22/09/2026)");
