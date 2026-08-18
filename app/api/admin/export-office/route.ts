import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/components/ui";
import { getDocumentTypeLabel } from "@/lib/documentTypes";
import { listOfficeDocumentTypes } from "@/lib/actions/documentTypes";
import { effective as effectiveStatus } from "@/lib/financeQuery";

// Exporta todos os dados "de negócio" do escritório do usuário logado numa única planilha (uma
// aba por entidade) — cópia de segurança que qualquer administrador pode gerar a qualquer
// momento. Portado do antigo sistema rp-financeiro (single-tenant, onde nasceu como ponte de
// migração pro Lúmen) e adaptado aqui para filtrar tudo por officeId, já que o Lúmen é
// multi-tenant. Anexos/documentos entram só como link (o arquivo em si continua no Drive/
// OneDrive) — ver comentário em cada aba de anexos abaixo.
export const dynamic = "force-dynamic";

function sheetFrom(rows: Record<string, unknown>[], headers: string[]) {
  return XLSX.utils.json_to_sheet(rows, { header: headers });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) {
    return NextResponse.json({ error: "Apenas administradores podem exportar os dados do escritório." }, { status: 403 });
  }

  const officeId = user.officeId;
  const now = new Date();

  const [
    users,
    clients,
    cases,
    attendances,
    tasks,
    payables,
    receivables,
    publications,
    assessorias,
    attachments,
    assessoriaDocumentos,
    officeTypes,
  ] = await Promise.all([
    prisma.user.findMany({ where: { officeId }, orderBy: { name: "asc" } }),
    prisma.client.findMany({ where: { officeId }, orderBy: { name: "asc" } }),
    prisma.case.findMany({
      where: { officeId },
      include: { client: true, responsible: true, assessoria: { include: { client: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.attendance.findMany({ where: { officeId }, include: { client: true, responsible: true }, orderBy: { createdAt: "asc" } }),
    prisma.task.findMany({ where: { officeId }, include: { case: true, attendance: true, responsible: true }, orderBy: { dueDate: "asc" } }),
    prisma.payable.findMany({ where: { officeId }, include: { category: true, costCenter: true, supplierRef: true }, orderBy: { dueDate: "asc" } }),
    prisma.receivable.findMany({ where: { officeId }, include: { category: true, costCenter: true, client: true }, orderBy: { dueDate: "asc" } }),
    prisma.publication.findMany({ where: { officeId }, include: { case: true, client: true }, orderBy: { publishedAt: "asc" } }),
    prisma.assessoria.findMany({ where: { officeId }, include: { client: true, responsible: true }, orderBy: { createdAt: "asc" } }),
    prisma.attachment.findMany({ where: { officeId }, include: { case: true, attendance: true, uploadedBy: true }, orderBy: { createdAt: "asc" } }),
    prisma.assessoriaDocumento.findMany({
      where: { officeId },
      include: { assessoria: { include: { client: true } }, case: true, uploadedBy: true },
      orderBy: { date: "asc" },
    }),
    listOfficeDocumentTypes(),
  ]);

  const workbook = XLSX.utils.book_new();

  const usersHeaders = ["Nome", "E-mail", "Usuário", "Cargo", "OAB", "Telefone", "Admin", "Acesso Financeiro", "Ativo"];
  XLSX.utils.book_append_sheet(
    workbook,
    sheetFrom(
      users.map((u) => ({
        Nome: u.name,
        "E-mail": u.email,
        Usuário: u.username || "",
        Cargo: u.role,
        OAB: u.oab || "",
        Telefone: u.phone || "",
        Admin: u.isAdmin ? "Sim" : "Não",
        "Acesso Financeiro": u.financeAccess ? "Sim" : "Não",
        Ativo: u.active ? "Sim" : "Não",
      })),
      usersHeaders
    ),
    "Usuários"
  );

  const clientsHeaders = ["Nome", "Tipo", "Documento", "RG", "Nacionalidade", "Estado Civil", "Profissão", "E-mail", "Telefone", "Endereço", "Observações"];
  XLSX.utils.book_append_sheet(
    workbook,
    sheetFrom(
      clients.map((c) => ({
        Nome: c.name,
        Tipo: c.type,
        Documento: c.document || "",
        RG: c.rg || "",
        Nacionalidade: c.nationality || "",
        "Estado Civil": c.maritalStatus || "",
        Profissão: c.profession || "",
        "E-mail": c.email || "",
        Telefone: c.phone || "",
        Endereço: c.address || "",
        Observações: c.notes || "",
      })),
      clientsHeaders
    ),
    "Clientes"
  );

  const casesHeaders = [
    "Título", "Tipo", "Área", "Status", "Nº Processo", "Vara/Comarca", "Fórum", "Tribunal",
    "Valor da Causa", "Cliente", "Responsável", "Assessoria", "Parte Adversa", "Papel Parte Adversa", "Descrição", "Criado em",
  ];
  XLSX.utils.book_append_sheet(
    workbook,
    sheetFrom(
      cases.map((c) => ({
        Título: c.title,
        Tipo: c.type,
        Área: c.area || "",
        Status: c.status,
        "Nº Processo": c.processNumber || "",
        "Vara/Comarca": c.court || "",
        Fórum: c.forum || "",
        Tribunal: c.tribunal || "",
        "Valor da Causa": c.caseValue ?? "",
        Cliente: c.client?.name || "",
        Responsável: c.responsible?.name || "",
        Assessoria: c.assessoria?.client.name || "",
        "Parte Adversa": c.opposingPartyName || "",
        "Papel Parte Adversa": c.opposingPartyRole || "",
        Descrição: c.description || "",
        "Criado em": formatDate(c.createdAt),
      })),
      casesHeaders
    ),
    "Processos"
  );

  const attendancesHeaders = ["Cliente", "Assunto", "Área", "Canal", "Status", "Estágio Comercial", "Valor Estimado", "Responsável", "Criado em"];
  XLSX.utils.book_append_sheet(
    workbook,
    sheetFrom(
      attendances.map((a) => ({
        Cliente: a.client?.name || a.clientName,
        Assunto: a.subject,
        Área: a.area || "",
        Canal: a.channel,
        Status: a.status,
        "Estágio Comercial": a.stage,
        "Valor Estimado": a.estimatedValue ?? "",
        Responsável: a.responsible?.name || "",
        "Criado em": formatDate(a.createdAt),
      })),
      attendancesHeaders
    ),
    "Atendimentos"
  );

  const tasksHeaders = ["Título", "Tipo", "Status", "Prioridade", "Vencimento", "Hora", "Vinculado a", "Responsável", "Criado em"];
  XLSX.utils.book_append_sheet(
    workbook,
    sheetFrom(
      tasks.map((t) => ({
        Título: t.title,
        Tipo: t.type,
        Status: t.status,
        Prioridade: t.priority,
        Vencimento: formatDate(t.dueDate),
        Hora: t.dueTime || "",
        "Vinculado a": t.case?.title || t.attendance?.subject || "",
        Responsável: t.responsible?.name || "",
        "Criado em": formatDate(t.createdAt),
      })),
      tasksHeaders
    ),
    "Tarefas"
  );

  const payablesHeaders = ["Descrição", "Fornecedor", "Categoria", "Centro de Custo", "Vencimento", "Valor", "Status", "Pago em", "Valor Pago"];
  XLSX.utils.book_append_sheet(
    workbook,
    sheetFrom(
      payables.map((p) => ({
        Descrição: p.description,
        Fornecedor: p.supplierRef?.name || p.supplier || "",
        Categoria: p.category ? `${p.category.code} ${p.category.name}` : "",
        "Centro de Custo": p.costCenter?.name || "",
        Vencimento: p.noDueDate ? "Sem vencimento" : formatDate(p.dueDate),
        Valor: p.amount,
        Status: effectiveStatus(p.status, p.dueDate, p.noDueDate, now),
        "Pago em": p.paidDate ? formatDate(p.paidDate) : "",
        "Valor Pago": p.paidAmount ?? "",
      })),
      payablesHeaders
    ),
    "Contas a Pagar"
  );

  const receivablesHeaders = ["Descrição", "Cliente", "Categoria", "Centro de Custo", "Vencimento", "Valor", "Status", "Pago em", "Valor Pago"];
  XLSX.utils.book_append_sheet(
    workbook,
    sheetFrom(
      receivables.map((r) => ({
        Descrição: r.description,
        Cliente: r.client?.name || "",
        Categoria: r.category ? `${r.category.code} ${r.category.name}` : r.kind,
        "Centro de Custo": r.costCenter?.name || "",
        Vencimento: r.noDueDate ? "Sem vencimento" : formatDate(r.dueDate),
        Valor: r.amount,
        Status: effectiveStatus(r.status, r.dueDate, r.noDueDate, now),
        "Pago em": r.paidDate ? formatDate(r.paidDate) : "",
        "Valor Pago": r.paidAmount ?? "",
      })),
      receivablesHeaders
    ),
    "Contas a Receber"
  );

  const publicationsHeaders = ["Tipo", "Fonte", "Conteúdo", "Publicado em", "Nº Processo", "Processo vinculado", "Cliente vinculado", "Lido"];
  XLSX.utils.book_append_sheet(
    workbook,
    sheetFrom(
      publications.map((p) => ({
        Tipo: p.kind,
        Fonte: p.source,
        Conteúdo: p.content,
        "Publicado em": formatDate(p.publishedAt),
        "Nº Processo": p.processNumberRaw || "",
        "Processo vinculado": p.case?.title || "",
        "Cliente vinculado": p.client?.name || "",
        Lido: p.read ? "Sim" : "Não",
      })),
      publicationsHeaders
    ),
    "Publicações e Andamentos"
  );

  const assessoriasHeaders = ["Cliente", "Status", "Início do Contrato", "Honorário Mensal", "Dia Vencimento", "Responsável", "Planejamento"];
  XLSX.utils.book_append_sheet(
    workbook,
    sheetFrom(
      assessorias.map((a) => ({
        Cliente: a.client.name,
        Status: a.status,
        "Início do Contrato": formatDate(a.startDate),
        "Honorário Mensal": a.monthlyFee,
        "Dia Vencimento": a.dueDay,
        Responsável: a.responsible?.name || "",
        Planejamento: a.planningNotes || "",
      })),
      assessoriasHeaders
    ),
    "Assessoria"
  );

  // Anexos só carregam o LINK do Drive/OneDrive, nunca o arquivo em si — o arquivo continua onde
  // está hospedado; a planilha serve pra reconstituir o vínculo (nome + categoria + a quem pertence).
  const attachmentsHeaders = ["Nome", "Categoria", "Link", "Vinculado a", "Enviado por", "Criado em"];
  XLSX.utils.book_append_sheet(
    workbook,
    sheetFrom(
      attachments.map((a) => ({
        Nome: a.name,
        Categoria: getDocumentTypeLabel(a.docType, officeTypes),
        Link: a.driveUrl,
        "Vinculado a": a.case?.title || a.attendance?.subject || "",
        "Enviado por": a.uploadedBy?.name || "",
        "Criado em": formatDate(a.createdAt),
      })),
      attachmentsHeaders
    ),
    "Anexos"
  );

  const assessoriaDocsHeaders = ["Nome", "Categoria", "Link", "Empresa", "Data", "Processo vinculado", "Enviado por"];
  XLSX.utils.book_append_sheet(
    workbook,
    sheetFrom(
      assessoriaDocumentos.map((d) => ({
        Nome: d.name,
        Categoria: getDocumentTypeLabel(d.docType, officeTypes),
        Link: d.driveUrl,
        Empresa: d.assessoria.client.name,
        Data: formatDate(d.date),
        "Processo vinculado": d.case?.title || "",
        "Enviado por": d.uploadedBy?.name || "",
      })),
      assessoriaDocsHeaders
    ),
    "Documentos Assessoria"
  );

  const buffer: Buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="lumen-export-escritorio-${stamp}.xlsx"`,
    },
  });
}
