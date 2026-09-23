import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo } from "./executar";

// ══════════════════════════════════════════════════════════════════════════════════════════
// AS SKILLS DO HERMES SÃO DOCUMENTOS DE PLATAFORMA.
//
// Cada SKILL.md em `servidor-hermes/skills/` é carregada no perfil de QUALQUER escritório
// contratante do Lúmen. Um nome de escritório, uma inscrição de advogado, um endereço, um
// telefone, um número de processo ou um tribunal escritos DENTRO de uma skill não ficam no
// escritório que pediu a funcionalidade: chegam ao agente de todos os outros, e o agente os
// trata como verdade do caso que está atendendo. Numa skill de conflito de interesses isso é
// pior que numa peça — um nome de cliente vazado de um escritório para outro é quebra de sigilo,
// não defeito de redação.
//
// A mesma proibição, para o prompt de peticionamento, está em
// lib/testes/peticionamentoPromptSemDadoDeEscritorio.teste.ts. Esta suíte reaproveita os padrões
// de lá, com duas diferenças deliberadas, documentadas onde ocorrem:
//
//   1. A LIÇÃO REGISTRADA LÁ vale aqui inteira: a primeira versão daquela suíte proibia a SIGLA
//      do tribunal e deixava passar o NOME POR EXTENSO. Os dois padrões (sigla e extenso) estão
//      abaixo, e a lista ainda ganhou "unidade da federação nomeada" — porque estas skills servem
//      o Brasil inteiro, e fixar um estado presume rito e competência que não são de todo mundo.
//   2. A SIGLA "OAB" SOZINHA NÃO PODE SER PROIBIDA AQUI. Lá ela é proibida porque o prompt de
//      peticionamento não tem motivo nenhum para escrevê-la. Aqui uma das skills analisa
//      conformidade ao Provimento 205/2021 da ordem profissional, e o nome da própria skill é
//      `etica-oab-publicidade`: proibir a sigla proibiria a skill de existir. O que vaza
//      identidade é a INSCRIÇÃO (número, ou seccional com sigla de UF), não o nome da entidade —
//      então os dois primeiros padrões abaixo exigem o que só uma inscrição concreta tem.
//
// NÃO SE USA `codigoDe()` NESTA SUÍTE. Aquela função descarta linhas que começam com "//", "*" ou
// "/*", para não deixar comentário de TypeScript satisfazer uma varredura. Em Markdown não há
// comentário, e linha começando com "*" é ênfase — em particular, TODAS as linhas de regra da casa
// destas skills começam com "**". Passar o Markdown por `codigoDe()` apagaria exatamente as linhas
// que esta suíte precisa ler, e as travas de conteúdo abaixo passariam verdes com o texto ausente.
// A varredura aqui é sobre o arquivo cru, de propósito.
// ══════════════════════════════════════════════════════════════════════════════════════════

const RAIZ = process.cwd();

/**
 * Todas as skills de plataforma do Hermes, pelo nome do diretório — que é também o `name` do
 * cabeçalho. As três primeiras são do lote 1 (conflict check, ética na publicidade e pesquisa de
 * jurisprudência); as quatro seguintes são do lote 2 (análise de sentença, análise de risco
 * processual, preparação de audiências e revisão de contratos); as quatro seguintes são do lote 3
 * (análise de legislação, diagnóstico de LGPD do próprio escritório, onboarding de cliente e
 * precificação de honorários); as quatro últimas são do lote 4 (qualificação de perfil financeiro,
 * follow-up inteligente, pós-venda e satisfação, e conteúdo de autoridade) — o lote que tangencia
 * captação de clientela em todas as quatro peças, e por isso é o que mais depende da
 * `etica-oab-publicidade` como eixo, não como nota de rodapé. Nova skill de plataforma entra nesta
 * lista — é o que estende as travas gerais abaixo (sem dado de escritório, quatro regras da casa,
 * convenção de cabeçalho) a ela também.
 */
const SKILLS = [
  "conflict-check",
  "etica-oab-publicidade",
  "pesquisa-jurisprudencia",
  "analise-sentenca",
  "analise-risco-processual",
  "preparacao-audiencias",
  "revisao-contratos",
  "analise-legislacao",
  "lgpd-escritorio",
  "onboarding-cliente",
  "precificacao-honorarios",
  "qualificacao-perfil-financeiro",
  "follow-up-inteligente",
  "pos-venda-satisfacao",
  "conteudo-autoridade",
  "resumo-pecas",
  "usar-o-lumen",
  "comunicados-clientes",
] as const;

function caminhoDa(skill: string): string {
  return join(RAIZ, "servidor-hermes", "skills", skill, "SKILL.md");
}

function textoDa(skill: string): string {
  return readFileSync(caminhoDa(skill), "utf8");
}

/** Onde fecha o cabeçalho `---` do arquivo. */
function fimDoCabecalho(texto: string): number {
  const fim = texto.indexOf("\n---", 4);
  if (fim < 0) throw new Error("SKILL.md sem cerca de fechamento do cabeçalho");
  return fim + 4;
}

/**
 * O CORPO da skill, sem o cabeçalho.
 *
 * ACHADO DA RODADA DE MUTAÇÃO DESTA ENTREGA: apagar `**Reprovado.**` da seção de classificação de
 * `etica-oab-publicidade` deixava esta suíte VERDE — porque a `description` do cabeçalho anuncia
 * "classificação em apto, precisa de ajustes ou reprovado", e a varredura no arquivo inteiro
 * encontrava ali a palavra que o corpo tinha perdido. É o mesmo defeito que `codigoDe()` resolve
 * no TypeScript (o comentário que explica a trava satisfaz a busca pela trava), na versão Markdown:
 * o cabeçalho que ANUNCIA a regra satisfaz a busca pela regra. Quem manda no agente na hora de
 * classificar é o corpo; o cabeçalho serve para a skill ser escolhida. As travas de conteúdo leem
 * o corpo.
 */
function corpoDa(skill: string): string {
  const texto = textoDa(skill);
  return texto.slice(fimDoCabecalho(texto));
}

/**
 * UMA seção `##` do corpo, do título dela até o próximo `##`.
 *
 * Mesma razão de `corpoDaFuncao` em ./executar: varrer o arquivo inteiro deixa a palavra procurada
 * ser encontrada na seção vizinha, e a seção examinada pode ter perdido o que se vigia. Devolve ""
 * quando a seção não existe — e quem chama confere isso, porque busca dentro de string vazia nunca
 * acha nada e sempre passa.
 */
function semQuebra(texto: string): string {
  // As travas de CONTEÚDO leem o texto com o espaço em branco normalizado. Sem isso elas dependem
  // de onde a linha do Markdown quebrou: "o que precisa ser\nverificado" faz uma busca por
  // "precisa ser verificado" falhar num arquivo que diz exatamente isso, e — pior — faz uma
  // mutação que apaga a frase passar verde se a frase reaparecer noutro ponto sem quebra. Isto
  // NÃO se aplica à varredura de dado de escritório, que lê o arquivo cru: juntar linhas lá
  // criaria vizinhanças que não existem no texto e produziria acusação falsa.
  return texto.replace(/\s+/g, " ");
}

function secaoDoCorpo(corpo: string, titulo: RegExp): string {
  const linhas = corpo.split("\n");
  const inicio = linhas.findIndex((l) => /^##\s/.test(l) && titulo.test(l));
  if (inicio < 0) return "";
  let fim = linhas.findIndex((l, k) => k > inicio && /^##\s/.test(l));
  if (fim < 0) fim = linhas.length;
  return linhas.slice(inicio, fim).join("\n");
}

/**
 * O CONTRATO da proibição: cada padrão é uma FORMA de um dado de escritório aparecer numa skill.
 * Por padrão, e não por lista de nomes — uma lista de nomes só pega o escritório que alguém já
 * lembrou de proibir, e o próximo a vazar é sempre o que não estava na lista.
 */
const PADROES_DE_DADO_DE_ESCRITORIO: [string, RegExp][] = [
  // Inscrição de advogado com SECCIONAL: "OAB/XX". A entidade pode ser nomeada; a seccional não,
  // porque ela é um estado, e estas skills não têm estado.
  ["inscrição/seccional com sigla de UF (ex.: OAB/XX)", /\bOAB\s*[/\-–]\s*[A-Z]{2}\b/],
  // Inscrição de advogado com NÚMERO. "a inscrição do advogado" (sem número) é justamente o que a
  // skill PODE dizer — é a referência genérica ao dado que vem do cadastro.
  ["número de inscrição de advogado", /\b(OAB|inscri[çc][ãa]o)\s+(sob\s+o\s+)?(n[º°o]\.?\s*)?\d{3,6}\b/i],
  ["número seguido de sigla de UF (ex.: 12345/XX)", /\b\d{2,6}\s*\/\s*[A-Z]{2}\b/],
  ["CEP", /\bCEP\b|\b\d{5}-\d{3}\b/],
  ["e-mail", /[\w.+-]+@[\w-]+\.[a-z]{2,}/i],
  ["telefone", /\(\d{2}\)\s*9?\d{4,5}-\d{4}/],
  ["CPF ou CNPJ", /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/],
  ["número de processo (padrão CNJ)", /\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/],
  ["sigla de tribunal", /\bTJ-?[A-Z]{2}\b|\bTR[TFE]-?\d{0,2}\b|\bST[JFM]\b|\bTST\b|\bTSE\b/],
  // A LIÇÃO DA SUÍTE GÊMEA: a sigla estava proibida, o nome por extenso não. Os dois entram.
  ["tribunal nomeado por extenso", /\bTribunal\s+(de\s+Justi[çc]a|Regional|Superior|de\s+Contas|Militar|Eleitoral)\b/i],
  ["corte, câmara ou turma nomeada", /\b(Supremo\s+Tribunal|Superior\s+Tribunal|C[âa]mara\s+C[íi]vel|Turma\s+Recursal|Corte\s+Especial|Tribunal\s+Pleno)\b/i],
  ["comarca, vara, juízo ou foro com nome próprio", /\b(Comarca|Vara|Ju[íi]zo|Foro|Se[çc][ãa]o\s+Judici[áa]ria)\s+(de|da|do)\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/],
  ["endereço com nome próprio", /\b(Rua|Avenida|Av\.|Alameda|Pra[çc]a|Edif[íi]cio|Sala|Bairro|Conjunto|Quadra|Lote)\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/],
  ["site, domínio ou link", /https?:\/\/|\bwww\.|\.com\.br\b|\.adv\.br\b/i],
  // ACHADO DA REVISÃO — não havia padrão NENHUM para caminho de máquina, e é justamente o defeito
  // que a skill de plataforma irmã (lumen-padrao-de-arquivos) nasceu para consertar: a original
  // dela trazia `H:\Meu Drive\Lúmen`, o disco do dono. Uma skill de plataforma que ensine um
  // caminho de máquina manda TODO escritório contratante salvar num lugar que só existe num
  // computador — e o agente, que roda no servidor, nem esse tem.
  //
  // Os três formatos entram juntos de propósito: proibir só o do Windows deixaria o de Unix
  // passar, que foi exatamente o que aconteceu quando sondei esta suíte.
  ["caminho de máquina Windows", /\b[A-Za-z]:\\/],
  ["caminho de máquina Unix", /(^|\s|`)\/(home|Users|root|mnt|media)\//],
  ["caminho de rede UNC", /\\\\[A-Za-z0-9._-]+\\/],
  // ACRÉSCIMO DESTA ENTREGA — as skills servem o Brasil inteiro. Um estado nomeado dentro de uma
  // skill de plataforma presume competência, rito e seccional que valem para uma fração dos
  // contratantes; o agente do escritório de outro estado obedeceria a presunção errada em silêncio.
  [
    "unidade da federação nomeada",
    /\b(Acre|Alagoas|Amap[áa]|Amazonas|Bahia|Cear[áa]|Distrito\s+Federal|Esp[íi]rito\s+Santo|Goi[áa]s|Maranh[ãa]o|Mato\s+Grosso|Minas\s+Gerais|Par[áâ]|Para[íi]ba|Paran[áa]|Pernambuco|Piau[íi]|Rio\s+de\s+Janeiro|Rio\s+Grande\s+do\s+(Sul|Norte)|Rond[ôo]nia|Roraima|Santa\s+Catarina|S[ãa]o\s+Paulo|Sergipe|Tocantins)\b/,
  ],
  // Sensível à caixa DE PROPÓSITO: "escritório luxoso" é exemplo legítimo de ostentação na skill de
  // publicidade; "Escritório Exemplo" é um escritório nomeado. Sob /i, a classe [A-Z] pegaria os
  // dois e o padrão viraria uma proibição da palavra.
  ["escritório, banca ou sociedade com nome próprio", /\b(Escrit[óo]rio|Banca|Sociedade)\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-zá-úçãõâêô]{2,}/],
  ["advogado nomeado", /\b(Dr\.|Dra\.)\s*[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/],
  // Nomes próprios que já circulam nesta base. Não substituem os padrões acima — somam.
  ["nome próprio de escritório/cidade que já circula nesta base", /\b(rodarte|prado|goi[âa]nia|advogados\s+associados|sociedade\s+de\s+advogados)\b/i],
];

function achaDadoDeEscritorio(texto: string): string | null {
  for (const [nome, padrao] of PADROES_DE_DADO_DE_ESCRITORIO) {
    const achado = texto.match(padrao);
    if (achado) return `${nome} → "${achado[0]}"`;
  }
  return null;
}

// ──────────────────────────────────────────────────────────────────────────────────────────
// A TRAVA PRINCIPAL DESTA ENTREGA
// ──────────────────────────────────────────────────────────────────────────────────────────

teste("HARD GATE: nenhuma das skills de plataforma do Hermes carrega dado de escritório", () => {
  for (const skill of SKILLS) {
    const texto = textoDa(skill);
    verdade(texto.length > 8_000, `${skill}/SKILL.md saiu com ${texto.length} caracteres — varredura cega`);
    const achado = achaDadoDeEscritorio(texto);
    verdade(
      achado === null,
      `servidor-hermes/skills/${skill}/SKILL.md embute dado de um escritório: ${achado} — isso chega ao agente de TODO escritório contratante`,
    );
  }
});

teste("a varredura de fato falha na presença de cada padrão — prova negativa, não só positiva", () => {
  // Sem este caso, uma lista de padrões furada (ou vazia por engano) faria a trava acima passar
  // verde provando zero coisa. Um exemplo por padrão, na ordem em que estão declarados.
  const exemplos = [
    "inscrito na OAB/GO",
    "OAB 123456",
    "12345/GO",
    "CEP 74000-000",
    "contato@exemplo.adv.br",
    "(62) 99999-0000",
    "CNPJ 12.345.678/0001-99",
    "Processo nº 1234567-89.2026.8.09.0051",
    "distribuído ao TJGO",
    "Enderece ao Tribunal de Justiça do Estado de Minas Gerais",
    "julgado pela Câmara Cível competente",
    "Comarca de Goiânia",
    "Rua Exemplo, 100",
    "https://exemplo.com.br",
    // Os três da revisão: não havia padrão nenhum para caminho de máquina.
    "salve em H:\\Meu Drive\\Lumen",
    "salve em /home/usuario/Documentos",
    "salve em \\\\servidor\\compartilhada",
    "o rito aplicável em Santa Catarina",
    "Escritório Exemplo advocacia",
    "assinado pelo Dr. Fulano",
    "Rodarte Prado Advogados",
  ];
  igual(exemplos.length, PADROES_DE_DADO_DE_ESCRITORIO.length, "cada padrão proibido precisa de um exemplo que o exercite: ");
  exemplos.forEach((exemplo, i) => {
    const [nome, padrao] = PADROES_DE_DADO_DE_ESCRITORIO[i];
    verdade(padrao.test(exemplo), `o padrão "${nome}" não pegou o exemplo "${exemplo}" — está cego`);
    verdade(achaDadoDeEscritorio(exemplo) !== null, `achaDadoDeEscritorio não acusou "${exemplo}"`);
  });

  // Falsos positivos que precisariam passar: o vocabulário LEGÍTIMO destas skills.
  const legitimos = [
    "a inscrição do advogado responde disciplinarmente",
    "a skill etica-oab-publicidade analisa a peça sob o Provimento 205/2021",
    "confirme no sítio oficial do tribunal prolator e em fonte secundária confiável",
    "vedada a ostentação de bens, como escritório luxuoso usado como argumento",
    "o juízo competente vem do contexto do caso, não desta skill",
    "Advogado que descobre a divergência na contestação perdeu a escolha",
  ];
  for (const frase of legitimos) {
    igual(achaDadoDeEscritorio(frase), null, `falso positivo em texto legítimo de skill ("${frase}"): `);
  }
});

teste("HARD GATE: o dado do escritório é CONSULTADO no Lúmen, nunca escrito na skill", () => {
  // O outro lado da mesma moeda: proibir o dado só serve se a skill disser de onde ele vem. Sem
  // isso, a proibição empurra o agente a inventar — que é o defeito que ela deveria evitar.
  for (const skill of ["conflict-check", "etica-oab-publicidade"]) {
    const texto = semQuebra(corpoDa(skill));
    verdade(/L[úu]men/.test(texto), `${skill} não manda consultar o Lúmen em lugar nenhum`);
    verdade(
      /(consult[ae]|consultando|consultar)[^.\n]{0,80}L[úu]men/i.test(texto) || /L[úu]men[^.\n]{0,80}(consult|cruzament)/i.test(texto),
      `${skill} menciona o Lúmen mas não instrui o agente a CONSULTÁ-LO`,
    );
    verdade(/(nunca|n[ãa]o)\s+(presum|invent|suponha|pela sua mem[óo]ria|presuma)/i.test(texto), `${skill} não proíbe presumir/inventar o dado que deveria vir do Lúmen`);
  }
});

// ──────────────────────────────────────────────────────────────────────────────────────────
// AS QUATRO REGRAS DA CASA — em TODAS as skills de plataforma, e de forma pertinente ao assunto de cada uma
// ──────────────────────────────────────────────────────────────────────────────────────────

/**
 * Cada regra é medida por MAIS DE UM SINAL, porque a frase-título sozinha é fácil de manter
 * enquanto o conteúdo dela vai embora. Uma skill que só escreve "validação dupla obrigatória" e
 * não diz quais são as duas fontes não deu ao agente passo executável nenhum.
 */
const REGRAS_DA_CASA: [string, RegExp[]][] = [
  [
    "regra 1 — validação dupla de jurisprudência (oficial + fonte secundária, e sinalizar quando não der)",
    [
      /(valida[çc][ãa]o dupla|dupla valida[çc][ãa]o|dupla confer[êe]ncia|confer[êe]ncia dupla)/i,
      /(s[íi]tio|site)\s+oficial/i,
      /(Conjur|Migalhas|Jusbrasil)/i,
      /(sinaliz|explicitamente|com todas as letras|n[ãa]o confirmad)/i,
      /(n[ãa]o\s+(é\s+citado|cite)|n[ãa]o\s+citar|n[ãa]o\s+afirme)/i,
    ],
  ],
  [
    "regra 2 — resposta objetiva e informativa, fundamentação precisa, sem formatação excessiva",
    [/objetiv[ao]/i, /informativ[ao]/i, /(fundamenta[çc][ãa]o precisa|precis[ãa]o)/i, /sem\s+formata[çc][ãa]o\s+excessiva/i],
  ],
  [
    "regra 3 — conflict check antes de aceitar caso novo",
    [/conflict[\s-]*check/i, /antes\s+de\s+aceitar/i, /caso\s+novo/i],
  ],
  [
    "regra 4 — publicidade e marketing jurídico sob o Provimento 205/2021",
    [/Provimento\s*205\s*\/\s*2021/i, /(publicidade|marketing|divulga[çc][ãa]o)/i],
  ],
];

teste("HARD GATE: as quatro regras da casa estão em TODAS as skills, com conteúdo e não só com o título", () => {
  for (const skill of SKILLS) {
    const texto = textoDa(skill);
    for (const [regra, sinais] of REGRAS_DA_CASA) {
      for (const sinal of sinais) {
        verdade(sinal.test(semQuebra(texto)), `${skill} perdeu a ${regra} — o sinal ${sinal} não aparece no arquivo`);
      }
    }
  }
});

// ──────────────────────────────────────────────────────────────────────────────────────────
// CLASSIFICAÇÃO DO RESULTADO — cada skill tem de encerrar em rótulo nomeado, com o que fazer
// ──────────────────────────────────────────────────────────────────────────────────────────

teste("HARD GATE: conflict-check classifica em direto, potencial e sem indício, e diz o que fazer em cada um", () => {
  const texto = semQuebra(textoDa("conflict-check"));
  const secao = semQuebra(secaoDoCorpo(corpoDa("conflict-check"), /classifica/i));
  verdade(secao.length > 800, `a seção de classificação de conflict-check saiu com ${secao.length} caracteres — varredura cega`);
  for (const rotulo of [/conflito\s+direto/i, /conflito\s+potencial/i, /sem\s+ind[íi]cio/i]) {
    verdade(rotulo.test(secao), `conflict-check perdeu a classificação ${rotulo} da seção que classifica`);
  }
  // O rótulo sem a conduta é etiqueta. Cada um precisa de destino, e o destino fica na mesma seção.
  verdade(/recus/i.test(secao), "conflict-check não diz que o conflito direto leva à recusa");
  verdade(/(precisa ser verificado|o que precisa ser verificado|verificar)/i.test(secao), "conflict-check não diz o que fazer no conflito potencial");
  verdade(/registr/i.test(secao), "conflict-check não manda registrar o resultado do sem indício");
  // A dúvida não é simétrica, e isso é o coração ético da skill.
  verdade(/d[úu]vida[^.\n]{0,40}recus/i.test(texto), "conflict-check não resolve a dúvida pela recusa");
  verdade(/decis[ãa]o\s+(final\s+)?(é\s+d[oe]|d[oe])\s+advogad/i.test(texto), "conflict-check não diz que a decisão final é do advogado");
});

teste("HARD GATE: conflict-check exige os três itens de entrada e roda os três testes", () => {
  const texto = semQuebra(corpoDa("conflict-check"));
  // Os três itens de entrada, e a parada sem eles.
  verdade(/Item\s*1/i.test(texto) && /Item\s*2/i.test(texto) && /Item\s*3/i.test(texto), "conflict-check não enumera os três itens de entrada");
  verdade(/n[ãa]o\s+come[çc]a/i.test(texto), "conflict-check não diz que sem os três itens o trabalho não começa");
  // Contrapartes indiretas, nomeadas uma a uma — a pergunta aberta não produz a lista.
  for (const indireta of [/grupo\s+econ[ôo]mico/i, /seguradora/i, /estipulante/i, /corresponsável|corespons[áa]vel|corresponsavel/i]) {
    verdade(indireta.test(texto), `conflict-check não nomeia a contraparte indireta ${indireta}`);
  }
  // Os três testes.
  verdade(/conflito\s+formal|Teste\s*1/i.test(texto), "conflict-check perdeu o teste formal");
  verdade(/Teste\s*2[^\n]{0,60}grupo\s+econ[ôo]mico/i.test(texto), "conflict-check perdeu o teste de grupo econômico");
  verdade(/Teste\s*3[^\n]{0,60}informa[çc][ãa]o\s+privilegiada/i.test(texto), "conflict-check perdeu o teste de informação privilegiada");
  // Falta de dado não é ausência de conflito — a confusão que transforma erro de base em liberação.
  verdade(/inconclusiv/i.test(texto), "conflict-check não trata a consulta incompleta como inconclusiva");
});

teste("HARD GATE: etica-oab-publicidade classifica em apto, precisa de ajustes e reprovado", () => {
  const secao = semQuebra(secaoDoCorpo(corpoDa("etica-oab-publicidade"), /classifica/i));
  verdade(secao.length > 800, `a seção de classificação de etica-oab-publicidade saiu com ${secao.length} caracteres — varredura cega`);
  for (const rotulo of [/\bapto\b/i, /precisa\s+de\s+ajustes/i, /\breprovad[oa]\b/i]) {
    verdade(rotulo.test(secao), `etica-oab-publicidade perdeu a classificação ${rotulo} da seção que classifica`);
  }
  verdade(/(reda[çc][ãa]o\s+substituta|ajuste\s+nomeado|troque)/i.test(secao), "em 'precisa de ajustes' o ajuste tem de vir nomeado, não pedido em abstrato");
  verdade(/motivo/i.test(secao), "em 'reprovado' o motivo tem de vir dito");
});

teste("HARD GATE: etica-oab-publicidade cobre os eixos do provimento e o checklist por suporte", () => {
  const texto = semQuebra(corpoDa("etica-oab-publicidade"));
  const eixos: RegExp[] = [
    /mercantiliza[çc][ãa]o/i,
    /capta[çc][ãa]o\s+de\s+clientela/i,
    /promessa\s+de\s+resultado/i,
    /(valores\s+de\s+honor[áa]rios|honor[áa]rios)/i,
    /cas[o]s?\s+concret[o]s?/i,
    /depoimento\s+de\s+cliente/i,
    /impulsionamento/i,
  ];
  for (const eixo of eixos) verdade(eixo.test(texto), `etica-oab-publicidade não trata do eixo ${eixo}`);

  const suportes: RegExp[] = [/rede\s+social/i, /\bsite\b/i, /an[úu]ncio/i, /impress[oa]/i];
  for (const suporte of suportes) verdade(suporte.test(texto), `etica-oab-publicidade não tem checklist para o suporte ${suporte}`);

  // A cautela com número de dispositivo é a regra 1 aplicada ao próprio provimento.
  verdade(/n[ãa]o\s+afirme\s+n[úu]mero\s+de\s+artigo/i.test(texto), "etica-oab-publicidade não proíbe afirmar número de artigo sem conferência");
  verdade(/(n[ãa]o\s+foi\s+confirmad|dispositivo\s+n[ãa]o\s+confirmado|n[ãa]o\s+foi\s+possível\s+confer)/i.test(texto), "etica-oab-publicidade não sinaliza o que não conseguiu confirmar");
  verdade(/(alterad|revogad|suspens)/i.test(texto), "etica-oab-publicidade não manda conferir se o provimento segue vigente");
});

teste("HARD GATE: pesquisa-jurisprudencia é um roteiro executável, não uma boa intenção", () => {
  const texto = semQuebra(corpoDa("pesquisa-jurisprudencia"));
  // Strings de busca.
  for (const item of [/sin[ôo]nimo/i, /operador/i, /recorte\s+temporal/i, /recorte\s+de\s+[óo]rg[ãa]o/i, /exclus[ãa]o/i]) {
    verdade(item.test(texto), `pesquisa-jurisprudencia não ensina ${item} na montagem da busca`);
  }
  // A ordem da pesquisa.
  verdade(/base\s+prim[áa]ria/i.test(texto), "pesquisa-jurisprudencia perdeu a base primária da ordem de pesquisa");
  verdade(/fonte\s+secund[áa]ria/i.test(texto), "pesquisa-jurisprudencia perdeu a fonte secundária da ordem de pesquisa");
  verdade(/independente/i.test(texto), "pesquisa-jurisprudencia não exige que as duas fontes sejam independentes entre si");
  // O protocolo passo a passo, e a falha.
  verdade(/passo\s+a\s+passo/i.test(texto), "pesquisa-jurisprudencia não apresenta o protocolo passo a passo");
  verdade(/(quando\s+a\s+valida[çc][ãa]o\s+falha|valida[çc][ãa]o\s+falha)/i.test(texto), "pesquisa-jurisprudencia não diz o que fazer quando a validação falha");
  verdade(/(n[ãa]o\s+localizei|n[ãa]o\s+foi\s+localizado|n[ãa]o\s+achei)/i.test(texto), "pesquisa-jurisprudencia não dá a redação da sinalização de falha");
  // Verificação de divergência.
  verdade(/diverg[êe]ncia/i.test(texto), "pesquisa-jurisprudencia perdeu a verificação de divergência");
  verdade(/dominante[^.\n]{0,60}contr[áa]rio|contr[áa]rio[^.\n]{0,60}dominante/i.test(texto), "pesquisa-jurisprudencia não manda procurar entendimento dominante em sentido contrário");
  verdade(/relate[^.\n]{0,60}advogado|relat[áa]-lo|relate-o/i.test(texto), "pesquisa-jurisprudencia não manda relatar a divergência ao advogado");
  // Mapa argumentativo.
  verdade(/teses\s+a\s+favor/i.test(texto), "pesquisa-jurisprudencia perdeu as teses a favor do mapa argumentativo");
  verdade(/teses\s+contra/i.test(texto), "pesquisa-jurisprudencia perdeu as teses contra do mapa argumentativo");
  verdade(/precedentes?-chave/i.test(texto), "pesquisa-jurisprudencia perdeu os precedentes-chave de cada lado");
  // A regra explícita, que é a razão de ser da skill.
  verdade(/precedente\s+n[ãa]o\s+validado[^.\n]{0,40}n[ãa]o\s+(é|e)\s+citad/i.test(texto), "pesquisa-jurisprudencia perdeu a regra 'precedente não validado não é citado'");
  verdade(/(descrever\s+a\s+tese\s+sem\s+n[úu]mero|tese\s+sem\s+n[úu]mero)/i.test(texto), "pesquisa-jurisprudencia não manda preferir a tese sem número a um número inventado");
  // Jurisdição: o Brasil inteiro, sem presumir estado/tribunal/rito.
  verdade(/n[ãa]o\s+presuma/i.test(texto), "pesquisa-jurisprudencia não proíbe presumir estado, tribunal ou rito");
});

// ──────────────────────────────────────────────────────────────────────────────────────────
// PRAZO EM analise-sentenca — o único erro desta pasta que não tem conserto depois
// ──────────────────────────────────────────────────────────────────────────────────────────

/**
 * Recorta uma seção de nível `##` pelo TÍTULO, terminando no próximo `##`.
 *
 * NÃO é janela de caracteres, e a diferença é a armadilha registrada em `executar.ts`: uma fatia
 * por número de caracteres escorrega para a seção vizinha e passa a "provar" o que está escrito
 * do lado. Aqui o fim do recorte é o próximo cabeçalho, que é o limite real da seção — se a
 * redação crescer ou encurtar, o recorte continua certo.
 */
function secaoDe(texto: string, titulo: string): string {
  const linhas = texto.split("\n");
  const inicio = linhas.findIndex((l) => l.startsWith("## ") && l.includes(titulo));
  if (inicio < 0) return "";
  const resto = linhas.slice(inicio + 1);
  const fim = resto.findIndex((l) => l.startsWith("## "));
  return (fim < 0 ? resto : resto.slice(0, fim)).join("\n");
}

/**
 * POR QUE ESTE GUARDA EXISTE, e vale registrar porque o defeito foi real.
 *
 * A primeira versão desta skill se contradizia sobre prazo: um passo mandava dizer "até quando o
 * prazo corre", e o passo seguinte proibia afirmar o número de dias de memória. Uma skill não pode
 * obedecer aos dois, e o FORMATO DA SAÍDA decidia qual venceria — o bloco de prazo pedia "o marco
 * usado, a contagem", uma data apresentada como fato, e a ressalva não aparecia em nenhum dos seis
 * blocos. Na prática o advogado leria uma data calculada, com o prazo em dias vindo da memória do
 * agente. Prazo em dias errado é PERDA DE PRAZO: o único erro desta pasta que não tem conserto
 * depois e que responde na esfera disciplinar e civil.
 *
 * Por isso a trava não fica só no corpo do texto, onde uma reescrita a apagaria sem ninguém notar:
 * ela confere TAMBÉM o bloco de prazo do formato da saída, que é o que chega à tela.
 *
 * AS ASSERÇÕES ACEITAM VARIANTES DE REDAÇÃO de propósito. Guarda preso a UMA grafia já bloqueou,
 * neste repositório, exatamente a correção que devia proteger — três vezes.
 */
teste("HARD GATE: em analise-sentenca a data do prazo nunca sai sozinha — nem no corpo, nem no formato da saída", () => {
  const texto = textoDa("analise-sentenca");

  // ── O CORPO ──────────────────────────────────────────────────────────────────────────────
  const prazo = secaoDe(texto, "Passo 4");
  verdade(prazo.length > 400, `a seção de prazo de analise-sentenca saiu com ${prazo.length} caracteres — varredura cega`);

  verdade(
    /(n[ãa]o\s+afirme[^.\n]{0,90}de\s+mem[óo]ria|sem\s+afirmar[^.\n]{0,90}de\s+mem[óo]ria|n[ãa]o[^.\n]{0,70}dias[^.\n]{0,50}de\s+mem[óo]ria)/i.test(prazo),
    "analise-sentenca não proíbe mais afirmar o prazo em dias de memória",
  );
  verdade(
    /prazo\s+em\s+dias/i.test(prazo),
    "analise-sentenca não exige que a data venha acompanhada do prazo em dias que a produziu",
  );
  verdade(
    /(origem|conferid|confirm)/i.test(prazo),
    "analise-sentenca não exige dizer se o prazo em dias foi conferido na fonte",
  );
  verdade(
    /n[ãa]o\s+estime/i.test(prazo),
    "analise-sentenca perdeu a proibição de estimar quando falta a data de intimação",
  );

  // ── O FORMATO DA SAÍDA, que é o que chega à tela do advogado ──────────────────────────────
  const formato = secaoDe(texto, "Formato da saída");
  verdade(formato.length > 200, `o formato da saída de analise-sentenca saiu com ${formato.length} caracteres — varredura cega`);

  const blocos = formato.split(/\n(?=\d+\.\s)/);
  const bloco = blocos.find((b) => /^\s*\d+\.\s*Prazo/i.test(b)) ?? "";
  verdade(bloco.length > 0, "o formato da saída de analise-sentenca não tem mais o bloco de prazo");
  verdade(
    /prazo\s+em\s+dias/i.test(bloco),
    "o bloco de prazo do formato da saída entrega a data sem o prazo em dias que a produziu",
  );
  verdade(
    /(origem|conferid|confirm|condicionad)/i.test(bloco),
    "o bloco de prazo do formato da saída não marca a data como dependente de conferência",
  );
});

// ──────────────────────────────────────────────────────────────────────────────────────────
// LGPD — O LIMITE QUE FALTAVA, e ele erra para os DOIS lados
// ──────────────────────────────────────────────────────────────────────────────────────────
//
// A primeira versão de `lgpd-escritorio` derrubava, com razão, a desculpa "somos advogados, o
// sigilo profissional nos isenta da lei de dados" — e depois nunca devolvia o limite LEGÍTIMO.
// Sobrava um passo mandando montar "um caminho definido para responder a pedido de titular
// (cliente, parte contrária, terceiro)", com os três no mesmo balde e com "pedir eliminação" na
// lista do que se atende.
//
// Seguido à risca, esse caminho único entrega À PARTE CONTRÁRIA o que o escritório guarda sobre
// ela — que é o material do caso do cliente, com estratégia e confidência dentro — e acolhe pedido
// de eliminação sobre prova que o escritório tem dever de guardar. O primeiro erro (a desculpa
// geral) custa sanção administrativa; este custa o cliente, o processo e a inscrição de quem
// assinou.
//
// O guarda confere a TRIAGEM, que é o que resolve os dois lados de uma vez: quem é o titular em
// relação ao escritório, e sobre que material recai o pedido. As asserções aceitam variantes de
// redação — guarda preso a uma grafia já bloqueou, neste repositório, a própria correção que devia
// proteger.

teste("HARD GATE: em lgpd-escritorio, pedido de titular passa por TRIAGEM — não por um caminho só", () => {
  const texto = textoDa("lgpd-escritorio");
  const passo = secaoDe(texto, "Passo 6");
  verdade(passo.length > 800, `a seção de direitos dos titulares saiu com ${passo.length} caracteres — varredura cega`);

  // O sigilo profissional tem de aparecer AQUI como limite, e não só lá no começo como desculpa
  // derrubada. É a diferença entre negar a isenção geral e reconhecer o limite concreto.
  verdade(
    /sigilo\s+profissional/i.test(passo),
    "lgpd-escritorio voltou a tratar direitos dos titulares sem mencionar o sigilo profissional como limite",
  );
  verdade(
    /dever\s+de\s+guard/i.test(passo),
    "lgpd-escritorio não invoca o dever de guarda do material de caso",
  );
  // A parte contrária precisa ser tratada como caso PRÓPRIO, não como mais um titular na lista.
  verdade(
    /parte\s+contr[áa]ria/i.test(passo) && /(material\s+de\s+caso|material\s+do\s+caso)/i.test(passo),
    "lgpd-escritorio não distingue o pedido da parte contrária sobre material de caso",
  );
  // Eliminação não é automática.
  verdade(
    /(n[ãa]o\s+se\s+atende[^.\n]{0,60}porque\s+foi\s+pedido|n[ãa]o\s+.{0,80}s[óo]\s+porque\s+foi\s+pedido)/i.test(passo),
    "lgpd-escritorio perdeu a regra de que pedido de eliminação sobre material de guarda obrigatória não se atende só porque foi pedido",
  );
  // Quem decide é o advogado, não a rotina administrativa.
  verdade(
    /advogado\s+respons[áa]vel/i.test(passo),
    "lgpd-escritorio não diz que a recusa fundamentada é decidida pelo advogado responsável",
  );
  // E o limite não pode virar a desculpa geral de novo.
  verdade(
    /(item\s+a\s+item|nunca\s+em\s+bloco)/i.test(passo),
    "lgpd-escritorio perdeu a trava contra invocar o limite em bloco — é a desculpa geral vestida de resposta",
  );
});

teste("HARD GATE: o formato da saída de lgpd-escritorio cobra a triagem, não só a existência do caminho", () => {
  const formato = secaoDe(textoDa("lgpd-escritorio"), "Formato da saída");
  verdade(formato.length > 200, `o formato da saída saiu com ${formato.length} caracteres — varredura cega`);
  verdade(
    /triagem/i.test(formato),
    "o bloco de lacunas não cobra a triagem dos pedidos de titular — a ressalva ficaria só na prosa, que é como o defeito do prazo em analise-sentenca chegou à tela",
  );
});

// ──────────────────────────────────────────────────────────────────────────────────────────
// QUALIFICAÇÃO FINANCEIRA — a recusa muda, e as duas contas que ninguém separa
// ──────────────────────────────────────────────────────────────────────────────────────────
//
// A primeira versão de `qualificacao-perfil-financeiro` acabava em "recuse". Quem sinalizasse que
// nenhum modelo de cobrança cabia no bolso dele era registrado para o advogado decidir, com a
// recusa entre as opções — e mais nada. Duas faltas, e as duas têm consequência:
//
//   1. A RECUSA MUDA. Encerrar a conversa sem dizer nada a quem procurou ajuda e não tem como
//      pagar. Orientar onde buscar atendimento não é captação, não cria vínculo, custa uma frase —
//      e é o que separa uma recusa profissional de uma porta fechada na cara de alguém que pode ter
//      prazo correndo.
//
//   2. AS DUAS CONTAS SOMADAS. Custas do processo e honorário do advogado particular são dinheiros
//      diferentes, e a gratuidade de justiça alcança o primeiro, não o segundo. A skill falava de
//      "capacidade de pagamento" sem nunca separá-los — e essa confusão erra nos DOIS sentidos:
//      alguém ouve que "vai ser de graça" e depois recebe cobrança de honorário; ou desiste de
//      procurar advogado porque o que o assustava eram as custas, e o honorário caberia.
//
// É a mesma forma do defeito da LGPD, logo acima: uma regra que só nega, sem dizer o que se faz.

teste("HARD GATE: em qualificacao-perfil-financeiro a recusa vem com orientação, e custas não se confundem com honorário", () => {
  const texto = textoDa("qualificacao-perfil-financeiro");
  const passo = secaoDe(texto, "Passo 2");
  verdade(passo.length > 1_000, `a seção de alinhamento saiu com ${passo.length} caracteres — varredura cega`);

  // AS DUAS CONTAS, separadas.
  verdade(/custas/i.test(passo), "a skill voltou a falar de pagamento sem nomear as custas do processo");
  verdade(
    /gratuidade/i.test(passo),
    "a skill não trata a gratuidade de justiça — é a primeira coisa que quem não pode pagar traz para a conversa",
  );
  verdade(
    /(honor[áa]rio\s+contratado|honor[áa]rio\s+contratual|advogado\s+particular)/i.test(passo),
    "a skill não distingue o honorário do advogado particular do que a gratuidade alcança",
  );

  // A RECUSA NÃO É MUDA.
  verdade(
    /(defensoria|assist[êe]ncia\s+judici[áa]ria)/i.test(passo),
    "a skill não orienta onde buscar atendimento quem não comporta nenhum modelo — a recusa volta a ser muda",
  );
  verdade(
    /(n[ãa]o\s+[ée]\s+capta[çc][ãa]o|n[ãa]o\s+.{0,40}capta[çc][ãa]o)/i.test(passo),
    "a skill perdeu a ressalva de que orientar não é captação — sem ela, o medo de captar produz a recusa muda de novo",
  );

  // E O BLOCO DA SAÍDA COBRA ISSO, senão a ressalva fica só na prosa — foi assim que o defeito do
  // prazo em analise-sentenca chegava à tela.
  const formato = secaoDe(texto, "Formato da saída");
  verdade(
    /(orienta[çc][ãa]o|custas)/i.test(formato),
    "o formato da saída não cobra a orientação nem a separação das contas — a ressalva ficaria só na prosa",
  );
});

// ──────────────────────────────────────────────────────────────────────────────────────────
// REFERÊNCIAS CRUZADAS — "ver passo N" tem de apontar para um passo que existe
// ──────────────────────────────────────────────────────────────────────────────────────────
//
// Estas skills são LIDAS POR UM AGENTE, e ele segue a referência. "Ver passo 8" quando o assunto
// está no 9 não é erro de revisão: é o agente indo ao lugar errado e seguindo a instrução errada.
//
// E o risco cresce sozinho: `resumo-pecas` tem treze passos, e qualquer inserção no meio
// renumera tudo o que vem depois sem tocar numa única referência. O guarda é barato e cobre as
// dezesseis skills de uma vez — inclusive as que ainda não existem.
//
// O QUE ELE NÃO PEGA, e está dito para ninguém confiar demais nele: referência que aponta para um
// passo QUE EXISTE mas é o errado. Foi exatamente esse o caso encontrado em `resumo-pecas` — "ver
// passo 8" para tutela provisória, que mora no 9 — e nenhuma varredura automática o distingue de
// uma referência correta. Isso continua sendo trabalho de quem lê.

teste("HARD GATE: nenhuma skill referencia um 'passo N' que não existe nela", () => {
  for (const skill of SKILLS) {
    const texto = textoDa(skill);
    const existentes = new Set(
      [...texto.matchAll(/^##\s+Passo\s+(\d+)/gm)].map((m) => Number(m[1])),
    );
    // Skill sem passos numerados não tem o que conferir — e não é defeito: várias organizam o
    // trabalho por frentes ou domínios em vez de passos.
    if (existentes.size === 0) continue;

    // O PLURAL E OS INTERVALOS CONTAM. A primeira versão deste laço procurava `passo\s+\d+` e
    // passava batido por "passos 11 e 12" e "passos 10 a 12" — o `s` do plural quebrava o casamento
    // logo no começo, e o segundo número de um intervalo nunca era olhado. Uma mutação que trocou
    // "passos 11 e 12" por "passos 11 e 20" passou verde, e foi assim que o buraco apareceu.
    //
    // Agora casa `passo` ou `passos`, captura a LISTA inteira que vem depois — "11", "11 e 12",
    // "10 a 12", "1, 2 e 3" — e confere cada número dela.
    for (const m of texto.matchAll(/\bpassos?\s+(\d+(?:\s*(?:,|e|a|até)\s*\d+)*)/gi)) {
      const linha = texto.slice(0, m.index ?? 0).split("\n").length;
      for (const bruto of m[1].match(/\d+/g) ?? []) {
        const numero = Number(bruto);
        verdade(
          existentes.has(numero),
          `${skill}/SKILL.md, linha ${linha}: referencia o passo ${numero}, que não existe — a skill vai do 1 ao ${Math.max(...existentes)}`,
        );
      }
    }
  }
});

teste("HARD GATE: em resumo-pecas, a remissão da tutela provisória aponta para o passo da tutela provisória", () => {
  const texto = textoDa("resumo-pecas");
  // O número do passo da tutela sai do CABEÇALHO, não escrito à mão aqui: se alguém inserir um
  // passo no meio e renumerar, este teste continua conferindo a coisa certa.
  const cabecalho = texto.match(/^##\s+Passo\s+(\d+)\s+—\s+Tutela provis[óo]ria/m);
  verdade(cabecalho !== null, "resumo-pecas perdeu o passo de tutela provisória");
  const numeroDaTutela = Number((cabecalho as RegExpMatchArray)[1]);

  const remissao = texto.match(/tutela\s+provis[óo]ria\s*\([^)]*ver\s+passo\s+(\d+)\)/i);
  verdade(remissao !== null, "resumo-pecas perdeu a remissão da tutela provisória no passo do pedido implícito");
  const numeroApontado = Number((remissao as RegExpMatchArray)[1]);

  igual(
    numeroApontado,
    numeroDaTutela,
    "a remissão da tutela provisória aponta para o passo errado — o agente seguiria a instrução de outra seção",
  );
});

// ──────────────────────────────────────────────────────────────────────────────────────────
// usar-o-lumen — as duas confusões que produzem resposta confiante e errada
// ──────────────────────────────────────────────────────────────────────────────────────────
//
// Esta skill nasceu para o agente USAR o que o Lúmen já faz em vez de reimplementar. Duas
// afirmações dentro dela foram conferidas no código, e as duas contrariaram a classificação que a
// supervisão havia feito de cabeça — é por isso que viraram trava:
//
//   1. O MÓDULO DE COMUNICADOS AVISA A EQUIPE, NÃO O CLIENTE. Toda chamada da fila de notificação
//      recebe um usuário interno; não há caminho de andamento processual chegando ao cliente por
//      ali. Uma skill que dissesse o contrário faria o agente garantir ao advogado que o cliente
//      "já foi avisado" quando ninguém foi.
//
//   2. O PAINEL DA PLATAFORMA NÃO É O PAINEL DO ESCRITÓRIO. O console administrativo da própria
//      Lúmen é restrito a quem opera a plataforma; os indicadores do escritório contratante vivem
//      em outra área. Esta é uma skill de PLATAFORMA, usada por qualquer escritório — nomear a tela
//      errada manda o advogado a um lugar onde ele nem entra.

teste("HARD GATE: usar-o-lumen não confunde aviso à equipe com mensagem ao cliente", () => {
  const texto = textoDa("usar-o-lumen");
  verdade(
    /equipe\s+do\s+escrit[óo]rio/i.test(texto),
    "usar-o-lumen deixou de dizer que o aviso automático é para a equipe do escritório",
  );
  verdade(
    /(n[ãa]o\s+o\s+cliente|n[ãa]o\s+[ée]\s+uma\s+mensagem\s+que\s+chega\s+ao\s+cliente)/i.test(texto),
    "usar-o-lumen perdeu a negativa explícita de que o aviso chega ao cliente — é a confusão que faria o agente garantir que o cliente foi avisado quando ninguém foi",
  );
});

teste("HARD GATE: usar-o-lumen não nomeia o console da plataforma como painel do escritório", () => {
  const texto = textoDa("usar-o-lumen");
  // A skill é de PLATAFORMA: nomear a tela restrita a quem opera a Lúmen manda o advogado de um
  // escritório contratante a um lugar onde ele nem entra.
  verdade(
    !/painel\s+mestre/i.test(texto),
    "usar-o-lumen voltou a nomear o console da plataforma — ele não é a tela de indicadores do escritório contratante",
  );
  verdade(
    /(n[ãa]o\s+presuma|confirme\s+com\s+o\s+L[úu]men|pergunte\s+ao\s+administrador)/i.test(texto),
    "usar-o-lumen perdeu a instrução de confirmar qual é a tela de indicadores em vez de nomeá-la",
  );
});

// ──────────────────────────────────────────────────────────────────────────────────────────
// comunicados-clientes — o valor de acordo é do CLIENTE, e a regra nasceu invertida
// ──────────────────────────────────────────────────────────────────────────────────────────
//
// A primeira versão desta skill punha "valor de acordo em negociação" na lista do que NÃO entra num
// comunicado ao cliente, com a justificativa de que divulgar a cifra "enfraquece a posição do
// escritório na mesa".
//
// O instinto estava certo — mensagem que circula é risco real — e a regra, errada, num ponto que
// não é de estilo: ACEITAR OU RECUSAR ACORDO É DECISÃO DO CLIENTE. A proposta, o valor, as
// condições e o prazo de resposta são exatamente a informação sem a qual ele não decide nada.
// Omitir a cifra não é cautela: é decidir por ele, colocando a posição negocial do escritório acima
// de quem é dono do caso. Seguida à risca, aquela regra faria o agente ajudar a esconder do cliente
// a proposta que estava sobre a mesa dele.
//
// O que a skill controla é o CANAL e o REGISTRO, nunca se informa. Estes guardas travam as duas
// metades: que a cifra chega, e que o "preservar a posição na negociação" não volta como motivo
// para não informar.

teste("HARD GATE: em comunicados-clientes, o valor de acordo chega ao cliente — a decisão é dele", () => {
  const texto = textoDa("comunicados-clientes");

  verdade(
    /(aceitar\s+ou\s+recusar\s+acordo\s+é\s+decis[ãa]o\s+do\s+cliente|decis[ãa]o\s+do\s+cliente,\s+n[ãa]o\s+do\s+escrit[óo]rio)/i.test(texto),
    "comunicados-clientes deixou de dizer que aceitar ou recusar acordo é decisão do cliente",
  );
  verdade(
    /(nunca\s+deixe\s+o\s+valor\s+de\s+fora|omitir\s+a\s+cifra[^.\n]{0,40}n[ãa]o\s+[ée]\s+cautela)/i.test(texto),
    "comunicados-clientes perdeu a proibição de omitir o valor de acordo do cliente",
  );
  // O QUE A SKILL CONTROLA É O CANAL, não o silêncio: sem esta metade, "não mande por WhatsApp"
  // viraria "não conte".
  verdade(
    /(canal\s+e\s+o\s+registro|o\s+canal\s+e\s+o\s+registro)/i.test(texto),
    "comunicados-clientes perdeu a distinção entre escolher o canal e escolher se informa",
  );

  // E A REGRA INVERTIDA NÃO PODE VOLTAR pela porta da justificativa: a posição negocial do
  // escritório não é motivo para não informar.
  const invertida = texto.match(/[^.\n]{0,120}(enfraquece|preservar)[^.\n]{0,60}posi[çc][ãa]o[^.\n]{0,60}(negocia|mesa)[^.\n]{0,80}/i);
  if (invertida) {
    verdade(
      /(nunca|n[ãa]o)\s/i.test(invertida[0]),
      `comunicados-clientes voltou a usar a posição negocial do escritório como motivo para não informar o valor: "${invertida[0].trim()}"`,
    );
  }
});

// ──────────────────────────────────────────────────────────────────────────────────────────
// CABEÇALHO — a convenção do repositório, conferida num exemplo real (.claude/skills/*/SKILL.md)
// ──────────────────────────────────────────────────────────────────────────────────────────

teste("todas as skills seguem a convenção de cabeçalho: --- com name e description, e name igual ao diretório", () => {
  for (const skill of SKILLS) {
    const texto = textoDa(skill);
    verdade(texto.startsWith("---\n"), `${skill}/SKILL.md não abre com a cerca --- do cabeçalho`);
    const fim = texto.indexOf("\n---", 4);
    verdade(fim > 0, `${skill}/SKILL.md não fecha a cerca --- do cabeçalho`);
    const cabecalho = texto.slice(4, fim);
    const nome = cabecalho.match(/^name:\s*(\S+)\s*$/m);
    verdade(nome !== null, `${skill}/SKILL.md não tem a chave name no cabeçalho`);
    igual(nome?.[1], skill, `o name do cabeçalho tem de ser o nome do diretório (${skill}): `);
    verdade(/^description:/m.test(cabecalho), `${skill}/SKILL.md não tem a chave description no cabeçalho`);
    verdade(cabecalho.length > 200, `a description de ${skill} tem ${cabecalho.length} caracteres de cabeçalho — curta demais para o agente escolher a skill`);
    // O cabeçalho é a parte que o agente lê primeiro: ele também não pode carregar dado de escritório.
    const achado = achaDadoDeEscritorio(cabecalho);
    verdade(achado === null, `o cabeçalho de ${skill} embute dado de escritório: ${achado}`);
  }
});

resumo("Skills do Hermes — documentos de plataforma: nenhum dado de escritório, as quatro regras da casa e a classificação de resultado em todas");
