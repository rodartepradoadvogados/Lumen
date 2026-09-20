import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { PageHeader } from "@/components/ui";
import QuadroDoFunil, { type CardDoFunil } from "@/components/atendimento/QuadroDoFunil";
import { stageOptions } from "@/lib/funil";
import { List } from "lucide-react";
import { veTodoOAtendimento } from "@/lib/acessoAtendimento";
import { quemEstaEsperando } from "@/lib/esperaDoAtendimento";
import FilaDeEspera from "@/components/atendimento/FilaDeEspera";
import RecusadosParaAnalise from "@/components/atendimento/RecusadosParaAnalise";
import { situacaoDaRecusa, type EstadoDaRecusa } from "@/lib/recusaDoLead";
import { dataDeBrasilia, dataEHoraDeBrasilia } from "@/lib/horaDeBrasilia";

export const dynamic = "force-dynamic";




function daysBetween(from: Date, to: Date) {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)));
}

const GUIAS = ["espera", "funil", "recusados"] as const;
type Guia = (typeof GUIAS)[number];

export default async function FunilPage({ searchParams }: { searchParams: { guia?: string } }) {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");
  // A REGRA DO DONO: o Atendimento é de administrador e da recepção, e de mais ninguém.
  // `notFound` e não uma tela de "sem permissão": quem não pode ver não precisa saber que existe.
  // O FUNIL É DE QUEM ORGANIZA A CAPTAÇÃO, e não de quem atende um caso. Ele mostra o pipeline
  // comercial do escritório inteiro — valor estimado, o que foi perdido e por quê. Recortá-lo por
  // dono daria a um advogado uma "visão de funil" de três cartões, que não é funil nenhum;
  // mostrá-lo inteiro entregaria a ele o comercial da casa. Então: só nível total.
  if (!veTodoOAtendimento(viewer)) notFound();

  const attendances = await prisma.attendance.findMany({
    where: { status: { notIn: ["ARQUIVADO", "RASCUNHO", "RECUSADO"] }, officeId: viewer.officeId },
    include: {
      responsible: { select: { name: true } },
      // Só a última mensagem: é o que decide se o card pisca. Ver a nota em lib/funil.ts sobre
      // por que "esperando resposta" não é a mesma coisa que a coluna "Aguardando".
      whatsappMessages: { orderBy: { createdAt: "desc" }, take: 1, select: { direction: true } },
    },
    orderBy: [{ stageChangedAt: "desc" }, { createdAt: "desc" }],
  });

  const now = new Date();

  // ── QUEM ESTÁ ESPERANDO, E O EXPEDIENTE QUE GOVERNA O RELÓGIO ─────────────
  // Esta tela é só de quem vê o escritório inteiro (ver o gate acima), então a fila vem sem
  // recorte por dono — de propósito: quem organiza a captação precisa enxergar a fila toda, e é
  // isso que ele está autorizado a ver.
  const guia: Guia = GUIAS.includes(searchParams.guia as Guia) ? (searchParams.guia as Guia) : "espera";

  const [fila, cfg, recusados] = await Promise.all([
    quemEstaEsperando(viewer.officeId, {}, viewer.id, now, 50),
    prisma.whatsappConfig.findUnique({
      where: { officeId: viewer.officeId },
      select: { expedienteInicio: true, expedienteFim: true },
    }),
    // Os recusados que ainda esperam decisão. Arquivados e revertidos não entram: a fila é de
    // trabalho, e tudo que não exige decisão precisa sair dela.
    prisma.recusaDeAtendimento.findMany({
      where: { officeId: viewer.officeId, estado: "EM_ANALISE" },
      include: {
        recusadaPor: { select: { name: true } },
        attendance: { select: { id: true, clientName: true, subject: true } },
      },
      // Quem tem data de voltar a olhar vencida vem primeiro; depois, o mais antigo.
      orderBy: [{ revisitaEm: "asc" }, { recusadaEm: "asc" }],
      take: 100,
    }),
  ]);
  const esperando = fila.lista.filter((q) => q.esperandoHa !== null);

  const naFilaDeRecusados = recusados.map((r) => ({
    recusaId: r.id,
    attendanceId: r.attendanceId,
    nome: r.attendance.clientName,
    assunto: r.attendance.subject,
    motivo: r.motivoTexto,
    observacao: r.observacao,
    recusadoEm: dataEHoraDeBrasilia(r.recusadaEm),
    recusadoPor: r.recusadaPor?.name ?? null,
    porAgente: r.porAgente,
    situacao: situacaoDaRecusa({
      estado: r.estado as EstadoDaRecusa,
      enviadaEm: r.enviadaEm,
      abertaEm: r.abertaEm,
      revisitaEm: r.revisitaEm,
    }),
    revisitaEm: r.revisitaEm ? r.revisitaEm.toISOString() : null,
    // Vencida é a que já passou da data — e é a única coisa nesta lista que merece destaque,
    // porque é uma promessa do escritório consigo mesmo que está sendo quebrada.
    revisitaVencida: Boolean(r.revisitaEm && r.revisitaEm <= now),
    revisitaLegivel: r.revisitaEm ? dataDeBrasilia(r.revisitaEm) : null,
  }));

  // O quadro é um componente de cliente (arrastar exige navegador), então o que sai daqui é uma
  // lista simples de cards já prontos — nada de objeto do Prisma atravessando a fronteira.
  const cardsDoFunil: CardDoFunil[] = attendances.map((a) => ({
    id: a.id,
    clientName: a.clientName,
    subject: a.subject,
    stage: stageOptions.includes(a.stage) ? a.stage : "NOVO",
    estimatedValue: a.estimatedValue,
    leadSource: a.leadSource,
    lostReason: a.lostReason,
    responsavel: a.responsible?.name ?? null,
    diasNoEstagio: daysBetween(a.stageChangedAt ?? a.createdAt, now),
    followupAtrasado: Boolean(a.nextContactAt && a.nextContactAt < now && !["FECHADO", "PERDIDO"].includes(a.stage)),
    // A ÚLTIMA PALAVRA É DO CLIENTE. Mesmo critério da fila de espera (lib/rotulosDaEspera.ts) —
    // uma segunda definição de "esperando resposta" faria a bolinha do card discordar da fila da
    // primeira guia, na mesma tela.
    esperandoResposta: a.whatsappMessages[0]?.direction === "IN",
  }));

  const contar = (stage: string) => cardsDoFunil.filter((c) => c.stage === stage).length;
  const closed = contar("FECHADO");
  const lost = contar("PERDIDO");
  const conversionRate = closed + lost > 0 ? (closed / (closed + lost)) * 100 : null;

  return (
    <div className="tela">
      <PageHeader
        title="Triagem"
        subtitle="Primeiro o que tem relógio correndo. Depois o funil, que é do ritmo da semana."
        action={
          <Link
            href="/atendimento"
            className="inline-flex items-center gap-1.5 bg-sf text-tx-2 border border-regua hover:bg-sf-apoio text-sm font-semibold px-3.5 py-2 transition-colors"
          >
            <List size={16} /> Lista de Atendimentos
          </Link>
        }
      />

      {/* TRÊS GUIAS, e a fila é a primeira porque é a única com relógio correndo. Antes a fila e o
          funil apareciam empilhados na mesma tela; a fila de recusados como terceira pilha ficaria
          abaixo de um quadro que rola de lado, ou seja, invisível. Em guias, cada uma das três
          ocupa a tela inteira quando é a vez dela, e a que abre é a urgente. */}
      <div className="mb-5 flex flex-wrap items-end gap-[3px] border-b-2 border-guia-ativa">
        <GuiaDaTriagem href="/atendimento/funil" ativa={guia === "espera"} numero={1} rotulo="Esperando resposta" contagem={esperando.length} />
        <GuiaDaTriagem href="/atendimento/funil?guia=funil" ativa={guia === "funil"} numero={2} rotulo="Funil comercial" />
        <GuiaDaTriagem
          href="/atendimento/funil?guia=recusados"
          ativa={guia === "recusados"}
          numero={3}
          rotulo="Recusados"
          contagem={naFilaDeRecusados.length}
        />
      </div>

      {guia === "espera" && (
        <FilaDeEspera
          lista={esperando}
          expediente={cfg ? { inicio: cfg.expedienteInicio, fim: cfg.expedienteFim } : null}
        />
      )}

      {guia === "recusados" && <RecusadosParaAnalise lista={naFilaDeRecusados} />}

      {guia === "funil" && (
      <>

      {/* O FUNIL RECUA A RÓTULO DE SEÇÃO. Ele continua inteiro, com as mesmas cinco colunas e o
          mesmo arrastar — o que muda é o peso: um título de página anunciando o funil dizia que a
          tela era sobre o ritmo da semana, quando o que estoura nela é o relógio de quinze
          minutos. A taxa de conversão vem junto, na mesma linha, porque é leitura do funil. */}
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-etiqueta font-bold uppercase tracking-wider text-tx-3">Funil comercial</h2>
        <span className="text-xs text-tx-3">
          arraste entre as colunas — o estágio continua sendo movido por você, nunca pelo sistema
        </span>
        {conversionRate !== null && (
          <span className="ml-auto text-xs text-tx-3">
            Taxa de conversão{" "}
            <span className="font-semibold tabular-nums text-concluido">{conversionRate.toFixed(0)}%</span> ({closed} de{" "}
            {closed + lost} decididos)
          </span>
        )}
      </div>

      <QuadroDoFunil cards={cardsDoFunil} />
      </>
      )}
    </div>
  );
}

function GuiaDaTriagem({
  href,
  ativa,
  numero,
  rotulo,
  contagem,
}: {
  href: string;
  ativa: boolean;
  numero: number;
  rotulo: string;
  contagem?: number;
}) {
  return (
    <Link
      href={href}
      replace
      aria-current={ativa ? "page" : undefined}
      className={`guia-ficha text-etiqueta font-semibold uppercase tracking-[.06em] whitespace-nowrap transition-colors ${
        ativa ? "bg-guia-ativa text-rotulo border-guia-ativa" : "bg-sf text-tx-2 border-regua-forte hover:bg-sf-apoio hover:text-tx"
      }`}
    >
      <span className="mr-1.5 tabular-nums opacity-70">{numero}</span>
      {rotulo}
      {contagem !== undefined && <span className={`ml-1.5 tabular-nums ${ativa ? "opacity-70" : "text-tx-3"}`}>({contagem})</span>}
    </Link>
  );
}
