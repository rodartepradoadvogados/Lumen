import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, Badge, ConclusionChip, formatCalendarDate, EmptyState, taskConclusionLabel, taskTypeLabels, taskTypeColors, priorityColors } from "@/components/ui";
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
import RecusarLeadPainel from "@/components/atendimento/RecusarLeadPainel";
import { motivosParaRecusar } from "@/lib/actions/recusaDoLead";
import { getAppUrl } from "@/lib/appUrl";
import type { EstadoDaRecusa } from "@/lib/recusaDoLead";

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

const ABAS = ["conversa", "ficha"] as const;
type Aba = (typeof ABAS)[number];

// A segunda aba não é uma tela: é uma gaveta com sete divisórias. Cada uma é uma coisa que se
// resolve de vez em quando e que, empilhada abaixo da conversa, obrigava a rolar meia tela para
// achar. O seletor troca a divisória sem sair do atendimento.
const BLOCOS = [
  { chave: "honorario", rotulo: "Honorário e prazos" },
  { chave: "pendencias", rotulo: "Pendências" },
  { chave: "processo", rotulo: "Transformar em processo" },
  { chave: "email", rotulo: "E-mail" },
  { chave: "tarefas", rotulo: "Tarefas" },
  { chave: "anexos", rotulo: "Anexos" },
  { chave: "anotacoes", rotulo: "Anotações" },
] as const;
type Bloco = (typeof BLOCOS)[number]["chave"];

export default async function AttendanceDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { aba?: string; bloco?: string };
}) {
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
      // A recusa mais recente que ainda está de pé. Só uma: as anteriores (desfeitas ou
      // arquivadas) são histórico, e histórico não vai para o topo da tela.
      recusas: { where: { estado: { not: "REVERTIDA" } }, orderBy: { recusadaEm: "desc" }, take: 1, include: { recusadaPor: { select: { name: true } } } },
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

  // Mesmo critério da fila e do quadro (lib/rotulosDaEspera.ts): a última palavra é do cliente.
  const ultimaMensagem = a.whatsappMessages[a.whatsappMessages.length - 1];
  const esperandoResposta = ultimaMensagem?.direction === "IN";

  // Os motivos só são buscados quando há chance de recusar — e o endereço do site é o que monta o
  // link da carta, que é copiado e mandado à mão.
  const recusaAtual = a.recusas[0] ?? null;
  const motivosDeRecusa = recusaAtual || a.convertedCaseId ? [] : await motivosParaRecusar();
  const enderecoDoSite = getAppUrl();
  const recusaNaTela = recusaAtual
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
    : null;

  const aba: Aba = ABAS.includes(searchParams.aba as Aba) ? (searchParams.aba as Aba) : "conversa";
  const bloco: Bloco = BLOCOS.some((b) => b.chave === searchParams.bloco)
    ? (searchParams.bloco as Bloco)
    : "honorario";
  const guia = (destino: Aba, qual?: Bloco) =>
    destino === "conversa" ? `/atendimento/${a.id}` : `/atendimento/${a.id}?aba=ficha&bloco=${qual ?? bloco}`;

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
                {/* A bolinha que pisca: a última mensagem é do cliente e ninguém respondeu. É FATO,
                    e não estágio — ver a nota em lib/funil.ts. Fica colada no nome porque é sobre
                    esta pessoa que ela fala. */}
                {esperandoResposta && (
                  <span
                    className="bolinha-espera"
                    role="img"
                    aria-label="O cliente está esperando resposta"
                    title="O cliente escreveu e ninguém respondeu"
                  />
                )}
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

        {/* ── AS DUAS GUIAS ────────────────────────────────────────────────
            A conversa é a tela; o resto é ficha. Antes tudo vinha no mesmo rolar, e quem queria
            lançar um honorário rolava por cima da conversa inteira para chegar lá — e quem queria
            ler a conversa via, no canto do olho, sete blocos pedindo atenção. A guia separa as
            duas intenções sem esconder nenhuma. */}
        <div className="shrink-0 border-b-2 border-guia-ativa bg-sf px-6">
          <div className="flex flex-wrap items-end gap-[3px]">
            <Link
              href={guia("conversa")}
              replace
              aria-current={aba === "conversa" ? "page" : undefined}
              className={`guia-ficha text-etiqueta font-semibold uppercase tracking-[.06em] whitespace-nowrap transition-colors ${
                aba === "conversa"
                  ? "bg-guia-ativa text-rotulo border-guia-ativa"
                  : "bg-sf text-tx-2 border-regua-forte hover:bg-sf-apoio hover:text-tx"
              }`}
            >
              <span className="mr-1.5 tabular-nums opacity-70">1</span>
              Conversa
            </Link>
            <Link
              href={guia("ficha")}
              replace
              aria-current={aba === "ficha" ? "page" : undefined}
              className={`guia-ficha text-etiqueta font-semibold uppercase tracking-[.06em] whitespace-nowrap transition-colors ${
                aba === "ficha"
                  ? "bg-guia-ativa text-rotulo border-guia-ativa"
                  : "bg-sf text-tx-2 border-regua-forte hover:bg-sf-apoio hover:text-tx"
              }`}
            >
              <span className="mr-1.5 tabular-nums opacity-70">2</span>
              Ficha completa
            </Link>
          </div>
        </div>

        {aba === "conversa" && (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:overflow-hidden">
          {/* ── AS DUAS COLUNAS ──────────────────────────────────────────────
              Altura travada em telas grandes para que a caixa de resposta fique presa no pé da
              conversa, que é o que faz a tela ser usável sem rolar. Abaixo de `lg` as duas empilham
              e a conversa ganha um teto próprio — numa tela estreita, uma conversa de altura livre
              empurraria a caixa de resposta para fora do alcance. */}
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
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

        </div>
        )}

        {/* ── A FICHA COMPLETA, EM SETE DIVISÓRIAS ────────────────────────── */}
        {aba === "ficha" && (
        <div className="flex-1 overflow-y-auto">
          <div className="tela pt-5">
            <div className="mb-5 flex flex-wrap gap-1.5">
              {BLOCOS.map((b) => (
                <Link
                  key={b.chave}
                  href={guia("ficha", b.chave)}
                  replace
                  aria-current={bloco === b.chave ? "page" : undefined}
                  /* A divisória escolhida NÃO usa o bordô. É a mesma regra que a guia do app já
                     segue (ver components/mobile/GuiaMobile.tsx): bordô é a cor da AÇÃO, e gastá-la
                     num estado de navegação tira dela o significado. E o bronze também não, porque
                     ele já está em uso logo acima, na guia de primeiro nível — repetir faria os
                     dois níveis parecerem o mesmo. Aqui a escolhida se distingue por peso e
                     contraste, que é o que sobra e é o que basta. */
                  className={`min-h-11 inline-flex items-center border px-3.5 text-xs transition-colors ${
                    bloco === b.chave
                      ? "border-regua-forte bg-sf-apoio font-bold text-tx"
                      : "border-regua bg-sf font-semibold text-tx-2 hover:bg-sf-apoio hover:text-tx"
                  }`}
                >
                  {b.rotulo}
                </Link>
              ))}
            </div>

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

            {bloco === "honorario" && (
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
            )}

            {bloco === "pendencias" && (
            <Card className="p-5 mb-5">
              <h4 className="text-sm font-semibold text-tx mb-1">Pendências</h4>
              <p className="text-xs italic text-tx-3 mb-3">
                O que falta pedir ao lead e o que falta mandar para ele. Fecha sozinha quando o anexo do tipo correspondente é registrado
                abaixo (Procuração, Contrato de Honorários e Declaração de Hipossuficiência); o resto se marca à mão.
              </p>
              <AttendancePendenciasPanel attendanceId={a.id} users={users} pendencias={serializedPendencias} />
            </Card>
            )}

            {/* RECUSAR MORA NA MESMA DIVISÓRIA DE TRANSFORMAR EM PROCESSO, e não numa própria: são
                os dois desfechos possíveis do lead, e quem abre esta divisória está decidindo
                entre eles. Separar em duas faria a pessoa ter de saber de antemão qual escolheria. */}
            {bloco === "processo" && (
              <div className="mb-5">
                <Card className="p-5">
                  <h4 className="mb-1 text-sm font-semibold text-tx">Recusar este lead</h4>
                  <p className="mb-3 text-xs italic text-tx-3">
                    Recusar não descarta: o lead sai das listas ativas, vai para a fila de recusados e pode voltar. A carta
                    fica pronta para você mandar quando quiser.
                  </p>
                  <RecusarLeadPainel
                    attendanceId={a.id}
                    motivos={motivosDeRecusa}
                    recusa={recusaNaTela}
                    enderecoDoSite={enderecoDoSite}
                  />
                </Card>
              </div>
            )}

            {bloco === "processo" && !a.convertedCaseId && (
              <div className="mb-5">
              <Card className="p-5">
                <h4 className="text-sm font-semibold text-tx mb-1">Transformar em Processo/Caso</h4>
                <p className="text-xs italic text-tx-3 mb-3">
                  Isso cria um novo Caso ou Processo vinculado ao cliente, mantendo o histórico completo deste atendimento.
                </p>
                <ConvertAttendanceForm attendanceId={a.id} />
              </Card>
              </div>
            )}

            {bloco === "processo" && a.convertedCaseId && (
              <Card className="mb-5 p-5">
                <p className="text-sm text-tx-3">Este atendimento já virou processo — ver o vínculo acima.</p>
              </Card>
            )}

            {bloco === "email" && (
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
            )}

            {bloco === "tarefas" && (
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
            )}

            {bloco === "anexos" && (
            <Card className="p-5">
              <div className="flex items-start justify-between mb-3 gap-2">
                <div>
                  <h4 className="text-sm font-semibold text-tx">Anexos</h4>
                  <p className="text-xs italic text-tx-3 mt-1.5">
                    {/* createdAt é instante — formatDate() lia sem fuso e virava um dia errado
                        perto da meia-noite. */}
                    Documentos armazenados no Drive do escritório, vinculados a este atendimento. Abertos em {dataDeBrasilia(a.createdAt)}.
                  </p>
                </div>
                <GerarDocumentoButton attendanceId={a.id} />
              </div>
              <AttachmentList attachments={serializedAttachments} attendanceId={a.id} driveConnected={storageConnected} />
            </Card>
            )}

            {bloco === "anotacoes" && (
            <Card className="p-5">
              <h4 className="text-sm font-semibold text-tx mb-1">Anotações pessoais</h4>
              <p className="text-xs italic text-tx-3 mb-3">
                Anotações que você criou vinculadas a este atendimento (painel Anotações, ícone na borda direita da tela) — visíveis só para você.
              </p>
              <AnotacoesPessoaisList anotacoes={serializedAnotacoes} />
            </Card>
            )}
          </div>
        </div>
        )}
      </div>
    </>
  );
}
