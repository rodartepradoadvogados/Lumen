import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { Card, CardHeader, Badge, EmptyState, formatCurrency, formatDate } from "@/components/ui";
import EditClientModal from "@/components/EditClientModal";
import { ArrowLeft, Scale, FileText } from "lucide-react";

export const dynamic = "force-dynamic";

const caseStatusColors: Record<string, "green" | "amber" | "slate" | "red"> = {
  ATIVO: "green",
  SUSPENSO: "amber",
  ENCERRADO: "slate",
  ARQUIVADO: "red",
};

const recStatusColor: Record<string, "green" | "red" | "amber"> = { PAGO: "green", ATRASADO: "red", PENDENTE: "amber", CANCELADO: "red" };

function field(label: string, value: string | null | undefined) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold text-navy-800/40 dark:text-cream-50/40 uppercase tracking-wide">{label}</p>
      <p className="text-sm text-navy-900 dark:text-cream-50 mt-0.5">{value}</p>
    </div>
  );
}

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const viewer = await getCurrentUser();
  if (!viewer) notFound();
  const hasFinanceAccess = Boolean(viewer.isAdmin || viewer.financeAccess);

  const client = await prisma.client.findFirst({
    where: { id: params.id, officeId: viewer.officeId },
    include: {
      cases: { include: { responsible: true }, orderBy: { title: "asc" } },
      publications: { include: { case: true }, orderBy: { publishedAt: "desc" }, take: 50 },
    },
  });

  if (!client) notFound();

  const now = new Date();
  const receivables = hasFinanceAccess
    ? await prisma.receivable.findMany({ where: { clientId: client.id, officeId: viewer.officeId }, orderBy: { dueDate: "asc" } })
    : [];
  const totalReceivable = receivables.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="p-6 max-w-[1100px] mx-auto animate-fade-in space-y-5">
      <Link href="/contatos/clientes" className="text-xs font-semibold text-navy-800/50 dark:text-cream-50/50 hover:text-navy-900 dark:hover:text-cream-50 flex items-center gap-1">
        <ArrowLeft size={14} /> Clientes
      </Link>

      <Card>
        <div className="flex items-start justify-between px-5 py-4 border-b border-navy-800/8 dark:border-white/10">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-serif text-xl font-bold text-navy-900 dark:text-cream-50">{client.name}</h1>
            <Badge color={client.type === "PJ" ? "navy" : "slate"}>{client.type === "PJ" ? "Pessoa Jurídica" : "Pessoa Física"}</Badge>
          </div>
          <EditClientModal client={client} />
        </div>
        <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-4">
          {field("CPF/CNPJ", client.document)}
          {field("RG", client.rg)}
          {field("E-mail", client.email)}
          {field("Telefone", client.phone)}
          {field("Nacionalidade", client.nationality)}
          {field("Estado civil", client.maritalStatus)}
          {field("Profissão", client.profession)}
          {field("Endereço", client.address)}
          {field("Cadastrado em", formatDate(client.createdAt))}
        </div>
        {client.notes && (
          <div className="px-5 pb-5">
            <p className="text-[11px] font-semibold text-navy-800/40 dark:text-cream-50/40 uppercase tracking-wide">Observações</p>
            <p className="text-sm text-navy-800 dark:text-cream-50/80 mt-0.5 whitespace-pre-wrap">{client.notes}</p>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Processos do cliente" subtitle={`${client.cases.length} registro(s)`} />
        {client.cases.length === 0 ? (
          <EmptyState title="Nenhum processo vinculado" />
        ) : (
          <div className="divide-y divide-navy-800/5 dark:divide-white/10">
            {client.cases.map((c) => (
              <Link key={c.id} href={`/processos/${c.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-cream-50 dark:hover:bg-white/5 transition-colors">
                <div className="h-9 w-9 rounded-lg bg-navy-900/5 text-navy-800 dark:bg-white/10 dark:text-cream-50 flex items-center justify-center shrink-0">
                  <Scale size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-navy-900 dark:text-cream-50 truncate">{c.title}</p>
                    <Badge color={caseStatusColors[c.status]}>{c.status}</Badge>
                    {c.area && <Badge color="gold">{c.area}</Badge>}
                  </div>
                  <p className="text-xs text-navy-800/45 dark:text-cream-50/45 mt-0.5 truncate">
                    {c.processNumber ? `${c.processNumber} · ` : ""}
                    {c.responsible?.name ?? "Sem responsável"}
                  </p>
                </div>
                {c.caseValue != null && <p className="text-sm font-semibold text-navy-900 dark:text-cream-50 shrink-0">{formatCurrency(c.caseValue)}</p>}
              </Link>
            ))}
          </div>
        )}
      </Card>

      {hasFinanceAccess && (
        <Card>
          <CardHeader title="Financeiro" subtitle={`${receivables.length} lançamento(s) a receber · Total ${formatCurrency(totalReceivable)}`} />
          {receivables.length === 0 ? (
            <EmptyState title="Nenhum lançamento a receber" />
          ) : (
            <div className="divide-y divide-navy-800/5 dark:divide-white/10">
              {receivables.map((r) => {
                const effectiveStatus = r.status === "PENDENTE" && r.dueDate < now && !r.noDueDate ? "ATRASADO" : r.status;
                return (
                  <div key={r.id} className="flex items-center gap-4 px-5 py-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-navy-900 dark:text-cream-50">{r.description}</p>
                      <p className="text-xs text-navy-800/45 dark:text-cream-50/45 mt-0.5">{r.noDueDate ? "Sem vencimento" : formatDate(r.dueDate)}</p>
                    </div>
                    <p className="text-sm font-semibold text-navy-900 dark:text-cream-50 shrink-0">{formatCurrency(r.amount)}</p>
                    <Badge color={recStatusColor[effectiveStatus]}>{effectiveStatus}</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      <Card>
        <CardHeader title="Publicações vinculadas" subtitle={`${client.publications.length} registro(s)`} />
        {client.publications.length === 0 ? (
          <EmptyState title="Nenhuma publicação vinculada" />
        ) : (
          <div className="divide-y divide-navy-800/5 dark:divide-white/10">
            {client.publications.map((p) => (
              <div key={p.id} className="flex items-start gap-3 px-5 py-3.5">
                <div className="h-9 w-9 rounded-lg bg-navy-900/5 text-navy-800 dark:bg-white/10 dark:text-cream-50 flex items-center justify-center shrink-0">
                  <FileText size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge color={p.kind === "PUBLICACAO" ? "blue" : "gold"}>{p.kind === "PUBLICACAO" ? "Publicação" : "Andamento"}</Badge>
                    {!p.read && <Badge color="gold">Não lida</Badge>}
                    <span className="text-xs text-navy-800/40 dark:text-cream-50/40">{formatDate(p.publishedAt)}</span>
                  </div>
                  {p.case && (
                    <Link href={`/processos/${p.case.id}`} className="text-xs font-medium text-gold-700 dark:text-gold-400 hover:underline mt-0.5 block">
                      {p.case.title}
                    </Link>
                  )}
                  <p className="text-sm text-navy-800 dark:text-cream-50/80 mt-1 line-clamp-2">{p.content}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
