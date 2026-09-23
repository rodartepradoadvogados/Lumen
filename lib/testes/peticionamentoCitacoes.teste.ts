import { teste, igual, verdade, resumo } from "./executar";
import { montarListaDeCitacoes, extrairTrechosSoltos, hashDeTexto, normalizarTextoCitacao } from "../peticionamentoCitacoes";
import { classificarIdentificador } from "../peticionamentoIdentificadorDeJulgado";

// A LISTA DE VALIDAÇÃO DE CITAÇÕES — decisão do dono (22/09/2026). A parte difícil é achar os
// TRECHOS SOLTOS (referência a julgado/súmula/tema no corpo, sem estar estruturada como ementa) —
// "os mais perigosos, porque hoje escapam inteiros da lista de jurisprudência". Este arquivo
// cobre especificamente os casos estranhos que o dono pediu para testar com cuidado.

teste("ementas citadas passam direto, com as DUAS fontes quando o agente informou as duas", () => {
  const lista = montarListaDeCitacoes({
    jurisprudenciaCitada: [{ texto: "STJ, REsp 1.874.782/SP (Tema 990)", fonte: "https://stj.jus.br/x", fonteSecundaria: "https://conjur.com.br/y" }],
    minutaTexto: "Conforme STJ, REsp 1.874.782/SP (Tema 990), o pedido procede.",
  });
  const ementas = lista.citacoes.filter((c) => c.tipo === "EMENTA");
  igual(ementas.length, 1);
  igual(ementas[0].texto, "STJ, REsp 1.874.782/SP (Tema 990)");
  igual(ementas[0].fonteUrl, "https://stj.jus.br/x");
  igual(ementas[0].fonteSecundariaUrl, "https://conjur.com.br/y");
  igual(lista.avisosDeMolde.length, 0, "número real não deveria gerar aviso de molde");
});

teste("uma ementa reproduzida literalmente no corpo NÃO vira também um trecho solto duplicado", () => {
  const lista = montarListaDeCitacoes({
    jurisprudenciaCitada: [{ texto: "STJ, REsp 1.874.782/SP (Tema 990)", fonte: "https://stj.jus.br/x" }],
    minutaTexto: "Conforme decidiu o STJ, REsp 1.874.782/SP (Tema 990), o pedido procede.",
  });
  igual(lista.citacoes.filter((c) => c.tipo === "TRECHO").length, 0, "o mesmo texto da ementa não deveria reaparecer como trecho");
});

// ── MOLDE/EXEMPLO — decisão do dono (23/09/2026): citação-molde não entra na lista, vira aviso ──
//
// Os três casos abaixo são EXATAMENTE os do print que motivou esta entrega: o quadro "Citações
// desta minuta" mostrando três "citações" com número mascarado ou de exemplo clássico, cada uma
// oferecendo "Li e revisei esta citação" como se fosse um julgado de verdade.

teste("RECONHECEDOR DE FORMA: números reais passam como 'valido'", () => {
  igual(classificarIdentificador("0001234-56.2023.5.18.0001"), "valido");
  igual(classificarIdentificador("REsp 1.874.782/SP"), "valido");
  igual(classificarIdentificador("AREsp 738.415/RJ"), "valido");
});

// REGRESSÃO — o reconhecedor nasceu recusando número REAL. A régua de "sequência trivial" era
// aplicada aos SEIS segmentos do CNJ, e a unidade de origem "0000" (sexto segmento) é "todo o
// mesmo dígito"; só que "0000" é o código OFICIAL de processo ORIGINÁRIO do tribunal, ou seja,
// justamente o que aparece no acórdão de competência originária — a jurisprudência que o advogado
// cita. O efeito era o pior possível: um julgado real virava "molde" e travava a aprovação da
// minuta, ensinando o advogado a desconfiar do aviso que existe para protegê-lo.
teste("REGRESSÃO: unidade de origem '0000' é processo originário do tribunal — número real, nunca molde", () => {
  igual(classificarIdentificador("1001234-56.2021.8.26.0000"), "valido", "ação originária no TJSP");
  igual(classificarIdentificador("0010567-89.2019.5.18.0000"), "valido", "dissídio/ação originária no TRT-18");
  igual(classificarIdentificador("RO 0010567-89.2019.5.18.0000"), "valido", "o mesmo número com a sigla do recurso na frente");
  // A máscara continua valendo sobre TODOS os segmentos — a correção acima não abriu essa porta.
  igual(classificarIdentificador("00XX234-56.2021.8.26.0000"), "molde", "máscara no primeiro segmento, unidade 0000 de verdade");
  igual(classificarIdentificador("1001234-56.20XX.8.26.0000"), "molde", "máscara no ano, unidade 0000 de verdade");
});

teste("RECONHECEDOR DE FORMA: os três exemplos exatos do print do dono são molde", () => {
  igual(classificarIdentificador("TRT-18-RO-000XX-XX.20XX.5.18.XXXX"), "molde");
  igual(classificarIdentificador("TST-RR-XXXXX-XX.20XX.5.XX.XXXX"), "molde");
  igual(classificarIdentificador("STJ-REsp-1.234.567/SP"), "molde");
});

teste("RECONHECEDOR DE FORMA: outras variantes de molde/exemplo também são pegas", () => {
  igual(classificarIdentificador("0000000-00.2020.8.09.0001"), "molde", "primeiro segmento todo zero");
  igual(classificarIdentificador("0000000-00"), "molde", "número antigo todo zero, sem palavra-chave na frente");
  igual(classificarIdentificador("NNNNNNN-NN.NNNN.N.NN.NNNN"), "molde", "máscara toda em N");
  igual(classificarIdentificador("_______-__.____.5.18.0001"), "molde", "máscara em underscore");
});

teste("RECONHECEDOR DE FORMA: texto sem forma de identificador nenhuma é 'irreconhecível', nunca 'válido' por omissão", () => {
  igual(classificarIdentificador(""), "irreconhecivel");
  igual(classificarIdentificador("processo sem número informado"), "irreconhecivel");
  igual(classificarIdentificador("processo 12345 do juiz"), "irreconhecivel", "número solto em meio a prosa, sem palavra-chave nem forma CNJ completa");
});

teste("EMENTA-molde (a citação inteira do print) não entra na lista de citações — vira aviso próprio", () => {
  const lista = montarListaDeCitacoes({
    jurisprudenciaCitada: [
      { texto: "TRT-18-RO-000XX-XX.20XX.5.18.XXXX — Contrato de gestão com metas objetivas...", fonte: null, fonteSecundaria: null },
      { texto: "TST-RR-XXXXX-XX.20XX.5.XX.XXXX — Veículo cedido para uso pessoal integral...", fonte: null, fonteSecundaria: null },
      { texto: "STJ-REsp-1.234.567/SP — Cláusula de não concorrência...", fonte: null, fonteSecundaria: null },
    ],
    minutaTexto: null,
  });
  igual(lista.citacoes.length, 0, "nenhuma das três deveria virar citação de verdade");
  igual(lista.avisosDeMolde.length, 3, `esperava 3 avisos de molde, veio ${lista.avisosDeMolde.length}`);
  for (const aviso of lista.avisosDeMolde) {
    igual(aviso.origem, "EMENTA");
    verdade(aviso.identificadorMolde.length > 0, "o aviso precisa dizer QUAL pedaço foi reconhecido como molde");
  }
});

teste("EMENTA real (não-molde) continua entrando normalmente na lista, mesmo ao lado de moldes rejeitados", () => {
  const lista = montarListaDeCitacoes({
    jurisprudenciaCitada: [
      { texto: "STJ, REsp 1.874.782/SP (Tema 990)", fonte: "https://stj.jus.br/x", fonteSecundaria: "https://conjur.com.br/y" },
      { texto: "STJ-REsp-1.234.567/SP — Cláusula de não concorrência...", fonte: null, fonteSecundaria: null },
    ],
    minutaTexto: null,
  });
  igual(lista.citacoes.length, 1, "só a citação real deveria sobreviver");
  igual(lista.citacoes[0].texto, "STJ, REsp 1.874.782/SP (Tema 990)");
  igual(lista.avisosDeMolde.length, 1);
});

teste("TRECHO-molde totalmente mascarado, solto no corpo (sem UM dígito sequer), também vira aviso — nunca escapa como trecho", () => {
  const lista = montarListaDeCitacoes({
    jurisprudenciaCitada: [],
    minutaTexto: "Conforme decidiu o TRT-18-RO-000XX-XX.20XX.5.18.XXXX, o pedido merece provimento.",
  });
  igual(lista.citacoes.length, 0);
  igual(lista.avisosDeMolde.length, 1);
  igual(lista.avisosDeMolde[0].origem, "TRECHO");
});

teste("TRECHO com número de exemplo clássico (1.234.567) solto no corpo também vira aviso", () => {
  const lista = montarListaDeCitacoes({ jurisprudenciaCitada: [], minutaTexto: "Vide REsp 1.234.567/SP, julgado recente." });
  igual(lista.citacoes.length, 0);
  igual(lista.avisosDeMolde.length, 1);
});

teste("EDGE CASE: número de processo CNJ quebrado em duas linhas ainda é reconhecido inteiro", () => {
  // "1874782" (não "1234567") DE PROPÓSITO: "1234567" é uma sequência ascendente perfeita e, com
  // o reconhecedor de molde/exemplo (23/09/2026), passaria a ser classificada como número de
  // exemplo — o que faria este teste de RECONSTITUIÇÃO DE LINHA QUEBRADA (o que ele realmente se
  // propõe a provar) parar de provar isso e passar a provar outra coisa por acidente.
  const minuta = "Vide os autos do processo 1874782-89.2020.8.09.\n0051, em trâmite na comarca.";
  const trechos = extrairTrechosSoltos(minuta, []);
  igual(trechos.length, 1);
  verdade(trechos[0].texto.replace(/\s+/g, "") === "1874782-89.2020.8.09.0051", `número não reconstituído: "${trechos[0].texto}"`);
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
  // "1.874.782" (não "1.234.567") DE PROPÓSITO: este teste cobre a FUSÃO de recurso+tema, não a
  // detecção de molde/exemplo — usar o número de exemplo clássico aqui faria a citação inteira
  // ser rejeitada como molde (comportamento novo, coberto à parte acima) e o teste deixaria de
  // provar o que se propõe a provar.
  const trechos = extrairTrechosSoltos("Vide REsp 1.874.782/SP (Tema 990/STJ), julgado em repetitivo.", []);
  igual(trechos.length, 1, `esperava um único item fundido, veio: ${JSON.stringify(trechos.map((t) => t.texto))}`);
  verdade(trechos[0].texto.includes("1.874.782/SP") && trechos[0].texto.includes("990"), `item fundido incompleto: "${trechos[0].texto}"`);
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
  igual(lista.citacoes.length, 1);
  igual(lista.citacoes[0].tipo, "TRECHO");
  igual(lista.avisosDeMolde.length, 0);
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
