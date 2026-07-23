"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";
import { copyAndFillTemplate, extractDriveFileId } from "@/lib/googleDrive";
import { buildHonorariosClause, type HonorariosInput } from "@/lib/honorarios";

const SEDE = "Goiânia";

// Mapeia DocumentTemplate.category (ver schema) para a taxonomia de Attachment.docType
// (lib/documentTypes.ts) — assim o documento gerado já sai categorizado corretamente.
const TEMPLATE_CATEGORY_TO_DOC_TYPE: Record<string, string> = {
  CONTRATO: "CONTRATO",
  PETICAO: "PETICAO",
  PROCURACAO: "PROCURACAO",
  DECLARACAO_HIPOSSUFICIENCIA: "DECLARACAO_HIPOSSUFICIENCIA",
  DECLARACAO_MORADIA: "COMPROVANTE_ENDERECO",
  OUTRO: "OUTRO",
};

function buildFileName(templateName: string, subject: string) {
  const today = new Date().toLocaleDateString("pt-BR");
  return `${templateName} - ${subject} - ${today}`;
}

type ClientQualificationSource = {
  nationality?: string | null;
  maritalStatus?: string | null;
  profession?: string | null;
  document?: string | null;
  rg?: string | null;
  address?: string | null;
};

function buildClienteQualificacao(client?: ClientQualificationSource | null): string {
  if (!client) return "qualificação a ser complementada";
  const partes = [client.nationality || "brasileiro(a)", client.maritalStatus, client.profession].filter(Boolean);
  const doc: string[] = [];
  if (client.rg) doc.push(`portador(a) do RG nº ${client.rg}`);
  if (client.document) doc.push(`inscrito(a) no CPF/CNPJ sob o nº ${client.document}`);
  const linhas = [partes.join(", "), doc.join(" e "), client.address ? `residente e domiciliado(a) em ${client.address}` : ""].filter(Boolean);
  return linhas.join(", ");
}

function buildClausulaObjetoCase(c: {
  type: string;
  processNumber: string | null;
  court: string | null;
  forum: string | null;
  area: string | null;
  title: string;
}): string {
  if (c.type === "JUDICIAL" && c.processNumber) {
    return `O presente contrato tem por objeto a prestação de serviços advocatícios pelos CONTRATADOS para patrocínio dos interesses do CONTRATANTE no processo nº ${c.processNumber}${
      c.court || c.forum ? `, em trâmite perante ${[c.court, c.forum].filter(Boolean).join(" — ")}` : ""
    }${c.area ? `, relativo a matéria de ${c.area}` : ""}, abrangendo a análise documental, a elaboração das peças processuais cabíveis e o acompanhamento integral do feito até seu efetivo desfecho.`;
  }
  const caráter = c.type === "EXTRAJUDICIAL" ? "extrajudicial" : "consultivo";
  return `O presente contrato tem por objeto a prestação de serviços advocatícios pelos CONTRATADOS ao CONTRATANTE, em caráter ${caráter}${
    c.area ? `, na área de ${c.area}` : ""
  }, relativos a "${c.title}", podendo abranger a elaboração de petição inicial e o acompanhamento do feito caso este venha a ser distribuído perante o Poder Judiciário, hipótese em que os termos deste contrato permanecem válidos.`;
}

function buildClausulaObjetoAtendimento(a: { subject: string; area: string | null }): string {
  return `O presente contrato tem por objeto a prestação de serviços advocatícios pelos CONTRATADOS ao CONTRATANTE, em caráter consultivo/extrajudicial${
    a.area ? `, na área de ${a.area}` : ""
  }, relativos a: ${a.subject}.`;
}

export async function generateDocumentFromTemplate(
  templateId: string,
  target: { caseId?: string; attendanceId?: string },
  honorarios?: HonorariosInput
): Promise<{ driveUrl?: string; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };

  const template = await prisma.documentTemplate.findFirst({ where: { id: templateId, officeId: user.officeId } });
  if (!template) return { error: "Modelo não encontrado." };

  const fileId = extractDriveFileId(template.driveUrl);
  if (!fileId) return { error: "Não foi possível identificar o arquivo do modelo no Google Drive." };

  const replacements: Record<string, string> = {
    DATA: new Date().toLocaleDateString("pt-BR"),
    CIDADE: SEDE,
    CLAUSULA_HONORARIOS: honorarios ? buildHonorariosClause(honorarios) : "",
  };
  let subject = "Documento";

  if (target.caseId) {
    const c = await prisma.case.findFirst({ where: { id: target.caseId, officeId: user.officeId }, include: { client: true, responsible: true } });
    if (!c) return { error: "Processo/caso não encontrado." };
    replacements.CLIENTE = c.client?.name ?? "";
    replacements.CLIENTE_QUALIFICACAO = buildClienteQualificacao(c.client);
    replacements.CLIENTE_CPF = c.client?.document ?? "";
    replacements.PROCESSO = c.title;
    replacements.NUMERO_PROCESSO = c.processNumber ?? "";
    replacements.VARA = c.court ?? "";
    replacements.FORO = c.forum ?? "";
    replacements.ADVOGADO = c.responsible?.name ?? "";
    replacements.PARTE_ADVERSA = c.opposingPartyName ?? "";
    replacements.POLO_PARTE_ADVERSA = c.opposingPartyRole ?? "";
    replacements.VALOR_CAUSA = c.caseValue != null ? c.caseValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "";
    replacements.MATERIA = c.area ?? "";
    replacements.CLAUSULA_OBJETO = buildClausulaObjetoCase(c);
    subject = c.client?.name || c.title;
  } else if (target.attendanceId) {
    const a = await prisma.attendance.findFirst({ where: { id: target.attendanceId, officeId: user.officeId }, include: { responsible: true } });
    if (!a) return { error: "Atendimento não encontrado." };
    replacements.CLIENTE = a.clientName;
    replacements.CLIENTE_QUALIFICACAO = buildClienteQualificacao(null);
    replacements.CLIENTE_CPF = "";
    replacements.ASSUNTO = a.subject;
    replacements.MATERIA = a.area ?? "";
    replacements.DESCRICAO = a.description ?? "";
    replacements.ADVOGADO = a.responsible?.name ?? "";
    replacements.CLAUSULA_OBJETO = buildClausulaObjetoAtendimento(a);
    subject = a.clientName;
  } else {
    return { error: "Nenhum processo ou atendimento informado." };
  }

  try {
    const { webViewLink } = await copyAndFillTemplate(fileId, buildFileName(template.name, subject), replacements, user.officeId);

    await prisma.attachment.create({
      data: {
        officeId: user.officeId,
        name: buildFileName(template.name, subject),
        driveUrl: webViewLink,
        docType: TEMPLATE_CATEGORY_TO_DOC_TYPE[template.category] || "OUTRO",
        caseId: target.caseId || null,
        attendanceId: target.attendanceId || null,
        uploadedById: user.id,
      },
    });

    if (target.caseId) revalidatePath(`/processos/${target.caseId}`);
    if (target.attendanceId) revalidatePath(`/atendimento/${target.attendanceId}`);

    return { driveUrl: webViewLink };
  } catch (e) {
    const raw = e instanceof Error ? e.message : "";
    const message = /invalid_request|invalid_grant|File not found|404/i.test(raw)
      ? "Não foi possível acessar o modelo no Google Drive. Verifique se o link do modelo está correto e se o Google Drive está conectado em Configurações."
      : raw || "Erro ao gerar documento.";
    return { error: message };
  }
}
