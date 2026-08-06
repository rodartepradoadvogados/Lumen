import { prisma } from "@/lib/prisma";
import { normalizarNumeroProcesso } from "@/lib/roboBridge";
import { saoPauloDayKey, saoPauloDayRangeUtc } from "@/lib/publicationGrouping";

// "Assumir responsabilidade" por uma publicação/andamento — a única forma de baixar um card da
// fila de TODO MUNDO do escritório.
//
// A regra pedida pelo dono do escritório, e o porquê dela:
//
//   Marcar como lida  -> continua PESSOAL. Quem clicou está dizendo "isso não é comigo" (ou "já
//                        vi"), e some só da fila dele. Os demais advogados continuam com a
//                        pendência em aberto, que é exatamente o desejado: ninguém pode fazer o
//                        item desaparecer do escritório só por tê-lo lido.
//   Gerar compromisso  -> vale para TODOS. Aqui alguém assumiu: existe uma Task com responsável,
//   na agenda ou            prazo e data, o item virou trabalho de uma pessoa concreta. Manter o
//   delegar tarefa          card na fila dos outros só produziria retrabalho — três advogados
//                           abrindo a mesma publicação já resolvida.
//
// Ponto de entrada ÚNICO: lib/actions/tasks.ts:delegateTask, quando recebe publicationId.
// "Gerar Prazo", "Marcar Audiência" e "Delegar" (desktop e mobile) já passam todos pelo MESMO
// formulário (components/DelegateTaskForm.tsx) e portanto pela mesma ação — não existe um segundo
// caminho que crie compromisso a partir de publicação, então não existe um segundo lugar onde
// esta baixa possa ser esquecida.

export type PublicationResolutionResult = {
  // Quantas publicações do grupo foram baixadas (o card da tela agrupa por processo + dia).
  publications: number;
  // Para quantas pessoas do escritório o item saiu da fila.
  users: number;
};

// Baixa a publicação e TODAS as irmãs do mesmo grupo para todos os membros ativos do escritório.
//
// "Grupo" aqui é exatamente o mesmo que o usuário vê como UM card: mesmo processo (número CNJ
// normalizado) no mesmo dia de Brasília — ver lib/publicationGrouping.ts, de onde as duas regras
// (número normalizado e dia) são importadas em vez de reescritas. Isso não é detalhe: a tela só
// tira o card da aba "Não lidas" quando TODOS os itens do grupo estão lidos (`allRead`), então
// baixar só a publicação clicada deixaria o card teimosamente visível para os colegas por causa
// da cópia que chegou por outra fonte (DJEN + Datajud + e-mail do Jusbrasil do mesmo ato).
//
// A baixa é feita gravando PublicationRead para cada membro — de propósito, em vez de um campo
// novo "resolvido" no Publication. Todo contador e toda tela de não lidas que existe hoje (badge
// da Sidebar, ícone do PWA, Central de Alertas, aba do Processo, início do app mobile, as duas
// listagens de Publicações) já lê PublicationRead; reaproveitá-lo faz os seis lugares acertarem
// de uma vez, sem depender de alguém lembrar de aplicar um filtro novo em cada um — e sem risco
// de a próxima tela nascer vazando o item de volta.
export async function resolvePublicationGroupForOffice(
  publicationId: string,
  officeId: string
): Promise<PublicationResolutionResult> {
  const pub = await prisma.publication.findFirst({
    where: { id: publicationId, officeId },
    select: { id: true, processNumberRaw: true, publishedAt: true },
  });
  if (!pub) return { publications: 0, users: 0 };

  const ids = await collectGroupIds(pub, officeId);

  const members = await prisma.user.findMany({
    where: { officeId, active: true },
    select: { id: true },
  });
  if (members.length === 0) return { publications: 0, users: 0 };

  await prisma.publicationRead.createMany({
    data: ids.flatMap((pubId) => members.map((m) => ({ publicationId: pubId, userId: m.id }))),
    // Quem já tinha lido continua lido — skipDuplicates evita colidir com a chave única
    // (publicationId, userId) sem precisar consultar antes quem já leu.
    skipDuplicates: true,
  });

  // Acende a tarja "Compromisso gerado" que o card já sabia desenhar (PublicationRow.tsx) mas que
  // nada no sistema jamais ligava. É o que explica, para quem for procurar o item depois na aba
  // "Lidas", por que ele saiu da fila: não foi alguém marcando como lido, foi compromisso criado.
  await prisma.publication.updateMany({
    where: { id: { in: ids }, officeId },
    data: { deadlineGenerated: true },
  });

  return { publications: ids.length, users: members.length };
}

// Ids do grupo a partir de UMA publicação, já com o escopo de escritório conferido. Existe
// porque vincular publicação a processo (lib/actions/publications.ts) precisa da MESMA noção de
// grupo usada aqui: o usuário age sobre o que ele vê, e o que ele vê é o card inteiro. Devolve
// lista vazia quando a publicação não é do escritório — o chamador não precisa checar de novo.
export async function collectPublicationGroupIds(publicationId: string, officeId: string): Promise<string[]> {
  const pub = await prisma.publication.findFirst({
    where: { id: publicationId, officeId },
    select: { id: true, processNumberRaw: true, publishedAt: true },
  });
  if (!pub) return [];
  return collectGroupIds(pub, officeId);
}

// Ids do grupo (a publicação + as irmãs do mesmo processo no mesmo dia de Brasília).
async function collectGroupIds(
  pub: { id: string; processNumberRaw: string | null; publishedAt: Date },
  officeId: string
): Promise<string[]> {
  const normalized = normalizarNumeroProcesso(pub.processNumberRaw);
  // Sem número de processo reconhecível não há como afirmar que duas publicações são o mesmo ato
  // — na listagem elas também viram grupos de um item só. Baixa só ela mesma.
  if (!normalized) return [pub.id];

  // Recorte pelo DIA (em UTC, ver saoPauloDayRangeUtc) antes de trazer qualquer linha: sem isso
  // seria preciso varrer todas as publicações do escritório para comparar número normalizado em
  // memória. O número não é comparável em SQL porque no banco ele está cru, com máscara e
  // formatos diferentes conforme a fonte — por isso a comparação final é em JS, mas já sobre um
  // punhado de linhas (as de um único dia daquele escritório).
  const { start, end } = saoPauloDayRangeUtc(pub.publishedAt);
  const sameDay = await prisma.publication.findMany({
    where: { officeId, publishedAt: { gte: start, lt: end }, processNumberRaw: { not: null } },
    select: { id: true, processNumberRaw: true, publishedAt: true },
  });

  const ids = sameDay
    .filter(
      (p) =>
        normalizarNumeroProcesso(p.processNumberRaw) === normalized &&
        // Cinto e suspensório: o recorte por intervalo já garante o mesmo dia, mas comparar a
        // chave de dia formatada mantém esta função respondendo pela MESMA regra que a listagem
        // usa, mesmo que o intervalo mude algum dia.
        saoPauloDayKey(p.publishedAt) === saoPauloDayKey(pub.publishedAt)
    )
    .map((p) => p.id);

  return ids.includes(pub.id) ? ids : [...ids, pub.id];
}
