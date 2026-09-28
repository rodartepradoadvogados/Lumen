import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { Card, Badge, formatDate } from "@/components/ui";
import { ArrowLeft, Search, MessageSquare } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

const statusColors: Record<string, "amber" | "blue" | "green" | "slate"> = {
  NOVO: "amber",
  EM_TRIAGEM: "blue",
  CONVERTIDO: "green",
  ARQUIVADO: "slate",
  RASCUNHO: "slate",
};

const channelLabels: Record<string, string> = { WHATSAPP: "WhatsApp", EMAIL: "E-mail", TELEFONE: "Telefone", PRESENCIAL: "Presencial" };

export default async function ConversasAppPage({ searchParams }: { searchParams: { q?: string; status?: string } }) {
  const viewer = await getCurrentUser();
  if (!viewer) notFound();

  const q = (searchParams.q || "").trim();
  const statusFilter = searchParams.status;

  const baseFilters = {
    officeId: viewer.officeId,
    status: statusFilter || { not: "RASCUNHO" },
    OR: [
      { waPhone: { not: null } },
      { whatsappMessages: { some: {} } },
    ],
  };

  const conversations = await prisma.attendance.findMany({
    where: baseFilters,
    include: {
      responsible: true,
      whatsappMessages: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { whatsappMessages: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const filtered = q
    ? conversations.filter((c) =>
        c.clientName.toLowerCase().includes(q.toLowerCase()) ||
        c.subject.toLowerCase().includes(q.toLowerCase()) ||
        c.waPhone?.includes(q)
      )
    : conversations;

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link href="/atendimento-app" className="inline-flex items-center gap-1 text-corpo font-semibold text-tx-2">
        <ArrowLeft size={13} /> Triagem
      </Link>

      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-tx">Conversas</h1>
          <p className="text-sm text-tx-2">{filtered.length} conversa(s)</p>
        </div>
      </div>

      <form className="flex gap-2">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-tx-3" />
          <input type="text" name="q" defaultValue={q} placeholder="Buscar conversas..." className="w-full border border-regua bg-sf text-tx placeholder:text-tx-3 pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ouro-acento" />
        </div>
      </form>

      <Card>
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-tx-2">Nenhuma conversa de WhatsApp encontrada.</div>
        ) : (
          <div className="divide-y divide-regua">
            {filtered.map((c) => {
              const lastMsg = c.whatsappMessages[0];
              return (
                <Link key={c.id} href={`/atendimento-app/${c.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-sf-apoio transition-colors">
                  <div className="h-12 w-12 rounded-full bg-ouro-bg flex items-center justify-center shrink-0">
                    <MessageSquare size={20} className="text-ouro-acento" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-tx truncate">{c.clientName}</p>
                      {lastMsg && <span className="text-xs text-tx-3 shrink-0 whitespace-nowrap">{formatDate(lastMsg.createdAt)}</span>}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                      <Badge color={statusColors[c.status]} className="text-xs">{c.status === "EM_TRIAGEM" ? "Em Triagem" : c.status}</Badge>
                      <Badge color="navy" className="text-xs">{channelLabels[c.channel]}</Badge>
                      {c.area && <Badge color="gold" className="text-xs">{c.area}</Badge>}
                    </div>
                    <p className="text-xs text-tx-3 mt-1 truncate flex items-center gap-1">
                      {lastMsg ? (
                        <>
                          {lastMsg.direction === "OUT" && <span className="text-ouro-acento">▸</span>}
                          {lastMsg.body.substring(0, 60)}{lastMsg.body.length > 60 ? "..." : ""}
                        </>
                      ) : (
                        "Sem mensagens"
                      )}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}