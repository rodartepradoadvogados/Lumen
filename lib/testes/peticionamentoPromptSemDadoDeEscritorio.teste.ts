import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";
import { montarMensagemParaHermes, instrucaoDeRequerimentos, type DadosParaPrompt } from "@/lib/peticionamentoPrompt";
import { CATEGORIAS_DE_PECA } from "@/lib/peticionamentoCategoriaPeca";

// ══════════════════════════════════════════════════════════════════════════════════════════
// lib/peticionamentoPrompt.ts É CÓDIGO DE PLATAFORMA.
//
// Ele roda para TODO escritório contratante do Lúmen, não só para o escritório que pediu a
// funcionalidade. Um nome de advogado, um número de inscrição, um endereço, um e-mail, uma comarca
// ou um tribunal escritos DENTRO deste prompt não ficam no escritório de origem: vão para a minuta
// de todos os outros escritórios, com a assinatura de um na peça do outro. É o defeito mais grave
// que este módulo pode produzir — pior que uma minuta ruim, porque uma minuta ruim o advogado vê.
//
// O que entra no prompt é ESTRUTURA e TÉCNICA processual, que valem para qualquer escritório. Dado
// de identificação vem do cadastro (matéria, categoria, contexto vinculado, campos do advogado) ou
// fica como LACUNA explícita para o advogado preencher.
//
// Duas frentes, e as duas precisam existir:
//   1. A MENSAGEM MONTADA DE VERDADE, com os campos do advogado vazios — o que resta ali é texto da
//      plataforma, e é ele que tem de estar limpo. Varredura de fonte não prova isto: alguém pode
//      montar o nome por concatenação, ou trazê-lo de outro módulo.
//   2. O ARQUIVO-FONTE sem comentários — pega a string escrita num campo novo que a montagem desta
//      suíte ainda não exercite.
//
// Mesmo desenho de lib/testes/peticionamentoManuaisSemNomes.teste.ts, que guarda a proibição
// gêmea (nome de skill/agente/modelo nos manuais da tela).
// ══════════════════════════════════════════════════════════════════════════════════════════

const RAIZ = process.cwd();
const FONTE_PROMPT = readFileSync(join(RAIZ, "lib", "peticionamentoPrompt.ts"), "utf8");

/**
 * O CONTRATO da proibição: cada padrão é uma forma de um dado de escritório aparecer no prompt.
 * Por PADRÃO, não por lista de nomes — uma lista de nomes só pega o escritório que alguém já
 * lembrou de proibir, e o próximo a vazar é sempre o que não estava na lista.
 */
const PADROES_DE_DADO_DE_ESCRITORIO: [string, RegExp][] = [
  // Inscrição de advogado. O prompt pode pedir o dado ("número de inscrição do advogado"), nunca
  // trazer um: a sigla só aparece quando alguém escreveu uma inscrição concreta aqui dentro.
  ["inscrição de advogado (OAB)", /\bOAB\b/i],
  ["número seguido de sigla de UF (ex.: inscrição 12345/XX)", /\b\d{2,6}\s*\/\s*[A-Z]{2}\b/],
  ["CEP", /\bCEP\b|\b\d{5}-\d{3}\b/],
  ["e-mail", /[\w.+-]+@[\w-]+\.[a-z]{2,}/i],
  ["telefone", /\(\d{2}\)\s*9?\d{4,5}-\d{4}/],
  ["CPF ou CNPJ", /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/],
  ["número de processo (padrão CNJ)", /\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/],
  ["sigla de tribunal", /\bTJ-?[A-Z]{2}\b|\bTR[TF]-?\d{1,2}\b/],
  ["comarca, vara ou juízo com nome próprio", /\b(Comarca|Vara|Ju[íi]zo|Foro)\s+(de|da|do)\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/],
  ["endereço com nome próprio", /\b(Rua|Avenida|Av\.|Alameda|Pra[çc]a|Edif[íi]cio|Sala|Bairro)\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/],
  ["site, domínio ou link", /https?:\/\/|\bwww\.|\.com\.br\b|\.adv\.br\b/i],
  // A palavra "escritório" em si NÃO entra na lista: o prompt fala dela em sentido genérico ("uso
  // interno do próprio cliente/escritório", em Geral), e proibir a palavra proibiria a categoria de
  // explicar a quem o documento se destina. O que vaza identidade é NOME, endereço, inscrição,
  // contato e comarca — não o substantivo comum.
  // Nomes próprios que já circulam nesta base. Não substituem os padrões acima — somam.
  ["nome próprio de escritório/cidade que já circula nesta base", /\b(rodarte|prado|goi[âa]nia|goi[áa]s|advogados associados|sociedade de advogados)\b/i],
];

function achaDadoDeEscritorio(texto: string): string | null {
  for (const [nome, padrao] of PADROES_DE_DADO_DE_ESCRITORIO) {
    const achado = texto.match(padrao);
    if (achado) return `${nome} → "${achado[0]}"`;
  }
  return null;
}

/**
 * O pedido com os CAMPOS DO ADVOGADO VAZIOS. O que sobra na mensagem é, por construção, texto da
 * plataforma — é exatamente o que precisa estar limpo. Medir a mensagem com os campos preenchidos
 * provaria o contrário do que interessa: o dado do escritório PODE vir pelos campos (é para isso
 * que eles existem), nunca pelo texto fixo.
 */
function pedidoSoComTextoDaPlataforma(categoriaPeca: string | null, extra: Partial<DadosParaPrompt> = {}): DadosParaPrompt {
  return {
    materias: [],
    categoriaPeca,
    tipoPeca: null,
    tipoPecaOutro: null,
    contextoDescricao: null,
    fatos: "",
    pedidos: [],
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

teste("HARD GATE: a mensagem enviada ao agente não carrega dado de escritório nenhum — nas cinco categorias", () => {
  for (const categoria of [...CATEGORIAS_DE_PECA, null]) {
    const mensagem = montarMensagemParaHermes(pedidoSoComTextoDaPlataforma(categoria));
    verdade(mensagem.length > 1_000, `a mensagem da categoria "${categoria}" saiu com ${mensagem.length} caracteres — varredura cega`);
    const achado = achaDadoDeEscritorio(mensagem);
    verdade(
      achado === null,
      `a mensagem da categoria "${categoria}" embute dado de um escritório: ${achado} — isso vaza a identidade de um escritório para a minuta de todos os outros`,
    );
  }
});

teste("HARD GATE: os blocos condicionais do prompt também estão limpos (prazo preclusivo, resumo, cerca de documento)", () => {
  // Cada `if` do montador é um trecho que a varredura acima não atravessa com os campos vazios.
  const variantes: [string, Partial<DadosParaPrompt>][] = [
    ["prazo preclusivo", { prazoFatal: "10/10/2026", prazoPreclusivo: true }],
    ["contexto resumido", { contextoFoiResumido: true, avisoDeResumo: "Resumimos um anexo." }],
    ["cerca de documento", { documentos: [{ nome: "anexo.pdf", texto: "Texto do anexo." }] }],
    ["tipo de peça inferido", { tipoPeca: null }],
  ];
  for (const [nome, extra] of variantes) {
    const mensagem = montarMensagemParaHermes(pedidoSoComTextoDaPlataforma("Petição", extra));
    const achado = achaDadoDeEscritorio(mensagem);
    verdade(achado === null, `o bloco "${nome}" embute dado de escritório: ${achado}`);
  }
});

teste("HARD GATE: a instrução da parte final, por categoria, é estrutura e técnica — nunca dado de escritório", () => {
  for (const categoria of [...CATEGORIAS_DE_PECA, null]) {
    const texto = instrucaoDeRequerimentos(categoria).join("\n");
    verdade(texto.length > 400, `a instrução da categoria "${categoria}" saiu com ${texto.length} caracteres — varredura cega`);
    const achado = achaDadoDeEscritorio(texto);
    verdade(achado === null, `a instrução de requerimentos da categoria "${categoria}" embute dado de escritório: ${achado}`);
  }
});

teste("HARD GATE: o ARQUIVO-FONTE do prompt, sem comentários, não tem dado de escritório escrito em string nenhuma", () => {
  const semComentarios = codigoDe(FONTE_PROMPT);
  verdade(semComentarios.length > 3_000, `lib/peticionamentoPrompt.ts sem comentários saiu com ${semComentarios.length} caracteres — varredura cega`);
  const achado = achaDadoDeEscritorio(semComentarios);
  verdade(
    achado === null,
    `lib/peticionamentoPrompt.ts embute dado de escritório: ${achado} — um campo novo com o dado de um escritório dentro chega a todos os outros`,
  );
});

teste("HARD GATE: o dado que falta fica como LACUNA para o advogado — não é inventado nem preenchido por semelhança", () => {
  // O outro lado da mesma moeda: proibir o dado no prompt só serve se o agente for instruído a
  // DEIXAR MARCADO o que falta. Sem isso a proibição empurra o modelo a inventar.
  for (const categoria of [...CATEGORIAS_DE_PECA, null]) {
    const texto = instrucaoDeRequerimentos(categoria).join("\n");
    // A palavra "lacuna" sozinha NÃO serve como prova: ela também aparece na regra de coerência
    // ("aponte a lacuna na seção de riscos"), e uma mutação que apagava a regra do DADO QUE FALTA
    // passou verde por aqui na rodada de mutação desta entrega. O que prova a regra certa é a
    // lacuna ter FORMA VISÍVEL na minuta (colchetes) e o dado de identificação estar nomeado.
    verdade(/lacuna/i.test(texto), `a categoria "${categoria}" não manda deixar lacuna explícita do dado que falta`);
    verdade(/colchetes/i.test(texto), `a categoria "${categoria}" não diz COMO marcar o dado que falta — sem marca visível, a lacuna vira texto que o advogado não enxerga`);
    verdade(/(qualifica[çc][ãa]o|endere[çc]o|inscri[çc][ãa]o)/i.test(texto), `a categoria "${categoria}" não nomeia que tipo de dado de identificação fica como lacuna`);
    verdade(/(nunca invente|n[ãa]o invente)/i.test(texto), `a categoria "${categoria}" não proíbe inventar o dado que falta`);
  }
});

teste("TRAVA: quem monta a mensagem não recebe nem lê campo de identificação de escritório", () => {
  // O tipo de entrada É a fronteira: se `DadosParaPrompt` ganhar um campo de nome/OAB/endereço de
  // escritório, o vazamento passa a ser possível sem nenhuma string suspeita no arquivo. Fixtures
  // antigos desta casa ainda passam `nomeDoEscritorio` por engano (com `as DadosParaPrompt`); o que
  // garante que aquilo não chega ao agente é o montador não ler campo nenhum desse tipo.
  const tipo = FONTE_PROMPT.slice(FONTE_PROMPT.indexOf("export type DadosParaPrompt"), FONTE_PROMPT.indexOf("};", FONTE_PROMPT.indexOf("export type DadosParaPrompt")));
  verdade(tipo.length > 300, `não achei a declaração de DadosParaPrompt (${tipo.length} caracteres) — varredura cega`);
  const achadoNoTipo = codigoDe(tipo).match(/\b(nomeDoEscritorio|escritorio|oab|endereco|cep|email|telefone|comarca|tribunal|advogadoNome)\b/i);
  igual(achadoNoTipo, null, "DadosParaPrompt ganhou campo de identificação de escritório — a fronteira do módulo abriu: ");

  const corpo = corpoDaFuncao(FONTE_PROMPT, "montarMensagemParaHermes");
  verdade(corpo.length > 1_000, `corpoDaFuncao("montarMensagemParaHermes") devolveu ${corpo.length} caracteres — varredura cega`);
  const achadoNoCorpo = corpo.match(/dados\.(nomeDoEscritorio|escritorio|oab|endereco|cep|email|telefone|comarca|tribunal)/i);
  igual(achadoNoCorpo, null, "o montador passou a ler um campo de identificação de escritório: ");
});

teste("a varredura de fato falha na presença de cada padrão — prova negativa, não só positiva", () => {
  // Sem este caso, uma lista de padrões furada (ou vazia por engano) faria todas as TRAVAS acima
  // passarem verdes provando zero coisa. Um exemplo por padrão, na ordem em que estão declarados.
  const exemplos = [
    "inscrito na OAB",
    "12345/GO",
    "CEP 74000-000",
    "contato@exemplo.adv.br",
    "(62) 99999-0000",
    "CNPJ 12.345.678/0001-99",
    "Processo nº 1234567-89.2026.8.09.0051",
    "distribuído ao TJGO",
    "Comarca de Goiânia",
    "Rua Exemplo, 100",
    "https://exemplo.com.br",
    "Rodarte Prado Advogados",
  ];
  igual(exemplos.length, PADROES_DE_DADO_DE_ESCRITORIO.length, "cada padrão proibido precisa de um exemplo que o exercite: ");
  exemplos.forEach((exemplo, i) => {
    const [nome, padrao] = PADROES_DE_DADO_DE_ESCRITORIO[i];
    verdade(padrao.test(exemplo), `o padrão "${nome}" não pegou o exemplo "${exemplo}" — está cego`);
    verdade(achaDadoDeEscritorio(exemplo) !== null, `achaDadoDeEscritorio não acusou "${exemplo}"`);
  });
  verdade(
    achaDadoDeEscritorio("Ordene os requerimentos: pedido principal, pedidos subsidiários, tutela provisória com multa.") === null,
    "falso positivo: instrução de estrutura processual acusada como dado de escritório",
  );
});

resumo("Peticionamento — o prompt é de plataforma: nenhum dado de escritório dentro");
