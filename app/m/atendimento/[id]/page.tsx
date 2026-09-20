import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { Card } from "@/components/ui";
import MobileAttendanceStatusSelect from "@/components/mobile/MobileAttendanceStatusSelect";
import FunnelStageSelect from "@/components/FunnelStageSelect";
import MobileConvertAttendanceForm from "@/components/mobile/MobileConvertAttendanceForm";
import MobileCaseAttachmentsTab from "@/components/mobile/MobileCaseAttachmentsTab";
import AnotacoesPessoaisList from "@/components/anotacoes/AnotacoesPessoaisList";
import MobileNovaAnotacaoForm from "@/components/mobile/MobileNovaAnotacaoForm";
import EditAttendanceSubject from "@/components/EditAttendanceSubject";
import { TiraDeGuias, GuiaLink } from "@/components/mobile/GuiaMobile";
import Conversa from "@/components/atendimento/Conversa";
import QuemEEsteNumero from "@/components/atendimento/QuemEEsteNumero";
import RelogioDoAtendimento from "@/components/atendimento/RelogioDoAtendimento";
import WhatsappReplyBox from "@/components/WhatsappReplyBox";
import AtendenteIaControle from "@/components/AtendenteIaControle";
import { ArrowLeft } from "lucide-react";
import { dataDeBrasilia, dataEHoraDeBrasilia } from "@/lib/horaDeBrasilia";
import { filtroDoAtendimento, podeVerAtendimentos } from "@/lib/acessoAtendimento";
import { identificarNumero } from "@/lib/identificarNumero";
import { telefoneLegivel } from "@/lib/quemEEsteNumero";
import { pendenciaKindLabel } from "@/lib/pendencias";
import { isWhatsappConfigured } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

const channelLabels: Record<string, string> = { WHATSAPP: "WhatsApp", EMAIL: "E-mail", TELEFONE: "Telefone", PRESENCIAL: "Presencial" };

const ABAS = ["conversa", "ficha", "documentos", "anotacoes"] as const;
type Aba = (typeof ABAS)[number];

// ============================================================================
// O ATENDIMENTO NO APP — A CONVERSA PRIMEIRO.
//
// Era uma pilha de cartões com a conversa no meio e, no pé dela, a frase "Para responder, use o
// computador". Isso invertia o propósito do app: o advogado abre o telefone JUSTAMENTE quando não
// está no computador, e o relógio de quinze minutos corre igual.
//
// Agora: abas no topo (conversa, ficha, documentos, anotações), a conversa ocupando o miolo, e o
// rodapé inteiro para escrever. A tela não rola como um todo — só a conversa rola — porque uma
// caixa de resposta que foge para baixo enquanto se rola a conversa é uma caixa de resposta que não
// se usa com uma mão só.
//
// RESPONDER PELO APP É NOVO, e usa a mesma ação do site (replyWhatsapp), com a mesma porta de
// acesso e o mesmo efeito sobre o atendente de IA: quem escreve, assume.
// ============================================================================

export default async function MobileAttendanceDetail({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { aba?: string };
}) {
  const viewer = await getCurrentUser();
  if (!viewer) notFound();
  // A REGRA DO DONO: o Atendimento é de administrador e da recepção, e de mais ninguém.
  // `notFound` e não uma tela de "sem permissão": quem não pode ver não precisa saber que existe.
  if (!podeVerAtendimentos(viewer)) notFound();

  const a = await prisma.attendance.findFirst({
    // Mesmo recorte do site: o dono entra no WHERE, não num `if` depois de carregar.
    where: { id: params.id, officeId: viewer.officeId, ...filtroDoAtendimento(viewer, viewer.id) },
    include: {
      responsible: true,
      campanha: { select: { nome: true } },
      convertedCase: true,
      whatsappMessages: { orderBy: { createdAt: "asc" } },
      emailMessages: { orderBy: { createdAt: "asc" } },
      pendencias: { orderBy: [{ status: "asc" }, { dueDate: "asc" }] },
      anotacoes: { where: { authorId: viewer.id }, orderBy: { referenceDate: "desc" } },
      attachments: { include: { uploadedBy: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!a) notFound();

  const aba: Aba = ABAS.includes(searchParams.aba as Aba) ? (searchParams.aba as Aba) : "conversa";

  // Mesma identificação do site: o app não pode saber menos sobre quem está falando do que a tela
  // grande, porque é justamente no app que se responde fora do escritório.
  const { telefone: telefoneDoContato, contato: contatoConhecido } = await identificarNumero(viewer.officeId, a);

  const whatsappConfigured = await isWhatsappConfigured(viewer.officeId);
  const podeResponder = Boolean(a.waPhone) && whatsappConfigured;

  // O MESMO CRITÉRIO DE TODAS AS TELAS (lib/rotulosDaEspera.ts): a última palavra é do cliente.
  // Serve a duas coisas de uma vez — a bolinha que pisca no cabeçalho e o controle do atendente,
  // que só se oferece a responder quando há o que responder. Duas definições fariam a bolinha
  // discordar do botão logo abaixo dela.
  const ultimaEhDoCliente =
    a.whatsappMessages.length > 0 && a.whatsappMessages[a.whatsappMessages.length - 1].direction === "IN";
  const nomeDoAtendente =
    (
      await prisma.whatsappConfig.findUnique({ where: { officeId: viewer.officeId }, select: { agenteNome: true } })
    )?.agenteNome?.trim() || "O atendente";

  const aguardando = a.pendencias.filter((p) => p.status !== "CONCLUIDA");
  const serializedAnotacoes = a.anotacoes.map((n) => ({
    id: n.id,
    content: n.content,
    referenceDate: n.referenceDate.toISOString(),
    createdAt: n.createdAt.toISOString(),
  }));
  const serializedAttachments = a.attachments.map((att) => ({
    id: att.id,
    name: att.name,
    driveUrl: att.driveUrl,
    docType: att.docType,
    createdAt: att.createdAt.toISOString(),
    updatedAt: att.updatedAt?.toISOString() ?? null,
    uploadedBy: att.uploadedBy ? { name: att.uploadedBy.name } : null,
  }));

  const guia = (destino: Aba) => `/m/atendimento/${a.id}${destino === "conversa" ? "" : `?aba=${destino}`}`;

  return (
    // A ALTURA É CONTADA, e os dois números têm origem: 52px é o cabeçalho do app (app/m/layout.tsx,
    // `min-h-[52px]`) e 80px é a barra de baixo, que o `pb-20` do <main> já reserva. `-mb-20`
    // devolve essa reserva, porque aqui quem manda na altura é esta caixa. Sem isto a conversa e o
    // compositor rolariam junto com a página, e a caixa de resposta fugiria para baixo.
    <div className="-mb-20 flex h-[calc(100dvh-132px)] flex-col animate-fade-in">
      <div className="shrink-0 border-b border-regua bg-sf px-4 pb-0 pt-3">
        <Link href="/m/atendimento" className="inline-flex min-h-[32px] items-center gap-1 text-corpo font-semibold text-tx-2">
          <ArrowLeft size={13} /> Atendimentos
        </Link>

        {/* O NOME OCUPA A LARGURA INTEIRA, e os dois seletores descem para a linha seguinte.
            Medido no navegador a 390px: com os seletores ao lado, "Carlos Eduardo da Silva" era
            cortado em "Carlos Eduardo da Si…" — e o nome de quem está do outro lado é a primeira
            coisa que a tela precisa dizer. */}
        <div className="mt-1 min-w-0">
          <h1 className="flex items-center gap-2 truncate text-lg font-bold leading-tight text-tx">
            {/* A bolinha que pisca: a última palavra é do cliente e ninguém respondeu. É FATO, e
                não estágio — ver a nota em lib/funil.ts. Mesma marca das outras telas, para que
                quem olha o celular e quem olha o computador esteja vendo a mesma coisa. */}
            {ultimaEhDoCliente && (
              <span
                className="bolinha-espera"
                role="img"
                aria-label="O cliente está esperando resposta"
                title="O cliente escreveu e ninguém respondeu"
              />
            )}
            <span className="min-w-0 truncate">{a.clientName}</span>
          </h1>
          <div className="mt-0.5">
            <EditAttendanceSubject attendanceId={a.id} subject={a.subject} />
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <MobileAttendanceStatusSelect attendanceId={a.id} status={a.status} />
          <FunnelStageSelect attendanceId={a.id} stage={a.stage} />
          <RelogioDoAtendimento prazoISO={a.prazoDeRespostaAte ? a.prazoDeRespostaAte.toISOString() : null} compacto />
        </div>

        <TiraDeGuias className="-mx-4 mt-3 px-4">
          <GuiaLink href={guia("conversa")} ativa={aba === "conversa"}>Conversa</GuiaLink>
          <GuiaLink href={guia("ficha")} ativa={aba === "ficha"}>Ficha</GuiaLink>
          <GuiaLink href={guia("documentos")} ativa={aba === "documentos"} contagem={a.attachments.length}>
            Documentos
          </GuiaLink>
          <GuiaLink href={guia("anotacoes")} ativa={aba === "anotacoes"} contagem={a.anotacoes.length}>
            Anotações
          </GuiaLink>
        </TiraDeGuias>
      </div>

      <div data-rolagem-da-conversa="" className="min-h-0 flex-1 overflow-y-auto bg-sf-fundo p-4">
        {aba === "conversa" && (
          <Conversa
            mensagens={a.whatsappMessages}
            agora={new Date()}
            nomeDoAtendente={nomeDoAtendente}
            transferidoPor={a.transferidoPor}
            transferidoEm={a.transferidoEm}
          />
        )}

        {aba === "ficha" && (
          <div className="space-y-4">
            <Card className="p-4">
              <Rotulo>Quem é este número</Rotulo>
              <QuemEEsteNumero attendanceId={a.id} telefone={telefoneDoContato} contato={contatoConhecido} />
            </Card>

            <Card className="space-y-2.5 p-4">
              <Rotulo>O que a triagem apurou</Rotulo>
              <Field label="Matéria" value={a.area} />
              <Field label="Canal" value={channelLabels[a.channel] || a.channel} />
              {a.campanha?.nome && <Field label="Campanha" value={a.campanha.nome} />}
              <Field label="E-mail" value={a.clientEmail} />
              <Field label="Responsável" value={a.responsible?.name} />
              <Field label="Aberto em" value={dataDeBrasilia(a.createdAt)} />
              {a.convertedCase && (
                <div className="flex justify-between gap-3 text-sm">
                  <span className="shrink-0 text-tx-2">Convertido em</span>
                  <Link href={`/m/processos/${a.convertedCase.id}`} className="text-right font-medium text-marca-tx">
                    {a.convertedCase.title}
                  </Link>
                </div>
              )}
              {a.description && (
                <div className="border-t border-regua pt-2.5">
                  <p className="text-corpo text-tx-3">O que o cliente contou</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-tx-2">{a.description}</p>
                </div>
              )}
            </Card>

            <Card className="p-4">
              <Rotulo>Pendências</Rotulo>
              {aguardando.length === 0 ? (
                <p className="text-corpo text-tx-3">Nada pendente neste atendimento.</p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {aguardando.map((p) => (
                    <div key={p.id} className="flex items-baseline gap-2.5">
                      <span className="min-w-0 flex-1 break-words text-sm text-tx">
                        {p.description?.trim() || pendenciaKindLabel(p.direction, p.kind)}
                      </span>
                      <span className="shrink-0 text-corpo text-tx-3">
                        {p.direction === "SOLICITAR" ? "pedir" : "enviar"}
                        {p.dueDate ? ` · ${dataDeBrasilia(p.dueDate)}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {a.emailMessages.length > 0 && (
              <Card className="p-4">
                <Rotulo>E-mail</Rotulo>
                <div className="space-y-2">
                  {a.emailMessages.map((m) => (
                    <div key={m.id} className="border border-regua bg-sf-apoio px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-tx">{m.subject}</p>
                        <span className="shrink-0 text-corpo text-tx-2">{dataEHoraDeBrasilia(m.createdAt)}</span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-tx">{m.body}</p>
                      {m.status === "FAILED" && (
                        <p className="mt-1 text-corpo font-medium text-urgente">
                          Falhou{m.errorMessage ? `: ${m.errorMessage}` : ""}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-corpo italic text-tx-2">Para responder por e-mail, use o computador.</p>
              </Card>
            )}

            {!a.convertedCaseId && (
              <Card className="p-4">
                <h4 className="mb-1 text-sm font-semibold text-tx">Transformar em Processo/Caso</h4>
                <p className="mb-3 text-corpo italic text-tx-3">
                  Cria um novo Caso ou Processo vinculado ao cliente, mantendo o histórico deste atendimento.
                </p>
                <MobileConvertAttendanceForm attendanceId={a.id} />
              </Card>
            )}
          </div>
        )}

        {aba === "documentos" && <MobileCaseAttachmentsTab attachments={serializedAttachments} />}

        {aba === "anotacoes" && (
          <Card className="p-4">
            <AnotacoesPessoaisList anotacoes={serializedAnotacoes} />
            <div className="mt-3 border-t border-regua pt-3">
              <MobileNovaAnotacaoForm linkType="ATENDIMENTO" entityId={a.id} />
            </div>
          </Card>
        )}
      </div>

      {aba === "conversa" && (
        <div className="shrink-0 border-t border-regua bg-sf px-4 pb-3 pt-2">
          {podeResponder ? (
            <>
              <AtendenteIaControle
                attendanceId={a.id}
                responde={a.agenteResponde}
                silenciado={Boolean(a.agenteSilenciadoEm)}
                ultimaEhDoCliente={ultimaEhDoCliente}
                nomeDoAtendente={nomeDoAtendente}
                compacto
              />
              <WhatsappReplyBox attendanceId={a.id} nomeDoCliente={a.clientName} />
            </>
          ) : (
            <p className="py-2 text-corpo text-tx-3">
              {a.waPhone
                ? "O canal de WhatsApp do escritório não está configurado, então não há como responder por aqui."
                : `Este atendimento não tem WhatsApp vinculado${telefoneDoContato ? ` — o telefone é ${telefoneLegivel(telefoneDoContato)}` : ""}.`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return <p className="mb-2.5 text-etiqueta font-bold uppercase tracking-wider text-tx-3">{children}</p>;
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-3 border-b border-regua pb-2 text-sm last:border-0 last:pb-0">
      <span className="shrink-0 text-tx-2">{label}</span>
      <span className="text-right font-medium text-tx">{value || "—"}</span>
    </div>
  );
}
