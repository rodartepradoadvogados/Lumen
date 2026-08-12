// Ponte entre o robô Python de captura do PNCP (robo-publicacoes/src/pncp.py, rodando no
// Railway, que grava direto na tabela "licitacoes_pncp" do mesmo Postgres — espelhada aqui
// como RoboLicitacao) e as tabelas principais do site (Publication/TermoVigilancia/
// FonteAdministrativa). Segue o mesmo padrão de lib/roboBridge.ts (arquivo NOVO, não altera
// aquele — são fontes/tabelas independentes, mas a forma de idempotência e o desenho geral
// são os mesmos).
//
// Diferença central para lib/roboBridge.ts: lá o roteamento por escritório é por número de
// processo/OAB (dado objetivo); aqui não há processo nem OAB — o roteamento é por CONTEÚDO
// (o "termo vigiado" de cada escritório, ver model TermoVigilancia) batendo no objeto ou no
// nome do órgão da licitação. Por isso uma mesma licitação pode gerar Publication para MAIS
// DE UM escritório (cada um com seu próprio termo), ou para nenhum.

import { prisma } from "@/lib/prisma";
import { decodificarEntidadesHtml } from "@/lib/htmlEntities";

export type PncpBridgeResult = {
  processadas: number;
  publicacoesCriadas: number;
  semTermo: number;
  erros: string[];
};

// Remove acentuação e normaliza caixa — mesma técnica já usada em lib/driveSync.ts
// (normalizeForCompare) e lib/actions/painelMestre.ts, reaproveitada aqui em vez de importada
// porque é uma função pequena e este arquivo não deve depender de lib/orgaosAdministrativos.ts
// nem de lib/caseNatureza.ts (outros agentes mexendo neles agora, ver instruções da tarefa).
function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

type TermoAtivo = {
  id: string;
  termo: string;
  termoNormalizado: string;
};

// Carrega todos os termos ATIVOS de todos os escritórios de uma vez (1 query), agrupados por
// officeId — evita N+1 (uma query de termos por licitação) quando há muitas licitações
// pendentes no mesmo ciclo.
async function carregarTermosAtivosPorOffice(): Promise<Map<string, TermoAtivo[]>> {
  const termos = await prisma.termoVigilancia.findMany({
    where: { ativo: true },
    select: { id: true, termo: true, officeId: true },
  });

  const porOffice = new Map<string, TermoAtivo[]>();
  for (const t of termos) {
    const termoNormalizado = normalizar(t.termo);
    if (!termoNormalizado) continue; // termo vazio/só-espaço nunca deveria casar com nada
    const lista = porOffice.get(t.officeId) ?? [];
    lista.push({ id: t.id, termo: t.termo, termoNormalizado });
    porOffice.set(t.officeId, lista);
  }
  return porOffice;
}

// Formata valor estimado em Real (pt-BR) — mesma técnica de lib/honorarios.ts. Retorna
// "(não informado)" em vez de "R$ NaN" quando o robô não conseguiu extrair o valor (ver aviso
// de mapeamento tolerante em robo-publicacoes/src/pncp.py).
function formatarValor(valor: number | null): string {
  if (valor === null || Number.isNaN(valor)) return "(valor não informado)";
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(raw: string | null): string {
  if (!raw) return "(não informado)";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw; // preserva o texto cru se não parsear como data
  return parsed.toLocaleDateString("pt-BR");
}

// Monta o texto da Publication a partir dos campos tolerantemente mapeados pelo robô — qualquer
// um deles pode vir null (ver robo-publicacoes/src/pncp.py), por isso cada linha tem fallback.
function montarConteudo(lic: {
  objeto: string | null;
  orgaoNome: string | null;
  municipio: string | null;
  uf: string | null;
  modalidadeNome: string | null;
  valorEstimado: number | null;
  dataEncerramentoProposta: string | null;
  linkSistemaOrigem: string | null;
}): string {
  const local = [lic.municipio, lic.uf].filter(Boolean).join("/");
  const linhas = [
    `Objeto: ${lic.objeto ?? "(não informado)"}`,
    `Órgão: ${lic.orgaoNome ?? "(não informado)"}${local ? ` (${local})` : ""}`,
    `Modalidade: ${lic.modalidadeNome ?? "(não informada)"}`,
    `Valor estimado: ${formatarValor(lic.valorEstimado)}`,
    `Prazo final para proposta: ${formatarData(lic.dataEncerramentoProposta)}`,
  ];
  if (lic.linkSistemaOrigem) linhas.push(`Link: ${lic.linkSistemaOrigem}`);
  return linhas.join("\n");
}

// Para uma licitação, encontra todos os (officeId, termo) cujo termo vigiado aparece no objeto
// OU no nome do órgão — comparação sem acento/case via normalizar(). Uma licitação pode casar
// com termos de vários escritórios diferentes (cada um monitora o que lhe interessa).
function encontrarOfficesComMatch(
  haystack: string,
  termosPorOffice: Map<string, TermoAtivo[]>
): Map<string, TermoAtivo[]> {
  const matches = new Map<string, TermoAtivo[]>();
  for (const [officeId, termos] of termosPorOffice) {
    const bateram = termos.filter((t) => haystack.includes(t.termoNormalizado));
    if (bateram.length > 0) matches.set(officeId, bateram);
  }
  return matches;
}

// Upsert de FonteAdministrativa (chave "PNCP") — chamado uma vez por escritório ao final do
// ciclo, só para os escritórios que têm pelo menos um termo vigiado ativo (são os únicos que
// esta ponte de fato avalia licitação para eles). @@unique([officeId, chave]) garante 1 linha.
async function registrarExecucaoFonte(officeId: string, sucesso: boolean, detalhe: string): Promise<void> {
  await prisma.fonteAdministrativa.upsert({
    where: { officeId_chave: { officeId, chave: "PNCP" } },
    create: {
      officeId,
      chave: "PNCP",
      nome: "PNCP — Portal Nacional de Contratações Públicas",
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

// O robô Python (robo-publicacoes/src/pncp.py) escreve licitações num conjunto único e global
// (RoboLicitacao), sem coluna de escritório — ele não sabe qual licitação interessa a qual
// escritório-cliente, só coleta tudo dentro das UFs configuradas (PNCP_UFS). É aqui, na ponte,
// que cada licitação é avaliada contra os termos vigiados (TermoVigilancia) de TODOS os
// escritórios ativos, e uma Publication é criada para cada escritório cujo termo bateu.
export async function syncPncpParaSite(): Promise<PncpBridgeResult> {
  const result: PncpBridgeResult = { processadas: 0, publicacoesCriadas: 0, semTermo: 0, erros: [] };

  const licitacoesPendentes = await prisma.roboLicitacao.findMany({ where: { statusProcessado: false } });
  if (licitacoesPendentes.length === 0) return result;

  const termosPorOffice = await carregarTermosAtivosPorOffice();

  // Acumula, por escritório, o que aconteceu neste ciclo — para o upsert final em
  // FonteAdministrativa (1 upsert por escritório, não 1 por licitação).
  const resumoPorOffice = new Map<string, { hits: number; erros: number }>();
  function contarResumo(officeId: string, campo: "hits" | "erros") {
    const atual = resumoPorOffice.get(officeId) ?? { hits: 0, erros: 0 };
    atual[campo]++;
    resumoPorOffice.set(officeId, atual);
  }

  // IDs de TermoVigilancia que tiveram acerto neste ciclo — atualizados em lote ao final
  // (evita 1 UPDATE por match individual quando várias licitações batem no mesmo termo).
  const termosComHit = new Set<string>();

  for (const lic of licitacoesPendentes) {
    result.processadas++;
    try {
      const haystack = normalizar(`${lic.objeto ?? ""} ${lic.orgaoNome ?? ""}`);
      const matches = haystack.trim() ? encontrarOfficesComMatch(haystack, termosPorOffice) : new Map();

      if (matches.size === 0) {
        result.semTermo++;
      } else {
        for (const [officeId, termos] of matches) {
          try {
            const emailMessageId = `pncp-${lic.numeroControlePNCP}-${officeId}`;
            const jaExiste = await prisma.publication.findUnique({ where: { emailMessageId } });

            if (!jaExiste) {
              await prisma.publication.create({
                data: {
                  officeId,
                  kind: "PUBLICACAO",
                  source: "PNCP",
                  content: decodificarEntidadesHtml(montarConteudo(lic)),
                  publishedAt: (() => {
                    if (!lic.dataPublicacao) return lic.dataCaptura;
                    const parsed = new Date(lic.dataPublicacao);
                    return Number.isNaN(parsed.getTime()) ? lic.dataCaptura : parsed;
                  })(),
                  emailMessageId,
                  triageStatus: "PENDENTE",
                },
              });
              result.publicacoesCriadas++;
            }

            for (const termo of termos) termosComHit.add(termo.id);
            contarResumo(officeId, "hits");
          } catch (e) {
            const message = e instanceof Error ? e.message : "erro desconhecido";
            result.erros.push(`[licitacao ${lic.numeroControlePNCP} office ${officeId}] ${message}`);
            contarResumo(officeId, "erros");
          }
        }
      }

      // Só marca como processada depois de ter tentado gerar Publication para TODOS os
      // escritórios que bateram — se não casou com nenhum termo, também marca (já foi
      // avaliada; não reprocessar para sempre, ver instrução da Tarefa 4).
      await prisma.roboLicitacao.update({ where: { id: lic.id }, data: { statusProcessado: true } });
    } catch (e) {
      const message = e instanceof Error ? e.message : "erro desconhecido";
      result.erros.push(`[licitacao ${lic.numeroControlePNCP}] ${message}`);
      // Erro inesperado avaliando a licitação (não erro de UM office específico, ver acima):
      // NÃO marcamos statusProcessado — deixamos para tentar de novo no próximo ciclo, porque
      // aqui a causa provável é um bug/exceção genuína, não "não casou com nada".
    }
  }

  if (termosComHit.size > 0) {
    await prisma.termoVigilancia.updateMany({
      where: { id: { in: Array.from(termosComHit) } },
      data: { ultimoHitAt: new Date() },
    });
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
