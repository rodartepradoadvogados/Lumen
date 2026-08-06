// Agrupamento de Publication (publicações/andamentos) pelo mesmo processo NO MESMO DIA, para a
// listagem em app/(app)/publicacoes/page.tsx e app/m/publicacoes/page.tsx. O mesmo evento
// processual hoje pode chegar por mais de uma fonte (DJEN direto, Datajud, e-mail do
// Jusbrasil...) e virava um card duplicado por fonte — este módulo faz o agrupamento em nível de
// apresentação/query, sem tabela nova no banco (o critério é 100% determinístico a partir de
// Publication.processNumberRaw + source + data, não precisa persistir nada).
//
// O agrupamento é por processo + dia (não só por processo): duas movimentações reais e
// diferentes do mesmo processo, em dias diferentes, são eventos distintos e cada uma merece seu
// próprio card — só o reenvio do MESMO evento por outra fonte (mesmo dia) deve virar um card só.
// O dia é calculado no fuso de Brasília (America/Sao_Paulo), o mesmo que a badge de data mostra
// ao usuário (formatDate, client-side, no fuso do navegador) — sem isso, uma publicação perto da
// meia-noite podia cair num "dia" diferente do que aparece escrito no card.
//
// Fica em lib/ (puro, sem depender de Prisma nem de "use client"/"use server") porque é usado
// tanto pela página desktop quanto pela mobile, e também por qualquer contador de "não lidas"
// fora da própria tela de Publicações (Sidebar, início mobile) — a duplicidade de contagem de
// não lidas é o mesmo problema da duplicidade de cards, só que em número em vez de em lista.

import { normalizarNumeroProcesso } from "@/lib/roboBridge";

// Prioridade de fonte pra escolher qual publicação representa o grupo quando o mesmo evento
// processual chega por mais de um canal: DJEN (Diário de Justiça Eletrônico Nacional) é a fonte
// mais direta/oficial, Datajud (API do CNJ) em seguida, e-mail do Jusbrasil por último entre as
// automatizadas (é um repasse de terceiro), e qualquer outra fonte (DJE estadual, PJe, ESAJ,
// Projudi, eproc, PNCP, DOU, lançamento manual...) numa faixa só, mais baixa — entre publicações
// dessa faixa (ou da mesma fonte), desempate é sempre pela mais recente.
const SOURCE_PRIORITY: Record<string, number> = {
  DJEN: 0,
  DATAJUD: 1,
  JUSBRASIL_EMAIL: 2,
};

function sourceRank(source: string): number {
  return SOURCE_PRIORITY[source] ?? 3;
}

// América/São_Paulo não observa mais horário de verão desde 2019 — sempre UTC-3, sem
// ambiguidade de data ao redor de troca de horário. Formato en-CA devolve AAAA-MM-DD direto.
const SP_DAY_FORMATTER = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });

export function saoPauloDayKey(date: string | Date): string {
  return SP_DAY_FORMATTER.format(new Date(date));
}

// Intervalo em UTC que corresponde ao DIA de Brasília em que `date` caiu — para consultar no
// banco "as outras publicações do mesmo dia" sem varrer a tabela inteira. Só é correto porque o
// fuso é fixo em UTC-3 (ver acima): o dia D de Brasília começa em D 03:00Z e termina em
// D+1 03:00Z. Deriva do MESMO formatador que decide o agrupamento, então não existe como as duas
// regras divergirem — se um dia o Brasil voltar a ter horário de verão, os dois quebram juntos e
// de forma visível, em vez de silenciosamente discordarem um do outro.
export function saoPauloDayRangeUtc(date: string | Date): { start: Date; end: Date } {
  const start = new Date(`${saoPauloDayKey(date)}T03:00:00.000Z`);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

export type GroupableItem = {
  id: string;
  source: string;
  publishedAt: string; // ISO — já serializado (Date.toISOString())
  processNumberRaw: string | null;
  read: boolean; // lido pelo viewer atual (ver PublicationRead)
};

export type PublicationGroup<T extends GroupableItem> = {
  // Id da publicação principal — estável e único, serve de key/identificador do grupo inteiro
  // (não criamos id novo de "grupo" nenhum: o agrupamento é só apresentação).
  key: string;
  primary: T;
  // Todos os itens do grupo (incluindo o primary), em ordem cronológica desc — mesmo padrão de
  // "mais recente primeiro" usado no resto do produto.
  items: T[];
  // true só quando TODOS os itens do grupo estão lidos pelo viewer — usado tanto para decidir em
  // qual aba (Não lidas/Lidas) o grupo aparece quanto para o badge de contagem.
  allRead: boolean;
};

// Agrupa por número de processo normalizado (CNJ de 20 dígitos, via normalizarNumeroProcesso) +
// dia (fuso de Brasília) de publicação. Publicações sem número reconhecido (ou que não batem com
// nenhuma outra do mesmo processo no mesmo dia) viram grupos de 1 item só — nunca são forçadas a
// agrupar com outra coisa.
export function groupPublicationsByProcess<T extends GroupableItem>(pubs: T[]): PublicationGroup<T>[] {
  const byProcessAndDay = new Map<string, T[]>();
  const singles: T[] = [];

  for (const pub of pubs) {
    const normalized = normalizarNumeroProcesso(pub.processNumberRaw);
    if (!normalized) {
      singles.push(pub);
      continue;
    }
    const bucketKey = `${normalized}|${saoPauloDayKey(pub.publishedAt)}`;
    const bucket = byProcessAndDay.get(bucketKey);
    if (bucket) bucket.push(pub);
    else byProcessAndDay.set(bucketKey, [pub]);
  }

  const groups: PublicationGroup<T>[] = [];
  for (const items of byProcessAndDay.values()) groups.push(buildGroup(items));
  for (const single of singles) groups.push(buildGroup([single]));

  // Mesmo critério de ordenação que a listagem já usava por publicação individual: data de
  // publicação do item principal do grupo, mais recente primeiro.
  groups.sort((a, b) => new Date(b.primary.publishedAt).getTime() - new Date(a.primary.publishedAt).getTime());

  return groups;
}

function buildGroup<T extends GroupableItem>(items: T[]): PublicationGroup<T> {
  const chronological = items.slice().sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  const primary = chronological
    .slice()
    .sort((a, b) => {
      const rankDiff = sourceRank(a.source) - sourceRank(b.source);
      if (rankDiff !== 0) return rankDiff;
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    })[0];
  return {
    key: primary.id,
    primary,
    items: chronological,
    allRead: chronological.every((p) => p.read),
  };
}

// Versão leve pra quando só temos a lista de publicações JÁ NÃO LIDAS (sem o estado de leitura
// dos outros itens do mesmo grupo — não precisamos dele aqui: se a linha está nessa lista, ela é
// não lida, e isso já basta pra contar o grupo como "tem pendência"). Usada pelos badges fora da
// tela de Publicações (Sidebar, início mobile), que hoje só buscam `processNumberRaw` das
// publicações não lidas por custo de query — contar grupos em vez de linhas é só deduplicar por
// número de processo normalizado (mesma regra do agrupamento acima).
export function countUnreadPublicationGroups(rows: { id: string; processNumberRaw: string | null; publishedAt: string | Date }[]): number {
  const seen = new Set<string>();
  for (const row of rows) {
    const normalized = normalizarNumeroProcesso(row.processNumberRaw);
    seen.add(normalized ? `${normalized}|${saoPauloDayKey(row.publishedAt)}` : `id:${row.id}`);
  }
  return seen.size;
}
