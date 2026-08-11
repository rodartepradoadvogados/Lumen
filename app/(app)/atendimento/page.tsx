import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { PageHeader, Card, Badge, formatDate, EmptyState } from "@/components/ui";
import NewAttendanceModal from "@/components/NewAttendanceModal";
import DeleteEntityButton from "@/components/DeleteEntityButton";
import Link from "next/link";
import { redirect } from "next/navigation";
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
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");

  const q = (searchParams.q || "").trim();
  const attendances = await prisma.attendance.findMany({
    where: {
      officeId: viewer.officeId,
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
  const users = await prisma.user.findMany({ where: { active: true, officeId: viewer.officeId }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const assessoriasRaw = await prisma.assessoria.findMany({ where: { status: "ATIVA", officeId: viewer.officeId }, include: { client: true }, orderBy: { client: { name: "asc" } } });
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
              className="inline-flex items-center gap-1.5 bg-sf text-tx-2 border border-regua hover:bg-sf-apoio text-sm font-semibold px-3.5 py-2 rounded-lg transition-colors"
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
      <p className="text-xs italic text-tx-3 mt-1 mb-3">
        Rascunhos são atendimentos iniciados mas não finalizados — continue de onde parou a qualquer momento.
      </p>

      <form className="mb-4 flex gap-2">
        {searchParams.status && <input type="hidden" name="status" value={searchParams.status} />}
        <input
          type="text"
          name="q"
          defaultValue={searchParams.q}
          placeholder="Buscar por nome do cliente ou assunto"
          className="flex-1 border border-regua-forte bg-sf text-tx placeholder:text-tx-3 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-acao-bg"
        />
        <button type="submit" className="bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold rounded-lg px-4 py-2 transition-colors">
          Buscar
        </button>
        {q && (
          <Link href={statusHref(searchParams.status)} className="text-xs font-semibold text-tx-3 hover:text-tx px-2 flex items-center">
            Limpar
          </Link>
        )}
      </form>

      <Card>
        {attendances.length === 0 ? (
          <EmptyState title="Nenhum atendimento registrado" />
        ) : (
          <div className="divide-y divide-regua">
            {attendances.map((a) => (
              <Link key={a.id} href={`/atendimento/${a.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-sf-apoio transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-tx">{a.clientName}</p>
                    <Badge color={statusColors[a.status]}>{statusLabels[a.status] ?? a.status.replace("_", " ")}</Badge>
                    <Badge color="navy">{channelLabels[a.channel]}</Badge>
                    {a.area && <Badge color="gold">{a.area}</Badge>}
                  </div>
                  <p className="text-xs text-tx-3 mt-0.5">{a.subject}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-tx-3">{formatDate(a.createdAt)}</p>
                  {a.responsible && <p className="text-xs text-tx-3 mt-0.5">{a.responsible.name}</p>}
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

      <p className="text-xs text-tx-3 mt-4">
        Assim que um atendimento evoluir para um processo, crie o card em{" "}
        <Link href="/processos/novo" className="text-acao hover:underline">
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
        active ? "bg-acao text-acao-tx" : "bg-sf text-tx-2 border border-regua hover:bg-sf-apoio"
      }`}
    >
      {label.toLowerCase()}
    </Link>
  );
}
