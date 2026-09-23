import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao, hrefsDeLinks } from "./executar";
import {
  hrefDaConversa,
  recorteDaConversa,
  ROTA_DA_CENTRAL,
  CONVERSA_FORA_DO_SEU_ALCANCE,
  type QuemAbreAConversa,
} from "@/lib/conversaDaCentral";
import { nivelDeAcessoAoAtendimento } from "@/lib/acessoAtendimento";
import { RAIL_SECTIONS } from "@/lib/navSections";

// ============================================================================
// A CENTRAL DE ATENDIMENTO — ETAPA 2: O CLIQUE QUE ABRE A CONVERSA NA PRÓPRIA TELA.
//
// A etapa 1 montou a tela e deixou o clique morto: a fila, o card do funil e a linha de recusados
// continuavam levando para /atendimento/:id, que é outra tela. Esta etapa liga os dois lados. São
// DUAS coisas a provar, e a segunda é a que não pode falhar em silêncio:
//
//   1. PARA ONDE O CLIQUE VAI. Um lugar só calcula o endereço (lib/conversaDaCentral.ts), os três
//      componentes de lista o recebem por `destino`, e o padrão continua sendo a rota antiga — a
//      Triagem antiga não mudou de comportamento e não precisou ser editada.
//
//   2. O QUE SE RECONFERE AO CHEGAR. O `id` vem da URL: é palpite. Ele entra na consulta ao lado do
//      officeId de QUEM PEDIU e do recorte por dono. Sem isso a fusão das duas telas teria aberto um
//      caminho novo por onde se leria conversa que a pessoa não poderia nem listar — e a tela
//      mostraria a conversa inteira, sem erro nenhum no console.
//
// SOBRE A FORMA DESTAS ASSERÇÕES. As de acesso são de MESA (chamam a função e olham o resultado):
// é isso que faz a mutação "tirar o officeId" reprovar em vez de passar verde. As de varredura leem
// a EXPRESSÃO do href (hrefsDeLinks), e não a grafia dela — a grafia desta linha já mudou uma vez
// nesta casa, e a asserção presa à antiga reprovaria a correção em lugar do defeito.
// ============================================================================

const RAIZ = process.cwd();

const SOCIO: QuemAbreAConversa = { id: "u-socio", officeId: "esc-1", isAdmin: true, role: "Sócio", recebeTransferencia: true };
const ADVOGADO: QuemAbreAConversa = { id: "u-adv", officeId: "esc-1", isAdmin: false, role: "Advogado", recebeTransferencia: true };
const SEM_ACESSO: QuemAbreAConversa = { id: "u-est", officeId: "esc-1", isAdmin: false, role: "Estagiário", recebeTransferencia: false };
const SOCIO_DE_OUTRO_ESCRITORIO: QuemAbreAConversa = { ...SOCIO, id: "u-socio-2", officeId: "esc-2" };

const ID = "atd-123";

// ── 0. Os três figurantes são mesmo os três níveis — senão o resto da suíte prova outra coisa ────

teste("os figurantes cobrem os três níveis de acesso: total, próprios, nenhum", () => {
  igual(nivelDeAcessoAoAtendimento(SOCIO), "total");
  igual(nivelDeAcessoAoAtendimento(ADVOGADO), "proprios");
  igual(nivelDeAcessoAoAtendimento(SEM_ACESSO), "nenhum");
});

// ── 1. PARA ONDE O CLIQUE VAI ───────────────────────────────────────────────────────────────────

teste("o clique da Central não sai da Central: mesma rota do item de menu, outros parâmetros", () => {
  const item = RAIL_SECTIONS.flatMap((s) => s.items).find((i) => i.label === "Atendimento");
  verdade(!!item, "o item de menu 'Atendimento' sumiu — a rota do clique não tem mais com o que ser comparada");
  igual(ROTA_DA_CENTRAL, item!.href, "o endereço do clique divergiu do item de menu: o clique levaria para uma tela que o menu não abre");

  const href = hrefDaConversa("central", ID);
  verdade(href.startsWith(`${ROTA_DA_CENTRAL}?`), `o clique saiu da rota da Central: ${href}`);
  verdade(href.includes(`id=${ID}`), "o endereço não carrega o id da conversa — a tela abriria no primeiro da lista, não no que foi clicado");
});

teste("o clique cai na aba ATENDIMENTOS, e não de volta na Triagem", () => {
  // Sem `aba=atendimentos` a tela usa o padrão da etapa 1, que é "triagem": clicar num card do funil
  // devolveria a pessoa ao próprio funil, com o id na URL e nada acontecendo. Falha silenciosa.
  verdade(hrefDaConversa("central", ID).includes("aba=atendimentos"),
    "o endereço do clique perdeu `aba=atendimentos` — o clique voltaria para a Triagem, de onde partiu");
});

teste("o destino 'classico' continua sendo a rota antiga, sem parâmetro nenhum", () => {
  igual(hrefDaConversa("classico", ID), `/atendimento/${ID}`);
});

teste("o id vai escapado — quem monta URL com dado de banco cru acerta hoje e erra depois", () => {
  const href = hrefDaConversa("central", "a b&c=d");
  verdade(!href.includes("a b&c=d"), "o id entrou cru na URL: um '&' no id viraria outro parâmetro de busca");
  verdade(href.includes(encodeURIComponent("a b&c=d")), "o id não foi escapado com encodeURIComponent");
});

// ── 2. OS TRÊS COMPONENTES DE LISTA ─────────────────────────────────────────────────────────────

const COMPONENTES: { arquivo: string; idDoRegistro: RegExp; linhas: number }[] = [
  // A fila tem DOIS links para o mesmo lugar (a linha inteira e o botão "Abrir"); as outras duas,
  // um cada. Ver a suíte triagemConsertos, que é quem guarda a não-aninhação.
  { arquivo: "components/atendimento/FilaDeEspera.tsx", idDoRegistro: /\bq\.id\b/, linhas: 2 },
  { arquivo: "components/atendimento/RecusadosParaAnalise.tsx", idDoRegistro: /\br\.attendanceId\b/, linhas: 1 },
  { arquivo: "components/atendimento/QuadroDoFunil.tsx", idDoRegistro: /\bcard\.id\b/, linhas: 1 },
];

teste("os três componentes de lista calculam o endereço, nenhum deles escreve a rota na mão", () => {
  for (const { arquivo, idDoRegistro, linhas } of COMPONENTES) {
    const fonte = codigoDe(readFileSync(join(RAIZ, arquivo), "utf8"));
    // TODOS os endereços derivados do id daquele registro — tanto o da conversa quanto o de "Ver a
    // recusa", que deriva do mesmo id e vai para outro painel.
    //
    // ESTE FILTRO JÁ FOI `!h.includes("aba=ficha")`, E ERA O DEFEITO 3 DESTA CASA (ver executar.ts):
    // a asserção presa a UMA GRAFIA. Ela separava "conversa" de "recusa" pela grafia da rota antiga
    // escrita dentro do componente — então, na etapa 3, quando o endereço da recusa passou a ser
    // CALCULADO (hrefDaRecusa, para o ícone parar de tirar a pessoa da Central), esta linha reprovou
    // a CORREÇÃO e não defeito nenhum. A separação agora é pelo CALCULADOR que cada link chama, que
    // é a diferença de verdade entre os dois destinos, e tolera a grafia que o endereço tiver.
    const derivados = hrefsDeLinks(fonte).filter((h) => idDoRegistro.test(h));
    const daConversa = derivados.filter((h) => h.includes("hrefDaConversa"));
    const daRecusa = derivados.filter((h) => h.includes("hrefDaRecusa"));
    igual(daConversa.length, linhas, `${arquivo}: esperava ${linhas} link(s) de conversa derivado(s) do id do registro`);
    igual(
      daConversa.length + daRecusa.length,
      derivados.length,
      `${arquivo}: sobrou endereço derivado do id do registro que não passa por nenhum dos dois calculadores de lib/conversaDaCentral.ts (${derivados.filter((h) => !h.includes("hrefDaConversa") && !h.includes("hrefDaRecusa")).join(" | ")})`,
    );
    for (const h of derivados) {
      verdade(!h.includes("/atendimento/"),
        `${arquivo} voltou a escrever a rota na mão (${h}) — com a rota embutida, hospedar o componente na Central manda a pessoa para fora da tela`);
      verdade(h.includes("destino"),
        `${arquivo}: o endereço não depende mais do \`destino\` recebido — o componente decidiu sozinho para onde levar quem clicou`);
    }
  }
});

teste("o padrão dos três é 'classico': hospedar sem pensar no assunto não muda o comportamento de ninguém", () => {
  for (const { arquivo } of COMPONENTES) {
    const fonte = codigoDe(readFileSync(join(RAIZ, arquivo), "utf8"));
    verdade(/destino\s*=\s*"classico"/.test(fonte),
      `${arquivo} perdeu o padrão "classico" — uma tela que hospede o componente sem passar destino passaria a mandar a pessoa para a Central`);
  }
});

teste("os três navegam pelo <Link> do App Router — é o que troca o conteúdo sem recarregar o documento", () => {
  for (const { arquivo } of COMPONENTES) {
    const fonte = codigoDe(readFileSync(join(RAIZ, arquivo), "utf8"));
    verdade(/import Link from "next\/link";/.test(fonte), `${arquivo} deixou de usar o <Link> do Next`);
    verdade(!fonte.includes("window.location"),
      `${arquivo} navega por window.location — isso recarrega o documento inteiro e a Central pisca a cada lead aberto`);
  }
});

teste("o foco por teclado é visível em TODOS os alvos de conversa — a linha é comodidade, o teclado é garantia", () => {
  for (const { arquivo } of COMPONENTES) {
    const fonte = codigoDe(readFileSync(join(RAIZ, arquivo), "utf8"));
    verdade(fonte.includes("focus-visible:ring"),
      `${arquivo}: o alvo clicável não mostra onde o foco está — quem tabula pela lista fica sem saber o que vai abrir`);
  }
});

// ── 3. A TELA PASSA O DESTINO, E A TRIAGEM ANTIGA NÃO ───────────────────────────────────────────

const FONTE_PAGE = readFileSync(join(RAIZ, "app", "atendimento-central", "page.tsx"), "utf8");
const PAGE = codigoDe(FONTE_PAGE);
const CORPO_PAGE = corpoDaFuncao(FONTE_PAGE, "AtendimentoCentralPage");
const FUNIL_ANTIGO = codigoDe(readFileSync(join(RAIZ, "app", "(app)", "atendimento", "funil", "page.tsx"), "utf8"));

/** A tag JSX de abertura, lida por CONTAGEM DE CHAVES — janela de N caracteres transborda. */
function tagJsx(fonte: string, nome: string): string {
  const i = fonte.indexOf(`<${nome}`);
  if (i < 0) return "";
  let nivel = 0;
  for (let j = i; j < fonte.length; j++) {
    const c = fonte[j];
    if (c === "{") nivel++;
    else if (c === "}") nivel--;
    else if (c === ">" && nivel === 0) return fonte.slice(i, j + 1);
  }
  return "";
}

teste("a varredura da página achou mesmo o corpo do componente de página (e não o arquivo inteiro)", () => {
  verdade(CORPO_PAGE.length > 4000, "corpoDaFuncao não achou AtendimentoCentralPage — todas as asserções abaixo passariam em cima de string vazia");
  verdade(!CORPO_PAGE.includes("function carregarLista"),
    "o trecho transbordou para carregarLista — uma trava perdida pela página seria encontrada na função vizinha");
});

teste("a Central pede 'central' aos TRÊS componentes de lista da Triagem", () => {
  for (const nome of ["FilaDeEspera", "RecusadosParaAnalise", "QuadroDoFunil"]) {
    const tag = tagJsx(CORPO_PAGE, nome);
    verdade(tag.length > 0, `<${nome}> não está mais na Central`);
    verdade(tag.length < 500, `a leitura da tag <${nome}> transbordou (${tag.length} caracteres) — asserção sobre trecho errado`);
    verdade(/destino=\{?"central"\}?/.test(tag),
      `<${nome}> não recebe destino="central" — essa lista continuaria levando a pessoa para fora da tela`);
  }
});

teste("a Triagem ANTIGA continua no destino clássico — ela não foi tocada nesta etapa", () => {
  verdade(!FUNIL_ANTIGO.includes('destino="central"'),
    'app/(app)/atendimento/funil/page.tsx passou a pedir destino="central" — a tela antiga mandaria a pessoa para a tela nova, que talvez nem esteja aberta');
});

teste("a lista da aba Atendimentos usa o MESMO cálculo de endereço do clique da Triagem", () => {
  // Dois cálculos de endereço para a mesma coisa divergem no dia em que um deles ganha parâmetro.
  verdade(/hrefDaConversa\("central",\s*a\.id\)/.test(CORPO_PAGE),
    "a coluna de lista da aba Atendimentos voltou a montar o endereço por conta própria");
});

// ── 4. A RECONFERÊNCIA — a trava do caminho novo, provada em mesa ───────────────────────────────

teste("MUTAÇÃO PRINCIPAL: o recorte carrega o officeId de QUEM PEDIU, sempre", () => {
  // O id de um atendimento é único no banco INTEIRO, não por inquilino: sem esta linha, um id de
  // outro escritório colado na URL abre a conversa de outro escritório. É a trava que a mutação tira.
  const recorte = recorteDaConversa(SOCIO, ID) as Record<string, unknown>;
  igual(recorte.officeId, SOCIO.officeId, "o recorte da conversa não filtra mais por escritório de quem pediu: ");
  igual(recorte.id, ID);
});

teste("o mesmo id pedido por dois escritórios dá DOIS recortes diferentes — id sozinho não decide nada", () => {
  const aqui = recorteDaConversa(SOCIO, ID) as Record<string, unknown>;
  const la = recorteDaConversa(SOCIO_DE_OUTRO_ESCRITORIO, ID) as Record<string, unknown>;
  igual(aqui.id, la.id, "os dois pediram o mesmo id: ");
  verdade(aqui.officeId !== la.officeId,
    "os dois recortes ficaram iguais apesar de os escritórios serem diferentes — o escritório saiu da consulta");
});

teste("quem só vê os próprios não pode ABRIR o que não poderia LISTAR: o recorte por dono entra junto", () => {
  // A aba Triagem não existe para este nível (etapa 1 prova isso), mas a URL da conversa é adivinhável
  // e o caminho novo não pode ser a porta que a lista fecha. O recorte prende ao responsável.
  const recorte = recorteDaConversa(ADVOGADO, ID) as Record<string, unknown>;
  igual(recorte.responsibleId, ADVOGADO.id, "o recorte por dono saiu da consulta da conversa: ");
  igual(recorte.officeId, ADVOGADO.officeId);
});

teste("quem vê o escritório inteiro não é preso a responsável — o recorte é vazio, não um filtro errado", () => {
  const recorte = recorteDaConversa(SOCIO, ID) as Record<string, unknown>;
  igual("responsibleId" in recorte, false, "quem vê tudo passou a ser filtrado por responsável: a recepção deixaria de abrir a conversa dos outros");
});

teste("quem não tem acesso nenhum recebe filtro IMPOSSÍVEL, e não um recorte vazio", () => {
  // Fechado por padrão: se um dia alguém chamar isto sem barrar o acesso antes, o pior caso é nada
  // aparecer — nunca a conversa inteira.
  const recorte = recorteDaConversa(SEM_ACESSO, ID) as Record<string, unknown>;
  verdade(typeof recorte.responsibleId === "string" && recorte.responsibleId !== SEM_ACESSO.id,
    "o recorte de quem não tem acesso deixou de ser impossível — sem a trava da tela, a conversa abriria");
});

teste("a consulta da conversa na Central passa pelo recorte, e não por um `where` cru com o id", () => {
  verdade(/where:\s*recorteDaConversa\(viewer,\s*idSelecionado\)/.test(CORPO_PAGE),
    "a consulta da conversa da Central deixou de usar recorteDaConversa — a reconferência voltou a ser copiada à mão, e some no próximo refatoramento");
  verdade(!/where:\s*\{\s*id:\s*idSelecionado/.test(CORPO_PAGE),
    "voltou a existir um `where` cru começando pelo id da URL — o id sozinho decidindo qual conversa abre");
});

// ── 5. QUANDO O RECORTE RECUSA, A TELA DIZ — e diz a mesma coisa para os três motivos ───────────

teste("a recusa é uma frase só para os três motivos, sem dizer qual deles é", () => {
  // Tolerante a plural, a variação e à ordem de propósito: o que importa é que a frase deixe os três
  // motivos em aberto. Uma asserção colada na redação exata travaria a própria melhoria do texto.
  const frase = CONVERSA_FORA_DO_SEU_ALCANCE.toLowerCase();
  verdade(/n[ãa]o exist/.test(frase), "a frase não menciona mais a possibilidade de o atendimento não existir");
  verdade(/escrit[óo]rio/.test(frase), "a frase não menciona mais a possibilidade de ser de outro escritório");
  verdade(/repassad/.test(frase), "a frase não menciona mais a possibilidade de não ter sido repassado a quem pediu");
  verdade(/\bou\b/.test(frase), "a frase deixou de manter os três motivos em aberto — dizer QUAL deles é já entrega informação de outro escritório");
});

teste("a tela usa a frase da recusa, e só quando alguém pediu um id de verdade", () => {
  verdade(CORPO_PAGE.includes("CONVERSA_FORA_DO_SEU_ALCANCE"),
    "a Central voltou a mostrar 'Selecione um atendimento à esquerda' para um clique recusado — manda a pessoa repetir o que acabou de fazer");
  verdade(/pedidoNegado\s*=\s*Boolean\(idPedido\)\s*&&\s*!selecionado/.test(CORPO_PAGE),
    "a recusa deixou de depender de terem PEDIDO um id: a frase apareceria também para quem só abriu a tela sem clicar em nada");
  // E o id pedido não pode ser confundido com o que a tela escolheu sozinha (o primeiro da lista).
  verdade(/idSelecionado = idPedido \|\|/.test(CORPO_PAGE),
    "o id pedido na URL parou de ter precedência sobre o primeiro da lista — clicar abriria outra conversa");
});

teste("nenhum hex cru entrou na página junto com esta etapa — a paleta continua em tokens", () => {
  verdade(!/#[0-9a-fA-F]{3,8}/.test(PAGE), "app/atendimento-central/page.tsx ganhou hex cru");
});

resumo("Central de Atendimento — etapa 2 (o clique abre a conversa na própria tela)");
