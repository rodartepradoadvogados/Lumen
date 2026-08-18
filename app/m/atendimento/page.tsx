import Link from "next/link";
import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { Card, Badge, formatDate, EmptyState } from "@/components/ui";
import { Plus, Search } from "lucide-react";
import { findAttendanceIdsByLooseName } from "@/lib/looseNameSearch";
import { attendanceStatusLabels } from "@/lib/atendimentoStatus";

export const dynamic = "force-dynamic";

const statusColors: Record<string, "amber" | "blue" | "green" | "slate"> = {
  NOVO: "amber",
  EM_TRIAGEM: "blue",
  CONVERTIDO: "green",
  ARQUIVADO: "slate",
  RASCUNHO: "slate",
};

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

  const q = (searchParams.q || "").trim();

  // Mesmo padrão de app/(app)/atendimento/page.tsx e app/m/processos/page.tsx: busca tolerante a
  // acento/pontuação via findAttendanceIdsByLooseName, em vez de contains cru (que só resolve
  // caixa, não acento).
  const baseFilters: Prisma.AttendanceWhereInput = {
    officeId: viewer.officeId,
    // Sem filtro de status (aba "Todos"): rascunhos ficam escondidos, só aparecem
    // na aba própria "Rascunhos" — mesma regra da lista desktop.
    status: searchParams.status || { not: "RASCUNHO" },
  };
  const matchingIds = q ? await findAttendanceIdsByLooseName(q, baseFilters) : [];
  const where: Prisma.AttendanceWhereInput = {
    ...baseFilters,
    ...(q ? { id: { in: matchingIds } } : {}),
  };

  const [attendances, totalCount] = await Promise.all([
    prisma.attendance.findMany({
      where,
      include: { responsible: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    // Total real (não attendances.length, que é só a página carregada, limitada pelo `take: 100`
    // acima) — sem isto o cabeçalho mentia sobre quantos atendimentos existem de fato, e um
    // atendimento além do corte por data simplesmente sumia da lista sem aviso (achado A21 da
    // revisão gauntlet, mesmo padrão de app/m/processos/page.tsx).
    prisma.attendance.count({ where }),
  ]);

  const tabHref = (status?: string) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    const s = params.toString();
    return `/m/atendimento${s ? `?${s}` : ""}`;
  };

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-tx">Atendimento</h1>
          <p className="text-sm text-tx-2">{totalCount} registro(s)</p>
        </div>
        <Link
          href="/m/atendimento/novo"
          className="inline-flex items-center gap-1.5 bg-acao hover:bg-acao-hover text-acao-tx text-xs font-semibold px-3 py-2 rounded-lg shrink-0"
        >
          <Plus size={14} /> Novo
        </Link>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
        {TABS.map((t) => {
          const active = t.status ? searchParams.status === t.status : !searchParams.status;
          return (
            <Link
              key={t.label}
              href={tabHref(t.status)}
              className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                active
                  ? "bg-acao text-acao-tx"
                  : "bg-sf text-tx-2 border border-regua"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      <form className="flex gap-2">
        {searchParams.status && <input type="hidden" name="status" value={searchParams.status} />}
        <div className="relative flex-1">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-tx-3" />
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Buscar por nome ou assunto"
            className="w-full border border-regua bg-sf text-tx placeholder:text-tx-3 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-acao/40"
          />
        </div>
        <button type="submit" className="bg-acao text-acao-tx text-sm font-semibold rounded-lg px-4 py-2">
          Buscar
        </button>
      </form>

      <Card>
        {attendances.length === 0 ? (
          <EmptyState title="Nenhum atendimento encontrado" />
        ) : (
          <div className="divide-y divide-regua">
            {attendances.map((a) => (
              <Link
                key={a.id}
                href={`/m/atendimento/${a.id}`}
                className="flex items-center gap-3 px-4 py-3.5 hover:bg-sf-apoio transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-tx truncate">{a.clientName}</p>
                    <Badge color={statusColors[a.status]}>{attendanceStatusLabels[a.status] ?? a.status}</Badge>
                  </div>
                  <p className="text-xs text-tx-2 mt-0.5 truncate">{a.subject}</p>
                  <div className="flex items-center gap-2 flex-wrap mt-1">
                    <Badge color="navy">{channelLabels[a.channel]}</Badge>
                    {a.area && <Badge color="gold">{a.area}</Badge>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-tx-2">{formatDate(a.createdAt)}</p>
                  {a.responsible && <p className="text-xs text-tx-2 mt-0.5">{a.responsible.name}</p>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>

      {attendances.length < totalCount && (
        <p className="text-xs text-tx-2 text-center">
          Mostrando os {attendances.length} mais recentes de {totalCount} — use a busca para encontrar os demais
        </p>
      )}
    </div>
  );
}
