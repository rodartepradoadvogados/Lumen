import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, Badge, ConclusionChip, formatDate, formatCalendarDate, EmptyState, taskConclusionLabel, taskTypeLabels, taskTypeColors, priorityColors } from "@/components/ui";
import NewTaskModal from "@/components/NewTaskModal";
import AttachmentList from "@/components/AttachmentList";
import DeleteEntityButton from "@/components/DeleteEntityButton";
import ConvertAttendanceForm from "@/components/ConvertAttendanceForm";
import AttendanceStatusSelect from "@/components/AttendanceStatusSelect";
import FunnelStageSelect from "@/components/FunnelStageSelect";
import AttendanceCommercialForm from "@/components/AttendanceCommercialForm";
import AttendancePendenciasPanel from "@/components/AttendancePendenciasPanel";
import GerarDocumentoButton from "@/components/GerarDocumentoButton";
import WhatsappReplyBox from "@/components/WhatsappReplyBox";
import AtendenteIaControle from "@/components/AtendenteIaControle";
import EmailReplyPanel from "@/components/EmailReplyPanel";
import AnotacoesPessoaisList from "@/components/anotacoes/AnotacoesPessoaisList";
import EditAttendanceSubject from "@/components/EditAttendanceSubject";
import Conversa from "@/components/atendimento/Conversa";
import TrilhoDoAtendimento from "@/components/atendimento/TrilhoDoAtendimento";
import RelogioDoAtendimento from "@/components/atendimento/RelogioDoAtendimento";
import { isStorageConnected } from "@/lib/storageProvider";
import { isWhatsappConfigured } from "@/lib/whatsapp";
import { getCurrentUser } from "@/lib/currentUser";
import { X } from "lucide-react";
import { horaDeBrasilia, dataDeBrasilia } from "@/lib/horaDeBrasilia";
import { filtroDoAtendimento, podeVerAtendimentos } from "@/lib/acessoAtendimento";
import { identificarNumero } from "@/lib/identificarNumero";
import { telefoneLegivel } from "@/lib/quemEEsteNumero";

export const dynamic = "force-dynamic";

const channelLabels: Record<string, string> = { WHATSAPP: "WhatsApp", EMAIL: "E-mail", TELEFONE: "Telefone", PRESENCIAL: "Presencial" };

// ============================================================================
// A TELA DO ATENDIMENTO — DUAS COLUNAS.
//
// Era uma pilha de dez cartões, e a conversa com o cliente estava no sexto. Quem abria a tela para
// responder a um lead precisava rolar até achá-la, e o relógio de quinze minutos correndo enquanto
// isso.
//
// AGORA A TELA ABRE NO QUE A TELA É PARA FAZER: a conversa ocupa a coluna da esquerda, com a caixa
// de resposta presa no pé, e o contexto que se precisa ter para responder ocupa um trilho de 360px
// à direita. O cabeçalho carrega o relógio.
//
// A FICHA COMPLETA NÃO SUMIU — ela segue abaixo, no mesmo rolar: tarefas, e-mail, anexos,
// anotações, honorário pretendido, transformação em processo. O que mudou é a ORDEM DE CHEGADA:
// primeiro o que é urgente, depois o que é completo.
// ============================================================================

export default async function AttendanceDetailPage({ params }: { params: { id: string } }) {
  const viewer = await getCurrentUser();
  if (!viewer) notFound();
  // A REGRA DO DONO: o Atendimento é de administrador e da recepção, e de mais ninguém.
  // `notFound` e não uma tela de "sem permissão": quem não pode ver não precisa saber que existe.
  if (!podeVerAtendimentos(viewer)) notFound();

  const a = await prisma.attendance.findFirst({
    // O dono entra no WHERE, e não num `if` depois de carregar: assim o atendimento do colega
    // simplesmente não existe para quem não pode vê-lo, e não há objeto carregado esperando um
    // `if` que alguém pode remover num refatoramento.
    where: { id: params.id, officeId: viewer.officeId, ...filtroDoAtendimento(viewer, viewer.id) },
    include: {
      responsible: true,
      campanha: { select: { nome: true } },
      tasks: { include: { responsible: true }, orderBy: { dueDate: "asc" } },
      attachments: { include: { uploadedBy: true }, orderBy: { createdAt: "desc" } },
      convertedCase: true,
      whatsappMessages: { orderBy: { createdAt: "asc" } },
      emailMessages: { orderBy: { createdAt: "asc" } },
      pendencias: { include: { responsible: true }, orderBy: [{ status: "asc" }, { dueDate: "asc" }] },
      // Anotações pessoais (painel global "Anotações") vinculadas a este Attendance — filtradas
      // por authorId, mesma regra de app/(app)/processos/[id]/page.tsx.
      anotacoes: { where: { authorId: viewer.id }, orderBy: { referenceDate: "desc" } },
    },
  });
  if (!a) notFound();

  const whatsappConfigured = await isWhatsappConfigured(viewer.officeId);

  // Quem é este número — cruzado com as quatro agendas do escritório (ver lib/identificarNumero.ts).
  const { telefone: telefoneDoContato, contato: contatoConhecido } = await identificarNumero(viewer.officeId, a);

  // O nome do atendente é do ESCRITÓRIO, não do Lúmen: para o cliente, quem atende é o escritório,
  // e um atendente chamado "Lúmen" entregaria que há um sistema de terceiro no meio da conversa.
  const nomeDoAtendente =
    (
      await prisma.whatsappConfig.findUnique({
        where: { officeId: viewer.officeId },
        select: { agenteNome: true },
      })
    )?.agenteNome?.trim() || "O atendente";
  const showWhatsapp = Boolean(a.waPhone) || a.whatsappMessages.length > 0;
  const podeResponder = Boolean(a.waPhone) && whatsappConfigured;

  const [users, columns, storageConnected] = await Promise.all([
    prisma.user.findMany({ where: { active: true, officeId: viewer.officeId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.kanbanColumn.findMany({ where: { officeId: viewer.officeId }, orderBy: { order: "asc" }, select: { id: true, name: true } }),
    // Gate da área de arrastar arquivo: pergunta pelo ARMAZENAMENTO do escritório, não pelo
    // Google. Um escritório em OneDrive ou Dropbox tem armazenamento conectado e mesmo assim
    // não via onde soltar o arquivo, porque a checagem era específica do Drive.
    isStorageConnected(viewer.officeId),
  ]);

  const serializedAttachments = a.attachments.map((att) => ({
    id: att.id,
    name: att.name,
    driveUrl: att.driveUrl,
    docType: att.docType,
    createdAt: att.createdAt.toISOString(),
    updatedAt: att.updatedAt?.toISOString() ?? null,
    uploadedBy: att.uploadedBy ? { name: att.uploadedBy.name } : null,
  }));

  const serializedAnotacoes = a.anotacoes.map((n) => ({
    id: n.id,
    content: n.content,
    referenceDate: n.referenceDate.toISOString(),
    createdAt: n.createdAt.toISOString(),
  }));

  const serializedPendencias = a.pendencias.map((p) => ({
    id: p.id,
    direction: p.direction,
    kind: p.kind,
    description: p.description,
    status: p.status,
    dueDate: p.dueDate ? p.dueDate.toISOString() : null,
    completedAt: p.completedAt ? p.completedAt.toISOString() : null,
    responsible: p.responsible ? { name: p.responsible.name } : null,
  }));

  const agora = new Date();

  return (
    <>
      {/* Backdrop puramente visual: clicar fora não fecha a janela (só o X fecha). */}
      <div className="fixed inset-0 bg-grafite-900/40 z-40" aria-hidden="true" />

      <div className="fixed inset-4 md:inset-8 lg:inset-12 z-50 bg-sf shadow-pop flex flex-col overflow-hidden">
        {/* ── O CABEÇALHO ────────────────────────────────────────────────────
            Nome, os dois eixos de estado, a linha de procedência e o relógio. O relógio fica aqui,
            e não dentro da conversa, porque ele vale para a tela inteira: onde a pessoa estiver
            rolando, ele continua à vista. */}
        <div className="shrink-0 border-b border-regua bg-sf px-6 py-4">
          <div className="flex items-start gap-5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-guia font-bold leading-tight text-tx">{a.clientName}</h1>
                <FunnelStageSelect attendanceId={a.id} stage={a.stage} />
                <AttendanceStatusSelect attendanceId={a.id} status={a.status} />
              </div>
              <div className="mt-1">
                <EditAttendanceSubject attendanceId={a.id} subject={a.subject} />
              </div>
              <p className="mt-1.5 text-xs text-tx-2">
                {telefoneDoContato && <span>{telefoneLegivel(telefoneDoContato)}</span>}
                {a.campanha?.nome && (
                  <>
                    {telefoneDoContato && <span className="text-regua-forte"> · </span>}
                    campanha <strong className="font-semibold">{a.campanha.nome}</strong>
                  </>
                )}
                {a.transferidoEm && (
                  <>
                    <span className="text-regua-forte"> · </span>
                    seu desde {horaDeBrasilia(a.transferidoEm)}
                  </>
                )}
              </p>
            </div>

            <RelogioDoAtendimento prazoISO={a.prazoDeRespostaAte ? a.prazoDeRespostaAte.toISOString() : null} />

            <div className="flex shrink-0 items-center gap-1">
              <DeleteEntityButton
                entityType="ATTENDANCE"
                entityId={a.id}
                entityLabel={`${a.clientName} — ${a.subject}`}
                confirmMessage={`Excluir o atendimento de "${a.clientName}"?`}
                redirectTo="/atendimento"
              />
              <Link href="/atendimento" className="p-1 text-tx-3 transition-colors hover:text-tx" aria-label="Fechar" title="Fechar">
                <X size={20} />
              </Link>
            </div>
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
          {/* ── AS DUAS COLUNAS ──────────────────────────────────────────────
              Altura travada em telas grandes para que a caixa de resposta fique presa no pé da
              conversa, que é o que faz a tela ser usável sem rolar. Abaixo de `lg` as duas empilham
              e a conversa ganha um teto próprio — numa tela estreita, uma conversa de altura livre
              empurraria a caixa de resposta para fora do alcance. */}
          <div className="flex flex-col lg:h-[620px] lg:flex-row">
            <div className="flex min-w-0 flex-1 flex-col border-b border-regua bg-sf-apoio lg:border-b-0 lg:border-r">
              <div
                data-rolagem-da-conversa=""
                className="max-h-[420px] min-h-0 flex-1 overflow-y-auto px-6 py-5 lg:max-h-none lg:px-8"
              >
                <Conversa
                  mensagens={a.whatsappMessages}
                  agora={agora}
                  nomeDoAtendente={nomeDoAtendente}
                  transferidoPor={a.transferidoPor}
                  transferidoEm={a.transferidoEm}
                />
              </div>

              <div className="shrink-0 border-t border-regua bg-sf px-6 pb-4 pt-3 lg:px-8">
                {podeResponder ? (
                  <>
                    {/* A chave do atendente fica ACIMA da caixa de resposta: quem está lendo a
                        conversa é quem sabe se aquele lead pode ser atendido por máquina, e a
                        decisão tem que estar onde ela é tomada. */}
                    <AtendenteIaControle
                      attendanceId={a.id}
                      responde={a.agenteResponde}
                      silenciado={Boolean(a.agenteSilenciadoEm)}
                      ultimaEhDoCliente={
                        a.whatsappMessages.length > 0 && a.whatsappMessages[a.whatsappMessages.length - 1].direction === "IN"
                      }
                      nomeDoAtendente={nomeDoAtendente}
                    />
                    <WhatsappReplyBox attendanceId={a.id} nomeDoCliente={a.clientName} />
                  </>
                ) : (
                  <p className="py-2 text-xs text-tx-3">
                    {a.waPhone
                      ? "O canal de WhatsApp do escritório não está configurado, então não há como responder por aqui."
                      : "Este atendimento não tem WhatsApp vinculado. Responda pelo e-mail, abaixo."}
                  </p>
                )}
              </div>
            </div>

            <div className="w-full shrink-0 lg:w-[360px]">
              <TrilhoDoAtendimento
                attendanceId={a.id}
                telefone={telefoneDoContato}
                contato={contatoConhecido}
                area={a.area}
                canal={channelLabels[a.channel] || a.channel}
                campanha={a.campanha?.nome ?? null}
                responsavel={a.responsible?.name ?? null}
                abertoEm={a.createdAt}
                descricao={a.description}
                anexos={a.attachments.map((att) => ({ id: att.id, name: att.name }))}
                pendencias={a.pendencias}
                jaConvertido={Boolean(a.convertedCaseId)}
              />
            </div>
          </div>

          {/* ── A FICHA COMPLETA, NO MESMO ROLAR ───────────────────────────── */}
          <div className="tela pt-6">
            {a.convertedCase && (
              <Card className="mb-5 p-5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-tx-3">Convertido em</span>
                  <Link href={`/processos/${a.convertedCase.id}`} className="text-right font-medium text-marca-tx hover:underline">
                    {a.convertedCase.title}
                  </Link>
                </div>
              </Card>
            )}

            <Card className="mb-5 p-5">
              <h4 className="mb-1 text-sm font-semibold text-tx">Honorário pretendido e prazo de resposta</h4>
              <p className="mb-3 text-xs italic text-tx-3">
                Capturado aqui para não ser redigitado na conversão em Processo. {a.contact ? `Contato (legado): ${a.contact}.` : ""}
              </p>
              <AttendanceCommercialForm
                attendanceId={a.id}
                estimatedValue={a.estimatedValue}
                leadSource={a.leadSource}
                nextContactAt={a.nextContactAt ? a.nextContactAt.toISOString() : null}
                feeMode={a.feeMode}
                feePercentual={a.feePercentual}
                feePercentualBase={a.feePercentualBase}
                responseDeadline={a.responseDeadline ? a.responseDeadline.toISOString() : null}
                firstResponseAt={a.firstResponseAt ? a.firstResponseAt.toISOString() : null}
              />
            </Card>

            <Card className="p-5 mb-5">
              <h4 className="text-sm font-semibold text-tx mb-1">Pendências</h4>
              <p className="text-xs italic text-tx-3 mb-3">
                O que falta pedir ao lead e o que falta mandar para ele. Fecha sozinha quando o anexo do tipo correspondente é registrado
                abaixo (Procuração, Contrato de Honorários e Declaração de Hipossuficiência); o resto se marca à mão.
              </p>
              <AttendancePendenciasPanel attendanceId={a.id} users={users} pendencias={serializedPendencias} />
            </Card>

            {!a.convertedCaseId && (
              /* A âncora do botão contornado do trilho. O id vai num invólucro porque o Card não
                 aceita id — e um botão que rola para lugar nenhum é pior que um botão a menos. */
              <div id="transformar" className="mb-5 scroll-mt-4">
              <Card className="p-5">
                <h4 className="text-sm font-semibold text-tx mb-1">Transformar em Processo/Caso</h4>
                <p className="text-xs italic text-tx-3 mb-3">
                  Isso cria um novo Caso ou Processo vinculado ao cliente, mantendo o histórico completo deste atendimento.
                </p>
                <ConvertAttendanceForm attendanceId={a.id} />
              </Card>
              </div>
            )}

            {!showWhatsapp && (
              <Card className="mb-5 p-5">
                <p className="text-sm text-tx-3">Este atendimento não tem conversa de WhatsApp.</p>
              </Card>
            )}

            <Card className="p-5 mb-5">
              <div className="mb-3">
                <h4 className="text-sm font-semibold text-tx">E-mail</h4>
                <p className="text-xs italic text-tx-3 mt-1.5">
                  Enviado usando a sua própria conta Google conectada. Se não conseguir enviar, reconecte sua conta em Configurações.
                </p>
              </div>

              {a.emailMessages.length === 0 ? (
                <p className="text-sm text-tx-3">Nenhum e-mail enviado ainda.</p>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1 mb-3">
                  {a.emailMessages.map((m) => (
                    <div key={m.id} className=" border border-regua bg-sf-apoio px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-tx">{m.subject}</p>
                        <span className="shrink-0 text-etiqueta text-tx-3">
                          {dataDeBrasilia(m.createdAt)} {horaDeBrasilia(m.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-tx-3">
                        De {m.fromAddress} para {m.toAddress}
                      </p>
                      <p className="mt-1 text-sm text-tx whitespace-pre-wrap break-words">{m.body}</p>
                      {m.status === "FAILED" && (
                        <p className="mt-1 text-xs font-medium text-urgente">Falhou{m.errorMessage ? `: ${m.errorMessage}` : ""}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <EmailReplyPanel attendanceId={a.id} clientEmail={a.clientEmail} />
            </Card>

            <Card className="mb-5">
              <div className="flex items-start justify-between px-5 py-3 border-b border-regua gap-2">
                <div>
                  <h4 className="text-sm font-semibold text-tx">Tarefas / Kanban</h4>
                  <p className="text-xs italic text-tx-3 mt-1.5">
                    Tarefas e compromissos vinculados só a este atendimento — aparecem também na Agenda geral.
                  </p>
                </div>
                <NewTaskModal cases={[]} users={users} columns={columns} defaultAttendanceId={a.id} label="Criar Tarefa/Evento" />
              </div>
              {a.tasks.length === 0 ? (
                <EmptyState title="Nenhuma tarefa vinculada a este atendimento" />
              ) : (
                <div className="divide-y divide-regua">
                  {a.tasks.map((t) => (
                    <div key={t.id} className="flex items-center gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {t.status === "CONCLUIDO" ? (
                            <ConclusionChip>{taskConclusionLabel(t.type)}</ConclusionChip>
                          ) : (
                            <>
                              <Badge color={taskTypeColors[t.type]}>{taskTypeLabels[t.type]}</Badge>
                              <Badge color={priorityColors[t.priority]}>{t.priority}</Badge>
                            </>
                          )}
                          <p className={`text-sm font-medium text-tx ${t.status === "CONCLUIDO" ? "line-through text-tx-3" : ""}`}>{t.title}</p>
                        </div>
                        {t.responsible && <p className="text-xs text-tx-3 mt-0.5">Responsável: {t.responsible.name}</p>}
                      </div>
                      <p className="text-xs font-semibold text-tx-2 shrink-0">{formatCalendarDate(t.dueDate)}</p>
                      <DeleteEntityButton entityType="TASK" entityId={t.id} entityLabel={t.title} confirmMessage={`Excluir a tarefa "${t.title}"?`} />
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-5">
              <div className="flex items-start justify-between mb-3 gap-2">
                <div>
                  <h4 className="text-sm font-semibold text-tx">Anexos</h4>
                  <p className="text-xs italic text-tx-3 mt-1.5">
                    Documentos armazenados no Drive do escritório, vinculados a este atendimento. Abertos em {formatDate(a.createdAt)}.
                  </p>
                </div>
                <GerarDocumentoButton attendanceId={a.id} />
              </div>
              <AttachmentList attachments={serializedAttachments} attendanceId={a.id} driveConnected={storageConnected} />
            </Card>

            <Card className="p-5 mt-5">
              <h4 className="text-sm font-semibold text-tx mb-1">Anotações pessoais</h4>
              <p className="text-xs italic text-tx-3 mb-3">
                Anotações que você criou vinculadas a este atendimento (painel Anotações, ícone na borda direita da tela) — visíveis só para você.
              </p>
              <AnotacoesPessoaisList anotacoes={serializedAnotacoes} />
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
