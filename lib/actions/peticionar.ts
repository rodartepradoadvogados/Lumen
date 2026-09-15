"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { revalidatePath } from "next/cache";
import {
  copyAndFillTemplate,
  extractDriveFileId,
  getOrCreateCaseFolder,
  getOrCreateAttendanceFolder,
  getOrCreateLicitacaoFolder,
  getOrCreateAssessoriaCompanyFolderCached,
} from "@/lib/googleDrive";
import { PETICIONAR_URL } from "@/lib/constants";
import type { PeticionarLink } from "@/lib/actions/peticionarLink";

// Cada clique em "Peticionar" gera uma cópia NOVA e independente do timbrado no Drive —
// antes, todo mundo abria o mesmo Google Doc fixo (PETICIONAR_URL), então uma pessoa podia
// sobrescrever o que outra estava escrevendo. Reaproveita a mesma infra de cópia usada em
// lib/actions/generateDocument.ts (Modelos de Documento), só que sem placeholders — o
// timbrado é só a folha em branco com identidade visual do escritório.
//
// `link` (achado G40 da auditoria — nunca corrigido até esta entrega): antes, a petição SEMPRE
// caía na pasta genérica "gerados" do escritório e nunca virava Attachment/AssessoriaDocumento
// nenhum — mesmo passando caseId, ele só compunha o nome do arquivo. Agora o wizard de vínculo
// (components/PeticionarWizard.tsx, lib/actions/peticionarLink.ts) resolve ONDE salvar antes de
// chamar esta action, e aqui a petição nasce dentro da pasta certa E com o registro certo no
// banco (Attachment de Processo/Caso/Atendimento/Licitação, ou AssessoriaDocumento pra "documento
// geral da empresa"), pra aparecer na aba Anexos/Documentos de onde foi vinculada. `link`
// ausente/undefined preserva o comportamento antigo: petição solta, só na pasta "gerados".
//
// officeId de CADA registro é reconferido aqui (nunca confiar só nas checagens já feitas no
// wizard) — `link` chega do cliente numa Server Action, mesmo padrão de isCaseInOffice espalhado
// pelo resto do produto.
export async function criarPeticao(link?: PeticionarLink): Promise<{ driveUrl?: string; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };

  // Cada escritório pode cadastrar o próprio timbrado em Configurações → Geral
  // (categoria "Timbrado (Peticionar)"). Sem um cadastrado, cai no timbrado global antigo
  // (só existe de verdade para o Rodarte Prado, o único escritório que ainda não recadastrou).
  const officeTimbrado = await prisma.documentTemplate.findFirst({
    where: { officeId: user.officeId, category: "TIMBRADO" },
    orderBy: { createdAt: "desc" },
  });
  const timbradoUrl = officeTimbrado?.driveUrl ?? PETICIONAR_URL;

  const fileId = extractDriveFileId(timbradoUrl);
  if (!fileId) {
    return {
      error: officeTimbrado
        ? "Não foi possível identificar o timbrado cadastrado (link do Drive inválido)."
        : "Não foi possível identificar o timbrado no Google Drive.",
    };
  }

  const today = new Date().toLocaleDateString("pt-BR");
  let subject = user.name;
  let destinationFolderId: string | undefined;
  // Só um destes fica preenchido — decide qual registro criar depois de gerar o arquivo, e qual
  // path revalidar. licitacaoAssessoriaId é resolvido junto do caso "licitação" (precisa dela pra
  // revalidar a aba certa da Assessoria, mesmo padrão de lib/actions/attachments.ts).
  let recordCaseId: string | null = null;
  let recordAttendanceId: string | null = null;
  let recordLicitacaoId: string | null = null;
  let licitacaoAssessoriaId: string | null = null;
  let recordAssessoriaId: string | null = null;

  if (link && "caseId" in link) {
    const c = await prisma.case.findFirst({ where: { id: link.caseId, officeId: user.officeId }, include: { client: true } });
    if (!c) return { error: "Processo não encontrado." };
    subject = c.client?.name || c.title;
    destinationFolderId = await getOrCreateCaseFolder(c.id, c.title, user.officeId);
    recordCaseId = c.id;
  } else if (link && "attendanceId" in link) {
    const a = await prisma.attendance.findFirst({ where: { id: link.attendanceId, officeId: user.officeId } });
    if (!a) return { error: "Atendimento não encontrado." };
    subject = a.clientName;
    destinationFolderId = await getOrCreateAttendanceFolder(a.id, a.subject, user.officeId);
    recordAttendanceId = a.id;
  } else if (link && "licitacaoId" in link) {
    const l = await prisma.licitacao.findFirst({
      where: { id: link.licitacaoId, officeId: user.officeId },
      include: { assessoria: { include: { client: true } } },
    });
    if (!l) return { error: "Licitação não encontrada." };
    const licitacaoNome = l.nome ?? l.objeto;
    subject = licitacaoNome;
    destinationFolderId = await getOrCreateLicitacaoFolder(l.id, l.assessoria.client.name, licitacaoNome, user.officeId);
    recordLicitacaoId = l.id;
    licitacaoAssessoriaId = l.assessoriaId;
  } else if (link && "assessoriaId" in link) {
    const assessoria = await prisma.assessoria.findFirst({ where: { id: link.assessoriaId, officeId: user.officeId }, include: { client: true } });
    if (!assessoria) return { error: "Assessoria não encontrada." };
    subject = assessoria.client.name;
    destinationFolderId = await getOrCreateAssessoriaCompanyFolderCached(assessoria.id, assessoria.client.name, user.officeId);
    recordAssessoriaId = assessoria.id;
  }

  const fileName = `Petição - ${subject} - ${today}`;

  try {
    const { webViewLink } = await copyAndFillTemplate(fileId, fileName, {}, user.officeId, destinationFolderId);

    if (recordCaseId) {
      await prisma.attachment.create({
        data: { name: fileName, driveUrl: webViewLink, docType: "PETICAO", caseId: recordCaseId, uploadedById: user.id, officeId: user.officeId },
      });
      revalidatePath(`/processos/${recordCaseId}`);
    } else if (recordAttendanceId) {
      await prisma.attachment.create({
        data: {
          name: fileName,
          driveUrl: webViewLink,
          docType: "PETICAO",
          attendanceId: recordAttendanceId,
          uploadedById: user.id,
          officeId: user.officeId,
        },
      });
      revalidatePath(`/atendimento/${recordAttendanceId}`);
    } else if (recordLicitacaoId) {
      await prisma.attachment.create({
        data: {
          name: fileName,
          driveUrl: webViewLink,
          docType: "PETICAO",
          licitacaoId: recordLicitacaoId,
          uploadedById: user.id,
          officeId: user.officeId,
        },
      });
      if (licitacaoAssessoriaId) revalidatePath(`/assessoria/${licitacaoAssessoriaId}`);
    } else if (recordAssessoriaId) {
      // Assessoria não tem Attachment próprio — documento "geral da empresa" é
      // AssessoriaDocumento, mesmo model usado por addDocumento (lib/actions/assessoria.ts). Sem
      // tipo "Petição" no catálogo dela (CONTRATO/PARECER/ACAO_VINCULADA/LICITACAO/
      // REGIMENTO_INTERNO/OUTRO) — OUTRO com o nome já deixa claro do que se trata.
      await prisma.assessoriaDocumento.create({
        data: {
          officeId: user.officeId,
          assessoriaId: recordAssessoriaId,
          name: fileName,
          docType: "OUTRO",
          driveUrl: webViewLink,
          uploadedById: user.id,
        },
      });
      revalidatePath(`/assessoria/${recordAssessoriaId}`);
    }

    return { driveUrl: webViewLink };
  } catch (e) {
    const raw = e instanceof Error ? e.message : "";
    const message = /invalid_request|invalid_grant|File not found|404/i.test(raw)
      ? `Não foi possível acessar o timbrado no Google Drive. Verifique ${
          officeTimbrado ? "o modelo cadastrado em Configurações → Geral (categoria Timbrado)" : "se o Google Drive está conectado em Conexões"
        }.`
      : raw || "Erro ao gerar a petição.";
    return { error: message };
  }
}
