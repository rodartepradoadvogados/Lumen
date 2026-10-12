"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";
import { collectPublicationGroupIds } from "@/lib/publicationResolution";
import { ehAvisoDeIntimacao } from "@/lib/classificarAto";
import { chaveDoProcesso } from "@/lib/processKey";
import { registrarAtividadePublicacao } from "@/lib/auditoriaPublicacoes";
import { SELECT_SNAPSHOT } from "@/lib/publicationSnapshot";
import { DESFECHOS_DE_CONCLUSAO, MOTIVOS_DE_DESCARTE, ROTULO_DO_DESFECHO, type DesfechoDeConclusao, type MotivoDeDescarte } from "@/lib/desfechosDePublicacao";
import { blockProcessNumber, restorePublicationSnapshots, unblockProcessNumber, type PublicationSnapshot } from "@/lib/actions/publications";

// Ações da nova barra de decisão de /publicacoes: TRATAR (prazo/tarefa, que continua passando por
// delegateTask) e CONCLUIR (visto só para mim, concluir para todos com motivo, descartar). Aqui ficam
// as duas que baixam o item da fila de TODOS: concluirParaTodos e descartarPublicacao, mais a quarentena
// de e-mail. Toda ação grava na trilha de auditoria (lib/auditoriaPublicacoes.ts).

function revalidarFila() {
  revalidatePath("/publicacoes");
  revalidatePath("/m/publicacoes");
  revalidatePath("/m");
  revalidatePath("/alertas");
  revalidatePath("/painel");
}

async function snapshotsDe(ids: string[], officeId: string): Promise<PublicationSnapshot[]> {
  const rows = await prisma.publication.findMany({ where: { id: { in: ids }, officeId }, select: SELECT_SNAPSHOT });
  return rows.map((r) => ({ ...r, desfechoEm: r.desfechoEm ? r.desfechoEm.toISOString() : null }));
}

// Concluir PARA TODOS: o item sai da fila do escritório inteiro, com motivo. "Visto, só para mim" não
// passa por aqui (markPublicationsRead): sai só da fila de quem marcou.
//
// `idsDaPilha`: avisos de intimação do MESMO processo (a pilha do Projudi) que a pessoa escolheu
// concluir junto. O servidor confere que são do escritório e do mesmo processo; nunca confia na tela.
export async function concluirParaTodos(
  publicationId: string,
  desfecho: DesfechoDeConclusao,
  idsDaPilha: string[] = []
): Promise<{ error?: string; antes?: PublicationSnapshot[]; ids?: string[] }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão inválida." };
  if (!DESFECHOS_DE_CONCLUSAO.includes(desfecho)) return { error: "Motivo de conclusão inválido." };

  const grupo = await collectPublicationGroupIds(publicationId, viewer.officeId);
  if (grupo.length === 0) return { error: "Publicação não encontrada." };

  const alvoBase = await prisma.publication.findFirst({ where: { id: publicationId, officeId: viewer.officeId }, select: { processNumberRaw: true } });
  const chave = chaveDoProcesso(alvoBase?.processNumberRaw);
  let extras: string[] = [];
  if (idsDaPilha.length > 0 && chave) {
    const candidatos = await prisma.publication.findMany({
      where: { id: { in: idsDaPilha }, officeId: viewer.officeId },
      select: { id: true, processNumberRaw: true },
    });
    extras = candidatos.filter((c) => chaveDoProcesso(c.processNumberRaw) === chave).map((c) => c.id);
  }
  const ids = Array.from(new Set([...grupo, ...extras]));

  const linhas = await prisma.publication.findMany({
    where: { id: { in: ids }, officeId: viewer.officeId },
    select: { id: true, source: true, content: true, emailSubject: true },
  });
  // Regra do SERVIDOR (não só da tela): aviso de intimação nunca é "só ciência". O e-mail do Projudi
  // não traz o ato nem o prazo; arquivá-lo como ciência é o defeito que esta tela existe para evitar.
  if (desfecho === "SO_CIENCIA" && linhas.some((l) => ehAvisoDeIntimacao({ source: l.source, content: l.content, emailSubject: l.emailSubject }))) {
    return { error: "Aviso de intimação não pode ser concluído como só ciência: abra a intimação no tribunal e conclua como \"já aberto e tratado\"." };
  }

  const antes = await snapshotsDe(ids, viewer.officeId);
  const agora = new Date();
  await prisma.publication.updateMany({
    where: { id: { in: ids }, officeId: viewer.officeId },
    data: { triageStatus: "TRATADA", desfecho, desfechoPorId: viewer.id, desfechoEm: agora },
  });
  await prisma.publicationRead.createMany({ data: ids.map((id) => ({ publicationId: id, userId: viewer.id })), skipDuplicates: true });

  await registrarAtividadePublicacao({
    officeId: viewer.officeId,
    actorId: viewer.id,
    acao: "CONCLUIR_PARA_TODOS",
    publicationIds: ids,
    reason: `Concluiu para todos: ${ROTULO_DO_DESFECHO[desfecho]}${alvoBase?.processNumberRaw ? ` · ${alvoBase.processNumberRaw}` : ""}`,
    meta: { desfecho, processo: alvoBase?.processNumberRaw ?? null, pilha: extras.length > 0 },
  });
  revalidarFila();
  return { antes, ids };
}

export type DesfazerDescarte = { officeBlockId?: string; regraId?: string; userBlockedId?: string };

// Descartar: "não é publicação" ou "não é do escritório". Sai da fila (estado DESCARTADA) e, se pedido,
// bloqueia o processo (para o escritório inteiro ou só para quem descartou) e/ou o remetente do e-mail.
// Processo CADASTRADO não pode ser bloqueado: é justamente o que o escritório quer acompanhar.
export async function descartarPublicacao(
  publicationId: string,
  motivo: MotivoDeDescarte,
  opcoes: { bloquearProcesso?: "ESCRITORIO" | "USUARIO" | null; bloquearRemetente?: boolean } = {}
): Promise<{ error?: string; antes?: PublicationSnapshot[]; desfazer?: DesfazerDescarte; aviso?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão inválida." };
  if (!MOTIVOS_DE_DESCARTE.includes(motivo)) return { error: "Motivo inválido." };

  const grupo = await collectPublicationGroupIds(publicationId, viewer.officeId);
  if (grupo.length === 0) return { error: "Publicação não encontrada." };
  const pub = await prisma.publication.findFirst({
    where: { id: publicationId, officeId: viewer.officeId },
    select: { id: true, caseId: true, processNumberRaw: true, remetente: true },
  });
  if (!pub) return { error: "Publicação não encontrada." };

  const comCaso = await prisma.publication.count({ where: { id: { in: grupo }, officeId: viewer.officeId, caseId: { not: null } } });
  const escopo = opcoes.bloquearProcesso ?? null;
  const chave = chaveDoProcesso(pub.processNumberRaw);
  if (escopo && comCaso > 0) return { error: "Este processo está cadastrado: só processo não cadastrado pode ser bloqueado." };
  if (escopo && !chave) return { error: "Não foi possível reconhecer o número do processo para bloquear." };

  // Itens do MESMO processo que o bloqueio do escritório também descarta (os ainda sem processo cadastrado).
  let idsDoProcesso: string[] = [];
  if (escopo === "ESCRITORIO" && chave) {
    const semCaso = await prisma.publication.findMany({
      where: { officeId: viewer.officeId, caseId: null, processNumberRaw: { not: null }, estado: "ATIVA" },
      select: { id: true, processNumberRaw: true },
    });
    idsDoProcesso = semCaso.filter((p) => chaveDoProcesso(p.processNumberRaw) === chave).map((p) => p.id);
  }
  const ids = Array.from(new Set([...grupo, ...idsDoProcesso]));

  const antes = await snapshotsDe(ids, viewer.officeId);
  const agora = new Date();
  const rotulo = ROTULO_DO_DESFECHO[motivo];
  await prisma.publication.updateMany({
    where: { id: { in: ids }, officeId: viewer.officeId },
    data: {
      estado: "DESCARTADA",
      motivoEstado: `Descartada: ${rotulo}`,
      triageStatus: "TRATADA",
      desfecho: motivo,
      desfechoPorId: viewer.id,
      desfechoEm: agora,
    },
  });
  await prisma.publicationRead.createMany({ data: ids.map((id) => ({ publicationId: id, userId: viewer.id })), skipDuplicates: true });

  const desfazer: DesfazerDescarte = {};
  let aviso: string | undefined;

  if (escopo === "ESCRITORIO" && chave) {
    const jaExistia = await prisma.officeBlockedProcess.findUnique({ where: { officeId_processKey: { officeId: viewer.officeId, processKey: chave } }, select: { id: true } });
    const bloqueio = await prisma.officeBlockedProcess.upsert({
      where: { officeId_processKey: { officeId: viewer.officeId, processKey: chave } },
      update: {},
      create: { officeId: viewer.officeId, processKey: chave, displayNumber: pub.processNumberRaw ?? chave, motivo: rotulo, criadoPorId: viewer.id },
    });
    if (!jaExistia) desfazer.officeBlockId = bloqueio.id;
    await registrarAtividadePublicacao({
      officeId: viewer.officeId,
      actorId: viewer.id,
      acao: "BLOQUEAR_PROCESSO",
      publicationIds: ids,
      reason: `Bloqueou o processo ${pub.processNumberRaw} para o escritório inteiro (${rotulo})`,
      meta: { processo: pub.processNumberRaw, escopo: "ESCRITORIO", motivo },
    });
  } else if (escopo === "USUARIO") {
    const r = await blockProcessNumber(publicationId);
    if (r.error) aviso = r.error;
    else if (r.blockedId) desfazer.userBlockedId = r.blockedId;
  }

  if (opcoes.bloquearRemetente) {
    const remetente = pub.remetente?.trim().toLowerCase();
    if (!remetente) {
      aviso = "O remetente deste item não foi guardado (é anterior à nova captura): nada foi bloqueado.";
    } else {
      const jaExistia = await prisma.emailRemetenteRegra.findUnique({ where: { officeId_padrao: { officeId: viewer.officeId, padrao: remetente } }, select: { id: true } });
      const regra = await prisma.emailRemetenteRegra.upsert({
        where: { officeId_padrao: { officeId: viewer.officeId, padrao: remetente } },
        update: { acao: "NEGAR" },
        create: { officeId: viewer.officeId, padrao: remetente, acao: "NEGAR", origem: "USUARIO", criadoPorId: viewer.id },
      });
      if (!jaExistia) desfazer.regraId = regra.id;
      await registrarAtividadePublicacao({
        officeId: viewer.officeId,
        actorId: viewer.id,
        acao: "BLOQUEAR_REMETENTE",
        publicationIds: [publicationId],
        reason: `Bloqueou o remetente ${remetente}`,
        meta: { remetente },
      });
    }
  }

  await registrarAtividadePublicacao({
    officeId: viewer.officeId,
    actorId: viewer.id,
    acao: "DESCARTAR",
    publicationIds: ids,
    reason: `Descartou: ${rotulo}${pub.processNumberRaw ? ` · ${pub.processNumberRaw}` : ""}`,
    meta: { motivo, processo: pub.processNumberRaw, bloqueioDoProcesso: escopo, bloqueioDoRemetente: Boolean(opcoes.bloquearRemetente) },
  });
  revalidarFila();
  revalidatePath("/configuracoes");
  return { antes, desfazer, aviso };
}

// Desfaz um descarte feito agora há pouco: restaura o estado dos itens e remove o que o descarte criou.
export async function desfazerDescarte(antes: PublicationSnapshot[], desfazer: DesfazerDescarte): Promise<void> {
  const viewer = await getCurrentUser();
  if (!viewer) return;
  await restorePublicationSnapshots(antes);
  if (desfazer.officeBlockId) await prisma.officeBlockedProcess.deleteMany({ where: { id: desfazer.officeBlockId, officeId: viewer.officeId } });
  if (desfazer.regraId) await prisma.emailRemetenteRegra.deleteMany({ where: { id: desfazer.regraId, officeId: viewer.officeId } });
  if (desfazer.userBlockedId) await unblockProcessNumber(desfazer.userBlockedId);
  revalidarFila();
  revalidatePath("/configuracoes");
}

// ===== Quarentena de e-mail: aba "Possível publicação" =====

// Promove à fila. `permitirRemetente` cria a regra PERMITIR para o endereço (as próximas mensagens dele
// entram direto). Item promovido de remetente desconhecido leva a marca "origem não reconhecida".
export async function promoverPossivelPublicacao(id: string, permitirRemetente: boolean): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão inválida." };
  const pub = await prisma.publication.findFirst({ where: { id, officeId: viewer.officeId, estado: "QUARENTENA" }, select: { id: true, remetente: true, processNumberRaw: true } });
  if (!pub) return { error: "Item não está mais na quarentena." };
  await prisma.publication.update({ where: { id }, data: { estado: "ATIVA", motivoEstado: permitirRemetente ? "Promovida; remetente permitido" : "Promovida da quarentena: confira o remetente" } });
  await registrarAtividadePublicacao({ officeId: viewer.officeId, actorId: viewer.id, acao: "PROMOVER", publicationIds: [id], reason: `Promoveu da quarentena para a fila${pub.processNumberRaw ? ` · ${pub.processNumberRaw}` : ""}`, meta: { processo: pub.processNumberRaw, remetente: pub.remetente } });
  if (permitirRemetente && pub.remetente) {
    await prisma.emailRemetenteRegra.upsert({
      where: { officeId_padrao: { officeId: viewer.officeId, padrao: pub.remetente } },
      update: { acao: "PERMITIR" },
      create: { officeId: viewer.officeId, padrao: pub.remetente, acao: "PERMITIR", origem: "USUARIO", criadoPorId: viewer.id },
    });
    await registrarAtividadePublicacao({ officeId: viewer.officeId, actorId: viewer.id, acao: "PERMITIR_REMETENTE", publicationIds: [id], reason: `Permitiu o remetente ${pub.remetente}`, meta: { remetente: pub.remetente } });
  }
  revalidarFila();
  return {};
}

export async function descartarPossivelPublicacao(id: string, bloquearRemetente: boolean): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão inválida." };
  const pub = await prisma.publication.findFirst({ where: { id, officeId: viewer.officeId, estado: "QUARENTENA" }, select: { id: true, remetente: true, processNumberRaw: true } });
  if (!pub) return { error: "Item não está mais na quarentena." };
  await prisma.publication.update({ where: { id }, data: { estado: "DESCARTADA", motivoEstado: "Descartada da quarentena", desfecho: "NAO_PUBLICACAO", desfechoPorId: viewer.id, desfechoEm: new Date() } });
  await registrarAtividadePublicacao({ officeId: viewer.officeId, actorId: viewer.id, acao: "DESCARTAR_QUARENTENA", publicationIds: [id], reason: `Descartou da quarentena${pub.processNumberRaw ? ` · ${pub.processNumberRaw}` : ""}`, meta: { remetente: pub.remetente } });
  if (bloquearRemetente && pub.remetente) {
    await prisma.emailRemetenteRegra.upsert({
      where: { officeId_padrao: { officeId: viewer.officeId, padrao: pub.remetente } },
      update: { acao: "NEGAR" },
      create: { officeId: viewer.officeId, padrao: pub.remetente, acao: "NEGAR", origem: "USUARIO", criadoPorId: viewer.id },
    });
    await registrarAtividadePublicacao({ officeId: viewer.officeId, actorId: viewer.id, acao: "BLOQUEAR_REMETENTE", publicationIds: [id], reason: `Bloqueou o remetente ${pub.remetente}`, meta: { remetente: pub.remetente } });
  }
  revalidarFila();
  return {};
}

// ===== Configurações: o que foi bloqueado para o escritório (reversível) =====

export async function removerBloqueioDoEscritorio(id: string): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão inválida." };
  if (!viewer.isAdmin) return { error: "Só administradores podem remover um bloqueio do escritório." };
  const b = await prisma.officeBlockedProcess.findFirst({ where: { id, officeId: viewer.officeId }, select: { displayNumber: true } });
  if (!b) return { error: "Bloqueio não encontrado." };
  await prisma.officeBlockedProcess.delete({ where: { id } });
  await registrarAtividadePublicacao({ officeId: viewer.officeId, actorId: viewer.id, acao: "DESBLOQUEAR_PROCESSO", publicationIds: [], reason: `Desbloqueou o processo ${b.displayNumber} para o escritório`, meta: { processo: b.displayNumber, escopo: "ESCRITORIO" } });
  revalidatePath("/configuracoes");
  return {};
}

export async function removerRegraDeRemetente(id: string): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão inválida." };
  if (!viewer.isAdmin) return { error: "Só administradores podem remover uma regra de remetente." };
  const r = await prisma.emailRemetenteRegra.findFirst({ where: { id, officeId: viewer.officeId }, select: { padrao: true, acao: true } });
  if (!r) return { error: "Regra não encontrada." };
  await prisma.emailRemetenteRegra.delete({ where: { id } });
  await registrarAtividadePublicacao({ officeId: viewer.officeId, actorId: viewer.id, acao: r.acao === "NEGAR" ? "PERMITIR_REMETENTE" : "BLOQUEAR_REMETENTE", publicationIds: [], reason: `Removeu a regra ${r.acao === "NEGAR" ? "de bloqueio" : "de permissão"} do remetente ${r.padrao}`, meta: { remetente: r.padrao, regraRemovida: r.acao } });
  revalidatePath("/configuracoes");
  return {};
}
