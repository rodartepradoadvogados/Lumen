// Ponte entre o robô Python de captura do DOU via INLABS (robo-publicacoes/src/inlabs.py,
// rodando no Railway) e as tabelas principais do site (Publication/TermoVigilancia/
// FonteAdministrativa). Fase 2 do Setor de Processos Administrativos — mesmo padrão geral de
// lib/pncpBridge.ts, mas BEM MAIS SIMPLES: lá o roteamento por escritório (casar contra
// TermoVigilancia) acontece aqui no TypeScript; aqui, o casamento já aconteceu DENTRO do
// Python (ver decisão de arquitetura no topo de robo-publicacoes/src/inlabs.py) — cada
// RoboDouItem já chega com o officeId certo, então esta ponte só precisa transformar cada
// item pendente numa Publication (idempotente) e atualizar os metadados de acompanhamento
// (TermoVigilancia.ultimoHitAt, FonteAdministrativa).

import { prisma } from "@/lib/prisma";

export type DouBridgeResult = {
  processadas: number;
  publicacoesCriadas: number;
  erros: string[];
};

const CHAVE_FONTE = "DOU_INLABS";

// Monta o texto da Publication a partir dos campos tolerantemente mapeados pelo robô Python
// (ver aviso de mapeamento defensivo no topo de robo-publicacoes/src/inlabs.py) — qualquer um
// deles pode vir null, por isso cada linha tem fallback. Prioriza `ementa`; na ausência dela,
// cai para o `textoResumo` (trecho recortado ao redor do termo, ver inlabs.py:_extrair_resumo).
function montarConteudo(item: {
  titulo: string | null;
  ementa: string | null;
  textoResumo: string | null;
  orgao: string | null;
  secao: string;
  termoEncontrado: string;
  numeroPagina: string | null;
}): string {
  const linhas = [
    `Título: ${item.titulo ?? "(não informado)"}`,
    `Órgão: ${item.orgao ?? "(não informado)"}`,
    `Seção do DOU: ${item.secao}${item.numeroPagina ? ` (pág. ${item.numeroPagina})` : ""}`,
    `Termo vigiado que bateu: "${item.termoEncontrado}"`,
    `Trecho: ${item.ementa ?? item.textoResumo ?? "(sem trecho disponível)"}`,
  ];
  return linhas.join("\n");
}

function formatarDataPublicacao(raw: string | null, fallback: Date): Date {
  if (!raw) return fallback;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

// Upsert de FonteAdministrativa (chave "DOU_INLABS") — uma vez por escritório ao final do
// ciclo, só para os escritórios que tiveram pelo menos 1 RoboDouItem pendente neste ciclo
// (mesmo padrão de lib/pncpBridge.ts:registrarExecucaoFonte). @@unique([officeId, chave])
// garante 1 linha por escritório.
async function registrarExecucaoFonte(officeId: string, sucesso: boolean, detalhe: string): Promise<void> {
  await prisma.fonteAdministrativa.upsert({
    where: { officeId_chave: { officeId, chave: CHAVE_FONTE } },
    create: {
      officeId,
      chave: CHAVE_FONTE,
      nome: "DOU — Diário Oficial da União (via INLABS)",
      ultimaExecucaoAt: new Date(),
      ultimoStatus: sucesso ? "OK" : "ERRO",
      ultimoDetalhe: detalhe,
    },
    update: {
      ultimaExecucaoAt: new Date(),
      ultimoStatus: sucesso ? "OK" : "ERRO",
      ultimoDetalhe: detalhe,
    },
  });
}

// O robô Python (robo-publicacoes/src/inlabs.py) já resolve, DENTRO da própria captura, a
// qual escritório cada artigo do DOU pertence (casando contra TermoVigilancia por lá) — ver
// comentário no topo do arquivo. Esta ponte só materializa cada RoboDouItem pendente como
// Publication (idempotente por emailMessageId), atualiza TermoVigilancia.ultimoHitAt do termo
// que bateu, e registra o resultado em FonteAdministrativa para o painel de status (ver
// app/api/admin/status-fontes/route.ts).
export async function syncDouParaSite(): Promise<DouBridgeResult> {
  const result: DouBridgeResult = { processadas: 0, publicacoesCriadas: 0, erros: [] };

  const itensPendentes = await prisma.roboDouItem.findMany({ where: { statusProcessado: false } });
  if (itensPendentes.length === 0) return result;

  // Acumula por escritório o que aconteceu neste ciclo — para o upsert final em
  // FonteAdministrativa (1 upsert por escritório, não 1 por item).
  const resumoPorOffice = new Map<string, { hits: number; erros: number }>();
  function contarResumo(officeId: string, campo: "hits" | "erros") {
    const atual = resumoPorOffice.get(officeId) ?? { hits: 0, erros: 0 };
    atual[campo]++;
    resumoPorOffice.set(officeId, atual);
  }

  // (termo, officeId) que tiveram acerto neste ciclo — atualizados em lote ao final (evita 1
  // UPDATE por item quando vários artigos batem no mesmo termo vigiado).
  const termosComHit = new Map<string, { officeId: string; termo: string }>();
  // Chave e JSON.stringify do par (nao concatenacao com separador) porque o texto do termo e
  // livre e pode conter qualquer caractere, inclusive o que fosse escolhido como separador.

  for (const item of itensPendentes) {
    result.processadas++;
    try {
      const emailMessageId = `dou-${item.chaveUnica}`;
      const jaExiste = await prisma.publication.findUnique({ where: { emailMessageId } });

      if (!jaExiste) {
        await prisma.publication.create({
          data: {
            officeId: item.officeId,
            kind: "PUBLICACAO",
            source: "DOU",
            content: montarConteudo(item),
            publishedAt: formatarDataPublicacao(item.dataPublicacao, item.dataCaptura),
            emailMessageId,
            triageStatus: "PENDENTE",
          },
        });
        result.publicacoesCriadas++;
      }

      const chaveTermo = JSON.stringify({ officeId: item.officeId, termo: item.termoEncontrado });
      termosComHit.set(chaveTermo, { officeId: item.officeId, termo: item.termoEncontrado });
      contarResumo(item.officeId, "hits");

      // Só marca como processado depois de garantir que a Publication foi criada ou já
      // existia — nunca antes, para não perder o dado em caso de erro no meio do caminho
      // (mesmo princípio de lib/pncpBridge.ts/lib/roboBridge.ts).
      await prisma.roboDouItem.update({ where: { id: item.id }, data: { statusProcessado: true } });
    } catch (e) {
      const message = e instanceof Error ? e.message : "erro desconhecido";
      result.erros.push(`[item ${item.chaveUnica}] ${message}`);
      contarResumo(item.officeId, "erros");
      // Erro inesperado processando o item: NÃO marcamos statusProcessado — deixamos para
      // tentar de novo no próximo ciclo, já que a causa provável é um bug/exceção genuína.
    }
  }

  // updateMany por (officeId, termo) — TermoVigilancia.termo não é único sozinho (pode haver
  // o mesmo texto vigiado em casos diferentes do mesmo escritório, ver @@unique([officeId,
  // termo, caseId]) no schema), por isso atualizamos todas as linhas que baterem no par.
  for (const { officeId, termo } of termosComHit.values()) {
    try {
      await prisma.termoVigilancia.updateMany({
        where: { officeId, termo },
        data: { ultimoHitAt: new Date() },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "erro desconhecido";
      result.erros.push(`[TermoVigilancia office ${officeId} termo "${termo}"] ${message}`);
    }
  }

  for (const [officeId, resumo] of resumoPorOffice) {
    const sucesso = resumo.erros === 0;
    const detalhe = `${resumo.hits} publicação(ões) avaliada(s)/criada(s) neste ciclo${
      resumo.erros > 0 ? `, ${resumo.erros} erro(s)` : ""
    }.`;
    try {
      await registrarExecucaoFonte(officeId, sucesso, detalhe);
    } catch (e) {
      const message = e instanceof Error ? e.message : "erro desconhecido";
      result.erros.push(`[FonteAdministrativa office ${officeId}] ${message}`);
    }
  }

  return result;
}
