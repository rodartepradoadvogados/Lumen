import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge, formatDate, EmptyState } from "@/components/ui";
import NewAttendanceModal from "@/components/NewAttendanceModal";
import DeleteEntityButton from "@/components/DeleteEntityButton";
import Link from "next/link";

export const dynamic = "force-dynamic";

const statusColors: Record<string, "amber" | "blue" | "green" | "slate"> = {
  NOVO: "amber",
  EM_TRIAGEM: "blue",
  CONVERTIDO: "green",
  ARQUIVADO: "slate",
};

const channelLabels: Record<string, string> = { WHATSAPP: "WhatsApp", EMAIL: "E-mail", TELEFONE: "Telefone", PRESENCIAL: "Presencial" };

export default async function AtendimentoPage({ searchParams }: { searchParams: { status?: string } }) {
  const attendances = await prisma.attendance.findMany({
    where: { status: searchParams.status || undefined },
    include: { responsible: true },
    orderBy: { createdAt: "desc" },
  });
  const users = await prisma.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });

  return (
    <div className="p-6 max-w-[1100px] mx-auto animate-fade-in">
      <PageHeader title="Atendimento" subtitle="Triagem de novos contatos antes de virarem processos/casos" action={<NewAttendanceModal users={users} />} />

      <div className="flex gap-2 mb-4 flex-wrap">
        <FilterLink label="Todos" href="/atendimento" active={!searchParams.status} />
        {["NOVO", "EM_TRIAGEM", "CONVERTIDO", "ARQUIVADO"].map((s) => (
          <FilterLink key={s} label={s.replace("_", " ")} href={`/atendimento?status=${s}`} active={searchParams.status === s} />
        ))}
      </div>

      <Card>
        {attendances.length === 0 ? (
          <EmptyState title="Nenhum atendimento registrado" />
        ) : (
          <div className="divide-y divide-navy-800/5">
            {attendances.map((a) => (
              <Link key={a.id} href={`/atendimento/${a.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-cream-50 transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-navy-900">{a.clientName}</p>
                    <Badge color={statusColors[a.status]}>{a.status.replace("_", " ")}</Badge>
                    <Badge color="navy">{channelLabels[a.channel]}</Badge>
                    {a.area && <Badge color="gold">{a.area}</Badge>}
                  </div>
                  <p className="text-xs text-navy-800/45 mt-0.5">{a.subject}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-navy-800/40">{formatDate(a.createdAt)}</p>
                  {a.responsible && <p className="text-xs text-navy-800/50 mt-0.5">{a.responsible.name}</p>}
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

      <p className="text-xs text-navy-800/40 mt-4">
        Assim que um atendimento evoluir para um processo, crie o card em{" "}
        <Link href="/processos/novo" className="text-gold-700 hover:underline">
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
        active ? "bg-navy-900 text-white" : "bg-white text-navy-800/60 border border-navy-800/10 hover:bg-cream-100"
      }`}
    >
      {label.toLowerCase()}
    </Link>
  );
}
