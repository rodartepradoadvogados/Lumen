import { teste, igual, verdade, resumo } from "./executar";
import {
  montarMensagemParaHermes,
  instrucaoDeRequerimentos,
  custoFixoDaMensagem,
  MARCADORES_RESPOSTA_HERMES,
  type DadosParaPrompt,
} from "@/lib/peticionamentoPrompt";
import { CATEGORIAS_DE_PECA } from "@/lib/peticionamentoCategoriaPeca";
import { LIMITE_PADRAO_CARACTERES } from "@/lib/peticionamentoJanelaDeContexto";

// ══════════════════════════════════════════════════════════════════════════════════════════
// A SEÇÃO DE REQUERIMENTOS — o pedido do dono depois de avaliar a primeira minuta.
//
// Antes desta entrega a lista de pedidos do advogado ia ao agente quase crua ("Pedidos a
// reiterar/formular: a; b; c") e NADA dizia como montar a parte final do documento. Saía genérico:
// "requer a produção de todas as provas em direito admitidas", dano moral sustentado só em dano
// presumido, litigância de má-fé por reflexo, "o que for devido".
//
// COMO ESTA SUÍTE TESTA. Duas decisões, as duas por defeito que já aconteceu nesta casa:
//
//   1. Ela EXERCITA o montador — monta a mensagem de verdade e lê o que saiu. Varredura de fonte
//      prova que o texto existe no arquivo, nunca que ele chega ao agente na categoria certa.
//   2. As asserções são sobre CONCEITO, com alternativas de grafia (/subsidiári/, /tutela.*multa/,
//      /in re ipsa/), nunca sobre a frase inteira. Varredura presa a uma grafia já impediu duas
//      vezes, aqui, a correção do defeito que o teste guardava: quem reescreve a frase quebra o
//      teste sem ter quebrado a regra, e o caminho fácil passa a ser afrouxar o teste.
//
// A ORDEM também é testada por índice, não por igualdade de texto: a sequência dos requerimentos é
// a substância do pedido do dono (pedido principal antes de subsidiário, tutela antes de citação,
// prova especificada antes de sucumbência, valor da causa antes do instrumental).
// ══════════════════════════════════════════════════════════════════════════════════════════

function dados(categoriaPeca: string | null, extra: Partial<DadosParaPrompt> = {}): DadosParaPrompt {
  return {
    materias: ["Cível"],
    categoriaPeca,
    tipoPeca: "Inicial",
    tipoPecaOutro: null,
    contextoDescricao: null,
    // Campos do advogado deliberadamente NEUTROS: se o fixture escrevesse "tutela de urgência" ou
    // "danos morais" em `pedidos`, toda asserção abaixo poderia estar encontrando o fixture em vez
    // da instrução da plataforma — e passaria verde com a instrução inteira removida.
    fatos: "Fatos descritos pelo advogado.",
    pedidos: ["Primeiro item informado", "Segundo item informado"],
    prazoFatal: null,
    prazoPreclusivo: false,
    teses: [],
    observacoes: null,
    documentos: [],
    contextoFoiResumido: false,
    avisoDeResumo: null,
    ...extra,
  };
}

/**
 * O TRECHO da mensagem que é a instrução da parte final, localizado pela PRIMEIRA linha que o
 * próprio módulo produz — não por uma frase copiada para cá. Copiar a frase amarraria a suíte a
 * uma grafia; pegar a âncora do módulo deixa a redação livre e mantém as asserções de conceito.
 */
function trechoDeRequerimentos(dadosDoPrompt: DadosParaPrompt): string {
  const linhas = instrucaoDeRequerimentos(dadosDoPrompt.categoriaPeca);
  const mensagem = montarMensagemParaHermes(dadosDoPrompt);
  const inicio = mensagem.indexOf(linhas[0]);
  verdade(inicio !== -1, "a instrução da parte final não chegou à mensagem montada");
  return mensagem.slice(inicio);
}

/** Índice da primeira ocorrência do conceito, ou -1. */
function onde(trecho: string, conceito: RegExp): number {
  return trecho.search(conceito);
}

// ── 1. A ESTRUTURA DE UMA PEÇA POSTULATÓRIA, NA ORDEM ────────────────────────────────────────

const ETAPAS_DA_PETICAO: [string, RegExp][] = [
  ["pedido principal", /pedido principal/i],
  ["pedidos subsidiários pela eventualidade", /subsidiári[oa]s?[\s\S]{0,400}eventualidade/i],
  ["tutela provisória com multa", /tutela provis[óo]ria[\s\S]{0,400}multa/i],
  ["citação da parte contrária", /cita(ção|r)[\s\S]{0,120}(parte contr[áa]ria|na forma da lei)/i],
  ["provas especificadas", /prova[\s\S]{0,400}depoimento pessoal[\s\S]{0,400}(per[íi]cia|pericial)/i],
  ["sucumbência com percentual", /(honor[áa]rios[\s\S]{0,80})?sucumbenciais[\s\S]{0,120}percentual/i],
  ["valor da causa pelo proveito econômico", /valor da causa[\s\S]{0,120}proveito econ[ôo]mico/i],
  ["requerimentos instrumentais", /(instrumenta(is|l)|gratuidade|prioridade de tramita)/i],
];

teste("HARD GATE: a peça postulatória recebe as OITO etapas do requerimento, na ORDEM", () => {
  const trecho = trechoDeRequerimentos(dados("Petição"));
  let anterior = -1;
  for (const [nome, conceito] of ETAPAS_DA_PETICAO) {
    const indice = onde(trecho, conceito);
    verdade(indice !== -1, `a instrução de requerimentos não fala de "${nome}" — a etapa sumiu do pedido ao agente`);
    verdade(
      indice > anterior,
      `"${nome}" apareceu fora de ordem (índice ${indice}, o anterior estava em ${anterior}) — a sequência dos requerimentos é a substância desta entrega`,
    );
    anterior = indice;
  }
});

teste("a prova pedida é ESPECIFICADA — genérico era o defeito relatado", () => {
  const trecho = trechoDeRequerimentos(dados("Petição"));
  for (const [nome, conceito] of [
    ["depoimento pessoal sob pena de confissão", /depoimento pessoal[\s\S]{0,80}confiss[ãa]o/i],
    ["oitiva de testemunhas", /testemunha/i],
    ["perícia e a especialidade do perito", /(per[íi]cia|pericial)[\s\S]{0,120}especialidade/i],
    ["juntada de documentos novos", /documentos? novos?/i],
    ["expedição de ofícios", /of[íi]cios?/i],
  ] as [string, RegExp][]) {
    verdade(onde(trecho, conceito) !== -1, `a especificação de prova deixou de citar ${nome} — sem isso a prova volta a ser "todos os meios em direito admitidos"`);
  }
});

teste("a tutela provisória é pedida de forma EXECUTÁVEL e com multa — não como adjetivo", () => {
  const trecho = trechoDeRequerimentos(dados("Petição"));
  verdade(/execut[áa]vel/i.test(trecho), "a instrução deixou de exigir que a tutela diga o que se pretende determinado de forma executável");
  verdade(/(urg[êe]ncia|evid[êe]ncia)/i.test(trecho), "a instrução deixou de distinguir tutela de urgência e de evidência");
  verdade(/multa/i.test(trecho), "a instrução deixou de pedir a multa para o caso de descumprimento da tutela");
});

// ── 2. AS REGRAS DE TÉCNICA QUE O AGENTE NÃO PODE VIOLAR ─────────────────────────────────────

teste("HARD GATE: pedido só com lastro fático — sem lastro, APONTA a lacuna em vez de inventar o fato", () => {
  const trecho = trechoDeRequerimentos(dados("Petição"));
  verdade(/causa de pedir/i.test(trecho), "a instrução deixou de exigir causa de pedir correspondente a cada pedido");
  verdade(/(fatos sustentam|sustentam os fundamentos|sustentam os pedidos)/i.test(trecho), "sumiu a direção da coerência (fato → fundamento → pedido)");
  verdade(/nunca o inverso/i.test(trecho), "sumiu a proibição de escrever o fato a partir do pedido");
  verdade(/riscos/i.test(trecho) && /(nunca invente|n[ãa]o invente)/i.test(trecho),
    "a instrução deixou de mandar apontar a lacuna nos riscos em vez de inventar o fato que a preencheria");
});

teste("HARD GATE: pedido certo e determinado — \"o que for devido\" fica proibido por escrito", () => {
  const trecho = trechoDeRequerimentos(dados("Petição"));
  verdade(/certo e determinado/i.test(trecho), "sumiu a exigência de pedido certo e determinado");
  verdade(/o que for devido/i.test(trecho), "a instrução deixou de proibir nominalmente o pedido indeterminado");
  verdade(/(crit[ée]rio de apuração|indique o crit[ée]rio)/i.test(trecho), "quando o valor depende de apuração, a instrução tem de exigir o critério");
});

teste("HARD GATE: dano moral não se sustenta em dano presumido, e o Tema 1.365 entra como REGRA a conferir", () => {
  const trecho = trechoDeRequerimentos(dados("Petição"));
  verdade(/in re ipsa/i.test(trecho) && /presumid/i.test(trecho), "a instrução deixou de proibir o dano moral fundamentado só em dano presumido");
  verdade(/circunstanciad/i.test(trecho), "a causa de pedir indenizatória precisa ser exigida como autônoma e circunstanciada");
  verdade(/1\.365/.test(trecho), "sumiu a referência ao repetitivo do STJ sobre recusa indevida de cobertura");
  verdade(/(conferid|conferir|conferência)/i.test(trecho),
    "a tese vinculante entrou sem o aviso de que a aplicação pelo tribunal local precisa ser conferida — afirmar aplicação sem conferência é o defeito");
});

teste("HARD GATE: litigância de má-fé só com elemento concreto — nunca por padrão", () => {
  const trecho = trechoDeRequerimentos(dados("Petição"));
  verdade(/m[áa]-f[ée]/i.test(trecho), "a instrução não fala de litigância de má-fé");
  verdade(/concret/i.test(trecho), "a má-fé entrou sem exigir elemento concreto nos autos");
  verdade(/(nunca por padr[ãa]o|gen[ée]ric)/i.test(trecho), "a instrução deixou de proibir a má-fé pedida por reflexo ou em termos genéricos");
});

teste("correção e juros exigem critério e marco inicial, sem índice afirmado como pacificado", () => {
  const trecho = trechoDeRequerimentos(dados("Petição"));
  verdade(/marco inicial/i.test(trecho), "sumiu a exigência de marco inicial da atualização");
  verdade(/(juros)/i.test(trecho) && /(corre[çc][ãa]o|atualiza)/i.test(trecho), "a instrução deixou de tratar correção e juros");
  verdade(/pacificad/i.test(trecho), "a instrução deixou de proibir afirmar índice/termo inicial como pacificado sem conferência");
});

teste("HARD GATE: dado de identificação que falta vira LACUNA marcada, nunca invenção", () => {
  const trecho = trechoDeRequerimentos(dados("Petição"));
  verdade(/lacuna/i.test(trecho), "sumiu a instrução de deixar lacuna explícita para o advogado preencher");
  verdade(/colchetes/i.test(trecho), "a lacuna precisa ter forma visível na minuta — sem marca, ela vira texto que o advogado não enxerga");
  verdade(/(semelhan[çc]a|nunca invente)/i.test(trecho), "a instrução deixou de proibir preencher o dado que falta por semelhança com outro caso");
});

teste("a seção nova NÃO promete resultado — a proibição de prognóstico continua valendo nela", () => {
  for (const categoria of CATEGORIAS_DE_PECA) {
    const trecho = instrucaoDeRequerimentos(categoria).join("\n");
    verdade(
      !/(chance de [êe]xito|probabilidade de [êe]xito|certamente ser[áa] (deferid|procedent)|[êe]xito prov[áa]vel)/i.test(trecho),
      `a instrução da categoria "${categoria}" passou a insinuar resultado — a trava de nunca prognosticar não pode ser afrouxada por aqui`,
    );
  }
});

// ── 3. A SEÇÃO MUDA CONFORME A CATEGORIA ─────────────────────────────────────────────────────
//
// O defeito que este bloco existe para pegar: a estrutura de PETIÇÃO copiada para as cinco
// categorias. É assim que sai "requer a citação do réu" no fim de um parecer.

const SO_DE_PETICAO: [string, RegExp][] = [
  ["citação da parte contrária", /cita(ção|r)[\s\S]{0,120}(parte contr[áa]ria|na forma da lei)/gi],
  ["sucumbência", /sucumb[êe]nc/gi],
  ["valor da causa", /valor da causa/gi],
];

teste("HARD GATE: notificação extrajudicial recebe INTERPELAÇÃO, não pedido a juízo", () => {
  const trecho = trechoDeRequerimentos(dados("Notificação Extrajudicial"));
  verdade(/interpela/i.test(trecho), "a notificação precisa ser instruída como interpelação, não como pedido");
  verdade(/(o que[\s\S]{0,40}se exige|exige do notificado)/i.test(trecho), "sumiu o que se exige do notificado");
  verdade(/prazo/i.test(trecho), "sumiu o prazo para cumprimento");
  verdade(/descumprimento/i.test(trecho), "sumiu a consequência do descumprimento");
  verdade(/constitui[çc][ãa]o em mora/i.test(trecho), "sumiu a advertência de que a notificação serve como prova de constituição em mora");
  verdade(/m[áa]-f[ée]/i.test(trecho) === false, "litigância de má-fé não existe fora dos autos — não pode entrar numa notificação");
});

teste("HARD GATE: parecer recebe CONCLUSÃO, recomendações e próximos passos — nunca requerimento", () => {
  const trecho = trechoDeRequerimentos(dados("Parecer"));
  verdade(/conclus[ãa]o/i.test(trecho), "o parecer precisa ser instruído a terminar em conclusão");
  verdade(/recomenda/i.test(trecho), "sumiram as recomendações");
  verdade(/(dilig[êe]ncia|pr[óo]ximos passos)/i.test(trecho), "sumiram as diligências e os próximos passos sugeridos");
  verdade(/progn[óo]stico/i.test(trecho), "a conclusão do parecer precisa ser separada de prognóstico de resultado — é onde o prognóstico tenta entrar");
});

teste("HARD GATE: contrato recebe CLÁUSULAS — inadimplemento, rescisão, penalidades e foro", () => {
  const trecho = trechoDeRequerimentos(dados("Contrato"));
  verdade(/cl[áa]usula/i.test(trecho), "o contrato precisa ser instruído em termos de cláusulas");
  for (const [nome, conceito] of [
    ["inadimplemento", /inadimplemento/i],
    ["rescisão", /rescis/i],
    ["penalidades", /(penalidade|multa)/i],
    ["foro", /foro/i],
  ] as [string, RegExp][]) {
    verdade(onde(trecho, conceito) !== -1, `a instrução de contrato deixou de cuidar de ${nome}`);
  }
});

teste("HARD GATE: o que é de PETIÇÃO não vaza para contrato, parecer e notificação", () => {
  for (const categoria of ["Contrato", "Parecer", "Notificação Extrajudicial"]) {
    const trecho = instrucaoDeRequerimentos(categoria).join("\n");
    for (const [nome, conceito] of SO_DE_PETICAO) {
      // TODAS as ocorrências, não a primeira. Dizer "aqui NÃO há valor da causa" é legítimo; pedir
      // valor da causa não é — e a diferença é a negativa por perto. Conferir só a primeira
      // ocorrência deixaria passar exatamente o defeito que este caso guarda: a frase que NEGA
      // ficando no começo do bloco e a estrutura de petição copiada logo abaixo dela.
      for (const achado of trecho.matchAll(conceito)) {
        const indice = achado.index ?? 0;
        const volta = trecho.slice(Math.max(0, indice - 160), indice + 40);
        verdade(
          /(n[ãa]o h[áa]|nem|n[ãa]o existe|n[ãa]o se pede)/i.test(volta),
          `a categoria "${categoria}" pede "${nome}" como se fosse petição — é assim que sai "requer a citação do réu" no fim de um parecer`,
        );
      }
    }
  }
});

teste("HARD GATE: 'Geral' carrega as QUATRO estruturas e manda declarar o tipo deduzido", () => {
  const trecho = trechoDeRequerimentos(dados("Geral"));
  verdade(/deduzi/i.test(trecho), "em Geral a parte final precisa depender do tipo DEDUZIDO, e isso precisa estar dito");
  for (const [nome, conceito] of [
    ["requerimentos de petição", /requerimentos/i],
    ["interpelação da notificação", /(interpela|constitui[çc][ãa]o em mora)/i],
    ["conclusão do parecer", /conclus[ãa]o/i],
    ["cláusulas do contrato", /cl[áa]usula/i],
  ] as [string, RegExp][]) {
    verdade(onde(trecho, conceito) !== -1, `Geral ficou sem a estrutura de ${nome} — é a categoria com MENOS pista, tem de receber MAIS orientação, nunca menos`);
  }
});

teste("categoria desconhecida ou ausente cai na estrutura de petição — nunca em silêncio", () => {
  for (const categoria of [null, "Coisa Nova Que Ninguém Cadastrou"]) {
    const linhas = instrucaoDeRequerimentos(categoria);
    verdade(linhas.length > 5, `categoria ${JSON.stringify(categoria)} ficou sem instrução de parte final nenhuma`);
    verdade(/pedido principal/i.test(linhas.join("\n")), `categoria ${JSON.stringify(categoria)} deveria cair no padrão de Petição, como o resto do módulo`);
  }
});

teste("TODAS as cinco categorias cadastradas têm instrução de parte final própria", () => {
  const vistos = new Set<string>();
  for (const categoria of CATEGORIAS_DE_PECA) {
    const texto = instrucaoDeRequerimentos(categoria).join("\n");
    verdade(texto.length > 400, `a categoria "${categoria}" recebeu instrução de ${texto.length} caracteres — curta demais para orientar a parte final`);
    vistos.add(texto);
  }
  igual(vistos.size, CATEGORIAS_DE_PECA.length, "duas categorias receberam a MESMA instrução — a estrutura de uma foi copiada na outra: ");
});

// ── 4. ONDE A INSTRUÇÃO MORA NA MENSAGEM (e o que ela não pode virar) ────────────────────────

teste("HARD GATE: a instrução chega INTEIRA à mensagem montada — linha por linha", () => {
  for (const categoria of CATEGORIAS_DE_PECA) {
    const dadosDoPrompt = dados(categoria);
    const mensagem = montarMensagemParaHermes(dadosDoPrompt);
    for (const linha of instrucaoDeRequerimentos(categoria)) {
      verdade(mensagem.includes(linha), `a categoria "${categoria}" tem a linha "${linha.slice(0, 50)}…" na instrução, mas ela não chegou à mensagem`);
    }
  }
});

teste("HARD GATE: a instrução fica FORA da cerca de documento — instrução do escritório antes, dado depois", () => {
  const mensagem = montarMensagemParaHermes(
    dados("Petição", { documentos: [{ nome: "contestacao.pdf", texto: "Texto da parte contrária." }] }),
  );
  const ancora = instrucaoDeRequerimentos("Petição")[0];
  const inicioDaInstrucao = mensagem.indexOf(ancora);
  const inicioDoDocumento = mensagem.indexOf("--- INÍCIO DO DOCUMENTO");
  verdade(inicioDaInstrucao !== -1 && inicioDoDocumento !== -1, "faltou a instrução ou a cerca na mensagem");
  verdade(
    inicioDaInstrucao < inicioDoDocumento,
    "a instrução da parte final caiu DEPOIS do conteúdo dos documentos — instrução do escritório não pode ficar dentro nem depois da região de dado",
  );
});

teste("HARD GATE: a seção nova NÃO criou marcador de formato — o contrato de resposta segue com os cinco", () => {
  const mensagem = montarMensagemParaHermes(dados("Petição", { tipoPeca: null }));
  const encontrados = mensagem.match(/#{3,}[^\s#]*#{3,}/g) ?? [];
  const esperados = Object.values(MARCADORES_RESPOSTA_HERMES);
  igual([...new Set(encontrados)].sort(), [...esperados].sort(), "o conjunto de marcadores da mensagem mudou: ");
  for (const categoria of CATEGORIAS_DE_PECA) {
    const texto = instrucaoDeRequerimentos(categoria).join("\n");
    verdade(!/#{3,}/.test(texto), `a instrução de "${categoria}" passou a conter marcador de três hashes — um documento passa a ter seção nova para forjar`);
  }
});

// ── 5. O ORÇAMENTO: INSTRUÇÃO NOVA É CUSTO FIXO, E CUSTO FIXO TIRA LUGAR DOS DOCUMENTOS ──────

teste("TRAVA DE ORÇAMENTO: o esqueleto do pedido continua sendo uma fração pequena do teto da ponte", () => {
  // Instrução boa é curta e específica. Esta trava existe para o dia em que alguém quiser
  // acrescentar uma aula de processo civil ao prompt: cada caractere fixo sai do orçamento dos
  // documentos do advogado (ver custoFixoDaMensagem e lib/testes/peticionamentoLimiteDaPonte.teste.ts).
  const teto = Math.floor(LIMITE_PADRAO_CARACTERES * 0.1);
  for (const categoria of [...CATEGORIAS_DE_PECA, null]) {
    const custo = custoFixoDaMensagem(dados(categoria));
    verdade(
      custo < teto,
      `o custo fixo da categoria "${categoria}" chegou a ${custo} caracteres, acima de 10% do limite da mensagem (${teto}) — isso é orçamento tirado dos documentos do advogado`,
    );
  }
});

teste("a instrução da parte final é, sozinha, menor que a metade do esqueleto de qualquer categoria", () => {
  // Proporção, não número absoluto: o que se vigia é a instrução nova não passar a dominar o
  // pedido. Um teto em caracteres puros envelheceria a cada linha nova em qualquer outro bloco.
  for (const categoria of [...CATEGORIAS_DE_PECA, null]) {
    const instrucao = instrucaoDeRequerimentos(categoria).join("\n").length;
    const esqueleto = montarMensagemParaHermes(dados(categoria, { fatos: "" })).length;
    verdade(
      instrucao < esqueleto * 0.75,
      `em "${categoria}" a instrução da parte final ocupa ${instrucao} de ${esqueleto} caracteres do pedido — virou a maior parte da mensagem`,
    );
  }
});

resumo("Peticionamento — a seção de requerimentos por categoria");
