import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { podeVerAtendimentos, veTodoOAtendimento, filtroDoAtendimento } from "@/lib/acessoAtendimento";
import { attendanceStatusLabels } from "@/lib/atendimentoStatus";
import { findAttendanceIdsByLooseName } from "@/lib/looseNameSearch";
import { stageOptions } from "@/lib/funil";
import { quemEstaEsperando } from "@/lib/esperaDoAtendimento";
import { situacaoDaRecusa, type EstadoDaRecusa } from "@/lib/recusaDoLead";
import { motivosParaRecusar } from "@/lib/actions/recusaDoLead";
import { identificarNumero } from "@/lib/identificarNumero";
import { getAppUrl } from "@/lib/appUrl";
import { hrefDaConversa, recorteDaConversa, CONVERSA_FORA_DO_SEU_ALCANCE } from "@/lib/conversaDaCentral";
import { dataDeBrasilia, dataEHoraDeBrasilia } from "@/lib/horaDeBrasilia";
import { Badge } from "@/components/ui";
import ThemeToggle from "@/components/ThemeToggle";
import QuadroDoFunil, { type CardDoFunil } from "@/components/atendimento/QuadroDoFunil";
import FilaDeEspera from "@/components/atendimento/FilaDeEspera";
import RecusadosParaAnalise, { type RecusadoNaLista } from "@/components/atendimento/RecusadosParaAnalise";
import Conversa from "@/components/atendimento/Conversa";
import TrilhoDoAtendimento from "@/components/atendimento/TrilhoDoAtendimento";
import RelogioDoAtendimento from "@/components/atendimento/RelogioDoAtendimento";
import RecusarLeadPainel from "@/components/atendimento/RecusarLeadPainel";

export const dynamic = "force-dynamic";

// ============================================================================
// CENTRAL DE ATENDIMENTO — a tela fundida (ETAPA 1: casca e navegação).
//
// Duas abas — "triagem" (padrão) e "atendimentos" — e três sub-abas dentro de Triagem, na ordem
// pedida: Funil comercial (padrão), Esperando resposta, Recusados. Ver PROPOSTA.md/CRITICA.md do
// mockup aprovado para o raciocínio de composição visual; esta página só HOSPEDA os componentes
// que já existem (QuadroDoFunil, FilaDeEspera, RecusadosParaAnalise, Conversa,
// TrilhoDoAtendimento, RelogioDoAtendimento, QuemEEsteNumero — dentro de TrilhoDoAtendimento —,
// RecusarLeadPainel), sem reescrever nenhum deles.
//
// ETAPA 2 — A FUSÃO DE CLIQUE, feita. A linha da fila, o card do funil e a linha de recusados
// abrem a conversa na aba Atendimentos DESTA tela, e não mais na rota antiga /atendimento/:id.
//
// COMO, e por que assim:
//
//   O ENDEREÇO É A MESMA ROTA COM OUTROS PARÂMETROS (?aba=atendimentos&id=...), calculado em
//   lib/conversaDaCentral.ts. Sendo a mesma rota, o <Link> do App Router faz navegação macia: troca
//   o conteúdo e não recarrega o documento. Foi por isso que o destino não virou uma tela nova nem
//   um modal — a tela já sabia ler `?id=` da URL desde a etapa 1, e ligar o que existe custa menos
//   do que inventar estado de cliente para a mesma coisa.
//
//   O DESTINO VIAJA COMO TEXTO ("central"), não como função. QuadroDoFunil e RecusadosParaAnalise
//   são componentes de cliente; passar `(id) => ...` como prop quebraria na serialização em tempo
//   de execução, sem um pio do TypeScript. Por padrão os três componentes continuam em "classico",
//   então a Triagem antiga (app/(app)/atendimento/funil/page.tsx) não mudou de comportamento — e
//   não precisou ser editada.
//
//   O `id` QUE CHEGA É PALPITE, e é reconferido: recorteDaConversa põe o officeId de QUEM PEDIU e o
//   recorte por dono no mesmo `where` do `id`. Sem isso, o caminho novo seria o furo da fusão —
//   clicar abriria conversa que a pessoa não poderia nem listar. Quando o recorte recusa, a tela
//   diz uma frase só para os três motivos possíveis (CONVERSA_FORA_DO_SEU_ALCANCE).
//
// A aba Atendimentos continua tendo a SUA PRÓPRIA seleção (lista → conversa): é o mesmo `?id=` que
// o clique da Triagem usa, e não um segundo caminho.
const ABAS = ["triagem", "atendimentos"] as const;
type AbaCentral = (typeof ABAS)[number];
const SUBS = ["funil", "espera", "recusados"] as const;
type SubTriagem = (typeof SUBS)[number];

const statusColors: Record<string, "amber" | "blue" | "green" | "slate"> = {
  NOVO: "amber",
  EM_TRIAGEM: "blue",
  CONVERTIDO: "green",
  ARQUIVADO: "slate",
  RASCUNHO: "slate",
};

const channelLabels: Record<string, string> = { WHATSAPP: "WhatsApp", EMAIL: "E-mail", TELEFONE: "Telefone", PRESENCIAL: "Presencial" };

function daysBetween(from: Date, to: Date) {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)));
}

export default async function AtendimentoCentralPage({
  searchParams,
}: {
  searchParams: { aba?: string; sub?: string; id?: string; status?: string; q?: string };
}) {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");
  // A REGRA DO DONO, a mesma de sempre (lib/acessoAtendimento.ts): quem não tem acesso nenhum não
  // sabe que a tela existe.
  if (!podeVerAtendimentos(viewer)) notFound();

  // ── A REGRA DE ACESSO DA FUSÃO — decisão do coordenador, registrada em lib/navSections.ts e
  // repetida aqui porque é aqui que ela é APLICADA: `veTodo` decide se a aba Triagem existe no
  // DOM (não "existe desabilitada" — não existe) e se a URL pode pedir por ela. Quem só tem
  // acesso aos próprios atendimentos nunca vê a Triagem por esta tela — exatamente como hoje não
  // vê o link "Triagem" no menu nem passa pela trava de servidor de
  // app/(app)/atendimento/funil/page.tsx, que continua de pé, intocada.
  const veTodo = veTodoOAtendimento(viewer);

  const abaPedida = ABAS.includes(searchParams.aba as AbaCentral) ? (searchParams.aba as AbaCentral) : "triagem";
  // Pedido de "?aba=triagem" sem o nível para ver: cai para Atendimentos. Isto NÃO é a trava de
  // acesso (a trava de verdade é a ausência das consultas abaixo, gated pelo mesmo `veTodo`) — é
  // só o que a tela mostra quando alguém tenta a URL direta.
  const aba: AbaCentral = abaPedida === "triagem" && !veTodo ? "atendimentos" : abaPedida;
  const sub: SubTriagem = SUBS.includes(searchParams.sub as SubTriagem) ? (searchParams.sub as SubTriagem) : "funil";

  const cfg = await prisma.whatsappConfig.findUnique({
    where: { officeId: viewer.officeId },
    select: { expedienteInicio: true, expedienteFim: true, agenteNome: true },
  });
  const nomeDoAtendente = cfg?.agenteNome?.trim() || "O atendente";

  // ── TRIAGEM — mesmas consultas de app/(app)/atendimento/funil/page.tsx, só disparadas quando
  // `veTodo` é verdadeiro. Quem só vê os próprios NUNCA dispara estas três consultas de escritório
  // inteiro, esteja a URL pedindo "triagem" ou não. ──────────────────────────────────────────────
  let esperando: Awaited<ReturnType<typeof quemEstaEsperando>>["lista"] = [];
  let naFilaDeRecusados: RecusadoNaLista[] = [];
  let cardsDoFunil: CardDoFunil[] = [];
  let closed = 0;
  let lost = 0;

  if (veTodo) {
    const now = new Date();
    const [fila, attendances, recusados] = await Promise.all([
      quemEstaEsperando(viewer.officeId, {}, viewer.id, now, 50),
      prisma.attendance.findMany({
        where: { status: { notIn: ["ARQUIVADO", "RASCUNHO", "RECUSADO"] }, officeId: viewer.officeId },
        include: {
          responsible: { select: { name: true } },
          whatsappMessages: { orderBy: { createdAt: "desc" }, take: 1, select: { direction: true } },
        },
        orderBy: [{ stageChangedAt: "desc" }, { createdAt: "desc" }],
      }),
      prisma.recusaDeAtendimento.findMany({
        where: { officeId: viewer.officeId, estado: "EM_ANALISE" },
        include: {
          recusadaPor: { select: { name: true } },
          attendance: { select: { id: true, clientName: true, subject: true } },
        },
        orderBy: [{ revisitaEm: "asc" }, { recusadaEm: "asc" }],
        take: 100,
      }),
    ]);
    esperando = fila.lista.filter((q) => q.esperandoHa !== null);
    naFilaDeRecusados = recusados.map((r) => ({
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
      revisitaVencida: Boolean(r.revisitaEm && r.revisitaEm <= now),
      revisitaLegivel: r.revisitaEm ? dataDeBrasilia(r.revisitaEm) : null,
    }));
    cardsDoFunil = attendances.map((a) => ({
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
      esperandoResposta: a.whatsappMessages[0]?.direction === "IN",
    }));
    closed = cardsDoFunil.filter((c) => c.stage === "FECHADO").length;
    lost = cardsDoFunil.filter((c) => c.stage === "PERDIDO").length;
  }
  const conversionRate = closed + lost > 0 ? (closed / (closed + lost)) * 100 : null;

  // ── ATENDIMENTOS — lista + a conversa selecionada. Mesmo filtro por dono de
  // app/(app)/atendimento/page.tsx (filtroDoAtendimento) — quem só vê os próprios continua só
  // vendo os próprios aqui dentro. ──────────────────────────────────────────────────────────────
  let listaAtendimentos: Awaited<ReturnType<typeof carregarLista>> = [];
  let idSelecionado: string | null = null;
  // O ID PEDIDO NA URL fica separado do que a tela escolheu sozinha (o primeiro da lista). É a
  // diferença entre "ninguém pediu nada ainda" e "pediram isto e a reconferência recusou" — e sem
  // guardar as duas coisas a segunda viraria a mensagem da primeira ("selecione à esquerda"), que
  // manda a pessoa fazer de novo o que ela acabou de fazer.
  const idPedido = (searchParams.id || "").trim() || null;
  if (aba === "atendimentos") {
    listaAtendimentos = await carregarLista(viewer, searchParams.status, searchParams.q);
    idSelecionado = idPedido || listaAtendimentos[0]?.id || null;
  }

  const selecionado = idSelecionado
    ? await prisma.attendance.findFirst({
        // A RECONFERÊNCIA DO CAMINHO NOVO, num lugar só (lib/conversaDaCentral.ts): id + escritório
        // de quem pediu + recorte por dono. O `id` da URL nunca decide sozinho.
        where: recorteDaConversa(viewer, idSelecionado),
        include: {
          responsible: { select: { name: true } },
          campanha: { select: { nome: true } },
          attachments: { orderBy: { createdAt: "desc" } },
          whatsappMessages: { orderBy: { createdAt: "asc" }, include: { transcricao: true } },
          pendencias: { orderBy: [{ status: "asc" }, { dueDate: "asc" }] },
          recusas: { where: { estado: { not: "REVERTIDA" } }, orderBy: { recusadaEm: "desc" }, take: 1, include: { recusadaPor: { select: { name: true } } } },
        },
      })
    : null;

  const { telefone: telefoneDoContato, contato: contatoConhecido } = selecionado
    ? await identificarNumero(viewer.officeId, selecionado)
    : { telefone: null, contato: null };

  const recusaAtual = selecionado?.recusas[0] ?? null;
  const motivosDeRecusa = selecionado && !recusaAtual && !selecionado.convertedCaseId ? await motivosParaRecusar() : [];
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
  const agora = new Date();
  const ultimaMensagem = selecionado?.whatsappMessages[selecionado.whatsappMessages.length - 1];
  const esperandoResposta = ultimaMensagem?.direction === "IN";

  // Pediram uma conversa por id e ela não voltou: a reconferência recusou (outro escritório, de
  // outra pessoa, ou não existe). Ver CONVERSA_FORA_DO_SEU_ALCANCE — uma frase para os três.
  const pedidoNegado = Boolean(idPedido) && !selecionado;

  const hrefAba = (destino: AbaCentral) => `/atendimento-central?aba=${destino}`;
  const hrefSub = (destino: SubTriagem) => `/atendimento-central?aba=triagem&sub=${destino}`;

  return (
    <div className="flex min-h-screen flex-col bg-[var(--work-bg)]">
      {/* ── MOLDURA: barra superior ─────────────────────────────────────────────────────────── */}
      <div className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-[var(--frame-border)] bg-[var(--frame-bg)] px-5">
        <a href="/painel" className="text-etiqueta font-semibold text-[var(--frame-tx-2)] transition-colors hover:text-[var(--frame-tx-0)]">
          ← Sair para o Lúmen
        </a>
        <div className="flex items-center gap-3">
          <span className="text-etiqueta text-[var(--frame-tx-2)]">{viewer.name}</span>
          {/* Variante "cromo": a MESMA usada pelo rail e pelo blog para uma barra que nunca
              retematiza — a moldura desta tela é fixa nos dois temas, exatamente essa superfície. */}
          <ThemeToggle variant="cromo" />
        </div>
      </div>

      {/* ── MOLDURA: título + abas principais ──────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-[var(--frame-border)] bg-[var(--frame-bg)] px-5 py-3">
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-lg font-bold tracking-wide text-[var(--frame-tx-0)]">Atendimento</h1>
          {/* Só existe seletor de aba quando há mais de uma aba para escolher — mesma regra de
              components/PageSectionTabs.tsx (items.length < 2 não mostra nada para escolher). Quem
              não tem `atendimentoTotal` só tem "Atendimentos": a aba Triagem não é desabilitada,
              ela SOME — nem o botão dela é renderizado. */}
          {veTodo && (
            <div className="inline-flex overflow-hidden rounded-sm border border-[var(--frame-border-strong)]">
              <Link
                href={hrefAba("triagem")}
                className={`px-4 py-2 text-etiqueta font-bold ${
                  aba === "triagem" ? "bg-[var(--frame-accent-bg)] text-[var(--frame-tx-0)]" : "bg-[var(--frame-bg-raised)] text-[var(--frame-tx-1)] hover:text-[var(--frame-tx-0)]"
                }`}
              >
                Triagem
              </Link>
              <Link
                href={hrefAba("atendimentos")}
                className={`border-l border-[var(--frame-border-strong)] px-4 py-2 text-etiqueta font-bold ${
                  aba === "atendimentos" ? "bg-[var(--frame-accent-bg)] text-[var(--frame-tx-0)]" : "bg-[var(--frame-bg-raised)] text-[var(--frame-tx-1)] hover:text-[var(--frame-tx-0)]"
                }`}
              >
                Atendimentos
              </Link>
            </div>
          )}
        </div>

        {aba === "triagem" && veTodo && (
          <div className="mt-3 flex flex-wrap gap-4 border-b border-[var(--frame-border)]">
            <SubAba href={hrefSub("funil")} ativa={sub === "funil"} numero={1} rotulo="Funil comercial" />
            <SubAba href={hrefSub("espera")} ativa={sub === "espera"} numero={2} rotulo="Esperando resposta" contagem={esperando.length} />
            <SubAba href={hrefSub("recusados")} ativa={sub === "recusados"} numero={3} rotulo="Recusados" contagem={naFilaDeRecusados.length} />
          </div>
        )}
      </div>

      {/* ── CONTEÚDO ────────────────────────────────────────────────────────────────────────── */}
      {aba === "triagem" && veTodo && (
        <div className="flex-1 overflow-y-auto bg-[var(--work-bg)] p-5">
          {sub === "espera" && (
            <FilaDeEspera
              lista={esperando}
              expediente={cfg ? { inicio: cfg.expedienteInicio, fim: cfg.expedienteFim } : null}
              destino="central"
            />
          )}
          {sub === "recusados" && <RecusadosParaAnalise lista={naFilaDeRecusados} destino="central" />}
          {sub === "funil" && (
            <>
              <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-etiqueta font-bold uppercase tracking-wider text-tx-3">Funil comercial</h2>
                <span className="text-xs text-tx-3">arraste entre as colunas — o estágio continua sendo movido por você, nunca pelo sistema</span>
                {conversionRate !== null && (
                  <span className="ml-auto text-xs text-tx-3">
                    Taxa de conversão <span className="font-semibold tabular-nums text-concluido">{conversionRate.toFixed(0)}%</span> ({closed} de {closed + lost} decididos)
                  </span>
                )}
              </div>
              <QuadroDoFunil cards={cardsDoFunil} isAdmin={Boolean(viewer.isAdmin)} destino="central" />
            </>
          )}
        </div>
      )}

      {aba === "atendimentos" && (
        <div className="flex min-h-0 flex-1">
          {/* ── COLUNA DE LISTA ─────────────────────────────────────────────────────────────── */}
          <div className="flex w-[340px] shrink-0 flex-col border-r border-[var(--atd-border)] bg-[var(--list-bg)]">
            <div className="shrink-0 border-b border-[var(--frame-border)] bg-[var(--frame-bg-raised)] p-3">
              <form className="flex gap-1.5">
                {searchParams.status && <input type="hidden" name="status" value={searchParams.status} />}
                <input type="hidden" name="aba" value="atendimentos" />
                <input
                  type="text"
                  name="q"
                  defaultValue={searchParams.q}
                  placeholder="Buscar por nome ou assunto"
                  className="min-w-0 flex-1 border border-[var(--frame-border-strong)] bg-[var(--frame-bg)] px-2.5 py-1.5 text-xs text-[var(--frame-tx-0)] placeholder:text-[var(--frame-tx-ghost)] focus:outline-none"
                />
              </form>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {listaAtendimentos.length === 0 ? (
                <p className="p-4 text-xs text-tx-3">Nenhum atendimento encontrado.</p>
              ) : (
                listaAtendimentos.map((a) => (
                  <Link
                    key={a.id}
                    href={hrefDaConversa("central", a.id)}
                    className={`block border-b border-[var(--atd-border)] px-4 py-3 transition-colors hover:bg-[var(--list-bg-hover)] ${a.id === idSelecionado ? "bg-[var(--list-bg-hover)]" : ""}`}
                  >
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm font-medium text-tx">{a.clientName}</p>
                      <Badge color={statusColors[a.status]}>{attendanceStatusLabels[a.status] ?? a.status}</Badge>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-tx-3">{a.subject}</p>
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* ── SUPERFÍCIE DE TRABALHO: conversa ────────────────────────────────────────────── */}
          <div className="flex min-w-0 flex-1 flex-col bg-[var(--work-bg)]">
            {selecionado ? (
              <>
                <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--atd-border)] bg-[var(--work-bg-raised)] px-6 py-3">
                  <div className="min-w-0">
                    <h2 className="flex items-center gap-2 truncate text-base font-bold text-tx">
                      {esperandoResposta && (
                        <span className="bolinha-espera" role="img" aria-label="O cliente está esperando resposta" title="O cliente escreveu e ninguém respondeu" />
                      )}
                      <span className="truncate">{selecionado.clientName}</span>
                    </h2>
                    <p className="truncate text-xs text-tx-3">{selecionado.subject}</p>
                  </div>
                  <RelogioDoAtendimento prazoISO={selecionado.prazoDeRespostaAte ? selecionado.prazoDeRespostaAte.toISOString() : null} />
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                  <Conversa
                    mensagens={selecionado.whatsappMessages}
                    agora={agora}
                    nomeDoAtendente={nomeDoAtendente}
                    transferidoPor={selecionado.transferidoPor}
                    transferidoEm={selecionado.transferidoEm}
                  />
                </div>
                {/* A caixa de resposta (WhatsappReplyBox) fica fora desta etapa de propósito: não
                    está na lista de componentes a hospedar (ver o comentário no topo do arquivo) —
                    ela depende de AtendenteIaControle/AvisoDaAna, e o aviso da Ana é explicitamente
                    etapa 3. Nesta etapa a conversa é hospedada em modo de leitura. */}
              </>
            ) : (
              <div className="flex h-full items-center justify-center px-6">
                <p className="max-w-[46ch] text-center text-sm text-tx-3">
                  {pedidoNegado ? CONVERSA_FORA_DO_SEU_ALCANCE : "Selecione um atendimento à esquerda."}
                </p>
              </div>
            )}
          </div>

          {/* ── SUPERFÍCIE DE TRABALHO: trilho ──────────────────────────────────────────────── */}
          {selecionado && (
            <div className="w-[380px] shrink-0 border-l border-[var(--atd-border)] bg-[var(--work-bg)]">
              <TrilhoDoAtendimento
                attendanceId={selecionado.id}
                telefone={telefoneDoContato}
                contato={contatoConhecido}
                area={selecionado.area}
                canal={channelLabels[selecionado.channel] || selecionado.channel}
                campanha={selecionado.campanha?.nome ?? null}
                responsavel={selecionado.responsible?.name ?? null}
                abertoEm={selecionado.createdAt}
                descricao={selecionado.description}
                anexos={selecionado.attachments.map((att) => ({ id: att.id, name: att.name }))}
                pendencias={selecionado.pendencias}
                jaConvertido={Boolean(selecionado.convertedCaseId)}
              />
              {!selecionado.convertedCaseId && (
                <div className="border-t border-[var(--atd-border)] p-4" style={{ boxShadow: "var(--atd-shadow-card)" }}>
                  <RecusarLeadPainel attendanceId={selecionado.id} motivos={motivosDeRecusa} recusa={recusaNaTela} enderecoDoSite={enderecoDoSite} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SubAba({ href, ativa, numero, rotulo, contagem }: { href: string; ativa: boolean; numero: number; rotulo: string; contagem?: number }) {
  return (
    <Link
      href={href}
      className={`border-b-2 pb-2 text-etiqueta font-semibold uppercase tracking-[.06em] transition-colors ${
        ativa ? "border-[var(--frame-accent)] text-[var(--frame-tx-0)]" : "border-transparent text-[var(--frame-tx-2)] hover:text-[var(--frame-tx-0)]"
      }`}
    >
      <span className="mr-1.5 tabular-nums opacity-70">{numero}</span>
      {rotulo}
      {contagem !== undefined && <span className="ml-1.5 tabular-nums text-[var(--frame-tx-2)]">({contagem})</span>}
    </Link>
  );
}

// Mesma consulta de app/(app)/atendimento/page.tsx — extraída aqui para não crescer ainda mais o
// corpo do componente de página. `soOsMeus` não entra no retorno porque esta etapa não reescreve
// o rótulo de cabeçalho por nível (fica para a etapa de acabamento); o RECORTE por dono, que é o
// que importa para segurança, já está aplicado via `filtroDoAtendimento`.
async function carregarLista(
  viewer: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>,
  status: string | undefined,
  q: string | undefined,
) {
  const baseFilters: Prisma.AttendanceWhereInput = {
    officeId: viewer.officeId,
    ...filtroDoAtendimento(viewer, viewer.id),
    status: status || { not: "RASCUNHO" },
  };
  const termo = (q || "").trim();
  const matchingIds = termo ? await findAttendanceIdsByLooseName(termo, baseFilters) : [];
  return prisma.attendance.findMany({
    where: { ...baseFilters, ...(termo ? { id: { in: matchingIds } } : {}) },
    select: { id: true, clientName: true, subject: true, status: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}
