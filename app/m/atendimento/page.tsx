import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { Card, Badge, formatDate, EmptyState } from "@/components/ui";
import { Plus, Search } from "lucide-react";

export const dynamic = "force-dynamic";

const statusColors: Record<string, "amber" | "blue" | "green" | "slate"> = {
  NOVO: "amber",
  EM_TRIAGEM: "blue",
  CONVERTIDO: "green",
  ARQUIVADO: "slate",
  RASCUNHO: "slate",
};

const statusLabels: Record<string, string> = {
  RASCUNHO: "Rascunho",
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

  const attendances = await prisma.attendance.findMany({
    where: {
      officeId: viewer.officeId,
      // Sem filtro de status (aba "Todos"): rascunhos ficam escondidos, só aparecem
      // na aba própria "Rascunhos" — mesma regra da lista desktop.
      status: searchParams.status || { not: "RASCUNHO" },
      ...(q
        ? {
            OR: [
              { clientName: { contains: q, mode: "insensitive" } },
              { subject: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { responsible: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

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
          <h1 className="font-serif text-xl font-bold text-navy-900 dark:text-cream-50">Atendimento</h1>
          <p className="text-sm text-navy-800/50 dark:text-cream-50/50">{attendances.length} registro(s)</p>
        </div>
        <Link
          href="/m/atendimento/novo"
          className="inline-flex items-center gap-1.5 bg-gold-600 hover:bg-gold-700 dark:bg-gold-500 dark:hover:bg-gold-600 text-white text-xs font-semibold px-3 py-2 rounded-lg shrink-0"
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
                  ? "bg-navy-900 dark:bg-gold-500 text-white dark:text-navy-950"
                  : "bg-white dark:bg-navy-900 text-navy-800/60 dark:text-cream-50/60 border border-navy-800/10 dark:border-white/10"
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
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-navy-800/30 dark:text-cream-50/30" />
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Buscar por nome ou assunto"
            className="w-full border border-navy-800/12 dark:border-white/10 bg-white dark:bg-navy-900 text-navy-900 dark:text-cream-50 placeholder:text-navy-800/40 dark:placeholder:text-cream-50/30 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-500/40"
          />
        </div>
        <button type="submit" className="bg-navy-900 dark:bg-gold-600 text-white text-sm font-semibold rounded-lg px-4 py-2">
          Buscar
        </button>
      </form>

      <Card>
        {attendances.length === 0 ? (
          <EmptyState title="Nenhum atendimento encontrado" />
        ) : (
          <div className="divide-y divide-navy-800/5 dark:divide-white/10">
            {attendances.map((a) => (
              <Link
                key={a.id}
                href={`/m/atendimento/${a.id}`}
                className="flex items-center gap-3 px-4 py-3.5 hover:bg-cream-50 dark:hover:bg-white/5 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-navy-900 dark:text-cream-50 truncate">{a.clientName}</p>
                    <Badge color={statusColors[a.status]}>{statusLabels[a.status] ?? a.status.replace("_", " ")}</Badge>
                  </div>
                  <p className="text-xs text-navy-800/45 dark:text-cream-50/45 mt-0.5 truncate">{a.subject}</p>
                  <div className="flex items-center gap-2 flex-wrap mt-1">
                    <Badge color="navy">{channelLabels[a.channel]}</Badge>
                    {a.area && <Badge color="gold">{a.area}</Badge>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-navy-800/40 dark:text-cream-50/40">{formatDate(a.createdAt)}</p>
                  {a.responsible && <p className="text-xs text-navy-800/50 dark:text-cream-50/50 mt-0.5">{a.responsible.name}</p>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
