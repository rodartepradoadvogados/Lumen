// Agrupamento de Publication (publicações/andamentos) pelo mesmo processo, para a listagem em
// app/(app)/publicacoes/page.tsx e app/m/publicacoes/page.tsx. O mesmo evento processual hoje
// pode chegar por mais de uma fonte (DJEN direto, Datajud, e-mail do Jusbrasil...) e virava um
// card duplicado por fonte — este módulo faz o agrupamento em nível de apresentação/query, sem
// tabela nova no banco (o critério é 100% determinístico a partir de Publication.processNumberRaw
// + source, não precisa persistir nada).
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

// Agrupa por número de processo normalizado (CNJ de 20 dígitos, via normalizarNumeroProcesso).
// Publicações sem número reconhecido (ou que não batem com nenhuma outra do mesmo processo)
// viram grupos de 1 item só — nunca são forçadas a agrupar com outra coisa.
export function groupPublicationsByProcess<T extends GroupableItem>(pubs: T[]): PublicationGroup<T>[] {
  const byProcess = new Map<string, T[]>();
  const singles: T[] = [];

  for (const pub of pubs) {
    const normalized = normalizarNumeroProcesso(pub.processNumberRaw);
    if (!normalized) {
      singles.push(pub);
      continue;
    }
    const bucket = byProcess.get(normalized);
    if (bucket) bucket.push(pub);
    else byProcess.set(normalized, [pub]);
  }

  const groups: PublicationGroup<T>[] = [];
  for (const items of byProcess.values()) groups.push(buildGroup(items));
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
export function countUnreadPublicationGroups(rows: { id: string; processNumberRaw: string | null }[]): number {
  const seen = new Set<string>();
  for (const row of rows) {
    const normalized = normalizarNumeroProcesso(row.processNumberRaw);
    seen.add(normalized ?? `id:${row.id}`);
  }
  return seen.size;
}
