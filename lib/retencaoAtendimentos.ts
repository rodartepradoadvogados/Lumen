import { prisma } from "@/lib/prisma";
import { extractDriveFileId } from "@/lib/googleDrive";
import { deleteDriveFile, getStorageProvider, type StorageProvider } from "@/lib/storageProvider";
import { eliminarComSeguranca, type AlvoDaEliminacao, type PortasDaEliminacao, type ResultadoDaEliminacao } from "@/lib/retencaoEliminar";
import {
  ETAPAS_ELEGIVEIS,
  LIMITE_DE_CANDIDATOS,
  LIMITE_POR_RODADA,
  MESES_PADRAO_DA_PREVIA,
  STATUS_ELEGIVEIS,
  arquivoJaNaoExiste,
  dataDeCorte,
  motivoParaNaoEliminar,
  prazoDeRetencaoValido,
  type CandidatoARetencao,
  type MotivoParaNaoEliminar,
} from "@/lib/retencaoRegras";

// ============================================================================
// RETENÇÃO DE ATENDIMENTOS SEM DESFECHO — QUEM APAGA.
//
// As regras do que pode ser apagado estão em lib/retencaoRegras.ts (puras, com teste). Aqui está o
// que mexe em banco e em Drive. Quatro decisões, todas por causa do que dá errado quando se apaga
// dado de cliente de verdade:
//
// 1. O ARQUIVO PRIMEIRO, O REGISTRO DEPOIS. Se o registro sumisse antes e a exclusão no Drive
//    falhasse, ficaria no Drive um áudio ou um laudo de alguém sem nenhum rastro de onde veio — o
//    pior desfecho possível para uma política que promete eliminar. Falhou o arquivo (que não seja
//    "já não existe"): o atendimento fica inteiro e entra na rodada do dia seguinte.
// 2. A PASTA DO ATENDIMENTO TAMBÉM. O nome dela (Atendimentos/{assunto}) pode carregar o nome da
//    pessoa; apagar só os arquivos deixaria o nome no Drive.
// 3. O REGISTRO SÓ SAI SE NADA MUDOU. A exclusão final repete a condição de data: uma mensagem
//    que chegou entre a leitura e a exclusão renova a atividade e a protege.
// 4. NADA DE DADO PESSOAL NO RASTRO. O que fica registrado (IntegrationRun) é contagem. Nome,
//    telefone e texto da conversa nunca passam por aqui nem vão para o log.
// ============================================================================

const INTEGRACAO = "RETENCAO";

type ArquivoRemoto = { provider: StorageProvider; id: string };

export type ElegivelParaEliminar = AlvoDaEliminacao;

export type ResultadoDaListagem = {
  elegiveis: ElegivelParaEliminar[];
  examinados: number;
  /** Quantos candidatos ficaram de fora, por motivo. Só números. */
  protegidos: Partial<Record<MotivoParaNaoEliminar, number>>;
};

function providerDoAnexo(valor: string | null | undefined): StorageProvider {
  return valor === "ONEDRIVE" ? "ONEDRIVE" : valor === "DROPBOX" ? "DROPBOX" : "GOOGLE_DRIVE";
}

/**
 * Os atendimentos do escritório que passaram do prazo E que a regra deixa eliminar, do mais antigo
 * para o mais novo. Só LÊ: é o que a tela usa para dizer "N atendimentos seriam eliminados".
 */
export async function listarElegiveis(officeId: string, meses: number, agora: Date = new Date()): Promise<ResultadoDaListagem> {
  const corte = dataDeCorte(agora, meses);

  // O filtro do banco é só um pré-corte barato (índice por escritório + data). A decisão de verdade
  // é motivoParaNaoEliminar, que também olha o que o banco não filtra bem (tarefas, anotações,
  // pendências, anexos em uso). Os candidatos vêm do mais antigo: sem isto, atendimentos protegidos
  // no começo da fila empurrariam os elegíveis para fora do limite, para sempre.
  const candidatos = await prisma.attendance.findMany({
    where: {
      officeId,
      status: { in: [...STATUS_ELEGIVEIS] },
      stage: { in: [...ETAPAS_ELEGIVEIS] },
      convertedCaseId: null,
      clientId: null,
      ultimaAtividadeEm: { lt: corte },
      createdAt: { lt: corte },
    },
    orderBy: { ultimaAtividadeEm: "asc" },
    take: LIMITE_DE_CANDIDATOS,
    select: {
      id: true,
      status: true,
      stage: true,
      convertedCaseId: true,
      clientId: true,
      createdAt: true,
      ultimaAtividadeEm: true,
      nextContactAt: true,
      documentoAte: true,
      driveFolderId: true,
      _count: { select: { tasks: true, anotacoes: true } },
      pendencias: { where: { status: "PENDENTE" }, select: { id: true }, take: 1 },
      attachments: {
        select: {
          storageFileId: true,
          storageProvider: true,
          driveUrl: true,
          _count: { select: { protocoloItens: true, protocoloComprovanteDe: true, documentoEnvioItens: true } },
        },
      },
      // O áudio que a transcrição leu é o mesmo arquivo do anexo; guardar o id aqui cobre o caso do
      // anexo não ter sido registrado (o upload deu certo, o registro falhou).
      whatsappMessages: {
        where: { transcricao: { isNot: null } },
        select: { transcricao: { select: { storageFileId: true, storageProvider: true } } },
      },
    },
  });

  const elegiveis: ElegivelParaEliminar[] = [];
  const protegidos: ResultadoDaListagem["protegidos"] = {};

  for (const c of candidatos) {
    const regra: CandidatoARetencao = {
      status: c.status,
      stage: c.stage,
      convertedCaseId: c.convertedCaseId,
      clientId: c.clientId,
      createdAt: c.createdAt,
      ultimaAtividadeEm: c.ultimaAtividadeEm,
      nextContactAt: c.nextContactAt,
      documentoAte: c.documentoAte,
      tarefas: c._count.tasks,
      anotacoes: c._count.anotacoes,
      pendenciasAbertas: c.pendencias.length,
      anexosEmUso: c.attachments.filter(
        (a) => a._count.protocoloItens + a._count.protocoloComprovanteDe + a._count.documentoEnvioItens > 0,
      ).length,
    };
    const motivo = motivoParaNaoEliminar(regra, agora, meses);
    if (motivo) {
      protegidos[motivo] = (protegidos[motivo] ?? 0) + 1;
      continue;
    }

    const vistos = new Set<string>();
    const arquivos: ArquivoRemoto[] = [];
    const acrescentar = (provider: StorageProvider, id: string | null | undefined) => {
      if (!id) return;
      const chave = `${provider}:${id}`;
      if (vistos.has(chave)) return;
      vistos.add(chave);
      arquivos.push({ provider, id });
    };
    for (const a of c.attachments) {
      const provider = providerDoAnexo(a.storageProvider);
      // Anexo antigo, de antes de storageFileId existir: só podia ser Google, e o id sai da URL
      // (o mesmo caminho de deleteAttachment em lib/actions/attachments.ts).
      acrescentar(provider, a.storageFileId ?? (provider === "GOOGLE_DRIVE" ? extractDriveFileId(a.driveUrl) : null));
    }
    for (const m of c.whatsappMessages) {
      if (m.transcricao) acrescentar(providerDoAnexo(m.transcricao.storageProvider), m.transcricao.storageFileId);
    }
    elegiveis.push({ id: c.id, driveFolderId: c.driveFolderId, arquivos });
  }

  return { elegiveis, examinados: candidatos.length, protegidos };
}

/** Quantos seriam eliminados agora, para a tela. `null` = nenhum prazo escolhido: mostra a prévia de 12 meses. */
export async function contarElegiveisParaTela(officeId: string, mesesEscolhidos: number | null): Promise<{ meses: number; quantos: number; mais: boolean }> {
  const meses = mesesEscolhidos && prazoDeRetencaoValido(mesesEscolhidos) ? mesesEscolhidos : MESES_PADRAO_DA_PREVIA;
  const r = await listarElegiveis(officeId, meses);
  return { meses, quantos: r.elegiveis.length, mais: r.examinados >= LIMITE_DE_CANDIDATOS };
}

async function apagarNoProvedor(officeId: string, alvo: ArquivoRemoto): Promise<string | null> {
  try {
    await deleteDriveFile(alvo.id, officeId, alvo.provider);
    return null;
  } catch (e) {
    if (arquivoJaNaoExiste(e)) return null;
    return `${alvo.provider}: ${e instanceof Error ? e.message.slice(0, 160) : "erro ao apagar"}`;
  }
}

/** As operações de verdade: banco e provedor de arquivos. A ORDEM delas está em lib/retencaoEliminar.ts. */
const portasReais: PortasDaEliminacao = {
  async atividadeAindaAntiga(officeId, id, corte) {
    const ainda = await prisma.attendance.findFirst({
      where: { id, officeId, ultimaAtividadeEm: { lt: corte } },
      select: { id: true },
    });
    return Boolean(ainda);
  },
  apagarNoProvedor,
  provedorDoEscritorio: (officeId) => getStorageProvider(officeId),
  async apagarNoBanco(officeId, id, corte) {
    // Cascata do banco: mensagens (e as transcrições), notas, e-mails, pendências, pedidos de envio,
    // mensagem fixada e recusas saem junto com o atendimento. Os anexos e os problemas de
    // sincronização do Drive NÃO têm cascata (a relação é opcional), por isso saem aqui, na mesma
    // transação. A condição de data repetida no final é o que protege uma mensagem que chegou depois
    // da releitura: ela renova a atividade e a exclusão não acha nada para apagar.
    const [, , apagados] = await prisma.$transaction([
      prisma.attachment.deleteMany({ where: { attendanceId: id, officeId } }),
      prisma.driveSyncIssue.deleteMany({ where: { attendanceId: id, officeId } }),
      prisma.attendance.deleteMany({ where: { id, officeId, ultimaAtividadeEm: { lt: corte } } }),
    ]);
    return apagados.count > 0;
  },
};

/** Elimina UM atendimento (arquivos, pasta, mensagens, transcrições, notas, e-mails, pendências e o registro). */
export function eliminarAtendimento(
  officeId: string,
  alvo: ElegivelParaEliminar,
  meses: number,
  agora: Date = new Date(),
): Promise<ResultadoDaEliminacao> {
  return eliminarComSeguranca(portasReais, officeId, alvo, meses, agora);
}

export type ResultadoDaRodada = {
  desligada: boolean;
  escritorios: number;
  eliminados: number;
  adiados: number;
};

/**
 * A rodada diária. Só age em escritório que ESCOLHEU um prazo, e só até LIMITE_POR_RODADA por
 * escritório. `RETENCAO_ATENDIMENTOS_DESLIGADA=1` na Vercel desliga tudo de uma vez, sem deploy.
 */
export async function rodarRetencao(agora: Date = new Date()): Promise<ResultadoDaRodada> {
  if (process.env.RETENCAO_ATENDIMENTOS_DESLIGADA === "1") {
    return { desligada: true, escritorios: 0, eliminados: 0, adiados: 0 };
  }

  const configs = await prisma.whatsappConfig.findMany({
    where: { retencaoAtendimentosMeses: { not: null } },
    select: { officeId: true, retencaoAtendimentosMeses: true },
  });

  let eliminados = 0;
  let adiados = 0;
  let escritorios = 0;

  for (const cfg of configs) {
    const meses = cfg.retencaoAtendimentosMeses;
    // Valor fora da lista (alguém mexeu direto no banco) é ignorado, não interpretado.
    if (!prazoDeRetencaoValido(meses)) continue;
    escritorios++;

    const inicio = Date.now();
    const { elegiveis } = await listarElegiveis(cfg.officeId, meses, agora);
    let eliminadosDoEscritorio = 0;
    let adiadosDoEscritorio = 0;

    for (const alvo of elegiveis.slice(0, LIMITE_POR_RODADA)) {
      const r = await eliminarAtendimento(cfg.officeId, alvo, meses, agora);
      if (r.eliminado) eliminadosDoEscritorio++;
      else if (r.motivo === "ADIADO") adiadosDoEscritorio++;
    }

    eliminados += eliminadosDoEscritorio;
    adiados += adiadosDoEscritorio;

    if (eliminadosDoEscritorio > 0 || adiadosDoEscritorio > 0) {
      await prisma.integrationRun
        .create({
          data: {
            officeId: cfg.officeId,
            integration: INTEGRACAO,
            status: adiadosDoEscritorio > 0 ? "AVISO" : "OK",
            itemCount: eliminadosDoEscritorio,
            durationMs: Date.now() - inicio,
            message:
              `Eliminados ${eliminadosDoEscritorio} atendimento(s) sem desfecho há mais de ${meses} meses` +
              (adiadosDoEscritorio > 0 ? `; ${adiadosDoEscritorio} adiado(s) por falha ao apagar arquivo no provedor (nova tentativa na próxima rodada)` : "") +
              ".",
          },
        })
        .catch(() => {});
    }
  }

  return { desligada: false, escritorios, eliminados, adiados };
}
