"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { sendDailyAgendaEmail } from "@/lib/email";
import { syncJusbrasilEmails, type SyncResult } from "@/lib/jusbrasilEmailSync";
import { syncOutlookEmails } from "@/lib/outlookEmailSync";
import { testDjenConnection, type DjenTestResult } from "@/lib/djenSync";
import { syncRoboParaSite, type RoboBridgeResult } from "@/lib/roboBridge";
import { getCurrentUser } from "@/lib/currentUser";
import { canConfigureIntegrations } from "@/lib/supportCapabilities";

export async function testDailyAgendaEmail(): Promise<{ sent: boolean; reason?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { sent: false, reason: "Sessão inválida." };
  return sendDailyAgendaEmail(viewer.officeId);
}

// Escolha explícita de qual conta usar para enviar e-mail no Atendimento (Google ou Microsoft)
// — conectar a conta não habilita o envio sozinho, ver lib/gmailSend.ts:sendEmailReply. Só
// aceita a escolha se a conta correspondente já estiver conectada.
export async function setEmailSendProvider(provider: "GOOGLE" | "MICROSOFT" | null): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão inválida." };

  if (provider === "GOOGLE") {
    const cred = await prisma.googleCredential.findFirst({ where: { userId: viewer.id } });
    if (!cred) return { error: "Conecte sua conta Google antes de escolhê-la para envio." };
  } else if (provider === "MICROSOFT") {
    const cred = await prisma.microsoftCredential.findFirst({ where: { userId: viewer.id } });
    if (!cred) return { error: "Conecte sua conta Microsoft antes de escolhê-la para envio." };
  }

  await prisma.user.update({ where: { id: viewer.id }, data: { emailSendProvider: provider } });
  revalidatePath("/configuracoes");
  return {};
}

// Escolha de qual provedor guarda os anexos (Processos/Atendimentos/Assessoria) DESTE escritório
// — mesmo padrão de setEmailSendProvider acima, mas por escritório (não por pessoa) e exigindo
// isAdmin, já que troca o comportamento de upload/exclusão pra todo mundo. Ao contrário do picker
// de e-mail, aqui a escolha é permitida mesmo ANTES de conectar a conta (ver
// components/StorageProviderPicker.tsx) — o fluxo natural é escolher primeiro, conectar depois.
export async function setStorageProvider(provider: "GOOGLE_DRIVE" | "ONEDRIVE" | "DROPBOX"): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão inválida." };
  if (!canConfigureIntegrations(viewer)) return { error: "Apenas administradores podem alterar o provedor de armazenamento." };

  await prisma.office.update({ where: { id: viewer.officeId }, data: { storageProvider: provider } });
  revalidatePath("/configuracoes");
  return {};
}

// Soma os resultados de Gmail e Outlook num só SyncResult — pro botão/cron não precisar saber
// que existem duas fontes de e-mail por baixo (mesma ideia de runFullPublicationsSync somando
// e-mail + robô).
function mergeSyncResults(a: SyncResult, b: SyncResult): SyncResult {
  return {
    accountsScanned: a.accountsScanned + b.accountsScanned,
    found: a.found + b.found,
    created: a.created + b.created,
    createdPublicacoes: a.createdPublicacoes + b.createdPublicacoes,
    createdAndamentos: a.createdAndamentos + b.createdAndamentos,
    skipped: a.skipped + b.skipped,
    errors: [...a.errors, ...b.errors],
  };
}

async function syncAllEmailAccounts(): Promise<SyncResult> {
  const [gmail, outlook] = await Promise.all([syncJusbrasilEmails(), syncOutlookEmails()]);
  return mergeSyncResults(gmail, outlook);
}

// runJusbrasilSync/runRoboBridgeSync existiram aqui como ações individuais (uma por fonte) até
// a reforma "Reorganizar Configurações" (commit 4a34032): o botão separado que as chamava
// (components/SyncJusbrasilButton.tsx) foi substituído pelo botão único abaixo
// (SyncPublicationsButton → runFullPublicationsSync, que já soma as duas fontes), e as duas
// funções ficaram sem nenhum chamador — removidas por serem puro código morto, não por perda de
// funcionalidade: o acionamento manual (e o automático, via cron — ver app/api/cron/jusbrasil-
// sync e app/api/cron/robo-bridge, que chamam syncJusbrasilEmails/syncOutlookEmails/
// syncRoboParaSite diretamente, sem passar por este arquivo) nunca parou de existir.

// Botão único "Sincronizar publicações e andamentos processuais" (Configurações → Modelos &
// Integrações) — antes eram dois botões separados (um em Publicações, outro implícito no cron
// do robô); agora dispara os dois de uma vez: varredura dos e-mails conectados (Gmail/Outlook +
// captura ampla — ver lib/jusbrasilEmailSync.ts e lib/outlookEmailSync.ts) e a ponte do robô
// Python (DJEN/Datajud).
export type FullSyncResult = { email: SyncResult; robo: RoboBridgeResult };

export async function runFullPublicationsSync(): Promise<FullSyncResult> {
  const [email, robo] = await Promise.all([syncAllEmailAccounts(), syncRoboParaSite()]);
  revalidatePath("/publicacoes");
  revalidatePath("/configuracoes");
  return { email, robo };
}

export async function runDjenConnectionTest(): Promise<{ error?: string; results?: DjenTestResult[] }> {
  const viewer = await getCurrentUser();
  if (!canConfigureIntegrations(viewer)) {
    return { error: "Apenas administradores podem testar essa integração." };
  }
  const results = await testDjenConnection(viewer.officeId);
  return { results };
}

export async function createUser(data: { name: string; email: string; role: string; oab?: string; color: string }): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer?.isAdmin) return { error: "Apenas administradores podem cadastrar membros da equipe." };
  await prisma.user.create({
    data: { name: data.name, email: data.email, role: data.role, oab: data.oab || null, color: data.color, officeId: viewer.officeId },
  });
  revalidatePath("/configuracoes");
  revalidatePath("/contatos/equipe");
  return {};
}

export async function updateUser(
  id: string,
  data: { name: string; email: string; role: string; oab?: string; color: string; phone?: string }
): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer?.isAdmin) return { error: "Apenas administradores podem editar membros da equipe." };
  const user = await prisma.user.findFirst({ where: { id, officeId: viewer.officeId } });
  if (!user) return { error: "Usuário não encontrado." };
  await prisma.user.update({
    where: { id },
    data: { name: data.name, email: data.email, role: data.role, oab: data.oab || null, color: data.color, phone: data.phone || null },
  });
  revalidatePath("/configuracoes");
  revalidatePath("/contatos/equipe");
  return {};
}

export async function setFinanceAccess(id: string, financeAccess: boolean): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer?.isAdmin) return { error: "Apenas administradores podem alterar o acesso ao Financeiro." };
  const user = await prisma.user.findFirst({ where: { id, officeId: viewer.officeId } });
  if (!user) return { error: "Usuário não encontrado." };
  if (user.isAdmin) return { error: "Sócios sempre têm acesso ao Financeiro." };
  await prisma.user.update({ where: { id }, data: { financeAccess } });
  revalidatePath("/configuracoes");
  revalidatePath("/painel");
  revalidatePath("/alertas");
  return {};
}

export async function setUserCredentials(id: string, username: string, password: string): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer?.isAdmin) return { error: "Apenas administradores podem definir credenciais de acesso." };

  const user = await prisma.user.findFirst({ where: { id, officeId: viewer.officeId } });
  if (!user) return { error: "Usuário não encontrado." };

  const normalizedUsername = username.trim().toLowerCase();
  if (normalizedUsername.length < 4) return { error: "O usuário deve ter ao menos 4 caracteres." };
  if (/\s/.test(normalizedUsername)) return { error: "O usuário não pode conter espaços." };
  if (password.length < 6) return { error: "A senha deve ter ao menos 6 caracteres." };

  const existing = await prisma.user.findFirst({
    where: { username: { equals: normalizedUsername, mode: "insensitive" }, id: { not: id }, officeId: viewer.officeId },
  });
  if (existing) return { error: "Já existe outro membro com esse usuário." };

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.update({ where: { id }, data: { username: normalizedUsername, passwordHash } });
  revalidatePath("/configuracoes");
  return {};
}

export async function changeOwnPassword(currentPassword: string, newPassword: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };
  if (newPassword.length < 6) return { error: "A nova senha deve ter ao menos 6 caracteres." };
  if (!user.passwordHash) return { error: "Este usuário ainda não tem senha configurada. Fale com um administrador." };
  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) return { error: "Senha atual incorreta." };
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  return {};
}

export async function toggleUserActive(id: string): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer?.isAdmin) return { error: "Apenas administradores podem inativar membros da equipe." };
  const user = await prisma.user.findFirst({ where: { id, officeId: viewer.officeId } });
  if (!user) return { error: "Usuário não encontrado." };
  if (user.isAdmin) return { error: "Não é possível inativar um administrador (Jairo/Rodrigo)." };
  await prisma.user.update({ where: { id }, data: { active: !user.active } });
  revalidatePath("/configuracoes");
  return {};
}

export async function deleteUser(id: string): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer?.isAdmin) return { error: "Apenas administradores podem excluir membros da equipe." };
  const user = await prisma.user.findFirst({ where: { id, officeId: viewer.officeId } });
  if (!user) return { error: "Usuário não encontrado." };
  if (user.isAdmin) {
    return { error: "Não é possível excluir um administrador (Jairo/Rodrigo) por aqui." };
  }

  const [commentCount, mentionCount, deletionReqCount] = await Promise.all([
    prisma.comment.count({ where: { authorId: id, officeId: viewer.officeId } }),
    prisma.mention.count({ where: { userId: id, officeId: viewer.officeId } }),
    prisma.deletionRequest.count({ where: { requestedById: id, officeId: viewer.officeId } }),
  ]);
  if (commentCount + mentionCount + deletionReqCount > 0) {
    return { error: "Não é possível excluir: este usuário já tem histórico no sistema (comentários, menções ou solicitações). Use \"Inativar\" em vez de excluir." };
  }

  await prisma.$transaction([
    prisma.task.updateMany({ where: { responsibleId: id, officeId: viewer.officeId }, data: { responsibleId: null } }),
    prisma.case.updateMany({ where: { responsibleId: id, officeId: viewer.officeId }, data: { responsibleId: null } }),
    prisma.attendance.updateMany({ where: { responsibleId: id, officeId: viewer.officeId }, data: { responsibleId: null } }),
    prisma.attachment.updateMany({ where: { uploadedById: id, officeId: viewer.officeId }, data: { uploadedById: null } }),
    prisma.deletionRequest.updateMany({ where: { resolvedById: id, officeId: viewer.officeId }, data: { resolvedById: null } }),
    prisma.user.delete({ where: { id } }),
  ]);
  revalidatePath("/configuracoes");
  return {};
}

export async function createKanbanColumn(data: { name: string; color: string }): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada." };
  const count = await prisma.kanbanColumn.count({ where: { officeId: viewer.officeId } });
  await prisma.kanbanColumn.create({ data: { officeId: viewer.officeId, name: data.name, color: data.color, order: count } });
  revalidatePath("/configuracoes");
  revalidatePath("/kanban");
  return {};
}

export async function deleteKanbanColumn(id: string): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada." };
  const column = await prisma.kanbanColumn.findFirst({ where: { id, officeId: viewer.officeId } });
  if (!column) return { error: "Coluna não encontrada." };
  const taskCount = await prisma.task.count({ where: { columnId: id, officeId: viewer.officeId } });
  if (taskCount > 0) {
    return { error: `Não é possível excluir: há ${taskCount} tarefa(s) nessa coluna. Mova-as antes de excluir.` };
  }
  await prisma.kanbanColumn.delete({ where: { id } });
  revalidatePath("/configuracoes");
  revalidatePath("/kanban");
  return {};
}

export async function createFinancialCategory(data: { name: string; kind: string; parentId?: string }): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada." };
  let code: string;
  if (data.parentId) {
    const parent = await prisma.financialCategory.findFirst({ where: { id: data.parentId, officeId: viewer.officeId } });
    if (!parent) return { error: "Categoria pai não encontrada." };
    const siblingCount = await prisma.financialCategory.count({ where: { parentId: data.parentId, officeId: viewer.officeId } });
    code = `${parent.code}.${siblingCount + 1}`;
  } else {
    const topCount = await prisma.financialCategory.count({ where: { parentId: null, officeId: viewer.officeId } });
    code = `${topCount + 1}`;
  }
  await prisma.financialCategory.create({
    data: { officeId: viewer.officeId, name: data.name, kind: data.kind, code, parentId: data.parentId || null },
  });
  revalidatePath("/configuracoes");
  return {};
}

export async function deleteFinancialCategory(id: string): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada." };
  const category = await prisma.financialCategory.findFirst({ where: { id, officeId: viewer.officeId } });
  if (!category) return { error: "Categoria não encontrada." };
  const childCount = await prisma.financialCategory.count({ where: { parentId: id, officeId: viewer.officeId } });
  if (childCount > 0) {
    return { error: `Não é possível excluir: essa categoria tem ${childCount} subcategoria(s). Exclua-as primeiro.` };
  }
  const [payableCount, receivableCount] = await Promise.all([
    prisma.payable.count({ where: { categoryId: id, officeId: viewer.officeId } }),
    prisma.receivable.count({ where: { categoryId: id, officeId: viewer.officeId } }),
  ]);
  if (payableCount + receivableCount > 0) {
    return { error: `Não é possível excluir: há ${payableCount + receivableCount} lançamento(s) usando essa categoria.` };
  }
  await prisma.financialCategory.delete({ where: { id } });
  revalidatePath("/configuracoes");
  return {};
}

export async function createCostCenter(data: { name: string; notes?: string }): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada." };
  await prisma.costCenter.create({ data: { officeId: viewer.officeId, name: data.name, notes: data.notes || null } });
  revalidatePath("/configuracoes");
  return {};
}

export async function createCostCenterQuick(name: string): Promise<{ id: string; name: string; error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { id: "", name: "", error: "Sessão expirada." };
  const costCenter = await prisma.costCenter.create({ data: { officeId: viewer.officeId, name } });
  revalidatePath("/configuracoes");
  revalidatePath("/financeiro/despesas");
  revalidatePath("/financeiro/receitas");
  return { id: costCenter.id, name: costCenter.name };
}

// Quick-add de conta bancária a partir do EntityPicker do bloco "Recebimento" do Lançamento de
// Honorários (components/honorarios/LancarHonorariosModal.tsx) — mesmo padrão de
// createCostCenterQuick acima. Não existe ainda uma tela de gestão de contas bancárias em
// Configurações (Fase 3): este é o único jeito de cadastrar uma conta hoje, direto de dentro do
// lançamento, sem precisar sair da janela.
export async function createBankAccountQuick(name: string): Promise<{ id: string; name: string; error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { id: "", name: "", error: "Sessão expirada." };
  const bankAccount = await prisma.bankAccount.create({ data: { officeId: viewer.officeId, name } });
  revalidatePath("/configuracoes");
  revalidatePath("/financeiro/despesas");
  revalidatePath("/financeiro/receitas");
  return { id: bankAccount.id, name: bankAccount.name };
}

// ============ CONTAS BANCÁRIAS (Fase 3) ============
// Tela de gestão em Configurações → Financeiro: listar, criar, editar, ativar/desativar — segue
// o mesmo padrão de createCostCenter/deleteCostCenter acima, mas com edição e inativação (em vez
// de exclusão) porque uma conta bancária normalmente já tem FinancePayment vinculado (histórico
// financeiro real, nunca deve sumir) assim que passa a ser usada — inativar apenas a tira das
// listas de seleção de novos lançamentos, sem apagar nada.
export async function createBankAccount(data: {
  name: string;
  bank?: string;
  agency?: string;
  accountNumber?: string;
  type?: string;
  initialBalance?: string;
  notes?: string;
}): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada." };
  if (!data.name.trim()) return { error: "Informe o apelido da conta." };
  await prisma.bankAccount.create({
    data: {
      officeId: viewer.officeId,
      name: data.name.trim(),
      bank: data.bank || null,
      agency: data.agency || null,
      accountNumber: data.accountNumber || null,
      type: data.type || "CORRENTE",
      initialBalance: parseFloat(data.initialBalance || "0") || 0,
      notes: data.notes || null,
    },
  });
  revalidatePath("/configuracoes");
  revalidatePath("/financeiro/despesas");
  revalidatePath("/financeiro/receitas");
  return {};
}

export async function updateBankAccount(
  id: string,
  data: { name: string; bank?: string; agency?: string; accountNumber?: string; type?: string; initialBalance?: string; notes?: string }
): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada." };
  const account = await prisma.bankAccount.findFirst({ where: { id, officeId: viewer.officeId } });
  if (!account) return { error: "Conta bancária não encontrada." };
  if (!data.name.trim()) return { error: "Informe o apelido da conta." };
  await prisma.bankAccount.update({
    where: { id },
    data: {
      name: data.name.trim(),
      bank: data.bank || null,
      agency: data.agency || null,
      accountNumber: data.accountNumber || null,
      type: data.type || "CORRENTE",
      initialBalance: parseFloat(data.initialBalance || "0") || 0,
      notes: data.notes || null,
    },
  });
  revalidatePath("/configuracoes");
  revalidatePath("/financeiro/despesas");
  revalidatePath("/financeiro/receitas");
  return {};
}

export async function toggleBankAccountActive(id: string): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada." };
  const account = await prisma.bankAccount.findFirst({ where: { id, officeId: viewer.officeId } });
  if (!account) return { error: "Conta bancária não encontrada." };
  await prisma.bankAccount.update({ where: { id }, data: { active: !account.active } });
  revalidatePath("/configuracoes");
  revalidatePath("/financeiro/despesas");
  revalidatePath("/financeiro/receitas");
  return {};
}

export async function deleteCostCenter(id: string): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada." };
  const costCenter = await prisma.costCenter.findFirst({ where: { id, officeId: viewer.officeId } });
  if (!costCenter) return { error: "Centro de custo não encontrado." };
  const [payableCount, receivableCount] = await Promise.all([
    prisma.payable.count({ where: { costCenterId: id, officeId: viewer.officeId } }),
    prisma.receivable.count({ where: { costCenterId: id, officeId: viewer.officeId } }),
  ]);
  if (payableCount + receivableCount > 0) {
    return { error: `Não é possível excluir: há ${payableCount + receivableCount} lançamento(s) usando esse centro de custo.` };
  }
  await prisma.costCenter.delete({ where: { id } });
  revalidatePath("/configuracoes");
  return {};
}

// ============ FERIADOS (Fase 4) ============
// Cadastro em Configurações → Geral do Holiday da Fase 1 (lib/prazos.ts) — feriado LOCAL do
// escritório (estadual, municipal ou forense). Os feriados NACIONAIS (fixos e móveis) nunca
// entram aqui: são calculados em código por feriadosNacionais() e só aparecem na tela como lista
// de leitura, para o usuário conferir que não precisa cadastrar Natal/Independência/Carnaval etc.
export async function createHoliday(data: { date: string; name: string; scope: string }): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada." };
  if (!data.name.trim()) return { error: "Informe o nome do feriado." };
  const date = new Date(`${data.date}T00:00:00Z`);
  if (isNaN(date.getTime())) return { error: "Informe a data do feriado." };
  await prisma.holiday.create({
    data: { officeId: viewer.officeId, date, name: data.name.trim(), scope: data.scope || "FORENSE" },
  });
  revalidatePath("/configuracoes");
  return {};
}

export async function updateHoliday(id: string, data: { date: string; name: string; scope: string }): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada." };
  const holiday = await prisma.holiday.findFirst({ where: { id, officeId: viewer.officeId } });
  if (!holiday) return { error: "Feriado não encontrado." };
  if (!data.name.trim()) return { error: "Informe o nome do feriado." };
  const date = new Date(`${data.date}T00:00:00Z`);
  if (isNaN(date.getTime())) return { error: "Informe a data do feriado." };
  await prisma.holiday.update({ where: { id }, data: { date, name: data.name.trim(), scope: data.scope || "FORENSE" } });
  revalidatePath("/configuracoes");
  return {};
}

export async function deleteHoliday(id: string): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada." };
  const holiday = await prisma.holiday.findFirst({ where: { id, officeId: viewer.officeId } });
  if (!holiday) return { error: "Feriado não encontrado." };
  await prisma.holiday.delete({ where: { id } });
  revalidatePath("/configuracoes");
  return {};
}
