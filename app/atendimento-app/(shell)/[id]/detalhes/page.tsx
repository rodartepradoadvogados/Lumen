import { prisma } from "@/lib/prisma";
import { whereDeUmAtendimento, veTodoOAtendimento } from "@/lib/acessoAtendimento";
import { exigirAcessoAoAtendimentoNaTela } from "@/lib/guardaDoAtendimento";
import { identificarNumero } from "@/lib/identificarNumero";
import { motivosParaRecusar } from "@/lib/actions/recusaDoLead";
import { getAppUrl } from "@/lib/appUrl";
import { dataDeBrasilia, dataEHoraDeBrasilia, diaDeBrasilia } from "@/lib/horaDeBrasilia";
import { diaDoCalendario, hojeEmBrasilia } from "@/lib/detalhesDoAtendimento";
import { lerTriagem } from "@/lib/triagemApurada";
import { PERCENTUAL_BASE_LABELS } from "@/lib/honorarioLancamento";
import type { EstadoDaRecusa } from "@/lib/recusaDoLead";
import SemAcessoAConversa from "@/components/atendimento-app/SemAcessoAConversa";
import DetalhesDoApp from "@/components/atendimento-app/detalhes/DetalhesDoApp";
import type { PropsDosDetalhes } from "@/components/atendimento-app/detalhes/tipos";

export const dynamic = "force-dynamic";

const MODOS_DE_HONORARIO: Record<string, string> = { DINHEIRO: "Dinheiro", PERCENTUAL: "Percentual", AMBOS: "Dinheiro + percentual" };

function honorarioEmTexto(a: { feeMode: string | null; estimatedValue: number | null; feePercentual: number | null; feePercentualBase: string | null }): string | null {
  if (!a.feeMode) return null;
  const partes: string[] = [];
  if (a.feeMode !== "PERCENTUAL" && a.estimatedValue != null) partes.push(a.estimatedValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
  if (a.feeMode !== "DINHEIRO" && a.feePercentual != null) {
    partes.push(`${a.feePercentual}% (${a.feePercentualBase ? (PERCENTUAL_BASE_LABELS[a.feePercentualBase] ?? a.feePercentualBase) : "base não definida"})`);
  }
  return partes.length ? `${MODOS_DE_HONORARIO[a.feeMode] ?? a.feeMode}: ${partes.join(" + ")}` : (MODOS_DE_HONORARIO[a.feeMode] ?? a.feeMode);
}

// A GUIA DETALHES — a ferramenta do atendimento no celular (PR 5 da proposta): contato, o que a triagem
// apurou, pendências, transformar em processo, dados, anexos, tarefas, anotações pessoais e encerrar.
//
// O lead entra pelo recorte de acesso (`whereDeUmAtendimento`: id + escritório + dono): o do colega, o de outro
// escritório e o id inventado dão a MESMA tela de "Sem acesso a esta conversa", sem nome, número nem dado
// algum — nada além do id foi lido antes disso. As anotações vêm só do próprio usuário (`authorId`).
export default async function DetalhesDoAtendimentoPage({ params }: { params: { id: string } }) {
  const viewer = await exigirAcessoAoAtendimentoNaTela();

  const a = await prisma.attendance.findFirst({
    where: whereDeUmAtendimento(viewer, params.id),
    include: {
      responsible: { select: { name: true } },
      campanha: { select: { nome: true } },
      convertedCase: { select: { id: true, title: true, type: true, processNumber: true } },
      anotacoes: { where: { authorId: viewer.id }, orderBy: { referenceDate: "desc" } },
      attachments: { include: { uploadedBy: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
      pendencias: { include: { responsible: { select: { name: true } } }, orderBy: [{ status: "asc" }, { dueDate: "asc" }] },
      tasks: { include: { responsible: { select: { name: true } } }, orderBy: { dueDate: "asc" } },
      // A recusa mais recente que ainda está de pé (as desfeitas são histórico).
      recusas: { where: { estado: { not: "REVERTIDA" } }, orderBy: { recusadaEm: "desc" }, take: 1, include: { recusadaPor: { select: { name: true } } } },
    },
  });
  if (!a) return <SemAcessoAConversa />;

  const recusaAtual = a.recusas[0] ?? null;
  const podeRecusar = !recusaAtual && !["CONVERTIDO", "RECUSADO"].includes(a.status);

  const [usuarios, colunas, ident, motivos, escritorio, clientePorNome] = await Promise.all([
    prisma.user.findMany({ where: { active: true, officeId: viewer.officeId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.kanbanColumn.findMany({ where: { officeId: viewer.officeId }, orderBy: { order: "asc" }, select: { id: true, name: true, isDoneCol: true } }),
    identificarNumero(viewer.officeId, a),
    podeRecusar ? motivosParaRecusar() : Promise.resolve([]),
    prisma.office.findUnique({ where: { id: viewer.officeId }, select: { name: true } }),
    a.clientId || a.convertedCaseId ? Promise.resolve(null) : prisma.client.findFirst({ where: { officeId: viewer.officeId, name: { equals: a.clientName, mode: "insensitive" } }, select: { id: true } }),
  ]);

  const abertas = a.pendencias.filter((x) => x.status !== "CONCLUIDA");
  const props: PropsDosDetalhes = {
    conversa: {
      id: a.id,
      clientName: a.clientName,
      subject: a.subject,
      area: a.area,
      description: a.description,
      channel: a.channel,
      status: a.status,
      stage: a.stage,
      lostReason: a.lostReason,
      waPhone: a.waPhone,
      contactPhone: a.contactPhone,
      clientEmail: a.clientEmail,
      leadSource: a.leadSource,
      estimatedValue: a.estimatedValue,
      nextContactDay: a.nextContactAt ? diaDeBrasilia(a.nextContactAt) : null,
      responsibleId: a.responsibleId,
      responsibleName: a.responsible?.name ?? null,
      honorario: honorarioEmTexto(a),
      feeMode: a.feeMode,
      campanha: a.campanha?.nome ?? null,
      abertoEmLabel: dataDeBrasilia(a.createdAt),
      agenteResponde: a.agenteResponde,
      agenteSilenciado: Boolean(a.agenteSilenciadoEm),
      documentoPendente: a.documentoPendente,
      documentoAteLabel: a.documentoAte ? dataDeBrasilia(a.documentoAte) : null,
      propostaDeRecusa: a.propostaDeRecusa,
      propostaDeRecusaEmLabel: a.propostaDeRecusaEm ? dataEHoraDeBrasilia(a.propostaDeRecusaEm) : null,
      propostaDeRecusaEmISO: a.propostaDeRecusaEm ? a.propostaDeRecusaEm.toISOString() : null,
      convertedCase: a.convertedCase,
    },
    telefone: ident.telefone,
    contato: ident.contato,
    triagem: lerTriagem(a.metadata),
    pendencias: a.pendencias.map((x) => ({
      id: x.id,
      direction: x.direction,
      kind: x.kind,
      description: x.description,
      status: x.status,
      dueDay: diaDoCalendario(x.dueDate),
      responsibleId: x.responsibleId,
      responsibleName: x.responsible?.name ?? null,
    })),
    tarefas: a.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      type: t.type,
      priority: t.priority,
      status: t.status,
      dueDay: diaDoCalendario(t.dueDate),
      columnId: t.columnId,
      responsibleId: t.responsibleId,
      responsibleName: t.responsible?.name ?? null,
    })),
    colunas,
    anexos: a.attachments.map((x) => ({
      id: x.id,
      name: x.name,
      driveUrl: x.driveUrl,
      docType: x.docType,
      dataLabel: dataDeBrasilia(x.updatedAt ?? x.createdAt),
      uploadedByName: x.uploadedBy?.name ?? null,
    })),
    anotacoes: a.anotacoes.map((n) => ({ id: n.id, content: n.content, referenceDay: diaDoCalendario(n.referenceDate) ?? "", criadaLabel: dataDeBrasilia(n.createdAt) })),
    usuarios,
    recusa: recusaAtual
      ? {
          id: recusaAtual.id,
          estado: recusaAtual.estado as EstadoDaRecusa,
          motivoTexto: recusaAtual.motivoTexto,
          observacao: recusaAtual.observacao,
          token: recusaAtual.token,
          enviadaEm: recusaAtual.enviadaEm ? recusaAtual.enviadaEm.toISOString() : null,
          abertaEm: recusaAtual.abertaEm ? recusaAtual.abertaEm.toISOString() : null,
          aberturas: recusaAtual.aberturas,
          revisitaEm: recusaAtual.revisitaEm ? recusaAtual.revisitaEm.toISOString() : null,
          recusadaPor: recusaAtual.recusadaPor?.name ?? null,
          porAgente: recusaAtual.porAgente,
        }
      : null,
    motivosDeRecusa: motivos,
    enderecoDoSite: getAppUrl(),
    nomeDoEscritorio: escritorio?.name ?? "o escritório",
    veTudo: veTodoOAtendimento(viewer),
    meuId: viewer.id,
    hoje: hojeEmBrasilia(),
    clienteDaConversa: a.clientId ? "vinculado" : clientePorNome ? "mesmoNome" : "novo",
    contagens: {
      anexos: a.attachments.length,
      anotacoesMinhas: a.anotacoes.length,
      pendenciasAbertas: abertas.length,
      tarefasAbertas: a.tasks.filter((t) => t.status !== "CONCLUIDO" && t.status !== "CANCELADO").length,
      temPastaNoDrive: Boolean(a.driveFolderId),
    },
  };

  return <DetalhesDoApp {...props} />;
}
