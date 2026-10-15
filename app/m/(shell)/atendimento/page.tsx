import Link from "next/link";
import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { MessageSquare, Plus, Search } from "lucide-react";
import { findAttendanceIdsByLooseName } from "@/lib/looseNameSearch";
import { attendanceStatusLabels } from "@/lib/atendimentoStatus";
import Avatar from "@/components/atendimento-app/ui/Avatar";
import Selinho from "@/components/atendimento-app/ui/Selinho";
import FiltroPilula from "@/components/atendimento-app/ui/FiltroPilula";
import { ORDEM_POR_ATIVIDADE } from "@/lib/atividadeDoAtendimento";
import { tempoRelativo, previaDaMensagem, prefixoDaPrevia, estaEsperandoResposta } from "@/lib/listaDeAtendimentos";
import { filtroDoAtendimento, podeVerAtendimentos, veTodoOAtendimento } from "@/lib/acessoAtendimento";
import NovaConversaModal from "@/components/atendimento/NovaConversaModal";

export const dynamic = "force-dynamic";

const channelLabels: Record<string, string> = { WHATSAPP: "WhatsApp", EMAIL: "E-mail", TELEFONE: "Telefone", PRESENCIAL: "Presencial" };

const TABS = [
  { label: "Todos", status: undefined },
  { label: "Novo", status: "NOVO" },
  { label: "Em Triagem", status: "EM_TRIAGEM" },
  { label: "Convertido", status: "CONVERTIDO" },
  { label: "Arquivado", status: "ARQUIVADO" },
  { label: "Rascunhos", status: "RASCUNHO" },
];

export default async function MobileAtendimento({
  searchParams,
}: {
  searchParams: { status?: string; q?: string };
}) {
  const viewer = await getCurrentUser();
  if (!viewer) notFound();
  // A REGRA DO DONO: o Atendimento é de administrador e da recepção, e de mais ninguém.
  // `notFound` e não uma tela de "sem permissão": quem não pode ver não precisa saber que existe.
  if (!podeVerAtendimentos(viewer)) notFound();

  // Mesmo motivo do site: a contagem é DELE, e o rótulo tem de dizer isso.
  const soOsMeus = !veTodoOAtendimento(viewer);

  const q = (searchParams.q || "").trim();

  // Mesmo padrão de app/(app)/atendimento/page.tsx e app/m/processos/page.tsx: busca tolerante a
  // acento/pontuação via findAttendanceIdsByLooseName, em vez de contains cru (que só resolve
  // caixa, não acento).
  const baseFilters: Prisma.AttendanceWhereInput = {
    officeId: viewer.officeId,
    // O recorte por dono vai na CONSULTA — ver a nota igual em app/(app)/atendimento/page.tsx.
    ...filtroDoAtendimento(viewer, viewer.id),
    // Sem filtro de status (aba "Todos"): rascunhos ficam escondidos, só aparecem
    // na aba própria "Rascunhos" — mesma regra da lista desktop.
    status: searchParams.status || { not: "RASCUNHO" },
  };
  const matchingIds = q ? await findAttendanceIdsByLooseName(q, baseFilters) : [];
  const where: Prisma.AttendanceWhereInput = {
    ...baseFilters,
    ...(q ? { id: { in: matchingIds } } : {}),
  };

  const [attendances, totalCount, cfg] = await Promise.all([
    prisma.attendance.findMany({
      where,
      include: {
        responsible: true,
        // A última mensagem (uma por lead): prévia, "Você:/Ana:" e o fato "esperando resposta".
        whatsappMessages: { orderBy: { createdAt: "desc" }, take: 1, select: { direction: true, body: true, porAgente: true, createdAt: true } },
      },
      // Mesma ordem do app e da Central: a conversa mais ativa primeiro (lib/atividadeDoAtendimento.ts).
      orderBy: ORDEM_POR_ATIVIDADE,
      take: 100,
    }),
    // Total real (não attendances.length, que é só a página carregada, limitada pelo `take: 100`
    // acima) — sem isto o cabeçalho mentia sobre quantos atendimentos existem de fato, e um
    // atendimento além do corte por data simplesmente sumia da lista sem aviso (achado A21 da
    // revisão gauntlet, mesmo padrão de app/m/processos/page.tsx).
    prisma.attendance.count({ where }),
    prisma.whatsappConfig.findUnique({ where: { officeId: viewer.officeId }, select: { agenteNome: true } }),
  ]);
  const nomeDoAtendente = cfg?.agenteNome?.trim() || "Atendente";

  const tabHref = (status?: string) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    const s = params.toString();
    return `/m/atendimento${s ? `?${s}` : ""}`;
  };

  const agora = new Date();
  const esperandoAgora = attendances.filter((a) => estaEsperandoResposta(a.whatsappMessages[0])).length;

  // ACABAMENTO DO APP DE ATENDIMENTO (DESIGN.md §9, 15/10/2026): a mesma lista de conversas do app
  // (components/atendimento-app/ListaDeConversasApp.tsx) — título de 26px, busca em pílula, filtros em
  // pílula, linha com avatar, nome em negrito quando o cliente espera, prévia da última mensagem.
  return (
    <div className="animate-fade-in pb-4">
      <div className="flex items-start justify-between gap-3 px-4 pb-2 pt-4">
        <div className="min-w-0">
          <h1 className="text-app-titulo font-bold text-tx">{soOsMeus ? "Suas demandas" : "Atendimento"}</h1>
          <p className="mt-0.5 text-app-meta text-atd-terciario">
            {totalCount} {soOsMeus ? "repassado(s) a você" : "registro(s)"}
          </p>
          {esperandoAgora > 0 && (
            <p className="mt-2 inline-flex min-h-8 items-center gap-2 rounded-atd-pilula bg-atd-ouro-suave pl-2.5 pr-3 text-corpo font-semibold text-atd-texto-ouro">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-atd-ouro" />
              <span className="tabular-nums">{esperandoAgora}</span> esperando resposta
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Link
            href="/m/atendimento/novo"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-atd-pilula bg-atd-ouro-suave px-4 text-corpo font-semibold text-atd-texto-ouro"
          >
            <Plus size={16} aria-hidden="true" /> Novo
          </Link>
          {/* F5.5 — "iniciar conversa" é diferente de "novo atendimento": aquele registra um
              contato (qualquer canal), este manda a primeira mensagem de verdade pelo WhatsApp. */}
          <NovaConversaModal acabamento="app" />
        </div>
      </div>

      <form className="px-4 pb-2">
        {searchParams.status && <input type="hidden" name="status" value={searchParams.status} />}
        <label htmlFor="busca-m-atendimento" className="sr-only">
          Buscar por nome ou assunto
        </label>
        <div className="relative">
          <Search size={17} aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-atd-terciario" />
          <input
            id="busca-m-atendimento"
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Buscar por nome ou assunto"
            className="min-h-11 w-full rounded-atd-pilula border border-transparent bg-atd-pilula py-2 pl-11 pr-4 text-corpo text-tx placeholder:text-atd-terciario focus:border-atd-campo-borda focus:outline-none"
          />
        </div>
      </form>

      <nav aria-label="Filtrar atendimentos" className="flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => (
          <FiltroPilula key={t.label} href={tabHref(t.status)} rotulo={t.label} ativo={t.status ? searchParams.status === t.status : !searchParams.status} />
        ))}
      </nav>

      {attendances.length === 0 ? (
        <div className="px-6 py-12 text-center text-tx-2">
          <MessageSquare size={36} aria-hidden="true" className="mx-auto mb-2 text-atd-terciario" />
          <p className="text-destaque font-semibold text-tx">Nenhum atendimento encontrado</p>
          <p className="mt-1 text-corpo">{q ? `Nada para “${q}”.` : "Quando um cliente escrever, a conversa aparece aqui."}</p>
        </div>
      ) : (
        <ul className="px-2 pt-1">
          {attendances.map((a) => {
            const ultima = a.whatsappMessages[0];
            const esperando = estaEsperandoResposta(ultima);
            const prefixo = ultima ? prefixoDaPrevia(ultima, nomeDoAtendente) : "";
            return (
              <li key={a.id}>
                <Link href={`/m/atendimento/${a.id}`} className="flex min-h-[72px] gap-3.5 rounded-atd-balao px-2.5 py-[11px] hover:bg-atd-linha-hover active:bg-atd-linha-hover">
                  <Avatar nome={a.clientName} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`min-w-0 truncate text-app-nome text-tx ${esperando ? "font-bold" : "font-normal"}`}>{a.clientName}</span>
                      <time dateTime={a.ultimaAtividadeEm.toISOString()} className={`shrink-0 text-app-meta tabular-nums ${esperando ? "font-semibold text-atd-hora" : "text-atd-terciario"}`}>
                        {tempoRelativo(a.ultimaAtividadeEm, agora)}
                      </time>
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span className={`min-w-0 truncate text-app-previa ${esperando ? "text-atd-tinta" : "text-atd-previa"}`}>
                        {prefixo && <span className="text-atd-terciario">{prefixo}</span>}
                        {ultima ? previaDaMensagem(ultima.body) : a.subject}
                      </span>
                      {esperando && <span role="img" aria-label="Esperando resposta" className="h-3 w-3 shrink-0 rounded-full bg-atd-selo" />}
                    </span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Selinho tom="fase">{attendanceStatusLabels[a.status] ?? a.status}</Selinho>
                      {channelLabels[a.channel] && <Selinho>{channelLabels[a.channel]}</Selinho>}
                      {a.area && <Selinho>{a.area}</Selinho>}
                      {a.responsible && <span className="truncate text-app-meta text-atd-terciario">{a.responsible.name}</span>}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {attendances.length < totalCount && (
        <p className="px-4 pt-2 text-center text-app-meta text-atd-terciario">
          Mostrando as {attendances.length} conversas mais recentes de {totalCount}. Use a busca para encontrar as demais.
        </p>
      )}
    </div>
  );
}
