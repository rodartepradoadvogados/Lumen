import { readFileSync } from "node:fs";
import { join } from "node:path";
// hrefsDeLinks NÃO é importado aqui de propósito: os dois links por linha (conversa e recusa) são
// contados nas suítes que já os contavam (atendimentoCentralCliques, triagemConsertos) — as duas
// reescritas nesta etapa para separá-los pelo CALCULADOR, e não pela grafia do endereço.
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";
import {
  hrefDaConversa,
  hrefDaRecusa,
  recorteDaConversa,
  ROTA_DA_CENTRAL,
  FOCO_DA_RECUSA,
  ANCORA_DA_RECUSA,
  type QuemAbreAConversa,
} from "@/lib/conversaDaCentral";

// ============================================================================
// A CENTRAL DE ATENDIMENTO — ETAPA 3 (o acabamento). Cinco consertos, cinco seções.
//
//   1. OS CHIPS QUEBRAVAM LINHA em largura intermediária. Conserto de LAYOUT: as células das linhas
//      encolhem (basis + min-w-0) em vez de empurrar a linha para baixo, e o que é chip de verdade
//      (guia, pílula, botão) não encolhe nem quebra.
//   2. A CONVERSA NÃO TINHA LARGURA MÁXIMA. Ganhou a medida de leitura da casa, em token.
//   3. A ESCALA TIPOGRÁFICA misturava os apelidos anônimos do Tailwind com as paradas nomeadas da
//      rampa. Passou a usar só as paradas — nos mesmos pixels.
//   4. "VER A RECUSA" TIRAVA A PESSOA DA CENTRAL na mesma aba. Passou a respeitar o `destino`, e na
//      Central abre o painel que a própria Central já hospeda.
//   5. O REALCE DO ITEM CLICADO não acontecia para lead fora dos 200 da lista.
//
// A FORMA DESTAS ASSERÇÕES, de novo (ver o cabeçalho de executar.ts e o defeito 3):
//
//   • o que dá para provar em MESA é provado em mesa (o endereço da recusa, o recorte da consulta);
//   • o que só se prova lendo o código é lido por MECANISMO, nunca por grafia. "Os rótulos encolhem
//     junto com os valores" é comparar as duas listas de `basis`, e não procurar uma classe literal;
//     "toda busca de um registro passa pelo recorte" é contar as buscas e os recortes, e não achar
//     uma linha específica. Duas asserções desta casa já foram presas a uma grafia (`aba=ficha`, em
//     duas suítes) e as duas reprovaram a correção desta etapa em vez de defeito — as duas foram
//     reescritas junto com este arquivo.
// ============================================================================

const RAIZ = process.cwd();

/**
 * O código sem comentário NENHUM — nem os de linha (codigoDe) nem os de JSX `{/* ... *\/}`.
 *
 * codigoDe sozinho não basta num arquivo de tela: comentário de JSX não começa a linha com `//`, e
 * os desta etapa CITAM as classes de que falam ("agora cada célula é `basis-[...] min-w-0`"). Uma
 * varredura que procurasse a classe encontraria a citação e daria a regra por cumprida com a classe
 * removida do elemento — é o defeito 1 de executar.ts, na forma que aparece em componente.
 */
function semComentarios(fonte: string): string {
  return codigoDe(fonte).replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

function ler(rel: string): string {
  return semComentarios(readFileSync(join(RAIZ, rel), "utf8"));
}

const ARQ_PAGE = "app/atendimento-central/page.tsx";
const ARQ_FILA = "components/atendimento/FilaDeEspera.tsx";
const ARQ_RECUSADOS = "components/atendimento/RecusadosParaAnalise.tsx";
const ARQ_FUNIL = "components/atendimento/QuadroDoFunil.tsx";

const PAGE = ler(ARQ_PAGE);
const FILA = ler(ARQ_FILA);
const RECUSADOS = ler(ARQ_RECUSADOS);
const FUNIL = ler(ARQ_FUNIL);
const CSS = readFileSync(join(RAIZ, "app", "atendimento-central", "atendimento-central.css"), "utf8");
const CORPO_PAGE = corpoDaFuncao(readFileSync(join(RAIZ, ARQ_PAGE), "utf8"), "AtendimentoCentralPage");

teste("a varredura tem o que varrer (senão tudo abaixo passa em cima de string vazia)", () => {
  for (const [nome, fonte] of [[ARQ_PAGE, PAGE], [ARQ_FILA, FILA], [ARQ_RECUSADOS, RECUSADOS], [ARQ_FUNIL, FUNIL]] as const) {
    verdade(fonte.length > 1500, `${nome}: a leitura devolveu ${fonte.length} caracteres — varredura cega`);
  }
  verdade(CORPO_PAGE.length > 4000, "corpoDaFuncao não achou AtendimentoCentralPage");
  verdade(!CORPO_PAGE.includes("function carregarLista"), "o trecho da página transbordou para carregarLista — asserção sobre a função vizinha");
});

// ── 1. OS CHIPS E AS LINHAS: ninguém quebra em largura intermediária ────────────────────────────
//
// O DEFEITO, em código: as células das linhas de "Esperando resposta" e "Recusados" eram largura
// FIXA com `shrink-0`. A largura mínima da linha passava de 900px; a partir de `lg` — onde os
// cabeçalhos das colunas já aparecem — o bloco de ações caía para uma segunda linha, e os valores
// deixavam de ficar embaixo dos seus rótulos. Uma linha de lista tem de encolher, não quebrar.

const LINHAS_COM_COLUNAS: { arquivo: string; fonte: string }[] = [
  { arquivo: ARQ_FILA, fonte: FILA },
  { arquivo: ARQ_RECUSADOS, fonte: RECUSADOS },
];

/**
 * A REGIÃO DAS CÉLULAS: de dentro do <Link> que cobre a linha até o </Link> que o fecha.
 *
 * Recortar a região é o que separa CÉLULA DE COLUNA de CHIP. Fora do link, na mesma linha, moram o
 * botão "Abrir" e o bloco de ações — e esses PODEM (devem) ter largura travada: um botão que encolhe
 * é um botão com o rótulo cortado. Uma varredura do arquivo inteiro acusaria os dois, e a "correção"
 * seria soltar a largura justamente de quem não pode soltá-la.
 */
function celulasDaLinha(fonte: string): string {
  // O <Link> da linha é o PRIMEIRO cujo href chama hrefDaConversa — e a busca parte das aberturas de
  // <Link>, não da palavra "hrefDaConversa": a primeira ocorrência dela no arquivo é o `import`, e
  // partir dela devolvia trecho vazio (varredura que nunca acha nada e sempre passa).
  for (const m of fonte.matchAll(/<Link\b/g)) {
    const abre = m.index!;
    const fecha = fonte.indexOf("</Link>", abre);
    if (fecha < 0) continue;
    const bloco = fonte.slice(abre, fecha);
    if (bloco.includes("hrefDaConversa")) return bloco;
  }
  return "";
}

teste("a varredura das células achou a região certa (e não o arquivo inteiro)", () => {
  for (const { arquivo, fonte } of LINHAS_COM_COLUNAS) {
    const regiao = celulasDaLinha(fonte);
    verdade(regiao.length > 300, `${arquivo}: a região das células devolveu ${regiao.length} caracteres — varredura cega`);
    verdade(!regiao.includes("</Link>"), `${arquivo}: a região transbordou o fim do link da linha`);
    verdade(regiao.length < fonte.length - 400, `${arquivo}: a região engoliu o arquivo — chip e célula voltariam a ser a mesma coisa para esta suíte`);
  }
});

teste("nenhuma célula de coluna é largura FIXA travada (`w-[NNNpx]` + `shrink-0`) — era isso que empurrava a linha para baixo", () => {
  for (const { arquivo, fonte } of LINHAS_COM_COLUNAS) {
    // Tolera a ordem das classes e o prefixo de variante (`lg:shrink-0` valia o mesmo).
    const travadas = [...celulasDaLinha(fonte).matchAll(/class[nN]ame=\{?["`][^"`]*["`]/g)]
      .map((m) => m[0])
      .filter((c) => /\bw-\[\d+px\]/.test(c) && /\bshrink-0\b/.test(c));
    igual(travadas.length, 0,
      `${arquivo}: célula de largura fixa e intravável de volta (${travadas.join(" | ")}) — a linha volta a quebrar em largura intermediária`);
  }
});

teste("toda célula com largura preferida encolhe de verdade: `basis-[...]` sempre com `min-w-0`", () => {
  for (const { arquivo, fonte } of LINHAS_COM_COLUNAS) {
    const comBasis = [...celulasDaLinha(fonte).matchAll(/class[nN]ame=\{?["`][^"`]*\bbasis-\[\d+px\][^"`]*["`]/g)].map((m) => m[0]);
    verdade(comBasis.length >= 2, `${arquivo}: esperava as colunas da linha declaradas por basis — achei ${comBasis.length}`);
    for (const c of comBasis) {
      verdade(/\bmin-w-0\b/.test(c),
        `${arquivo}: ${c} tem largura preferida mas não pode encolher abaixo do conteúdo (falta min-w-0) — é a mesma quebra de linha, por outro caminho`);
    }
  }
});

teste("MECANISMO DO ALINHAMENTO: os cabeçalhos têm as MESMAS larguras preferidas das células", () => {
  // Este é o conserto que mais fácil se desfaz sem ninguém ver: mexer na largura de uma coluna e
  // esquecer o rótulo dela deixa a tela com o valor embaixo do rótulo errado, e nada em vermelho.
  const larguras = (trecho: string) => [...trecho.matchAll(/basis-\[(\d+)px\]/g)].map((m) => Number(m[1]));
  for (const { arquivo, fonte } of LINHAS_COM_COLUNAS) {
    const cabecalhos = fonte.split("\n").filter((l) => l.includes("<Cabecalho")).join("\n");
    verdade(cabecalhos.length > 0, `${arquivo}: não achei os cabeçalhos das colunas`);
    const doCabecalho = larguras(cabecalhos);
    const dasCelulas = larguras(celulasDaLinha(fonte));
    verdade(doCabecalho.length >= 2, `${arquivo}: os cabeçalhos perderam a largura preferida (${doCabecalho.join(",")})`);
    igual(dasCelulas, doCabecalho,
      `${arquivo}: as larguras das células (${dasCelulas.join(",")}) não são mais as dos cabeçalhos (${doCabecalho.join(",")}), na mesma ordem — rótulo e valor saem de prumo quando a janela aperta`);
  }
});

teste("a faixa de sub-abas da Central não quebra linha — uma guia é chip, ou cabe ou a faixa desliza", () => {
  // A faixa era `flex-wrap`: a terceira guia caía para a segunda linha e a régua de baixo ficava
  // desenhada só embaixo da primeira. A asserção olha o BLOCO da faixa (do <div até o primeiro
  // <SubAba), não o arquivo inteiro — a página tem outros `flex-wrap` legítimos.
  const iSub = PAGE.indexOf("<SubAba");
  verdade(iSub > 0, "as sub-abas sumiram da Central");
  const abreDiv = PAGE.lastIndexOf("<div", iSub);
  const faixa = PAGE.slice(abreDiv, iSub);
  verdade(!/\bflex-wrap\b/.test(faixa), `a faixa de sub-abas voltou a quebrar linha (${faixa.trim()})`);
  verdade(/\bflex-nowrap\b/.test(faixa) || /\boverflow-x-auto\b/.test(faixa),
    "a faixa de sub-abas não diz o que fazer quando não cabe — sem nowrap nem deslizamento, ela volta a quebrar");

  const guia = corpoDaFuncao(readFileSync(join(RAIZ, ARQ_PAGE), "utf8"), "SubAba");
  verdade(guia.length > 200, "corpoDaFuncao não achou SubAba");
  verdade(/\bwhitespace-nowrap\b/.test(guia), "o rótulo da guia pode quebrar no meio — o nome da guia é o que diz onde a pessoa está");
  verdade(/\bshrink-0\b/.test(guia), "a guia pode ser esmagada pelas vizinhas — chip esmagado é chip quebrado");
});

// ── 2. A LARGURA MÁXIMA DA CONVERSA ─────────────────────────────────────────────────────────────

const TOKEN_LARGURA = "--atd-largura-leitura";

teste("a medida de leitura é um TOKEN da folha desta tela, declarado uma vez, e não um número solto no JSX", () => {
  const declaracoes = [...CSS.matchAll(new RegExp(`${TOKEN_LARGURA}:\\s*([^;]+);`, "g"))].map((m) => m[1].trim());
  igual(declaracoes.length, 1, `${TOKEN_LARGURA} deveria ser declarado uma única vez em atendimento-central.css — achei ${declaracoes.length}`);
  verdade(/^\d+(\.\d+)?(px|rem|ch)$/.test(declaracoes[0]), `${TOKEN_LARGURA} não é uma medida (${declaracoes[0]})`);
  // E o valor não pode estar repetido cru no JSX, que é o jeito de o token e a tela divergirem.
  const numero = declaracoes[0].replace(/[a-z]+$/, "");
  verdade(!PAGE.includes(`max-w-[${declaracoes[0]}]`) && !PAGE.includes(`[${numero}px]`),
    `a página repete a medida (${declaracoes[0]}) crua no JSX em vez de usar var(${TOKEN_LARGURA})`);
});

teste("O NÚMERO NÃO É NOVO: é uma medida de leitura que a casa já usa (a superfície de trabalho do Peticionamento)", () => {
  const valor = (new RegExp(`${TOKEN_LARGURA}:\\s*([^;]+);`).exec(CSS) ?? [])[1]?.trim();
  verdade(!!valor, "não achei o valor do token");
  const petic = readFileSync(join(RAIZ, "app", "peticionamento", "peticionamento.css"), "utf8");
  const larguras = [...petic.matchAll(/max-width:\s*([^;]+);/g)].map((m) => m[1].trim());
  verdade(larguras.includes(valor!),
    `a medida de leitura da Central (${valor}) não é nenhuma das larguras de superfície do Peticionamento (${larguras.join(", ")}) — ou a Central inventou um número, ou a outra aba mudou a dela e as duas precisam voltar a falar a mesma medida`);
});

teste("a medida limita o CONTEÚDO da conversa, e não a caixa que rola — o chassi da tela não entrou no conserto", () => {
  const usos = [...CORPO_PAGE.matchAll(new RegExp(`max-w-\\[var\\(${TOKEN_LARGURA}\\)\\]`, "g"))].length;
  verdade(usos >= 2, `esperava a medida aplicada no cabeçalho E na conversa (achei ${usos}) — em réguas diferentes, o nome do cliente e as mensagens dele desalinham`);
  // A caixa que rola continua sendo a que rolava: overflow-y-auto + min-h-0, e SEM a medida nela.
  const linhas = CORPO_PAGE.split("\n");
  const daRolagem = linhas.filter((l) => l.includes("overflow-y-auto") && l.includes("flex-1"));
  verdade(daRolagem.length >= 1, "a caixa que rola a conversa sumiu — o chassi da tela mudou junto com a largura");
  for (const l of daRolagem) {
    verdade(!l.includes(`var(${TOKEN_LARGURA})`),
      `a medida de leitura foi aplicada na própria caixa que rola (${l.trim()}) — a barra de rolagem sai do lugar e a régua do cabeçalho não bate mais`);
  }
});

// ── 3. A ESCALA TIPOGRÁFICA ─────────────────────────────────────────────────────────────────────

const ANONIMAS = ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl"];

teste("a rampa nomeada existe mesmo em tailwind.config.ts — senão esta seção exige um token que não há", () => {
  const cfg = readFileSync(join(RAIZ, "tailwind.config.ts"), "utf8");
  for (const parada of ["etiqueta", "corpo", "destaque"]) {
    verdade(new RegExp(`\\b${parada}:\\s*\\[`).test(cfg), `a parada "${parada}" saiu da rampa em tailwind.config.ts`);
  }
});

teste("as quatro superfícies da Central usam SÓ as paradas nomeadas da rampa — nenhum apelido anônimo", () => {
  for (const [nome, fonte] of [[ARQ_PAGE, PAGE], [ARQ_FILA, FILA], [ARQ_RECUSADOS, RECUSADOS], [ARQ_FUNIL, FUNIL]] as const) {
    const achadas = ANONIMAS.filter((a) => new RegExp(`\\btext-${a.replace(/(\d)/g, "$1")}\\b`).test(fonte));
    igual(achadas.length, 0,
      `${nome} voltou a usar apelido anônimo de tamanho (text-${achadas.join(", text-")}) — com ele, "subir um tamanhinho" é uma letra de distância e sai da rampa sem ninguém ver`);
    verdade(/\btext-(etiqueta|corpo|destaque|guia|autuacao|tarja)\b/.test(fonte),
      `${nome} não usa nenhuma parada nomeada da rampa — ou o arquivo perdeu o texto, ou a varredura está lendo outra coisa`);
  }
});

// ── 4. "VER A RECUSA" NÃO TIRA MAIS A PESSOA DA CENTRAL ─────────────────────────────────────────

const ID = "atd-777";

teste("na Central, 'Ver a recusa' continua na Central — mesma rota, mesma conversa, com o foco a mais", () => {
  const href = hrefDaRecusa("central", ID);
  verdade(href.startsWith(ROTA_DA_CENTRAL), `o ícone saiu da rota da Central: ${href}`);
  verdade(href.includes(`id=${ID}`), "o endereço não carrega o id do atendimento");
  verdade(href.includes("aba=atendimentos"), "o endereço não cai na aba Atendimentos — o painel da recusa vive lá");
  verdade(href.includes(FOCO_DA_RECUSA), "o endereço não diz qual painel a pessoa veio ver");
  verdade(href.includes(`#${ANCORA_DA_RECUSA}`), "o endereço perdeu a âncora — o navegador não rola até o painel");
});

teste("o endereço da recusa DERIVA do endereço da conversa — um cálculo só, não dois parecidos", () => {
  verdade(hrefDaRecusa("central", ID).startsWith(hrefDaConversa("central", ID)),
    "o endereço de 'Ver a recusa' deixou de ser o da conversa mais o foco: dois cálculos do mesmo endereço divergem no dia em que um deles ganha parâmetro");
});

teste("o destino 'classico' NÃO mudou: a Triagem antiga continua abrindo a ficha antiga", () => {
  const href = hrefDaRecusa("classico", ID);
  verdade(href.startsWith(`/atendimento/${ID}`), `a rota antiga do ícone mudou: ${href}`);
  verdade(/aba=ficha/.test(href) && /bloco=processo/.test(href),
    "o ícone da Triagem antiga deixou de abrir a ficha no bloco do processo — a tela antiga mudou de comportamento numa etapa que não a toca");
});

teste("o id vai escapado também neste endereço", () => {
  const href = hrefDaRecusa("central", "a b&c=d");
  verdade(!href.includes("a b&c=d"), "o id entrou cru: um '&' no id viraria outro parâmetro de busca");
});

teste("a Central hospeda o destino: o painel da recusa tem a âncora, e ela vem da MESMA constante do endereço", () => {
  verdade(CORPO_PAGE.includes("ANCORA_DA_RECUSA"),
    "a página não marca mais o painel da recusa com a âncora — o endereço do ícone aponta para um id que não existe no DOM, e a rolagem não acontece");
  verdade(!new RegExp(`id="${ANCORA_DA_RECUSA}"`).test(CORPO_PAGE),
    "a âncora virou literal na página: duas palavras iguais em dois arquivos divergem no primeiro renomear, e o sintoma é uma âncora que não rola para lugar nenhum");
  verdade(/RecusarLeadPainel/.test(CORPO_PAGE), "o painel da recusa saiu da Central — o ícone passaria a apontar para uma tela que não mostra a recusa");
});

teste("o foco vem da URL e é CONFERIDO contra o valor conhecido, nunca usado cru", () => {
  verdade(/searchParams\.foco/.test(CORPO_PAGE), "a página não lê mais o foco pedido na URL");
  verdade(new RegExp(`searchParams\\.foco\\s*===?\\s*FOCO_DA_RECUSA`).test(CORPO_PAGE) || /FOCOS\.includes/.test(CORPO_PAGE),
    "o `foco` da URL deixou de ser conferido contra o valor conhecido — texto de quem pediu viraria classe de CSS ou chegaria à tela");
});

teste("o destaque do painel usa token da paleta desta tela — nenhum hex cru entrou no acabamento", () => {
  verdade(!/#[0-9a-fA-F]{3,8}/.test(PAGE), "app/atendimento-central/page.tsx ganhou hex cru");
  for (const [nome, fonte] of [[ARQ_FILA, FILA], [ARQ_RECUSADOS, RECUSADOS], [ARQ_FUNIL, FUNIL]] as const) {
    // stageDot vem de lib/funil.ts (var CSS), não de hex escrito aqui.
    verdade(!/#[0-9a-fA-F]{3,8}/.test(fonte), `${nome} ganhou hex cru`);
  }
});

// ── 5. O REALCE DO ITEM CLICADO, quando ele não está nos 200 da lista ───────────────────────────

const SOCIO: QuemAbreAConversa = { id: "u-socio", officeId: "esc-1", isAdmin: true, role: "Sócio", recebeTransferencia: true };
const ADVOGADO: QuemAbreAConversa = { id: "u-adv", officeId: "esc-1", isAdmin: false, role: "Advogado", recebeTransferencia: true };

teste("MUTAÇÃO PRINCIPAL DESTA ETAPA: a busca que acha o lead fora da página passa pelo recorte — e o recorte tem o officeId de quem pediu", () => {
  // A linha nova é uma LEITURA de entidade, e por isso vale a regra da casa inteira: id + escritório
  // de quem pediu + recorte por dono. Sem o escritório, um id de outro escritório colado na URL não
  // abriria a conversa (essa trava é a da etapa 2) mas ACRESCENTARIA à lista da esquerda uma linha
  // com o nome e o assunto de um cliente de outro escritório — vazamento pela lista.
  const recorte = recorteDaConversa(SOCIO, ID) as Record<string, unknown>;
  igual(recorte.officeId, SOCIO.officeId, "o recorte perdeu o escritório de quem pediu: ");
  igual(recorte.id, ID);
  const doAdvogado = recorteDaConversa(ADVOGADO, ID) as Record<string, unknown>;
  igual(doAdvogado.responsibleId, ADVOGADO.id, "o recorte por dono saiu: quem só vê os próprios passaria a fixar na lista um lead que não pode listar: ");
});

teste("TRAVA: toda busca de UM registro nesta tela passa por recorteDaConversa — contagem, não linha", () => {
  const buscas = (CORPO_PAGE.match(/prisma\.attendance\.find(First|Unique)\(/g) ?? []).length;
  const recortes = (CORPO_PAGE.match(/recorteDaConversa\(/g) ?? []).length;
  verdade(buscas >= 2, `esperava ao menos duas buscas de um registro no corpo da página (a conversa e a linha fixada) — achei ${buscas}`);
  igual(recortes, buscas,
    `há ${buscas} busca(s) de um registro e ${recortes} recorte(s): alguma delas voltou a montar o \`where\` à mão, e um \`where\` à mão é onde o officeId se perde`);
});

teste("a lista NÃO virou varredura da tabela: o teto e a ordem continuam de pé", () => {
  const carregar = corpoDaFuncao(readFileSync(join(RAIZ, ARQ_PAGE), "utf8"), "carregarLista");
  verdade(carregar.length > 200, "corpoDaFuncao não achou carregarLista");
  const take = Number(/take:\s*(\d+)/.exec(carregar)?.[1] ?? 0);
  verdade(take > 0 && take <= 200,
    `o teto da lista virou ${take || "inexistente"} — o conserto do realce era uma busca por chave primária, não alargar (ou abrir) a consulta da lista`);
  verdade(/orderBy/.test(carregar), "a lista perdeu a ordenação — sem ela o `take` devolve 200 linhas quaisquer");
  // E a busca extra é por UM registro, nunca um segundo findMany sem teto.
  const semTeto = [...CORPO_PAGE.matchAll(/findMany\(\{[\s\S]{0,400}?\}\)/g)].map((m) => m[0]).filter((t) => !/take:/.test(t));
  igual(semTeto.length, 0, `apareceu findMany sem teto no corpo da página (${semTeto.length}) — é a varredura de tabela entrando por outra porta`);
});

teste("a linha só é fixada quando o id pedido NÃO está na página — senão a lista mostra o mesmo lead duas vezes", () => {
  const i = CORPO_PAGE.indexOf("idPedido");
  verdade(i > 0, "a página não lê mais o id pedido na URL");
  verdade(/!\s*\w+\.(some|find|findIndex|includes)\(/.test(CORPO_PAGE),
    "a fixação da linha deixou de checar se o lead já está na lista — o mesmo atendimento apareceria duas vezes, uma no topo e outra no lugar dele");
});

teste("a linha fixada vai para o TOPO da lista, onde o realce é visto", () => {
  // O lugar cronológico de um lead antigo é o fim de uma lista de 200 linhas: o realce existiria e
  // ninguém o veria. Tolera a grafia (spread, concat, unshift) — o que importa é que a linha achada
  // entre ANTES das outras.
  verdade(/\[\s*\w+\s*,\s*\.\.\.\s*listaAtendimentos\s*\]/.test(CORPO_PAGE) || /unshift\(/.test(CORPO_PAGE) || /concat\(\s*listaAtendimentos/.test(CORPO_PAGE),
    "a linha achada fora da página não entra mais no começo da lista — o realce vai para o fim de 200 linhas, onde não se vê");
});

teste("o realce continua sendo comparação com o id SELECIONADO, e não com o pedido na URL", () => {
  // `idSelecionado` é o pedido OU o primeiro da lista; o realce tem de seguir ele, senão abrir a tela
  // sem clicar em nada deixa a conversa da direita sem par na esquerda.
  verdade(/a\.id === idSelecionado/.test(CORPO_PAGE) || /idSelecionado === a\.id/.test(CORPO_PAGE),
    "a lista deixou de comparar a linha com o atendimento selecionado — o realce passa a dizer outra coisa que a conversa aberta");
});

// ── E o que não pode ter mudado: a Triagem não vaza para quem só vê os próprios ─────────────────

teste("a aba Triagem continua AUSENTE do DOM para quem não vê o escritório todo — o acabamento não afrouxou nada", () => {
  verdade(/const veTodo = veTodoOAtendimento\(viewer\);/.test(PAGE), "a página não calcula mais `veTodo` por veTodoOAtendimento");
  verdade(/\{veTodo && \(/.test(PAGE), "o seletor de abas não está mais condicionado a `veTodo`");
  verdade(/if \(veTodo\) \{/.test(PAGE), "as consultas de escritório inteiro saíram de dentro de `if (veTodo)`");
  verdade(/aba === "triagem" && veTodo/.test(PAGE), "o painel da Triagem é renderizado sem checar `veTodo`");
  // A linha nova (fixar o lead clicado) roda na aba Atendimentos, que existe para os dois níveis —
  // mas ela não pode ter escapado do `if` da aba, senão faria consulta em Triagem também.
  const iAba = CORPO_PAGE.indexOf('aba === "atendimentos"');
  verdade(iAba > 0, "a página não decide mais a lista pela aba Atendimentos");
});

// ── O DESTINO DO ÍCONE EXISTE NOS DOIS CASOS ────────────────────────────────────────────────────
//
// O painel de recusa não aparece para lead já convertido em processo, e isso está certo. Mas o
// ícone "Ver a recusa" CONTINUA na fila nesse caso — ela busca por `estado: EM_ANALISE`, e converter
// não muda esse estado. Sem um bloco para o caso convertido, o ícone promete a recusa e entrega tela
// sem nada: o usuário clica de novo, acha que travou, e passa a desconfiar do resto.

teste("o destino do ícone 'Ver a recusa' existe TAMBÉM para lead já convertido — a âncora nunca cai no vazio", () => {
  // As duas pontas do `convertedCaseId`: uma com o painel, outra com a explicação. Se existisse só
  // uma, metade dos cliques do ícone não teria onde chegar.
  const comPainel = /\{!selecionado\.convertedCaseId && \(/.test(CORPO_PAGE);
  const semPainel = /\{selecionado\.convertedCaseId && \(/.test(CORPO_PAGE);
  verdade(comPainel, "sumiu o bloco do painel de recusa (lead NÃO convertido)");
  verdade(semPainel, "não há bloco para o lead JÁ convertido — o ícone 'Ver a recusa' levaria a uma tela sem nada");

  // A ÂNCORA É A MESMA NOS DOIS, e vem da constante — é ela que o endereço do ícone aponta. Duas
  // âncoras diferentes, ou uma escrita à mão, fariam o ícone acertar num caso e errar no outro.
  const ancoras = [...CORPO_PAGE.matchAll(/id=\{ANCORA_DA_RECUSA\}/g)].length;
  igual(ancoras, 2, "esperava a MESMA âncora nos dois blocos (com painel e sem), vinda da constante");

  // E o anel do foco também nos dois: ele é a garantia que não depende de o navegador ter rolado.
  // Conta o ANEL, e não a comparação `foco === FOCO_DA_RECUSA`: essa aparece uma terceira vez na
  // leitura do parâmetro da URL (`searchParams.foco === ...`), e contar a comparação faria este teste
  // afirmar sobre linha que não é a que ele pensa estar lendo — a mesma armadilha da janela de
  // caracteres, em outra roupa.
  const aneis = [...CORPO_PAGE.matchAll(/ring-\[var\(--frame-accent\)\]/g)].length;
  igual(aneis, 2, "o anel de foco tem de ser desenhado nos dois casos — senão quem clicou no ícone não acha o que procurava");

  // O bloco do convertido precisa EXPLICAR, não só existir vazio. Asserção sobre o mecanismo
  // (menciona a conversão e diz que o registro não se perdeu), tolerante à redação.
  const trecho = CORPO_PAGE.slice(CORPO_PAGE.search(/\{selecionado\.convertedCaseId && \(/));
  verdade(/convertid/i.test(trecho), "o bloco do lead convertido não diz que ele foi convertido");
  verdade(/hist[oó]rico|registro/i.test(trecho), "o bloco não diz onde o registro da recusa continua — ficaria parecendo que a recusa se perdeu");
});

resumo("Central de Atendimento — etapa 3 (acabamento: chips, largura, escala, 'Ver a recusa', realce)");
