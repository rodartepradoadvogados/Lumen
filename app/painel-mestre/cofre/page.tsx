import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";
import { ACCESS_REASONS } from "@/lib/supportAccessConstants";
import { LumenPanel, LumenPanelHeader, LumenStatusDot } from "@/components/painelMestre/LumenUi";

export const dynamic = "force-dynamic";

// Rótulos de status de AccessRequest — mesmo vocabulário de
// app/(app)/configuracoes/acessos/page.tsx, sem reinventar nomenclatura.
const REQUEST_STATUS_LABEL: Record<string, string> = {
  PENDENTE: "Pendente",
  APROVADO: "Aprovado",
  NEGADO: "Negado",
  EXPIRADO: "Expirado",
  REVOGADO: "Revogado",
};
const REQUEST_STATUS_TONE: Record<string, "ok" | "warn" | "risk" | "slate"> = {
  PENDENTE: "warn",
  APROVADO: "ok",
  NEGADO: "risk",
  EXPIRADO: "risk",
  REVOGADO: "risk",
};

// Mesmo rótulo de ação de app/(app)/configuracoes/acessos/page.tsx (ACTION_LABEL) — duplicado
// aqui de propósito, é um mapa local pequeno, não vale extrair para lib só por isso (mesmo
// padrão de components/AccessRequestQueue.tsx duplicando timeAgo).
const ACTION_LABEL: Record<string, string> = {
  ENTRADA: "Entrada",
  SAIDA: "Saída",
  PEDIDO: "Pedido",
  APROVACAO: "Aprovação",
  NEGACAO: "Negação",
  REVOGACAO: "Revogação",
  SELAGEM: "Selagem",
};

function reasonLabel(code: string | null | undefined): string {
  if (!code) return "—";
  return (ACCESS_REASONS as Record<string, string>)[code] ?? code;
}

function expiraEm(expiresAt: Date): string {
  const minutos = Math.round((expiresAt.getTime() - Date.now()) / 60000);
  if (minutos <= 0) return "expirando agora";
  if (minutos < 60) return `expira em ${minutos} min`;
  const horas = Math.round(minutos / 60);
  return `expira em ${horas}h`;
}

export default async function CofrePage() {
  const viewer = await getCurrentUser({ ignoreActing: true });
  if (!viewer) redirect("/");
  if (!viewer.isPlatformOwner) redirect("/painel");

  // Somente leitura — cruza todos os escritórios. Nenhuma das ações de mutação existentes em
  // lib/actions/supportAccess.ts é chamada aqui (elas são escopadas ao lado do escritório, ver
  // spec "Um limite importante").
  const [activeSessions, recentRequests, recentAudit] = await Promise.all([
    prisma.accessSession.findMany({
      where: { endedAt: null },
      include: {
        member: { include: { user: { select: { name: true } } } },
        request: { include: { office: { select: { name: true } } } },
      },
      orderBy: { startedAt: "desc" },
    }),
    prisma.accessRequest.findMany({
      include: {
        office: { select: { name: true } },
        requester: { include: { user: { select: { name: true } } } },
        approver: { include: { user: { select: { name: true } } } },
      },
      orderBy: { requestedAt: "desc" },
      take: 20,
    }),
    prisma.accessAuditLog.findMany({
      include: {
        office: { select: { name: true } },
        member: { include: { user: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  return (
    <div className="p-6 max-w-[1200px] mx-auto animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Cofre de acesso</h1>
        <p className="text-sm text-white/55 mt-1">
          Visão consolidada do acesso de suporte a todos os escritórios — somente leitura
        </p>
      </div>

      <LumenPanel>
        <LumenPanelHeader title="Sessões ativas agora" subtitle={`${activeSessions.length} sessão(ões) em andamento`} />
        {activeSessions.length === 0 ? (
          <p className="px-5 py-6 text-sm text-white/45">Nenhuma sessão ativa agora.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-semibold text-white/40 uppercase tracking-wide border-b border-white/10">
                  <th className="px-5 py-2.5 font-semibold">Escritório</th>
                  <th className="px-3 py-2.5 font-semibold">Membro</th>
                  <th className="px-3 py-2.5 font-semibold">Motivo</th>
                  <th className="px-3 py-2.5 font-semibold">Iniciada</th>
                  <th className="px-3 py-2.5 font-semibold">Expira</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {activeSessions.map((s) => (
                  <tr key={s.id}>
                    <td className="px-5 py-3 text-white">{s.request.office.name}</td>
                    <td className="px-3 py-3 text-white/80">{s.member.user?.name ?? s.member.name ?? "—"}</td>
                    <td className="px-3 py-3 text-white/70">{reasonLabel(s.request.reasonCode)}</td>
                    <td className="px-3 py-3 font-mono tabular-nums text-white/70">
                      {s.startedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-3 py-3 font-mono tabular-nums text-white/70">{expiraEm(s.expiresAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </LumenPanel>

      <LumenPanel>
        <LumenPanelHeader title="Pedidos recentes" subtitle={`Últimos ${recentRequests.length} pedido(s), todos os status`} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-semibold text-white/40 uppercase tracking-wide border-b border-white/10">
                <th className="px-5 py-2.5 font-semibold">Escritório</th>
                <th className="px-3 py-2.5 font-semibold">Solicitante</th>
                <th className="px-3 py-2.5 font-semibold">Motivo</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5 font-semibold">Aprovador</th>
                <th className="px-3 py-2.5 font-semibold">Pedido em</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {recentRequests.map((r) => (
                <tr key={r.id}>
                  <td className="px-5 py-3 text-white">{r.office.name}</td>
                  <td className="px-3 py-3 text-white/80">{r.requester.user?.name ?? r.requester.name ?? "—"}</td>
                  <td className="px-3 py-3 text-white/70">{reasonLabel(r.reasonCode)}</td>
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/80">
                      <LumenStatusDot tone={REQUEST_STATUS_TONE[r.status] ?? "slate"} />{" "}
                      {REQUEST_STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-white/60 text-xs">
                    {r.approver ? r.approver.user?.name ?? r.approver.name ?? "—" : "—"}
                  </td>
                  <td className="px-3 py-3 font-mono tabular-nums text-white/60 text-xs">
                    {r.requestedAt.toLocaleString("pt-BR")}
                  </td>
                </tr>
              ))}
              {recentRequests.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-white/40 text-sm">
                    Nenhum pedido registrado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </LumenPanel>

      <LumenPanel>
        <LumenPanelHeader title="Auditoria recente" subtitle={`Últimas ${recentAudit.length} entrada(s), todos os escritórios`} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-semibold text-white/40 uppercase tracking-wide border-b border-white/10">
                <th className="px-5 py-2.5 font-semibold">Quando</th>
                <th className="px-3 py-2.5 font-semibold">Escritório</th>
                <th className="px-3 py-2.5 font-semibold">Membro</th>
                <th className="px-3 py-2.5 font-semibold">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {recentAudit.map((log) => (
                <tr key={log.id}>
                  <td className="px-5 py-3 font-mono tabular-nums text-white/70 text-xs whitespace-nowrap">
                    {log.createdAt.toLocaleString("pt-BR")}
                  </td>
                  <td className="px-3 py-3 text-white">{log.office.name}</td>
                  <td className="px-3 py-3 text-white/80">{log.member?.user?.name ?? log.member?.name ?? "—"}</td>
                  <td className="px-3 py-3">
                    <span className="text-white/80">{ACTION_LABEL[log.action] ?? log.action}</span>
                    {log.outOfBand && (
                      <span className="ml-2 inline-flex items-center text-[10px] font-semibold uppercase tracking-wide text-atencao border border-atencao/30 bg-atencao/10 rounded px-1.5 py-0.5">
                        Fora do processo normal
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {recentAudit.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-white/40 text-sm">
                    Nenhuma entrada de auditoria registrada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </LumenPanel>
    </div>
  );
}
