import type { Prisma } from "@prisma/client";
import { filtroDoAtendimento, type QuemOlha } from "@/lib/acessoAtendimento";

// ============================================================================
// O CLIQUE DA CENTRAL DE ATENDIMENTO — ETAPA 2: para onde vai, e o que reconfere ao chegar.
//
// A etapa 1 montou a tela (app/atendimento-central/) com as duas abas e as três guias de Triagem,
// e deixou o clique morto de propósito: a fila, o card do funil e a linha de recusados continuavam
// levando para a rota antiga /atendimento/:id, que é OUTRA tela, dentro da casca do Lúmen. Quem
// estava organizando a captação perdia a tela em que estava a cada lead que abria.
//
// ESTE MÓDULO EXISTE PARA QUE HAJA UM LUGAR SÓ, e não três. As duas metades do clique são as duas
// funções daqui:
//
//   hrefDaConversa   PARA ONDE o clique vai. Dois destinos, e um deles é o de sempre: "classico" é
//                    /atendimento/:id, a rota antiga, que continua sendo o destino de quem abre a
//                    Triagem antiga (app/(app)/atendimento/funil/page.tsx) — ela não foi tocada.
//                    "central" é a MESMA tela onde a pessoa já está, na aba Atendimentos.
//
//   recorteDaConversa  O QUE SE RECONFERE AO CHEGAR. O `id` que veio da URL é palpite de quem
//                    clicou, nunca prova: ele entra na consulta ao lado do escritório de quem pediu
//                    e do recorte por dono. É a regra da casa — toda leitura de uma entidade
//                    reconfere o officeId de quem pediu, e id sozinho não decide nada.
//
// POR QUE O DESTINO É UM TEXTO ("central" | "classico") E NÃO UMA FUNÇÃO PASSADA POR PROP. Dois dos
// três componentes de lista são de cliente ("use client": QuadroDoFunil e RecusadosParaAnalise).
// Função não atravessa a fronteira servidor→cliente do App Router: passar `(id) => ...` como prop
// quebraria na serialização, em tempo de execução, sem o TypeScript dizer nada. Um literal de união
// atravessa, e o cálculo do endereço fica aqui, num lugar só, para os três.
//
// POR QUE NÃO HÁ `prisma` NESTE ARQUIVO. Só o `where` sai daqui; quem consulta é a página, com o
// `include` que a tela dela precisa. Assim o módulo é puro e a reconferência de escritório fica
// provável em teste de mesa, sem banco — que é justamente a trava que não pode sair sem ninguém ver.
// ============================================================================

/** A rota da tela fundida. Uma constante porque o clique não pode divergir do item de menu. */
export const ROTA_DA_CENTRAL = "/atendimento-central";

/**
 * Onde a conversa abre.
 *
 * "classico"  a rota de sempre, /atendimento/:id, dentro da casca do Lúmen.
 * "central"   a aba Atendimentos da própria Central, sem sair da tela.
 *
 * O PADRÃO É "classico" de propósito: um componente de lista que alguém hospedar amanhã numa tela
 * nova sem pensar no assunto continua se comportando como hoje, e não passa a mandar a pessoa para
 * uma tela que talvez ela nem tenha aberto.
 */
export type DestinoDaConversa = "classico" | "central";

/**
 * O endereço que a linha/o card abre.
 *
 * Em "central" o endereço é a MESMA rota com outros parâmetros de busca — e é isso que faz o clique
 * ser navegação macia do App Router (o <Link> troca o conteúdo, o documento não recarrega), em vez
 * de uma ida e volta ao servidor com a tela inteira piscando.
 *
 * O id vai escapado. Ele é um cuid hoje, mas quem monta URL com dado de banco sem escapar acerta
 * por enquanto e erra no dia em que o formato do id mudar.
 */
export function hrefDaConversa(destino: DestinoDaConversa, attendanceId: string): string {
  if (destino === "central") {
    return `${ROTA_DA_CENTRAL}?aba=atendimentos&id=${encodeURIComponent(attendanceId)}`;
  }
  return `/atendimento/${attendanceId}`;
}

/**
 * O que a tela escreve quando o `id` pedido na URL não passa pelo recorte.
 *
 * UMA FRASE PARA OS TRÊS CASOS, de propósito: não existe, é de outro escritório, ou não foi
 * repassada a quem pediu. Distinguir seria dizer a alguém de fora que aquele id existe — e num
 * sistema de vários inquilinos isso já é informação demais. Curta na tela; o motivo fica aqui.
 */
export const CONVERSA_FORA_DO_SEU_ALCANCE =
  "Esta conversa não está ao seu alcance. Ou ela não existe, ou é de outro escritório, ou não foi repassada a você.";

/** Quem está pedindo: o nível de acesso, mais a identidade que o recorte usa. */
export type QuemAbreAConversa = QuemOlha & { id: string; officeId: string };

/**
 * O `where` de UMA conversa, do jeito que ela pode ser lida por quem pediu.
 *
 * TRÊS CONDIÇÕES, E NENHUMA É DISPENSÁVEL:
 *
 *   id          o que veio da URL — o palpite.
 *   officeId    o escritório de QUEM PEDIU, nunca o que veio junto do pedido. Sem esta linha, um id
 *               de outro escritório colado na URL abriria a conversa de outro escritório: o id é
 *               único no banco inteiro, não por inquilino. É esta a linha que a mutação tira.
 *   recorte     filtroDoAtendimento: vazio para quem vê o escritório todo, responsibleId para quem
 *               só vê os próprios, e um filtro IMPOSSÍVEL para quem não tem acesso nenhum. Sem ela,
 *               o clique abriria conversa que a pessoa não poderia nem LISTAR — que é exatamente o
 *               furo que a fusão das duas telas poderia ter aberto.
 *
 * Devolve `where`, e não o registro, porque cada tela precisa de um `include` diferente. O que não
 * pode variar de tela para tela é o recorte — e ele está aqui.
 */
export function recorteDaConversa(quem: QuemAbreAConversa, attendanceId: string): Prisma.AttendanceWhereInput {
  return {
    id: attendanceId,
    officeId: quem.officeId,
    ...filtroDoAtendimento(quem, quem.id),
  };
}

// ============================================================================
// ETAPA 3 — "VER A RECUSA" DEIXA DE TIRAR A PESSOA DA CENTRAL.
//
// O DEFEITO. O ícone "Ver a recusa" da linha de recusados apontava, escrito cru dentro do
// componente, para /atendimento/:id?aba=ficha&bloco=processo. Na Central isso abria OUTRA tela na
// MESMA aba do navegador: quem estava organizando a captação perdia a Central inteira para ler a
// carta de um lead — exatamente o que a etapa 2 corrigiu para o clique da linha e deixou de pé para
// este ícone.
//
// A DECISÃO: A CENTRAL JÁ HOSPEDA O QUE ESTE ÍCONE PRECISA MOSTRAR — não foi preciso trazer a ficha.
// O que o ícone promete ("Ver a recusa e a carta") é o que RecusarLeadPainel mostra: motivo,
// situação, observação, o link da carta com o botão de copiar e o "marcar como enviada". E esse
// painel está na Central desde a etapa 1, no trilho da aba Atendimentos — é o MESMO componente que
// o bloco `processo` da ficha antiga renderiza (ver app/(app)/atendimento/[id]/page.tsx: o bloco tem
// RecusarLeadPainel e o formulário de Transformar em Processo, que não é o que este ícone promete).
// Hospedar a ficha inteira seria trazer sete divisórias para dentro da Central por causa de um
// ícone; abrir em aba nova esconderia que a Central já tem a resposta na tela em que a pessoa está.
//
// SOBRA UMA COISA A DIZER À TELA: QUAL DOS DOIS PAINÉIS a pessoa veio ver. A conversa e o trilho
// aparecem juntos, e quem clica neste ícone quer o trilho — daí `foco=recusa`, que a página lê para
// destacar o painel, e a âncora, que pede ao navegador para rolar até ele. O destaque é a garantia
// (é servidor: sempre acontece); a âncora é a comodidade (depende de o navegador rolar).
//
// O DESTINO "classico" NÃO MUDA: a Triagem antiga continua abrindo a ficha antiga, na rota antiga.
// Ela não foi tocada nesta etapa — de novo.
// ============================================================================

/** O parâmetro que diz à Central qual painel a pessoa veio ver. */
export const FOCO_DA_RECUSA = "recusa";

/**
 * O id do elemento do painel de recusa na Central.
 *
 * É constante porque o `href` (aqui) e o `id` (na página) têm de ser a MESMA palavra: dois literais
 * iguais em dois arquivos divergem no dia em que alguém renomeia um deles, e o sintoma é uma âncora
 * que não rola para lugar nenhum — sem erro e sem aviso.
 */
export const ANCORA_DA_RECUSA = "recusa-do-lead";

/**
 * Onde "Ver a recusa" abre.
 *
 * Em "central", o MESMO endereço da conversa (hrefDaConversa, e não um segundo cálculo do mesmo
 * endereço) mais o foco e a âncora: a pessoa continua na Central, com o painel da recusa destacado.
 * Em "classico", a ficha antiga no bloco do processo — de onde o painel da recusa nunca saiu.
 */
export function hrefDaRecusa(destino: DestinoDaConversa, attendanceId: string): string {
  if (destino === "central") {
    return `${hrefDaConversa("central", attendanceId)}&foco=${FOCO_DA_RECUSA}#${ANCORA_DA_RECUSA}`;
  }
  return `/atendimento/${attendanceId}?aba=ficha&bloco=processo`;
}
