"use server";

import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { atendimentoDaAcao } from "@/lib/guardaDoAtendimento";
import { whereDeUmAtendimento, veTodoOAtendimento } from "@/lib/acessoAtendimento";
import { isUserInOffice, isKanbanColumnInOffice } from "@/lib/officeScope";
import { stageOptions } from "@/lib/funil";
import { setAttendanceStage, updateAttendanceSubject } from "@/lib/actions/attendance";
import { createTask } from "@/lib/actions/tasks";
import { converterAtendimentoEmCaso } from "@/lib/converterAtendimento";
import { OPCOES_DO_APLICATIVO, tipoDeConversao, TIPO_DO_CASE } from "@/lib/conversaoEmProcesso";
import {
  CANAIS_DO_ATENDIMENTO,
  ORIGENS_DO_LEAD,
  PRIORIDADES_DE_TAREFA,
  TIPOS_DE_TAREFA,
  diaValido,
} from "@/lib/detalhesDoAtendimento";
import {
  acrescentarFato,
  carimbarCorrecao,
  confirmarItem,
  corrigirFato,
  gravarTriagem,
  lerTriagem,
  manterProposta,
  reabrirProposta,
  removerFato,
  LIMITE_RELATO,
  type CampoDaTriagem,
  type TriagemGravada,
} from "@/lib/triagemApurada";
import { lerDatetimeLocalEmBrasilia } from "@/lib/horaDeBrasilia";

// ============================================================================
// AS AÇÕES DA ABA DETALHES DO APLICATIVO DE ATENDIMENTO.
//
// Toda ação começa por `atendimentoDaAcao` (lib/guardaDoAtendimento.ts): sessão, acesso ao Atendimento e o
// recorte por dono (`whereDeUmAtendimento`) ANTES de ler o corpo do pedido ou tocar em qualquer coisa.
// Quem não vê aquele lead — outro dono, outro escritório, sem acesso — recebe a mesma frase e NADA é gravado.
// Uma Server Action é um endereço HTTP: esconder o botão não protege.
//
// As regras de negócio que já existiam (pendências, recusa, anotações, fase, assunto, cadastro do contato)
// NÃO são reescritas aqui: o componente chama as ações de sempre, que já carregam o recorte. Este arquivo
// tem só o que faltava — dados, triagem, tarefas do atendimento, conversão com resultado e arquivar.
//
// Retorno: `{ error?: string }` — uma frase em português, sem código, sem "throw" que vire tela de erro.
// ============================================================================

type R = { error?: string };

function recarregar(id: string) {
  revalidatePath(`/atendimento-app/${id}`);
  revalidatePath(`/atendimento-app/${id}/detalhes`);
  revalidatePath("/atendimento-app");
  revalidatePath("/atendimento");
  revalidatePath(`/atendimento/${id}`);
}

const limpo = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim();

// ── DADOS DO ATENDIMENTO ────────────────────────────────────────────────────

export type DadosParaSalvar = {
  assunto?: string;
  nome?: string;
  materia?: string | null;
  canal?: string;
  telefoneDeContato?: string | null;
  email?: string | null;
  origem?: string | null;
  valorEstimado?: number | null;
  /** "aaaa-mm-dd" ou null (sem próximo contato). */
  proximoContato?: string | null;
  /** Só quem vê o escritório inteiro escolhe o responsável (é escala: `responsavelDoNovoAtendimento`). */
  responsavelId?: string | null;
};

export async function salvarDadosDoAtendimento(id: string, d: DadosParaSalvar): Promise<R> {
  const r = await atendimentoDaAcao(id);
  if (r.erro !== undefined) return { error: r.erro };
  const { viewer, attendance } = r;

  const data: Prisma.AttendanceUncheckedUpdateManyInput = {};

  if (d.nome !== undefined) {
    const nome = limpo(d.nome);
    if (!nome) return { error: "O nome do contato não pode ficar vazio." };
    if (nome.length > 120) return { error: "O nome do contato pode ter até 120 caracteres." };
    data.clientName = nome;
  }
  if (d.materia !== undefined) {
    const m = limpo(d.materia);
    if (m.length > 80) return { error: "A matéria pode ter até 80 caracteres." };
    data.area = m || null;
  }
  if (d.canal !== undefined) {
    if (!(d.canal in CANAIS_DO_ATENDIMENTO)) return { error: "Canal inválido." };
    data.channel = d.canal;
  }
  if (d.telefoneDeContato !== undefined) {
    const t = limpo(d.telefoneDeContato);
    if (t.length > 30 || (t && !/^[\d\s()+.-]+$/.test(t))) return { error: "Telefone inválido: use só números, espaço, parênteses, + e -." };
    data.contactPhone = t || null;
  }
  if (d.email !== undefined) {
    const e = limpo(d.email);
    if (e && (e.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))) return { error: "E-mail inválido." };
    data.clientEmail = e || null;
  }
  if (d.origem !== undefined) {
    if (d.origem && !(d.origem in ORIGENS_DO_LEAD)) return { error: "Origem inválida." };
    data.leadSource = d.origem || null;
  }
  if (d.valorEstimado !== undefined) {
    const v = d.valorEstimado;
    if (v != null && (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1_000_000_000)) return { error: "Valor estimado inválido." };
    data.estimatedValue = v;
  }
  if (d.proximoContato !== undefined) {
    if (d.proximoContato === null || d.proximoContato === "") data.nextContactAt = null;
    else if (!diaValido(d.proximoContato)) return { error: "Data do próximo contato inválida." };
    else data.nextContactAt = lerDatetimeLocalEmBrasilia(`${d.proximoContato}T09:00`);
  }
  if (d.responsavelId !== undefined && d.responsavelId !== attendance.responsibleId) {
    if (!veTodoOAtendimento(viewer)) return { error: "Quem define o responsável é a recepção ou um sócio administrador." };
    if (d.responsavelId) {
      const dono = await prisma.user.findFirst({ where: { id: d.responsavelId, officeId: viewer.officeId, active: true }, select: { id: true } });
      if (!dono) return { error: "Responsável não encontrado." };
    }
    data.responsibleId = d.responsavelId || null;
  }

  let assunto: string | null = null;
  if (d.assunto !== undefined) {
    assunto = limpo(d.assunto);
    if (!assunto) return { error: "Preencha o assunto." };
    if (assunto.length > 200) return { error: "O assunto pode ter até 200 caracteres." };
  }

  // O assunto tem regra própria (renomeia a pasta do Drive): usa a ação de sempre, que confere o recorte de novo.
  if (assunto !== null && assunto !== attendance.subject) {
    const s = await updateAttendanceSubject(id, assunto);
    if (s.error) return { error: s.error };
  }

  if (Object.keys(data).length > 0) {
    const n = await prisma.attendance.updateMany({ where: whereDeUmAtendimento(viewer, id), data });
    if (n.count !== 1) return { error: "Atendimento não encontrado." };
  }
  recarregar(id);
  return {};
}

/** Mudar a fase do funil (Perdido exige o motivo). Usa `setAttendanceStage`, que já carrega o recorte. */
export async function mudarFaseDoAtendimento(id: string, fase: string, motivoDaPerda?: string): Promise<R> {
  const r = await atendimentoDaAcao(id);
  if (r.erro !== undefined) return { error: r.erro };
  if (!stageOptions.includes(fase)) return { error: "Fase inválida." };
  try {
    const s = await setAttendanceStage(id, fase, motivoDaPerda);
    if (s.error) return { error: s.error };
  } catch {
    return { error: "Não foi possível mudar a fase." };
  }
  recarregar(id);
  return {};
}

// ── O QUE A TRIAGEM APUROU ──────────────────────────────────────────────────


async function gravarNaTriagem(
  id: string,
  mudar: (t: TriagemGravada, ctx: { quem: { nome: string }; agora: Date; atendimento: { area: string | null; description: string | null; documentoPendente: string | null; propostaDeRecusaEm: Date | null } }) => { triagem: TriagemGravada; campos?: Prisma.AttendanceUncheckedUpdateManyInput } | { error: string },
): Promise<R> {
  const r = await atendimentoDaAcao(id);
  if (r.erro !== undefined) return { error: r.erro };
  const { viewer, attendance } = r;
  try {
    const atual = lerTriagem(attendance.metadata);
    const resultado = mudar(atual, { quem: { nome: viewer.name }, agora: new Date(), atendimento: attendance });
    if ("error" in resultado) return { error: resultado.error };
    const metadata = gravarTriagem(attendance.metadata, resultado.triagem) as Prisma.InputJsonValue;
    const n = await prisma.attendance.updateMany({
      where: whereDeUmAtendimento(viewer, id),
      data: { ...(resultado.campos ?? {}), metadata },
    });
    if (n.count !== 1) return { error: "Atendimento não encontrado." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível salvar." };
  }
  recarregar(id);
  return {};
}

export async function confirmarNaTriagem(id: string, alvo: { campo: CampoDaTriagem } | { fatoId: string }): Promise<R> {
  return gravarNaTriagem(id, (t, c) => {
    const novo = confirmarItem(t, alvo, c.quem, c.agora);
    return novo ? { triagem: novo } : { error: "Essa informação não existe mais." };
  });
}

/** Desfazer uma confirmação: o campo volta a ser "da triagem"; a linha acrescentada volta a "anotada". */
export async function retirarConfirmacaoDaTriagem(id: string, alvo: { campo: CampoDaTriagem } | { fatoId: string }): Promise<R> {
  return gravarNaTriagem(id, (t) => {
    if ("campo" in alvo) {
      const carimbos = { ...t.carimbos };
      delete carimbos[alvo.campo];
      return { triagem: { ...t, carimbos } };
    }
    if (!t.fatos.some((f) => f.id === alvo.fatoId)) return { error: "Essa informação não existe mais." };
    return { triagem: { ...t, fatos: t.fatos.map((f) => (f.id === alvo.fatoId && f.estado === "CONFIRMADO" ? { ...f, estado: "PESSOA" as const } : f)) } };
  });
}

/** Corrigir o valor de um campo da triagem (matéria, documento esperado, relato) ou de uma linha acrescentada. */
export async function corrigirNaTriagem(id: string, alvo: { campo: CampoDaTriagem } | { fatoId: string }, valor: string): Promise<R> {
  return gravarNaTriagem(id, (t, c) => {
    if ("fatoId" in alvo) {
      const novo = corrigirFato(t, alvo.fatoId, valor, c.quem, c.agora);
      return novo ? { triagem: novo } : { error: "Essa informação não existe mais." };
    }
    const v = alvo.campo === "relato" ? valor.trim() : limpo(valor);
    if (alvo.campo === "area") {
      if (v.length > 80) return { error: "A matéria pode ter até 80 caracteres." };
      return { triagem: carimbarCorrecao(t, "area", c.quem, c.agora), campos: { area: v || null } };
    }
    if (alvo.campo === "documento") {
      if (!c.atendimento.documentoPendente) return { error: "Este atendimento não está esperando documento." };
      if (!v) return { error: "Escreva o documento esperado." };
      if (v.length > 300) return { error: "O documento esperado pode ter até 300 caracteres." };
      return { triagem: carimbarCorrecao(t, "documento", c.quem, c.agora), campos: { documentoPendente: v } };
    }
    if (v.length > LIMITE_RELATO) return { error: `O relato pode ter até ${LIMITE_RELATO} caracteres.` };
    return { triagem: carimbarCorrecao(t, "relato", c.quem, c.agora), campos: { description: v || null } };
  });
}

export async function acrescentarNaTriagem(id: string, rotulo: string, valor: string): Promise<R & { fatoId?: string }> {
  const fatoId = randomUUID();
  const r = await gravarNaTriagem(id, (t, c) => ({ triagem: acrescentarFato(t, { id: fatoId, rotulo, valor }, c.quem, c.agora) }));
  return r.error ? r : { fatoId };
}

export async function removerDaTriagem(id: string, fatoId: string): Promise<R> {
  return gravarNaTriagem(id, (t) => {
    const novo = removerFato(t, fatoId);
    return novo ? { triagem: novo } : { error: "Essa informação não existe mais." };
  });
}

/** "Manter atendimento": a pessoa leu a proposta de recusa da Ana e não vai recusar. A nota da Ana fica guardada. */
export async function manterAtendimentoSemRecusar(id: string): Promise<R> {
  return gravarNaTriagem(id, (t, c) => ({ triagem: manterProposta(t, c.atendimento.propostaDeRecusaEm, c.quem, c.agora) }));
}

export async function reabrirPropostaDeRecusa(id: string): Promise<R> {
  return gravarNaTriagem(id, (t) => ({ triagem: reabrirProposta(t) }));
}

// ── PENDÊNCIAS: desfazer uma exclusão ───────────────────────────────────────

/**
 * Recria uma pendência que acabou de ser excluída (o "Desfazer" do aviso). Os campos são validados de novo
 * — o pedido vem do aparelho — e o responsável tem de ser do escritório.
 */
export async function recriarPendencia(
  id: string,
  p: { direction: string; kind: string; description: string | null; dueDay: string | null; responsibleId: string | null; concluida: boolean },
): Promise<R> {
  const r = await atendimentoDaAcao(id);
  if (r.erro !== undefined) return { error: r.erro };
  if (p.direction !== "SOLICITAR" && p.direction !== "ENVIAR") return { error: "Pendência inválida." };
  if (!/^[A-Z_]{2,40}$/.test(p.kind)) return { error: "Pendência inválida." };
  if (p.dueDay && !diaValido(p.dueDay)) return { error: "Prazo inválido." };
  if (p.responsibleId && !(await isUserInOffice(p.responsibleId, r.viewer.officeId))) return { error: "Responsável não encontrado." };
  await prisma.atendimentoPendencia.create({
    data: {
      attendanceId: id,
      officeId: r.viewer.officeId,
      direction: p.direction,
      kind: p.kind,
      description: limpo(p.description) || null,
      dueDate: p.dueDay ? new Date(p.dueDay) : null,
      responsibleId: p.responsibleId || null,
      status: p.concluida ? "CONCLUIDA" : "PENDENTE",
      completedAt: p.concluida ? new Date() : null,
    },
  });
  revalidatePath("/alertas");
  recarregar(id);
  return {};
}

// ── TAREFAS DO ATENDIMENTO ──────────────────────────────────────────────────

export type NovaTarefa = {
  titulo: string;
  tipo: string;
  prioridade: string;
  /** "aaaa-mm-dd" — a tarefa precisa de data. */
  dia: string;
  responsavelId?: string | null;
  colunaId?: string | null;
};

/** Cria a tarefa do atendimento (aparece também na Agenda). Usa `createTask`, com o recorte conferido antes. */
export async function criarTarefaDoAtendimento(id: string, t: NovaTarefa): Promise<R & { tarefaId?: string }> {
  const r = await atendimentoDaAcao(id);
  if (r.erro !== undefined) return { error: r.erro };
  const titulo = limpo(t.titulo);
  if (!titulo) return { error: "Escreva o que precisa ser feito." };
  if (titulo.length > 200) return { error: "O título pode ter até 200 caracteres." };
  if (!(t.tipo in TIPOS_DE_TAREFA)) return { error: "Tipo de tarefa inválido." };
  if (!(t.prioridade in PRIORIDADES_DE_TAREFA)) return { error: "Prioridade inválida." };
  if (!diaValido(t.dia)) return { error: "A tarefa precisa de uma data." };
  try {
    const criada = await createTask({
      title: titulo,
      type: t.tipo,
      priority: t.prioridade,
      dueDate: t.dia,
      attendanceId: id,
      responsibleId: t.responsavelId || undefined,
      columnId: t.colunaId || undefined,
    });
    recarregar(id);
    return { tarefaId: criada?.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível criar a tarefa." };
  }
}

const SELECT_DA_TAREFA = { id: true, status: true, columnId: true, attendanceId: true } as const;

async function tarefaDoAtendimento(id: string, tarefaId: string) {
  const r = await atendimentoDaAcao(id);
  if (r.erro !== undefined) return { erro: r.erro };
  // O escritório e o ATENDIMENTO entram no WHERE: a tarefa de outro atendimento (mesmo do mesmo escritório) não é esta.
  const tarefa = await prisma.task.findFirst({ where: { id: tarefaId, officeId: r.viewer.officeId, attendanceId: id }, select: SELECT_DA_TAREFA });
  if (!tarefa) return { erro: "Tarefa não encontrada neste atendimento." };
  return { viewer: r.viewer, tarefa };
}

/**
 * Concluir ou reabrir — com o estado que se QUER, e não "alternar" (um segundo toque não desfaz o primeiro).
 * Concluir leva a tarefa à coluna de conclusão do quadro (como o site faz) e carimba quem concluiu; reabrir
 * a devolve à coluna de antes (`colunaAnteriorId`) ou, se ela estava na de conclusão, à primeira.
 */
export async function definirConclusaoDaTarefa(id: string, tarefaId: string, concluida: boolean, colunaAnteriorId?: string | null): Promise<R> {
  const r = await tarefaDoAtendimento(id, tarefaId);
  if (r.erro !== undefined) return { error: r.erro };
  const { viewer, tarefa } = r;
  if (concluida === (tarefa.status === "CONCLUIDO")) return {};

  let columnId = tarefa.columnId;
  if (concluida) {
    const fim = await prisma.kanbanColumn.findFirst({ where: { isDoneCol: true, officeId: viewer.officeId }, orderBy: { order: "asc" } });
    if (fim) columnId = fim.id;
  } else {
    const anterior = colunaAnteriorId && (await isKanbanColumnInOffice(colunaAnteriorId, viewer.officeId)) ? colunaAnteriorId : null;
    const atual = tarefa.columnId ? await prisma.kanbanColumn.findFirst({ where: { id: tarefa.columnId, officeId: viewer.officeId }, select: { isDoneCol: true } }) : null;
    if (anterior) columnId = anterior;
    else if (atual?.isDoneCol) columnId = (await prisma.kanbanColumn.findFirst({ where: { officeId: viewer.officeId, isDoneCol: false }, orderBy: { order: "asc" }, select: { id: true } }))?.id ?? columnId;
  }
  await prisma.task.updateMany({
    where: { id: tarefaId, officeId: viewer.officeId, attendanceId: id },
    data: { status: concluida ? "CONCLUIDO" : "PENDENTE", completedAt: concluida ? new Date() : null, completedById: concluida ? viewer.id : null, columnId },
  });
  revalidatePath("/kanban");
  revalidatePath("/agenda");
  revalidatePath("/painel");
  revalidatePath("/alertas");
  recarregar(id);
  return {};
}

/** Mover de coluna: só a coluna muda (a mesma regra do arrastar do quadro do site). Vai para o fim da coluna. */
export async function moverTarefaDeColuna(id: string, tarefaId: string, colunaId: string): Promise<R> {
  const r = await tarefaDoAtendimento(id, tarefaId);
  if (r.erro !== undefined) return { error: r.erro };
  const { viewer } = r;
  if (!(await isKanbanColumnInOffice(colunaId, viewer.officeId))) return { error: "Coluna não encontrada." };
  const ultima = await prisma.task.aggregate({ where: { officeId: viewer.officeId, columnId: colunaId }, _max: { columnOrder: true } });
  await prisma.task.updateMany({
    where: { id: tarefaId, officeId: viewer.officeId, attendanceId: id },
    data: { columnId: colunaId, columnOrder: (ultima._max.columnOrder ?? -1) + 1 },
  });
  revalidatePath("/kanban");
  revalidatePath("/agenda");
  recarregar(id);
  return {};
}

/** Trocar o responsável de uma tarefa do atendimento. */
export async function definirResponsavelDaTarefa(id: string, tarefaId: string, responsavelId: string | null): Promise<R> {
  const r = await tarefaDoAtendimento(id, tarefaId);
  if (r.erro !== undefined) return { error: r.erro };
  if (responsavelId && !(await isUserInOffice(responsavelId, r.viewer.officeId))) return { error: "Responsável não encontrado." };
  await prisma.task.updateMany({ where: { id: tarefaId, officeId: r.viewer.officeId, attendanceId: id }, data: { responsibleId: responsavelId || null } });
  revalidatePath("/kanban");
  revalidatePath("/agenda");
  recarregar(id);
  return {};
}

// ── TRANSFORMAR EM PROCESSO OU CASO ─────────────────────────────────────────

/**
 * A conversão do aplicativo (N19): devolve `{ error }` ou `{ caseId }` — nunca lança nem redireciona (um
 * `redirect` levaria o celular para o site). As travas (já convertido, CNJ, nome temporário, recusado) e a
 * reserva atômica estão em lib/converterAtendimento.ts. O aplicativo mostra ANTES o que vai acontecer.
 */
export async function converterEmProcessoNoApp(
  id: string,
  d: { tipo: string; numero?: string; vara?: string },
): Promise<R & { caseId?: string; titulo?: string; honorarioQuery?: string }> {
  const r = await atendimentoDaAcao(id);
  if (r.erro !== undefined) return { error: r.erro };
  const tipo = tipoDeConversao(d.tipo);
  if (!tipo) return { error: "Escolha se é caso ou processo judicial." };
  try {
    const res = await converterAtendimentoEmCaso(
      r.viewer,
      id,
      { type: TIPO_DO_CASE[tipo], processNumber: tipo === "JUDICIAL" ? d.numero : undefined, court: tipo === "JUDICIAL" ? d.vara : undefined },
      OPCOES_DO_APLICATIVO,
    );
    if ("error" in res) return { error: res.error };
    revalidatePath("/processos");
    revalidatePath("/m/processos");
    recarregar(id);
    return { caseId: res.caseId, titulo: res.titulo, honorarioQuery: res.honorarioQuery };
  } catch {
    return { error: "Não foi possível converter agora. Nada foi criado; tente de novo." };
  }
}

// ── ARQUIVAR E DESARQUIVAR ──────────────────────────────────────────────────

const ARQUIVAVEIS = ["NOVO", "EM_TRIAGEM", "CONVERTIDO"];

/**
 * Arquivar tira a conversa das listas de trabalho e a deixa em Triagem > Arquivados; nada é apagado.
 * Desarquivar devolve a situação de antes — `CONVERTIDO` se o lead virou processo, senão a que a tela
 * lembrava (Novo ou Em triagem) ou Em triagem. Lead recusado não se arquiva por aqui (a recusa tem o seu
 * caminho, e a fila de recusados é do nível total).
 */
export async function definirArquivamento(id: string, arquivar: boolean, situacaoAnterior?: string): Promise<R & { situacao?: string }> {
  const r = await atendimentoDaAcao(id);
  if (r.erro !== undefined) return { error: r.erro };
  const { viewer, attendance } = r;

  let novo: string;
  if (arquivar) {
    if (attendance.status === "ARQUIVADO") return { situacao: "ARQUIVADO" };
    if (!ARQUIVAVEIS.includes(attendance.status)) {
      return { error: attendance.status === "RECUSADO" ? "Este lead está recusado. Para arquivar, desfaça a recusa ou use a fila de recusados." : "Este atendimento não pode ser arquivado agora." };
    }
    novo = "ARQUIVADO";
  } else {
    if (attendance.status !== "ARQUIVADO") return { situacao: attendance.status };
    novo = attendance.convertedCaseId ? "CONVERTIDO" : situacaoAnterior === "NOVO" || situacaoAnterior === "EM_TRIAGEM" ? situacaoAnterior : "EM_TRIAGEM";
  }
  const n = await prisma.attendance.updateMany({ where: { ...whereDeUmAtendimento(viewer, id), status: attendance.status }, data: { status: novo } });
  if (n.count !== 1) return { error: "A situação mudou enquanto você olhava. Recarregue a tela." };
  recarregar(id);
  return { situacao: novo };
}
