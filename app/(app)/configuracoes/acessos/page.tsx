import Link from "next/link";
import { getCurrentUser } from "@/lib/currentUser";
import { getActiveSupportSession, listOfficeAccessLog } from "@/lib/supportAccess";
import { ACCESS_REASONS, type AccessReasonCode } from "@/lib/supportAccessConstants";
import { PageHeader, Card, CardHeader, Badge } from "@/components/ui";
import EndSupportAccessButton from "@/components/EndSupportAccessButton";
import { ShieldCheck, ShieldAlert } from "lucide-react";

export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, string> = {
  ENTRADA: "Entrada",
  SAIDA: "Saída",
  PEDIDO: "Pedido",
  APROVACAO: "Aprovação",
  NEGACAO: "Negação",
  REVOGACAO: "Revogação",
  SELAGEM: "Selagem",
};

// Página de transparência do escritório (Passo 2): visível a QUALQUER usuário do escritório,
// não só admin — é justamente o ponto. Só leitura: ninguém apaga nada por aqui, e não existe
// nenhuma ação de escrita nesta tela além de encerrar a sessão ativa (que é uma saída, não uma
// edição do histórico).
export default async function AcessosPage() {
  const viewer = await getCurrentUser();
  if (!viewer) return null;

  const [activeSession, log] = await Promise.all([
    getActiveSupportSession(viewer.officeId),
    listOfficeAccessLog(viewer.officeId, 90),
  ]);

  const totalEntradas = log.filter((l) => l.action === "ENTRADA").length;

  return (
    <div className="p-6 max-w-[900px] mx-auto animate-fade-in space-y-6">
      <Link
        href="/configuracoes"
        className="text-xs font-semibold text-navy-800/50 dark:text-cream-50/50 hover:text-navy-900 dark:hover:text-cream-50"
      >
        ← Configurações
      </Link>
      <PageHeader
        title="Acessos da Lúmen"
        subtitle="Toda vez que o suporte da Lúmen precisa entrar nos dados do seu escritório, fica registrado aqui — com motivo, chamado e prazo curto."
      />

      <Card>
        <div className="p-5 flex items-center gap-3">
          {totalEntradas === 0 ? (
            <>
              <ShieldCheck size={22} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
              <p className="text-sm text-navy-900 dark:text-cream-50">
                Nos últimos 90 dias, a Lúmen <strong>não acessou</strong> os dados do seu escritório nenhuma vez.
              </p>
            </>
          ) : (
            <>
              <ShieldAlert size={22} className="text-gold-600 dark:text-gold-400 shrink-0" />
              <p className="text-sm text-navy-900 dark:text-cream-50">
                Nos últimos 90 dias, a Lúmen acessou dados do seu escritório <strong>{totalEntradas}</strong>{" "}
                {totalEntradas === 1 ? "vez" : "vezes"}.
              </p>
            </>
          )}
        </div>
      </Card>

      {activeSession && (
        <Card>
          <CardHeader title="Sessão ativa agora" subtitle="Alguém da Lúmen está com acesso ao seu escritório neste momento" />
          <div className="p-5 flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-navy-900 dark:text-cream-50">
              <p>
                <strong>{activeSession.memberName}</strong> — {ACCESS_REASONS[activeSession.reasonCode as AccessReasonCode] ?? activeSession.reasonCode}
              </p>
              <p className="text-xs text-navy-800/50 dark:text-cream-50/50 mt-0.5">
                Entrou às {activeSession.startedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}, expira às{" "}
                {activeSession.expiresAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
            <EndSupportAccessButton sessionId={activeSession.id} />
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title="Histórico (90 dias)" subtitle="Somente leitura — nenhum registro pode ser editado ou apagado" />
        {log.length === 0 ? (
          <p className="px-5 py-6 text-sm text-navy-800/50 dark:text-cream-50/50">Nenhum acesso registrado neste período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-navy-800/45 dark:text-cream-50/45 border-b border-navy-800/8 dark:border-white/10">
                  <th className="px-5 py-2 font-semibold">Data/hora</th>
                  <th className="px-5 py-2 font-semibold">Quem</th>
                  <th className="px-5 py-2 font-semibold">Motivo</th>
                  <th className="px-5 py-2 font-semibold">Ação</th>
                  <th className="px-5 py-2 font-semibold">Duração</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-800/5 dark:divide-white/10">
                {log.map((entry) => (
                  <tr key={entry.id} className="text-navy-800 dark:text-cream-50/85">
                    <td className="px-5 py-2.5 whitespace-nowrap">{entry.createdAt.toLocaleString("pt-BR")}</td>
                    <td className="px-5 py-2.5">{entry.memberName}</td>
                    <td className="px-5 py-2.5">
                      {entry.reasonLabel}
                      {entry.outOfBand && (
                        <Badge color="red" className="ml-2">
                          Fora do processo normal
                        </Badge>
                      )}
                    </td>
                    <td className="px-5 py-2.5">{ACTION_LABEL[entry.action] ?? entry.action}</td>
                    <td className="px-5 py-2.5">{entry.durationMinutes !== null ? `${entry.durationMinutes} min` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
