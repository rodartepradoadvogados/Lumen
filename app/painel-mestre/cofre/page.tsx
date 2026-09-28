import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";
import { ACCESS_REASONS } from "@/lib/supportAccessConstants";
import { LumenPanel, LumenPanelHeader, LumenStatusDot, LumenAbas, LumenAba } from "@/components/painelMestre/LumenUi";
import { horaDeBrasilia } from "@/lib/horaDeBrasilia";
import { FUSO_DO_ESCRITORIO } from "@/lib/horaDeBrasilia";

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

// O diagnóstico chamou esta tela de caso extremo do Painel da Empresa: três tabelas de cinco e
// seis colunas empilhadas na vertical, sem abas, sem divisão, sem uso da largura — enquanto a tela
// de escritório ([officeId]) tinha abas de verdade desde sempre. O padrão certo já estava escrito;
// faltava propagá-lo. As três tabelas viram três abas, e a contagem entra na própria aba.
const ABAS = [
  { key: "sessoes", label: "Sessões ativas" },
  { key: "pedidos", label: "Pedidos recentes" },
  { key: "auditoria", label: "Auditoria" },
];

export default async function CofrePage({ searchParams }: { searchParams: { aba?: string } }) {
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

  const aba = ABAS.some((a) => a.key === searchParams.aba) ? searchParams.aba! : "sessoes";
  const contagens: Record<string, number> = {
    sessoes: activeSessions.length,
    pedidos: recentRequests.length,
    auditoria: recentAudit.length,
  };

  return (
    <div className="p-6 max-w-[1200px] mx-auto animate-fade-in space-y-6">
      <div>
        <h1 className="text-autuacao font-bold text-tx leading-tight">Cofre de acesso</h1>
        <p className="text-corpo text-tx-2 mt-1">
          Visão consolidada do acesso de suporte a todos os escritórios — somente leitura
        </p>
      </div>

      <LumenAbas>
        {ABAS.map((a) => (
          <LumenAba key={a.key} href={`/painel-mestre/cofre?aba=${a.key}`} ativa={aba === a.key} contagem={contagens[a.key]}>
            {a.label}
          </LumenAba>
        ))}
      </LumenAbas>

      {aba === "sessoes" && (
      <LumenPanel>
        <LumenPanelHeader title="Sessões ativas agora" subtitle={`${activeSessions.length} sessão(ões) em andamento`} />
        {activeSessions.length === 0 ? (
          <p className="px-5 py-6 text-sm text-tx-3">Nenhuma sessão ativa agora.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-etiqueta font-semibold text-tx-3 uppercase tracking-wide border-b border-regua">
                  <th className="px-5 py-2.5 font-semibold">Escritório</th>
                  <th className="px-3 py-2.5 font-semibold">Membro</th>
                  <th className="px-3 py-2.5 font-semibold">Motivo</th>
                  <th className="px-3 py-2.5 font-semibold">Iniciada</th>
                  <th className="px-3 py-2.5 font-semibold">Expira</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-regua">
                {activeSessions.map((s) => (
                  <tr key={s.id}>
                    <td className="px-5 py-3 text-tx">{s.request.office.name}</td>
                    <td className="px-3 py-3 text-tx-2">{s.member.user?.name ?? s.member.name ?? "—"}</td>
                    <td className="px-3 py-3 text-tx-2">{reasonLabel(s.request.reasonCode)}</td>
                    <td className="px-3 py-3 font-mono tabular-nums text-tx-2">
                      {horaDeBrasilia(s.startedAt)}
                    </td>
                    <td className="px-3 py-3 font-mono tabular-nums text-tx-2">{expiraEm(s.expiresAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </LumenPanel>
      )}

      {aba === "pedidos" && (
      <LumenPanel>
        <LumenPanelHeader title="Pedidos recentes" subtitle={`Últimos ${recentRequests.length} pedido(s), todos os status`} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-etiqueta font-semibold text-tx-3 uppercase tracking-wide border-b border-regua">
                <th className="px-5 py-2.5 font-semibold">Escritório</th>
                <th className="px-3 py-2.5 font-semibold">Solicitante</th>
                <th className="px-3 py-2.5 font-semibold">Motivo</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5 font-semibold">Aprovador</th>
                <th className="px-3 py-2.5 font-semibold">Pedido em</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-regua">
              {recentRequests.map((r) => (
                <tr key={r.id}>
                  <td className="px-5 py-3 text-tx">{r.office.name}</td>
                  <td className="px-3 py-3 text-tx-2">{r.requester.user?.name ?? r.requester.name ?? "—"}</td>
                  <td className="px-3 py-3 text-tx-2">{reasonLabel(r.reasonCode)}</td>
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-tx-2">
                      <LumenStatusDot tone={REQUEST_STATUS_TONE[r.status] ?? "slate"} />{" "}
                      {REQUEST_STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-tx-2 text-xs">
                    {r.approver ? r.approver.user?.name ?? r.approver.name ?? "—" : "—"}
                  </td>
                  <td className="px-3 py-3 font-mono tabular-nums text-tx-2 text-xs">
                    {r.requestedAt.toLocaleString("pt-BR", { timeZone: FUSO_DO_ESCRITORIO })}
                  </td>
                </tr>
              ))}
              {recentRequests.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-tx-3 text-sm">
                    Nenhum pedido registrado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </LumenPanel>
      )}

      {aba === "auditoria" && (
      <LumenPanel>
        <LumenPanelHeader title="Auditoria recente" subtitle={`Últimas ${recentAudit.length} entrada(s), todos os escritórios`} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-etiqueta font-semibold text-tx-3 uppercase tracking-wide border-b border-regua">
                <th className="px-5 py-2.5 font-semibold">Quando</th>
                <th className="px-3 py-2.5 font-semibold">Escritório</th>
                <th className="px-3 py-2.5 font-semibold">Membro</th>
                <th className="px-3 py-2.5 font-semibold">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-regua">
              {recentAudit.map((log) => (
                <tr key={log.id}>
                  <td className="px-5 py-3 font-mono tabular-nums text-tx-2 text-xs whitespace-nowrap">
                    {log.createdAt.toLocaleString("pt-BR", { timeZone: FUSO_DO_ESCRITORIO })}
                  </td>
                  <td className="px-3 py-3 text-tx">{log.office.name}</td>
                  <td className="px-3 py-3 text-tx-2">{log.member?.user?.name ?? log.member?.name ?? "—"}</td>
                  <td className="px-3 py-3">
                    <span className="text-tx-2">{ACTION_LABEL[log.action] ?? log.action}</span>
                    {log.outOfBand && (
                      <span className="ml-2 inline-flex items-center text-etiqueta font-semibold uppercase tracking-wide text-atencao border border-linha-grave bg-grave-bg rounded px-1.5 py-0.5">
                        Fora do processo normal
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {recentAudit.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-tx-3 text-sm">
                    Nenhuma entrada de auditoria registrada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </LumenPanel>
      )}
    </div>
  );
}
