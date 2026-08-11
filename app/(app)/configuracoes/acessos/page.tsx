import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { getActiveSupportSession, listOfficeAccessLog, listPendingAccessRequests } from "@/lib/supportAccess";
import { ACCESS_REASONS, ACCESS_ACTION_LABEL, type AccessReasonCode } from "@/lib/supportAccessConstants";
import { PageHeader, Card, CardHeader, Badge, ButtonSecondary } from "@/components/ui";
import EndSupportAccessButton from "@/components/EndSupportAccessButton";
import SupportAccessPolicyPicker from "@/components/SupportAccessPolicyPicker";
import AccessRequestQueue from "@/components/AccessRequestQueue";
import { ShieldCheck, ShieldAlert, Eye, Download } from "lucide-react";

export const dynamic = "force-dynamic";

const ACTION_LABEL = ACCESS_ACTION_LABEL;

// Página de transparência do escritório (Passo 2): visível a QUALQUER usuário do escritório,
// não só admin — é justamente o ponto. Só leitura: ninguém apaga nada por aqui, e não existe
// nenhuma ação de escrita nesta tela além de encerrar a sessão ativa (que é uma saída, não uma
// edição do histórico).
export default async function AcessosPage() {
  const viewer = await getCurrentUser();
  if (!viewer) return null;

  // office e pendingRequests são buscados sempre (custo baixo), mas só aparecem na tela pra
  // isAdmin (ver JSX abaixo) — usuário comum do escritório continua vendo só o que já existia.
  const [activeSession, log, office, pendingRequests] = await Promise.all([
    getActiveSupportSession(viewer.officeId),
    listOfficeAccessLog(viewer.officeId, 90),
    prisma.office.findUnique({ where: { id: viewer.officeId }, select: { supportAccessPolicy: true } }),
    listPendingAccessRequests(viewer.officeId),
  ]);

  const totalEntradas = log.filter((l) => l.action === "ENTRADA").length;

  return (
    <div className="p-6 max-w-[900px] mx-auto animate-fade-in space-y-6">
      <Link
        href="/configuracoes"
        className="text-xs font-semibold text-tx-3 hover:text-tx"
      >
        ← Configurações
      </Link>
      <PageHeader
        title="Acessos da Lúmen"
        subtitle="Toda vez que o suporte da Lúmen precisa entrar nos dados do seu escritório, fica registrado aqui — com motivo, chamado e prazo curto."
        action={
          <div className="flex items-center gap-2 flex-wrap">
            {viewer.isAdmin && (
              <Link href="/configuracoes/acessos/previa">
                <ButtonSecondary>
                  <Eye size={14} /> Ver como o suporte vê este escritório
                </ButtonSecondary>
              </Link>
            )}
            <a href="/api/configuracoes/acessos/exportar" download>
              <ButtonSecondary>
                <Download size={14} /> Baixar extrato de acessos (CSV)
              </ButtonSecondary>
            </a>
          </div>
        }
      />

      <Card>
        <div className="p-5 flex items-center gap-3">
          {totalEntradas === 0 ? (
            <>
              <ShieldCheck size={22} className="text-concluido shrink-0" />
              <p className="text-sm text-tx">
                Nos últimos 90 dias, a Lúmen <strong>não acessou</strong> os dados do seu escritório nenhuma vez.
              </p>
            </>
          ) : (
            <>
              <ShieldAlert size={22} className="text-aviso shrink-0" />
              <p className="text-sm text-tx">
                Nos últimos 90 dias, a Lúmen acessou dados do seu escritório <strong>{totalEntradas}</strong>{" "}
                {totalEntradas === 1 ? "vez" : "vezes"}.
              </p>
            </>
          )}
        </div>
      </Card>

      {viewer.isAdmin && office && (
        <Card>
          <CardHeader
            title="Política de acesso de suporte"
            subtitle="Escolha como o suporte da Lúmen pode entrar no seu escritório"
          />
          <div className="p-5">
            <SupportAccessPolicyPicker current={office.supportAccessPolicy as "AUTO" | "APROVACAO"} />
          </div>
        </Card>
      )}

      {viewer.isAdmin && office?.supportAccessPolicy === "APROVACAO" && pendingRequests.length > 0 && (
        <Card>
          <CardHeader
            title="Pedidos aguardando aprovação"
            subtitle="Um sócio precisa liberar cada acesso antes dele acontecer"
          />
          <AccessRequestQueue requests={pendingRequests} />
        </Card>
      )}

      {activeSession && (
        <Card>
          <CardHeader title="Sessão ativa agora" subtitle="Alguém da Lúmen está com acesso ao seu escritório neste momento" />
          <div className="p-5 flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-tx">
              <p>
                <strong>{activeSession.memberName}</strong> — {ACCESS_REASONS[activeSession.reasonCode as AccessReasonCode] ?? activeSession.reasonCode}
              </p>
              <p className="text-xs text-tx-3 mt-0.5">
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
          <p className="px-5 py-6 text-sm text-tx-3">Nenhum acesso registrado neste período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-tx-3 border-b border-regua">
                  <th className="px-5 py-2 font-semibold">Data/hora</th>
                  <th className="px-5 py-2 font-semibold">Quem</th>
                  <th className="px-5 py-2 font-semibold">Motivo</th>
                  <th className="px-5 py-2 font-semibold">Ação</th>
                  <th className="px-5 py-2 font-semibold">Duração</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-regua">
                {log.map((entry) => (
                  <tr key={entry.id} className="text-tx/85">
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
                    <td className="px-5 py-2.5">
                      {ACTION_LABEL[entry.action] ?? entry.action}
                      {entry.scopeDescription && (
                        <p className="text-[11px] font-normal text-tx-3 mt-0.5">
                          {entry.scopeDescription}
                        </p>
                      )}
                    </td>
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
