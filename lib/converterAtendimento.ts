import { prisma } from "@/lib/prisma";
import { naturezaOf } from "@/lib/caseNatureza";
import { renameDriveFolder, moveDriveFile, getProcessosRootFolderId, getCasosRootFolderId } from "@/lib/storageProvider";
import { whereDeUmAtendimento, type ViewerDoAtendimento } from "@/lib/acessoAtendimento";
import { validarConversao, numeroParaGravar, type OpcoesDaConversao } from "@/lib/conversaoEmProcesso";

// ============================================================================
// O NÚCLEO DE "TRANSFORMAR O ATENDIMENTO EM PROCESSO OU CASO".
//
// Saiu de `convertAttendanceToCase` (lib/actions/attendance.ts) para servir a DUAS portas com a mesma
// regra: o site (que lança e redireciona) e o aplicativo de Atendimento (que precisa de um RESULTADO —
// `{ error }` ou `{ caseId }` — porque um `redirect()` levaria o celular para fora do aplicativo e um
// `throw` vira a tela de erro genérica, N19). Regra de negócio numa só casa; o que muda entre as duas
// portas é `OpcoesDaConversao` (o aplicativo trava CNJ, nome temporário e lead recusado; o site segue
// como sempre e ganha só a trava de "já convertido").
//
// A RESERVA DO ATENDIMENTO É ATÔMICA. O caso é criado e o atendimento é "tomado" na MESMA transação, com
// `updateMany where convertedCaseId is null`: dois toques (ou duas abas) disputam, um leva, o outro desfaz
// a transação inteira — não nasce processo em dobro. A pasta do Drive é mexida DEPOIS, fora da transação
// e em melhor esforço: rede externa dentro de transação segura a conexão do banco.
// ============================================================================

export type ResultadoDaConversao = { error: string } | { caseId: string; titulo: string; honorarioQuery: string };

class JaConvertido extends Error {}

export async function converterAtendimentoEmCaso(
  viewer: ViewerDoAtendimento,
  attendanceId: string,
  data: { type: string; processNumber?: string; court?: string },
  opcoes: OpcoesDaConversao,
): Promise<ResultadoDaConversao> {
  // O dono entra no WHERE: o atendimento do colega (ou de outro escritório) simplesmente não existe aqui.
  const attendance = await prisma.attendance.findFirst({ where: whereDeUmAtendimento(viewer, attendanceId) });
  if (!attendance) return { error: "Atendimento não encontrado." };

  const tipo = data.type === "JUDICIAL" ? "JUDICIAL" : "CASO";
  const erro = validarConversao(
    { tipo, numero: data.processNumber, nomeDoContato: attendance.clientName, status: attendance.status, convertedCaseId: attendance.convertedCaseId },
    opcoes,
  );
  if (erro) return { error: erro };

  // Client/Case criados a partir daqui usam o officeId do PRÓPRIO atendimento — na prática o mesmo do
  // viewer (o WHERE acima já garante), mas a intenção é "a conversão fica no escritório dono do lead".
  const officeId = attendance.officeId;

  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      // Prioriza o vínculo direto (cliente escolhido na busca ou recém-cadastrado); só recorre à busca
      // por nome para atendimentos antigos sem clientId.
      let client = attendance.clientId ? await tx.client.findFirst({ where: { id: attendance.clientId, officeId } }) : null;
      if (!client) client = await tx.client.findFirst({ where: { name: { equals: attendance.clientName, mode: "insensitive" }, officeId } });
      if (!client) client = await tx.client.create({ data: { name: attendance.clientName, type: "PF", officeId } });

      const caso = await tx.case.create({
        data: {
          title: attendance.subject,
          type: data.type,
          area: attendance.area || null,
          description: attendance.description || null,
          processNumber: opcoes.exigirCnj ? numeroParaGravar(data.processNumber) : data.processNumber || null,
          court: data.court?.trim() || null,
          clientId: client.id,
          responsibleId: attendance.responsibleId,
          assessoriaId: attendance.assessoriaId,
          officeId,
        },
      });

      // A reserva: só leva quem chegou primeiro. Se outro pedido já converteu, count = 0 e tudo desfaz.
      const reservou = await tx.attendance.updateMany({
        where: { id: attendanceId, officeId, convertedCaseId: null, status: { not: "CONVERTIDO" } },
        data: { status: "CONVERTIDO", convertedCaseId: caso.id },
      });
      if (reservou.count !== 1) throw new JaConvertido();

      // Os anexos já enviados passam a pertencer ao processo criado.
      await tx.attachment.updateMany({ where: { attendanceId, officeId }, data: { caseId: caso.id, attendanceId: null } });
      return caso;
    });
  } catch (e) {
    if (e instanceof JaConvertido) return { error: "Este atendimento já virou processo ou caso." };
    throw e;
  }

  // A MESMA pasta do Drive (se já existir) é reaproveitada — renomeada e MOVIDA para a raiz certa
  // (Processos ou Casos) em vez de deixar uma pasta órfã dentro de "Atendimentos" (achado P2 de
  // docs/auditoria-pastas-drive-2026-09.md) e criar outra do zero no próximo anexo.
  if (attendance.driveFolderId) {
    try {
      const targetRootId = naturezaOf(created.type) === "CASO" ? await getCasosRootFolderId(officeId) : await getProcessosRootFolderId(officeId);
      await moveDriveFile(attendance.driveFolderId, targetRootId, officeId);
      await renameDriveFolder(attendance.driveFolderId, created.title, officeId);
      await prisma.case.update({ where: { id: created.id }, data: { driveFolderId: attendance.driveFolderId } });
    } catch {
      // Best-effort — sem Drive conectado (ou chamada que falhe), o processo segue criado; uma pasta nova
      // nasce no próximo anexo, se precisar.
    }
  }

  // Honorário pretendido (Fase 5): vai por querystring para o Processo novo só PRÉ-PREENCHER o "Lançar
  // honorários" (LancarHonorariosModal.tsx, `prefill`/`autoOpen`); nunca cria a cobrança sozinho.
  const feeParams = new URLSearchParams();
  if (attendance.feeMode) {
    feeParams.set("honorarioPretendido", "1");
    feeParams.set("feeMode", attendance.feeMode);
    if (attendance.estimatedValue != null) feeParams.set("feeAmount", String(attendance.estimatedValue));
    if (attendance.feePercentual != null) feeParams.set("feePercentual", String(attendance.feePercentual));
    if (attendance.feePercentualBase) feeParams.set("feePercentualBase", attendance.feePercentualBase);
  }
  return { caseId: created.id, titulo: created.title, honorarioQuery: feeParams.toString() };
}
