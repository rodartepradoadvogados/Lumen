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
