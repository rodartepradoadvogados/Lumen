"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { sendWhatsappText } from "@/lib/whatsapp";
import { silenciarAtendente, atendenteResponde } from "@/lib/atendenteResponde";
import { sendEmailReply } from "@/lib/gmailSend";
import { renameDriveFolder, moveDriveFile, getProcessosRootFolderId, getCasosRootFolderId } from "@/lib/storageProvider";
import { naturezaOf } from "@/lib/caseNatureza";
import { isClientInOffice, isUserInOffice, isAssessoriaInOffice } from "@/lib/officeScope";
import { getOfficeModules } from "@/lib/officeModules";
import { normalizeForCompare } from "@/lib/textNormalize";
import { createAttendancePendencias, type PendenciaInput } from "@/lib/actions/attendancePendencias";
import { podeVerAtendimentos, veTodoOAtendimento, filtroDoAtendimento, SEM_ACESSO_AO_ATENDIMENTO } from "@/lib/acessoAtendimento";
import { recorteDaConversa } from "@/lib/conversaDaCentral";
import { prazoAutomaticoDeFollowUp } from "@/lib/followUpAutomatico";
import { assuntoPadraoWhatsapp } from "@/lib/nomeTemporarioDoLead";
import { composePhoneWithDdi } from "@/lib/documentoEnvios";
import { somenteDigitos } from "@/lib/whatsappEvolution";
import { agendaDoEscritorio } from "@/lib/identificarNumero";
import type { TipoDeContato, ContatoConhecido } from "@/lib/quemEEsteNumero";

async function assertAttendanceRelationsInOffice(
  data: { clientId?: string; responsibleId?: string; assessoriaId?: string },
  officeId: string
): Promise<void> {
  if (data.clientId && !(await isClientInOffice(data.clientId, officeId))) throw new Error("Cliente não encontrado.");
  if (data.responsibleId && !(await isUserInOffice(data.responsibleId, officeId))) throw new Error("Responsável não encontrado.");
  if (data.assessoriaId && !(await isAssessoriaInOffice(data.assessoriaId, officeId))) throw new Error("Assessoria não encontrada.");
}

type CreateAttendanceInput = {
  clientName: string;
  contactPhone?: string;
  contactPhoneDdi?: string;
  clientEmail?: string;
  clientId?: string;
  isNewClient?: boolean;
  subject: string;
  area?: string;
  description?: string;
  channel: string;
  responsibleId?: string;
  estimatedValue?: number | null;
  leadSource?: string;
  nextContactAt?: string;
  assessoriaId?: string;
  // Prazo de resposta ao lead (Fase 5) — vem já calculado do client (default 24h após a criação,
  // editável na janela), string ISO/datetime-local.
  responseDeadline?: string;
  // Honorário pretendido (Fase 5) — ver comentário do schema (Attendance.feeMode e vizinhos).
  feeMode?: string;
  feePercentual?: number | null;
  feePercentualBase?: string;
  // Pendências marcadas já na criação (Fase 5) — criadas depois do Attendance existir, na mesma
  // chamada (precisa do id gerado).
  pendencias?: PendenciaInput[];
};

// A REGRA DO DONO, APLICADA EM TODA AÇÃO E NÃO SÓ NA TELA. Esconder o menu é decoração: uma
// Server Action é um endereço HTTP, e quem souber o nome dela a chama sem passar por tela
// nenhuma. Por isso a trava repete-se em cada função deste arquivo, logo depois de saber quem
// está do outro lado e antes de qualquer consulta ao banco.
/**
 * O responsável de um atendimento criado à mão.
 *
 * Quem só vê os PRÓPRIOS atendimentos fica como responsável do que abre, sempre — mesmo que o
 * formulário mande outro nome ou nenhum. Sem isto, o advogado abriria um atendimento manual e ele
 * SUMIRIA no instante em que fosse salvo: o recorte por dono o esconderia dele mesmo, e o botão
 * "Novo atendimento" que acabamos de lhe dar seria um botão que engole o trabalho.
 *
 * Escolher o responsável continua sendo de quem enxerga o escritório inteiro — é escala, e escala
 * é de quem organiza.
 */
function responsavelDoNovoAtendimento(
  viewer: { id: string; isAdmin: boolean; role: string | null; recebeTransferencia: boolean },
  escolhido: string | null | undefined,
): string | null {
  if (!veTodoOAtendimento(viewer)) return viewer.id;
  return escolhido || null;
}

export async function createAttendance(data: CreateAttendanceInput): Promise<{ id: string; newClientId?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) throw new Error("Sessão expirada. Faça login novamente.");
  if (!podeVerAtendimentos(viewer)) throw new Error(SEM_ACESSO_AO_ATENDIMENTO);
  if (!(await getOfficeModules(viewer.officeId)).atendimento) {
    throw new Error("O módulo Atendimento não está incluído no plano deste escritório.");
  }
  await assertAttendanceRelationsInOffice(data, viewer.officeId);

  // Resolve o vínculo com Client conforme o modo escolhido no formulário:
  // - clientId preenchido: cliente já cadastrado, selecionado via busca — usa direto.
  // - isNewClient: fluxo "Cadastrar novo cliente" finalizado (não é rascunho) — cria o Client agora.
  // - nenhum dos dois: atendimento rápido sem cliente formal ainda (comportamento antigo).
  let clientId = data.clientId || null;
  let newClientId: string | undefined;

  if (!clientId && data.isNewClient) {
    const client = await prisma.client.create({
      data: {
        name: data.clientName,
        type: "PF",
        phone: data.contactPhone || null,
        // DDI cadastrado no atendimento vai junto pro cliente novo — sem isso, o Client.phoneDdi
        // nasceria vazio mesmo com o telefone já certo (ver bug de WhatsApp sem código de país).
        phoneDdi: data.contactPhone ? data.contactPhoneDdi || null : null,
        email: data.clientEmail || null,
        officeId: viewer.officeId,
      },
    });
    clientId = client.id;
    newClientId = client.id;
  }

  const created = await prisma.attendance.create({
    data: {
      clientName: data.clientName,
      contactPhone: data.contactPhone || null,
      contactPhoneDdi: data.contactPhone ? data.contactPhoneDdi || null : null,
      clientEmail: data.clientEmail || null,
      clientId,
      subject: data.subject,
      area: data.area || null,
      description: data.description || null,
      channel: data.channel,
      responsibleId: responsavelDoNovoAtendimento(viewer, data.responsibleId),
      estimatedValue: data.estimatedValue ?? null,
      leadSource: data.leadSource || null,
      // FOLLOW-UP AUTOMÁTICO (F5.5): quando a pessoa não escolheu uma data de próximo contato na
      // janela de criação, o atendimento não nasce sem follow-up nenhum — ganha o prazo automático
      // do estágio inicial (NOVO, sempre — este formulário não escolhe estágio). Ver a regra
      // central em lib/followUpAutomatico.ts.
      nextContactAt: data.nextContactAt ? new Date(data.nextContactAt) : prazoAutomaticoDeFollowUp("NOVO", new Date()),
      stageChangedAt: new Date(),
      assessoriaId: data.assessoriaId || null,
      officeId: viewer.officeId,
      responseDeadline: data.responseDeadline ? new Date(data.responseDeadline) : new Date(Date.now() + 24 * 3600 * 1000),
      feeMode: data.feeMode || null,
      feePercentual: data.feePercentual ?? null,
      feePercentualBase: data.feePercentualBase || null,
    },
  });

  if (data.pendencias && data.pendencias.length > 0) {
    await createAttendancePendencias(created.id, data.pendencias);
  }

  revalidatePath("/atendimento");
  revalidatePath("/atendimento/funil");
  return { id: created.id, newClientId };
}

// Checagem de conflito de interesses (Fase 5) — nome digitado no "Nome do Contato" contra a parte
// adversa de qualquer processo do escritório (CaseParty.name + o campo legado
// Case.opposingPartyName). Comparação tolerante (sem acento/caixa/espaços — ver
// lib/textNormalize.ts) porque o mesmo nome quase nunca é digitado igual duas vezes. Não bloqueia
// nada — só avisa (ver NewAttendanceModal.tsx); a decisão de seguir ou não é sempre do advogado.
export async function checkOpposingPartyConflict(
  name: string
): Promise<{ id: string; title: string; processNumber: string | null }[]> {
  const q = name.trim();
  if (q.length < 3) return [];
  const viewer = await getCurrentUser();
  if (!viewer) return [];
  if (!podeVerAtendimentos(viewer)) return [];
  const target = normalizeForCompare(q);

  const [byParty, byLegacyField] = await Promise.all([
    prisma.caseParty.findMany({
      where: { case: { officeId: viewer.officeId } },
      select: { name: true, case: { select: { id: true, title: true, processNumber: true } } },
    }),
    prisma.case.findMany({
      where: { officeId: viewer.officeId, opposingPartyName: { not: null } },
      select: { id: true, title: true, processNumber: true, opposingPartyName: true },
    }),
  ]);

  const matches = new Map<string, { id: string; title: string; processNumber: string | null }>();
  for (const p of byParty) {
    if (normalizeForCompare(p.name) === target) matches.set(p.case.id, p.case);
  }
  for (const c of byLegacyField) {
    if (c.opposingPartyName && normalizeForCompare(c.opposingPartyName) === target) {
      matches.set(c.id, { id: c.id, title: c.title, processNumber: c.processNumber });
    }
  }
  return Array.from(matches.values());
}

export async function markAttendanceResponded(attendanceId: string): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada. Faça login novamente." };
  if (!podeVerAtendimentos(viewer)) return { error: SEM_ACESSO_AO_ATENDIMENTO };
  await prisma.attendance.updateMany({
    where: { id: attendanceId, officeId: viewer.officeId, firstResponseAt: null, ...filtroDoAtendimento(viewer, viewer.id) },
    data: { firstResponseAt: new Date() },
  });
  revalidatePath(`/atendimento/${attendanceId}`);
  revalidatePath("/alertas");
  return {};
}

// Rascunho: salva o que já foi preenchido para retomar depois. Nunca cria um Client novo
// aqui (mesmo que o modo "novo cliente" estivesse selecionado) para não deixar cadastro
// órfão no caso do rascunho nunca ser finalizado.
export async function saveAttendanceDraft(
  data: Omit<CreateAttendanceInput, "isNewClient">
): Promise<{ id: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) throw new Error("Sessão expirada. Faça login novamente.");
  if (!podeVerAtendimentos(viewer)) throw new Error(SEM_ACESSO_AO_ATENDIMENTO);
  if (!(await getOfficeModules(viewer.officeId)).atendimento) {
    throw new Error("O módulo Atendimento não está incluído no plano deste escritório.");
  }
  await assertAttendanceRelationsInOffice(data, viewer.officeId);

  const created = await prisma.attendance.create({
    data: {
      clientName: data.clientName || "(rascunho sem nome)",
      contactPhone: data.contactPhone || null,
      contactPhoneDdi: data.contactPhone ? data.contactPhoneDdi || null : null,
      clientEmail: data.clientEmail || null,
      clientId: data.clientId || null,
      subject: data.subject || "(rascunho)",
      area: data.area || null,
      description: data.description || null,
      channel: data.channel || "WHATSAPP",
      responsibleId: responsavelDoNovoAtendimento(viewer, data.responsibleId),
      estimatedValue: data.estimatedValue ?? null,
      leadSource: data.leadSource || null,
      nextContactAt: data.nextContactAt ? new Date(data.nextContactAt) : null,
      status: "RASCUNHO",
      stageChangedAt: new Date(),
      assessoriaId: data.assessoriaId || null,
      officeId: viewer.officeId,
      responseDeadline: data.responseDeadline ? new Date(data.responseDeadline) : new Date(Date.now() + 24 * 3600 * 1000),
      feeMode: data.feeMode || null,
      feePercentual: data.feePercentual ?? null,
      feePercentualBase: data.feePercentualBase || null,
    },
  });

  if (data.pendencias && data.pendencias.length > 0) {
    await createAttendancePendencias(created.id, data.pendencias);
  }

  revalidatePath("/atendimento");
  return { id: created.id };
}

export async function searchClients(
  query: string
): Promise<{ id: string; name: string; phone: string | null; phoneDdi: string | null; email: string | null }[]> {
  const q = query.trim();
  if (!q) return [];
  const viewer = await getCurrentUser();
  if (!viewer) return [];
  // Busca de cliente da janela de novo atendimento — lista vazia, que é o "não achei" dela.
  if (!podeVerAtendimentos(viewer)) return [];
  const clients = await prisma.client.findMany({
    where: { name: { contains: q, mode: "insensitive" }, officeId: viewer.officeId },
    select: { id: true, name: true, phone: true, phoneDdi: true, email: true },
    orderBy: { name: "asc" },
    take: 15,
  });
  return clients;
}

export async function updateClientQualification(
  clientId: string,
  data: {
    type?: string;
    document?: string;
    rg?: string;
    nationality?: string;
    maritalStatus?: string;
    profession?: string;
    address?: string;
    notes?: string;
  }
): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada. Faça login novamente." };
  if (!podeVerAtendimentos(viewer)) return { error: SEM_ACESSO_AO_ATENDIMENTO };

  await prisma.client.updateMany({
    where: { id: clientId, officeId: viewer.officeId },
    data: {
      type: data.type || undefined,
      document: data.document || null,
      rg: data.rg || null,
      nationality: data.nationality || null,
      maritalStatus: data.maritalStatus || null,
      profession: data.profession || null,
      address: data.address || null,
      notes: data.notes || null,
    },
  });
  revalidatePath("/atendimento");
  revalidatePath("/contatos/clientes");
  revalidatePath(`/contatos/clientes/${clientId}`);
  revalidatePath("/contatos");
  return {};
}

export async function updateAttendanceStatus(id: string, status: string) {
  const viewer = await getCurrentUser();
  if (!viewer) throw new Error("Sessão expirada. Faça login novamente.");
  if (!podeVerAtendimentos(viewer)) throw new Error(SEM_ACESSO_AO_ATENDIMENTO);
  await prisma.attendance.updateMany({ where: { id, officeId: viewer.officeId, ...filtroDoAtendimento(viewer, viewer.id) }, data: { status } });
  revalidatePath("/atendimento");
  revalidatePath(`/atendimento/${id}`);
  revalidatePath("/m/atendimento");
  revalidatePath(`/m/atendimento/${id}`);
}

// Renomeia o assunto do atendimento — é o texto usado em toda lista/vínculo (ex.: "Casos
// vinculados" da Assessoria, ver AssessoriaProcessosCasosTab.tsx), mas até aqui só era definido na
// criação, sem jeito de corrigir depois.
export async function updateAttendanceSubject(id: string, subject: string): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão inválida." };
  if (!podeVerAtendimentos(viewer)) return { error: SEM_ACESSO_AO_ATENDIMENTO };
  const trimmed = subject.trim();
  if (!trimmed) return { error: "Preencha o assunto." };

  const existing = await prisma.attendance.findFirst({
    where: { id, officeId: viewer.officeId, ...filtroDoAtendimento(viewer, viewer.id) },
    select: { id: true, subject: true, driveFolderId: true },
  });
  if (!existing) return { error: "Atendimento não encontrado." };

  await prisma.attendance.update({ where: { id }, data: { subject: trimmed } });

  // A pasta do Drive (quando já existe — ver getOrCreateAttendanceFolder em lib/googleDrive.ts)
  // é nomeada com o assunto ("Lúmen - Atendimentos/{assunto}"), do mesmo jeito que
  // convertAttendanceToCase já renomeia ao virar Processo/Caso. Editar o assunto à mão tinha o
  // mesmo efeito sem o mesmo cuidado: a pasta ficava com o nome velho pra sempre. Aqui só
  // RENOMEIA — nunca cria pasta nova (quem decide se um atendimento ganha pasta é o primeiro
  // anexo, não a edição do texto) e nunca troca o driveFolderId (o id é o que amarra tudo no
  // banco; o nome é só rótulo).
  if (existing.driveFolderId && trimmed !== existing.subject) {
    try {
      await renameDriveFolder(existing.driveFolderId, trimmed, viewer.officeId);
    } catch {
      // Best-effort, igual ao renomeio de convertAttendanceToCase: um escritório sem Drive
      // conectado (ou uma chamada que falhe) não pode impedir a correção do assunto — a pasta
      // fica com o nome antigo até a próxima tentativa, mas o atendimento é atualizado normalmente.
    }
  }

  revalidatePath("/atendimento");
  revalidatePath(`/atendimento/${id}`);
  revalidatePath("/m/atendimento");
  revalidatePath(`/m/atendimento/${id}`);
  return {};
}

// ===== Funil comercial (CRM de captação) — eixo independente do status operacional =====

export async function setAttendanceStage(id: string, stage: string, lostReason?: string): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) throw new Error("Sessão expirada. Faça login novamente.");
  if (!podeVerAtendimentos(viewer)) throw new Error(SEM_ACESSO_AO_ATENDIMENTO);

  // Motivo da perda passou a ser OBRIGATÓRIO (Fase 5) — é o que alimenta o relatório de captação.
  // Quem chama isto para PERDIDO precisa já ter coletado o motivo antes (ver
  // components/AttendanceLostReasonModal.tsx, opções fechadas + "Outro" com texto livre) — aqui só
  // se recusa a gravar um PERDIDO sem motivo, não decide QUAL motivo.
  if (stage === "PERDIDO" && !lostReason?.trim()) {
    return { error: "Informe o motivo da perda antes de mover para Perdido." };
  }

  // FOLLOW-UP AUTOMÁTICO (F5.5) — só PREENCHE quando ainda não há data nenhuma; nunca sobrescreve
  // uma data que já existe, seja ela manual ou automática de uma passagem anterior por este mesmo
  // atendimento. Por isso o `findFirst` antes do `updateMany`: sem ler o valor atual não dá para
  // saber se há vazio para preencher. Ver a regra central em lib/followUpAutomatico.ts.
  const atual = await prisma.attendance.findFirst({
    where: { id, officeId: viewer.officeId, ...filtroDoAtendimento(viewer, viewer.id) },
    select: { nextContactAt: true },
  });
  if (!atual) return { error: "Atendimento não encontrado." };

  const agora = new Date();
  await prisma.attendance.updateMany({
    where: { id, officeId: viewer.officeId, ...filtroDoAtendimento(viewer, viewer.id) },
    data: {
      stage,
      stageChangedAt: agora,
      // motivo só é gravado (ou limpo) quando o estágio é PERDIDO
      lostReason: stage === "PERDIDO" ? lostReason!.trim() : null,
      nextContactAt: atual.nextContactAt ?? prazoAutomaticoDeFollowUp(stage, agora),
      // não mexe no `status` operacional: os dois eixos são independentes
    },
  });
  revalidatePath("/atendimento");
  revalidatePath("/atendimento/funil");
  revalidatePath(`/atendimento/${id}`);
  revalidatePath("/alertas");
  return {};
}

export async function updateAttendanceCommercial(
  id: string,
  data: {
    estimatedValue?: number | null;
    leadSource?: string | null;
    nextContactAt?: string | null;
    // Fase 5 — honorário pretendido e prazo de resposta, editáveis junto com o resto do bloco
    // "Comercial (Funil)" da tela de detalhe (ver AttendanceCommercialForm.tsx).
    feeMode?: string | null;
    feePercentual?: number | null;
    feePercentualBase?: string | null;
    responseDeadline?: string | null;
  }
) {
  const viewer = await getCurrentUser();
  if (!viewer) throw new Error("Sessão expirada. Faça login novamente.");
  if (!podeVerAtendimentos(viewer)) throw new Error(SEM_ACESSO_AO_ATENDIMENTO);
  await prisma.attendance.updateMany({
    where: { id, officeId: viewer.officeId, ...filtroDoAtendimento(viewer, viewer.id) },
    data: {
      estimatedValue: data.estimatedValue ?? null,
      leadSource: data.leadSource || null,
      nextContactAt: data.nextContactAt ? new Date(data.nextContactAt) : null,
      feeMode: data.feeMode || null,
      feePercentual: data.feePercentual ?? null,
      feePercentualBase: data.feePercentualBase || null,
      responseDeadline: data.responseDeadline ? new Date(data.responseDeadline) : null,
    },
  });
  revalidatePath("/atendimento");
  revalidatePath("/atendimento/funil");
  revalidatePath(`/atendimento/${id}`);
  revalidatePath("/alertas");
}

// ===== O atendente de IA, nesta conversa =====

/**
 * Liga ou desliga o atendente NESTA conversa.
 *
 * Ligar vale da PRÓXIMA mensagem do cliente em diante — foi assim que o dono descreveu, e é o
 * comportamento seguro: marcar a chave no meio de uma conversa não faz o atendente sair
 * respondendo sozinho uma pergunta que alguém já pode estar redigindo. Para responder à última
 * pergunta que ficou pendente, existe `responderUltimaPergunta`, que é um ato deliberado.
 */
export async function definirAtendenteResponde(
  attendanceId: string,
  responde: boolean,
): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão expirada. Faça login novamente." };
  if (!podeVerAtendimentos(user)) return { error: SEM_ACESSO_AO_ATENDIMENTO };

  const atendimento = await prisma.attendance.findFirst({
    where: { id: attendanceId, officeId: user.officeId, ...filtroDoAtendimento(user, user.id) },
    select: { agenteSilenciadoEm: true },
  });
  if (!atendimento) return { error: "Atendimento não encontrado." };

  // Esta CHAVE continua recusando religar depois que alguém assumiu, e a recusa continua
  // explícita: uma chave que aceita ser ligada e depois não faz nada é pior que uma chave que diz
  // não. O dono pediu uma SAÍDA para essa situação, e ela existe — mas é `devolverAtendenteResponde`,
  // logo abaixo, uma ação nomeada e com confirmação própria, não este mesmo botão aceitando `true`
  // de novo.
  if (atendimento.agenteSilenciadoEm && responde) {
    return {
      error: "Uma pessoa do escritório já respondeu nesta conversa — o atendente não volta a falar aqui.",
    };
  }

  await prisma.attendance.update({ where: { id: attendanceId }, data: { agenteResponde: responde } });
  revalidatePath(`/atendimento/${attendanceId}`);
  return {};
}

/**
 * DEVOLVE a conversa para a Ana depois que um humano assumiu.
 *
 * O dono decidiu reverter a trava de `definirAtendenteResponde` acima: religar não era permitido
 * porque "uma chave que aceita ser ligada e depois não faz nada é pior que uma chave que diz não"
 * — e continua sendo, por isso esta NÃO é aquela chave voltando a aceitar `true`. É uma ação à
 * parte, com nome que diz o que faz, chamada só a partir de um botão com confirmação
 * (components/AtendenteIaControle.tsx), nunca automaticamente.
 *
 * O mesmo contrato de sempre se aplica: ligar vale da PRÓXIMA mensagem do cliente em diante. Esta
 * função só grava estado — quem decide se o atendente fala é `deveResponder`, chamado no próximo
 * webhook de mensagem recebida — então devolver no meio de uma conversa não faz a Ana sair
 * respondendo sozinha uma pergunta que a pessoa do escritório pode estar redigindo agora. Para
 * isso existe `responderUltimaPergunta`, ato separado e explícito, disponível logo em seguida
 * assim que a tela deixa de mostrar o cadeado.
 */
export async function devolverAtendenteResponde(attendanceId: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão expirada. Faça login novamente." };
  if (!podeVerAtendimentos(user)) return { error: SEM_ACESSO_AO_ATENDIMENTO };

  // MESMO recorte de `definirAtendenteResponde`: id + escritório de quem pediu + recorte por
  // dono. Quem só vê os próprios atendimentos não pode devolver um atendimento que não poderia
  // nem listar.
  const atendimento = await prisma.attendance.findFirst({
    where: { id: attendanceId, officeId: user.officeId, ...filtroDoAtendimento(user, user.id) },
    select: { agenteSilenciadoEm: true },
  });
  if (!atendimento) return { error: "Atendimento não encontrado." };

  if (!atendimento.agenteSilenciadoEm) {
    return { error: "Esta conversa não está com um humano assumido — não há o que devolver." };
  }

  // `agenteSilenciadoEm` volta a `null`: é o que faz `deveResponder` (lib/agenteAtendimento.ts)
  // voltar a permitir resposta. Não é apagado sem deixar rastro — `agenteDevolvidoEm` e
  // `agenteDevolvidoPorId` (prisma/schema.prisma) guardam quando e quem decidiu, porque zerar
  // o campo perde a memória de quando o humano tinha assumido a primeira vez.
  await prisma.attendance.update({
    where: { id: attendanceId },
    data: {
      agenteSilenciadoEm: null,
      agenteResponde: true,
      agenteDevolvidoEm: new Date(),
      agenteDevolvidoPorId: user.id,
    },
  });
  revalidatePath(`/atendimento/${attendanceId}`);
  return {};
}

/** Faz o atendente responder AGORA à última mensagem do cliente, mesmo com a chave desligada. */
export async function responderUltimaPergunta(attendanceId: string): Promise<{ error?: string; motivo?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão expirada. Faça login novamente." };
  if (!podeVerAtendimentos(user)) return { error: SEM_ACESSO_AO_ATENDIMENTO };

  const existe = await prisma.attendance.findFirst({
    where: { id: attendanceId, officeId: user.officeId, ...filtroDoAtendimento(user, user.id) },
    select: { id: true },
  });
  if (!existe) return { error: "Atendimento não encontrado." };

  const r = await atendenteResponde(attendanceId, { forcar: true });
  if (!r.respondeu) return { error: `O atendente não respondeu: ${r.motivo}.` };
  revalidatePath(`/atendimento/${attendanceId}`);
  return { motivo: r.motivo };
}

// ===== WhatsApp: responder ao cliente pelo número oficial da Meta =====

export async function replyWhatsapp(attendanceId: string, body: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão expirada. Faça login novamente." };
  if (!podeVerAtendimentos(user)) return { error: SEM_ACESSO_AO_ATENDIMENTO };

  const text = body.trim();
  if (!text) return { error: "Digite uma mensagem antes de enviar." };

  // O MESMO recorte da leitura da Central (id + escritório de quem pediu + recorte por dono): quem
  // não poderia abrir a conversa não pode escrever nela.
  const attendance = await prisma.attendance.findFirst({ where: recorteDaConversa(user, attendanceId) });
  if (!attendance) return { error: "Atendimento não encontrado." };
  if (!attendance.waPhone) return { error: "Este atendimento não tem WhatsApp vinculado." };

  const result = await sendWhatsappText(user.officeId, attendance.waPhone, text);
  if (!result.ok) {
    return { error: result.error || "Não foi possível enviar a mensagem." };
  }

  // UMA PESSOA ASSUMIU: o atendente de IA cala nesta conversa, para sempre. Vem antes de gravar
  // a mensagem de propósito — se a gravação falhar, é melhor o atendente estar calado a mais do
  // que a menos.
  await silenciarAtendente(attendanceId, user.officeId);

  await prisma.whatsappMessage.create({
    data: {
      attendanceId,
      direction: "OUT",
      body: text,
      waMessageId: result.waMessageId || null,
      status: "SENT",
      fromNumber: attendance.waPhone,
      officeId: user.officeId,
    },
  });

  await prisma.attendance.update({
    where: { id: attendanceId },
    data: {
      waLastMessageAt: new Date(),
      // Primeira resposta ao lead (Fase 5) — só carimba se ainda estiver nula, nunca sobrescreve.
      firstResponseAt: attendance.firstResponseAt ?? new Date(),
    },
  });

  revalidatePath(`/atendimento/${attendanceId}`);
  return {};
}

// ===== WhatsApp: INICIAR conversa (F5.5, item 4) =====
//
// "eu só consigo responder reativamente, e não selecionar um contato ou digitar um número de
// whatsapp para iniciar uma conversa" — pedido do dono, para o atendimento e para Clientes,
// Advogados e Fornecedores.
//
// A JANELA DE 24H DA META NÃO É IGNORADA AQUI — É DEIXADA PARA A API DIZER A VERDADE. Este
// escritório pode estar em qualquer um dos dois provedores (ver lib/whatsapp.ts): na Cloud API
// oficial da Meta, iniciar contato com quem nunca escreveu (ou está fora da janela de 24h) exige
// um modelo (template) pré-aprovado — ESTE PROJETO NÃO IMPLEMENTA ENVIO DE TEMPLATE, então
// `sendWhatsappText` (mensagem de texto livre) é rejeitado pela própria Graph API nesse caso, e o
// erro que ela devolve é o que a tela mostra — nunca um "enviado" fingido. Na Evolution (WhatsApp
// Web / Baileys), não há essa trava da Meta: o envio funciona como mandar uma mensagem pelo
// aplicativo, com o mesmo risco de sempre de ser um número não-oficial (ver o cabeçalho de
// lib/whatsappEvolution.ts). NENHUM texto de tela promete "iniciar conversa" sem ressalva — ver
// components/atendimento/NovaConversaModal.tsx.
//
// O ATENDIMENTO NUNCA SE PERDE, MESMO QUANDO O ENVIO FALHA: ele é criado (ou reaproveitado, se já
// havia uma conversa aberta com este telefone) ANTES do envio, e o `id` volta mesmo em erro — quem
// chamou pode reabrir a conversa e tentar de novo pela caixa de resposta comum, sem redigitar nada.

type ResultadoDeIniciarConversa = { error?: string; id?: string; jaExistia?: boolean };

/** O que os três "iniciar conversa" (contato existente, número digitado) têm em comum: achar (ou
 * criar) o atendimento pelo telefone, mandar a primeira mensagem, e nunca inventar sucesso. */
async function iniciarOuRetomarConversa(
  officeId: string,
  responsibleId: string | null,
  numeroE164: string,
  nome: string,
  mensagem: string,
  clientId: string | null,
): Promise<ResultadoDeIniciarConversa> {
  // JÁ HÁ CONVERSA ABERTA COM ESTE TELEFONE NESTE ESCRITÓRIO? Reaproveita — criar uma segunda
  // conversa para o mesmo número duplicaria a Central de Atendimento e confundiria para quem lado
  // a próxima resposta do cliente deveria ir (ingestIncomingWhatsapp também escolhe pela mais
  // recente não arquivada, mesmo critério aqui).
  const existente = await prisma.attendance.findFirst({
    where: { officeId, waPhone: numeroE164, status: { not: "ARQUIVADO" } },
    orderBy: { createdAt: "desc" },
    select: { id: true, firstResponseAt: true },
  });

  const attendanceId = existente
    ? existente.id
    : (
        await prisma.attendance.create({
          data: {
            clientName: nome,
            subject: assuntoPadraoWhatsapp(nome),
            channel: "WHATSAPP",
            status: "NOVO",
            waPhone: numeroE164,
            clientId,
            responsibleId,
            stageChangedAt: new Date(),
            officeId,
            responseDeadline: new Date(Date.now() + 24 * 3600 * 1000),
            // A conversa está sendo aberta PELO escritório — não há lead esperando, então o
            // primeiro "próximo contato" automático já entra (ver lib/followUpAutomatico.ts),
            // mesma regra de ingestIncomingWhatsapp e createAttendance.
            nextContactAt: prazoAutomaticoDeFollowUp("NOVO", new Date()),
          },
        })
      ).id;

  const envio = await sendWhatsappText(officeId, numeroE164, mensagem);
  if (!envio.ok) {
    // O ATENDIMENTO FICA — ver o comentário de cabeçalho desta seção. Devolve o id mesmo em erro.
    return { error: envio.error || "Não foi possível enviar a mensagem.", id: attendanceId, jaExistia: Boolean(existente) };
  }

  await prisma.whatsappMessage.create({
    data: {
      attendanceId,
      direction: "OUT",
      body: mensagem,
      waMessageId: envio.waMessageId || null,
      status: "SENT",
      fromNumber: numeroE164,
      officeId,
    },
  });
  await prisma.attendance.update({
    where: { id: attendanceId },
    data: {
      waLastMessageAt: new Date(),
      firstResponseAt: existente?.firstResponseAt ?? new Date(),
    },
  });

  revalidatePath("/atendimento");
  revalidatePath("/atendimento-central");
  revalidatePath(`/atendimento/${attendanceId}`);
  revalidatePath(`/m/atendimento/${attendanceId}`);
  return { id: attendanceId, jaExistia: Boolean(existente) };
}

/**
 * A busca do pop-up "Iniciar conversa" — clientes, advogados PARCEIROS e fornecedores com
 * telefone cadastrado, pelo nome. Reaproveita `agendaDoEscritorio` (lib/identificarNumero.ts), a
 * mesma varredura que "Quem é este número" já usa para o caminho inverso (telefone → nome).
 *
 * ADVOGADO ADVERSO NUNCA APARECE AQUI. Iniciar contato com a parte adversa de um processo em
 * curso não é "abrir uma conversa de atendimento" — é abordagem indevida a quem está representado,
 * a mesma ressalva de servidor-hermes/skills/follow-up-inteligente/SKILL.md. Quem precisa falar
 * com um advogado adverso fala pelos autos, não pelo botão desta tela.
 */
export async function buscarContatosParaConversa(query: string): Promise<ContatoConhecido[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const viewer = await getCurrentUser();
  if (!viewer) return [];
  if (!podeVerAtendimentos(viewer)) return [];

  const alvo = normalizeForCompare(q);
  const agenda = await agendaDoEscritorio(viewer.officeId);
  return agenda
    .filter((c) => c.tipo !== "equipe")
    .filter((c) => !(c.tipo === "advogado" && (c.detalhe || "").startsWith("Advogado adverso")))
    .filter((c) => c.telefone && normalizeForCompare(c.nome).includes(alvo))
    .slice(0, 15);
}

/**
 * Inicia (ou retoma) uma conversa de WhatsApp com um contato JÁ CADASTRADO — o telefone e o nome
 * vêm do PRÓPRIO CADASTRO, nunca do que o formulário mandar, porque o cadastro já reconferiu o
 * escritório (cliente/advogado/fornecedor são todos consultados com `officeId: viewer.officeId`
 * no `where`) e confiar no nome/telefone que o cliente do navegador mandasse abriria a porta para
 * escrever em nome de outro escritório só trocando o `id` na chamada.
 */
export async function iniciarConversaComContato(
  tipo: TipoDeContato,
  contatoId: string,
  mensagem: string
): Promise<ResultadoDeIniciarConversa> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada. Faça login novamente." };
  if (!podeVerAtendimentos(viewer)) return { error: SEM_ACESSO_AO_ATENDIMENTO };
  if (!(await getOfficeModules(viewer.officeId)).atendimento) {
    return { error: "O módulo Atendimento não está incluído no plano deste escritório." };
  }
  const texto = mensagem.trim();
  if (!texto) return { error: "Escreva a primeira mensagem." };

  let nome: string;
  let telefone: string | null;
  let phoneDdi: string | null;
  let clientId: string | null = null;

  if (tipo === "cliente") {
    const c = await prisma.client.findFirst({ where: { id: contatoId, officeId: viewer.officeId }, select: { name: true, phone: true, phoneDdi: true } });
    if (!c) return { error: "Cliente não encontrado." };
    ({ name: nome, phone: telefone, phoneDdi } = c);
    clientId = contatoId;
  } else if (tipo === "advogado") {
    const l = await prisma.lawyer.findFirst({ where: { id: contatoId, officeId: viewer.officeId }, select: { name: true, phone: true, phoneDdi: true, side: true } });
    if (!l) return { error: "Advogado não encontrado." };
    if (l.side === "ADVERSO") return { error: "Este contato é a parte adversa de um processo — não é possível iniciar conversa por aqui." };
    ({ name: nome, phone: telefone, phoneDdi } = l);
  } else {
    const s = await prisma.supplier.findFirst({ where: { id: contatoId, officeId: viewer.officeId }, select: { name: true, phone: true, phoneDdi: true } });
    if (!s) return { error: "Fornecedor não encontrado." };
    ({ name: nome, phone: telefone, phoneDdi } = s);
  }

  if (!telefone?.trim()) return { error: `${nome} não tem telefone cadastrado.` };
  const numeroE164 = somenteDigitos(composePhoneWithDdi(phoneDdi, telefone));
  if (numeroE164.length < 10) return { error: "O telefone cadastrado parece incompleto." };

  return iniciarOuRetomarConversa(
    viewer.officeId,
    responsavelDoNovoAtendimento(viewer, undefined),
    numeroE164,
    nome,
    texto,
    clientId
  );
}

/**
 * Inicia uma conversa com um número digitado à mão — quando a pessoa não está em cadastro nenhum
 * do escritório. Mesmo nível de confiança no telefone/nome que `createAttendance` já dá ao
 * "Cadastrar novo cliente" da janela de Novo Atendimento: dado digitado por quem já passou pelo
 * login e pela trava de módulo, não um dado de fora.
 */
export async function iniciarConversaComNumero(input: {
  nome: string;
  telefone: string;
  ddi: string;
  mensagem: string;
}): Promise<ResultadoDeIniciarConversa> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada. Faça login novamente." };
  if (!podeVerAtendimentos(viewer)) return { error: SEM_ACESSO_AO_ATENDIMENTO };
  if (!(await getOfficeModules(viewer.officeId)).atendimento) {
    return { error: "O módulo Atendimento não está incluído no plano deste escritório." };
  }

  const nome = input.nome.trim();
  if (!nome) return { error: "Informe o nome da pessoa." };
  const texto = input.mensagem.trim();
  if (!texto) return { error: "Escreva a primeira mensagem." };

  const numeroE164 = somenteDigitos(composePhoneWithDdi(input.ddi, input.telefone));
  if (numeroE164.length < 10) return { error: "Digite um telefone válido, com DDD." };

  return iniciarOuRetomarConversa(viewer.officeId, responsavelDoNovoAtendimento(viewer, undefined), numeroE164, nome, texto, null);
}

// ===== E-mail: responder ao cliente usando a conta Google do próprio advogado logado =====

export async function updateAttendanceClientEmail(attendanceId: string, clientEmail: string): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada. Faça login novamente." };
  if (!podeVerAtendimentos(viewer)) return { error: SEM_ACESSO_AO_ATENDIMENTO };
  const email = clientEmail.trim();
  await prisma.attendance.updateMany({ where: { id: attendanceId, officeId: viewer.officeId, ...filtroDoAtendimento(viewer, viewer.id) }, data: { clientEmail: email || null } });
  revalidatePath(`/atendimento/${attendanceId}`);
  return {};
}

export async function replyEmail(attendanceId: string, subject: string, body: string): Promise<{ error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão expirada. Faça login novamente." };
  if (!podeVerAtendimentos(user)) return { error: SEM_ACESSO_AO_ATENDIMENTO };

  const subjectText = subject.trim();
  const bodyText = body.trim();
  if (!subjectText || !bodyText) return { error: "Preencha o assunto e a mensagem antes de enviar." };

  const attendance = await prisma.attendance.findFirst({ where: { id: attendanceId, officeId: user.officeId, ...filtroDoAtendimento(user, user.id) } });
  if (!attendance) return { error: "Atendimento não encontrado." };
  if (!attendance.clientEmail) return { error: "Este atendimento não tem e-mail do cliente cadastrado." };

  const result = await sendEmailReply(user.id, attendance.clientEmail, subjectText, bodyText);

  // fromAddress para exibição no histórico: a conta Google conectada do usuário (a que efetivamente envia),
  // com fallback para o e-mail de login caso ele ainda não tenha conectado nenhuma conta.
  const cred = await prisma.googleCredential.findFirst({ where: { userId: user.id, officeId: user.officeId } });
  const fromAddress = cred?.accountEmail || user.email;

  await prisma.emailMessage.create({
    data: {
      attendanceId,
      direction: "OUT",
      toAddress: attendance.clientEmail,
      fromAddress,
      subject: subjectText,
      body: bodyText,
      sentByUserId: user.id,
      status: result.ok ? "SENT" : "FAILED",
      errorMessage: result.ok ? null : result.error || "Falha desconhecida ao enviar e-mail.",
      officeId: user.officeId,
    },
  });

  // Primeira resposta ao lead (Fase 5) — só quando o envio realmente saiu, e só carimba se ainda
  // estiver nula (nunca sobrescreve a primeira resposta de verdade por uma resposta posterior).
  if (result.ok && !attendance.firstResponseAt) {
    await prisma.attendance.update({ where: { id: attendanceId }, data: { firstResponseAt: new Date() } });
  }

  revalidatePath(`/atendimento/${attendanceId}`);

  if (!result.ok) {
    return { error: result.error || "Não foi possível enviar o e-mail." };
  }
  return {};
}

export async function convertAttendanceToCase(
  attendanceId: string,
  data: { type: string; processNumber?: string; court?: string },
  // Base de redirecionamento pós-conversão. O desktop usa "/processos" (default, mantém
  // compatibilidade com o ConvertAttendanceForm existente); o app mobile passa "/m/processos"
  // para nunca navegar o usuário para uma rota do site desktop.
  redirectBasePath: string = "/processos"
) {
  const viewer = await getCurrentUser();
  if (!viewer) throw new Error("Sessão expirada. Faça login novamente.");
  if (!podeVerAtendimentos(viewer)) throw new Error(SEM_ACESSO_AO_ATENDIMENTO);

  // Escopo por escritório logo na busca do atendimento: impede que alguém converta um
  // atendimento de OUTRO escritório só por conhecer/adivinhar o id.
  const attendance = await prisma.attendance.findFirst({ where: { id: attendanceId, officeId: viewer.officeId, ...filtroDoAtendimento(viewer, viewer.id) } });
  if (!attendance) throw new Error("Atendimento não encontrado.");

  // Client/Case criados a partir daqui usam o officeId do PRÓPRIO atendimento (não o do viewer)
  // — na prática são sempre o mesmo escritório (já filtrado acima), mas a intenção correta é
  // "a conversão fica dentro do escritório dono do atendimento", não "dono de quem clicou".
  const officeId = attendance.officeId;

  // Prioriza o vínculo direto (cliente selecionado na busca ou recém-cadastrado ao criar
  // o atendimento); só recorre à busca/criação por nome para atendimentos antigos sem clientId.
  let client = attendance.clientId
    ? await prisma.client.findFirst({ where: { id: attendance.clientId, officeId } })
    : null;
  if (!client) {
    client = await prisma.client.findFirst({
      where: { name: { equals: attendance.clientName, mode: "insensitive" }, officeId },
    });
  }
  if (!client) {
    client = await prisma.client.create({ data: { name: attendance.clientName, type: "PF", officeId } });
  }

  const created = await prisma.case.create({
    data: {
      title: attendance.subject,
      type: data.type,
      area: attendance.area || null,
      description: attendance.description || null,
      processNumber: data.processNumber || null,
      court: data.court || null,
      clientId: client.id,
      responsibleId: attendance.responsibleId,
      assessoriaId: attendance.assessoriaId,
      officeId,
    },
  });

  // Ownership do atendimento já foi verificada acima (findFirst com officeId), então o
  // update por id aqui é seguro.
  await prisma.attendance.update({
    where: { id: attendanceId },
    data: { status: "CONVERTIDO", convertedCaseId: created.id },
  });

  // Os anexos já enviados no atendimento passam a pertencer ao processo criado — e a MESMA
  // pasta do Drive (se já existir) é reaproveitada (renomeada e MOVIDA para a raiz certa —
  // Processos ou Casos, conforme o tipo escolhido — em vez de deixar uma pasta órfã fisicamente
  // dentro de "Atendimentos" pra sempre, achado P2 de docs/auditoria-pastas-drive-2026-09.md),
  // em vez de deixar uma pasta órfã pra trás e criar outra do zero no próximo anexo.
  await prisma.attachment.updateMany({
    where: { attendanceId, officeId },
    data: { caseId: created.id, attendanceId: null },
  });
  if (attendance.driveFolderId) {
    try {
      const targetRootId =
        naturezaOf(created.type) === "CASO" ? await getCasosRootFolderId(officeId) : await getProcessosRootFolderId(officeId);
      await moveDriveFile(attendance.driveFolderId, targetRootId, officeId);
      await renameDriveFolder(attendance.driveFolderId, created.title, officeId);
      await prisma.case.update({ where: { id: created.id }, data: { driveFolderId: attendance.driveFolderId } });
    } catch {
      // Best-effort — se o Drive não estiver conectado ou a chamada falhar, o processo segue
      // criado normalmente; uma pasta nova será criada no próximo anexo, se precisar.
    }
  }

  revalidatePath("/atendimento");
  revalidatePath("/processos");
  revalidatePath("/m/atendimento");
  revalidatePath("/m/processos");

  // Honorário pretendido (Fase 5) — passado por querystring para o Processo novo só PRÉ-PREENCHER
  // o Lançar Honorários (ver LancarHonorariosModal.tsx, prop `prefill`/`autoOpen`); nunca cria a
  // cobrança sozinho. A tela mobile do Processo ignora esses parâmetros (não tem esse modal), então
  // é seguro incluir sempre, mesmo quando redirectBasePath é "/m/processos".
  const feeParams = new URLSearchParams();
  if (attendance.feeMode) {
    feeParams.set("honorarioPretendido", "1");
    feeParams.set("feeMode", attendance.feeMode);
    if (attendance.estimatedValue != null) feeParams.set("feeAmount", String(attendance.estimatedValue));
    if (attendance.feePercentual != null) feeParams.set("feePercentual", String(attendance.feePercentual));
    if (attendance.feePercentualBase) feeParams.set("feePercentualBase", attendance.feePercentualBase);
  }
  const qs = feeParams.toString();
  redirect(`${redirectBasePath}/${created.id}${qs ? `?tab=financeiro&${qs}` : ""}`);
}
