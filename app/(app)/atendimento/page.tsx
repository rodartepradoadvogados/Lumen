import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge, formatDate, EmptyState } from "@/components/ui";
import NewAttendanceModal from "@/components/NewAttendanceModal";
import DeleteEntityButton from "@/components/DeleteEntityButton";
import Link from "next/link";
import { Filter } from "lucide-react";

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

export default async function AtendimentoPage({ searchParams }: { searchParams: { status?: string; novo?: string; q?: string } }) {
  const q = (searchParams.q || "").trim();
  const attendances = await prisma.attendance.findMany({
    where: {
      // Sem filtro de status (aba "Todos"): rascunhos ficam escondidos, só aparecem
      // na aba própria "Rascunhos" — não fazem parte da triagem normal.
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
  });
  const users = await prisma.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const assessoriasRaw = await prisma.assessoria.findMany({ where: { status: "ATIVA" }, include: { client: true }, orderBy: { client: { name: "asc" } } });
  const assessorias = assessoriasRaw.map((a) => ({ id: a.id, clientName: a.client.name }));

  const statusHref = (status?: string) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    const s = params.toString();
    return `/atendimento${s ? `?${s}` : ""}`;
  };

  return (
    <div className="p-6 max-w-[1100px] mx-auto animate-fade-in">
      <PageHeader
        title="Atendimento"
        subtitle="Triagem de novos contatos antes de virarem processos/casos"
        action={
          <div className="flex items-center gap-2">
            <Link
              href="/atendimento/funil"
              className="inline-flex items-center gap-1.5 bg-white dark:bg-navy-900 text-navy-800/70 dark:text-cream-50/70 border border-navy-800/10 dark:border-white/10 hover:bg-cream-100 dark:hover:bg-white/10 text-sm font-semibold px-3.5 py-2 rounded-lg transition-colors"
            >
              <Filter size={16} /> Funil Comercial
            </Link>
            <NewAttendanceModal users={users} assessorias={assessorias} autoOpen={searchParams.novo === "1"} />
          </div>
        }
      />

      <div className="flex gap-2 mb-1 flex-wrap">
        <FilterLink label="Todos" href={statusHref()} active={!searchParams.status} />
        {["NOVO", "EM_TRIAGEM", "CONVERTIDO", "ARQUIVADO", "RASCUNHO"].map((s) => (
          <FilterLink key={s} label={statusLabels[s] ?? s.replace("_", " ")} href={statusHref(s)} active={searchParams.status === s} />
        ))}
      </div>
      <p className="text-xs italic text-slate-600 dark:text-cream-50/45 mt-1 mb-3">
        Rascunhos são atendimentos iniciados mas não finalizados — continue de onde parou a qualquer momento.
      </p>

      <form className="mb-4 flex gap-2">
        {searchParams.status && <input type="hidden" name="status" value={searchParams.status} />}
        <input
          type="text"
          name="q"
          defaultValue={searchParams.q}
          placeholder="Buscar por nome do cliente ou assunto"
          className="flex-1 border border-navy-800/12 dark:border-white/10 bg-white dark:bg-navy-900 text-navy-900 dark:text-cream-50 placeholder:text-navy-800/40 dark:placeholder:text-cream-50/30 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-500/40"
        />
        <button type="submit" className="bg-navy-900 hover:bg-navy-800 text-white text-sm font-semibold rounded-lg px-4 py-2">
          Buscar
        </button>
        {q && (
          <Link href={statusHref(searchParams.status)} className="text-xs font-semibold text-navy-800/50 dark:text-cream-50/50 hover:text-navy-900 dark:hover:text-cream-50 px-2 flex items-center">
            Limpar
          </Link>
        )}
      </form>

      <Card>
        {attendances.length === 0 ? (
          <EmptyState title="Nenhum atendimento registrado" />
        ) : (
          <div className="divide-y divide-navy-800/5 dark:divide-white/10">
            {attendances.map((a) => (
              <Link key={a.id} href={`/atendimento/${a.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-cream-50 dark:hover:bg-white/5 transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-navy-900 dark:text-cream-50">{a.clientName}</p>
                    <Badge color={statusColors[a.status]}>{statusLabels[a.status] ?? a.status.replace("_", " ")}</Badge>
                    <Badge color="navy">{channelLabels[a.channel]}</Badge>
                    {a.area && <Badge color="gold">{a.area}</Badge>}
                  </div>
                  <p className="text-xs text-navy-800/45 dark:text-cream-50/45 mt-0.5">{a.subject}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-navy-800/40 dark:text-cream-50/40">{formatDate(a.createdAt)}</p>
                  {a.responsible && <p className="text-xs text-navy-800/50 dark:text-cream-50/50 mt-0.5">{a.responsible.name}</p>}
                </div>
                <DeleteEntityButton
                  entityType="ATTENDANCE"
                  entityId={a.id}
                  entityLabel={`${a.clientName} — ${a.subject}`}
                  confirmMessage={`Excluir o atendimento de "${a.clientName}"?`}
                />
              </Link>
            ))}
          </div>
        )}
      </Card>

      <p className="text-xs text-navy-800/40 dark:text-cream-50/40 mt-4">
        Assim que um atendimento evoluir para um processo, crie o card em{" "}
        <Link href="/processos/novo" className="text-gold-700 dark:text-gold-400 hover:underline">
          Processos e Casos
        </Link>
        .
      </p>
    </div>
  );
}

function FilterLink({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors capitalize ${
        active
          ? "bg-navy-900 dark:bg-gold-500 text-white dark:text-navy-950"
          : "bg-white dark:bg-navy-900 text-navy-800/60 dark:text-cream-50/60 border border-navy-800/10 dark:border-white/10 hover:bg-cream-100 dark:hover:bg-white/10"
      }`}
    >
      {label.toLowerCase()}
    </Link>
  );
}
