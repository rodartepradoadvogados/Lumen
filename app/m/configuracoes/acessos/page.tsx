import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { getActiveSupportSession, listOfficeAccessLog, listPendingAccessRequests } from "@/lib/supportAccess";
import { ACCESS_REASONS, ACCESS_ACTION_LABEL, type AccessReasonCode } from "@/lib/supportAccessConstants";
import { Card, CardHeader, Badge } from "@/components/ui";
import EndSupportAccessButton from "@/components/EndSupportAccessButton";
import SupportAccessPolicyPicker from "@/components/SupportAccessPolicyPicker";
import AccessRequestQueue from "@/components/AccessRequestQueue";
import { ArrowLeft, ShieldCheck, ShieldAlert, Download, Monitor } from "lucide-react";

export const dynamic = "force-dynamic";

// Equivalente mobile de app/(app)/configuracoes/acessos/page.tsx — mesma fonte de dados
// (getActiveSupportSession/listOfficeAccessLog/listPendingAccessRequests, lib/supportAccess.ts)
// e os mesmos componentes de ação (EndSupportAccessButton, SupportAccessPolicyPicker,
// AccessRequestQueue: nenhum já tinha nada de específico de desktop — são divs com
// flex-wrap/texto pequeno, então servem aqui sem alteração). Só o layout muda: cabeçalho e
// cards no padrão de app/m/configuracoes/page.tsx, e o histórico vira lista empilhada em vez de
// tabela (uma tabela de 5 colunas não cabe em tela de celular sem rolagem horizontal constante).
//
// Antes desta página existir, um sócio que só usa o celular não tinha como ver quem acessou o
// escritório, aprovar um pedido pendente ou encerrar uma sessão ativa — tinha que pegar um
// computador. Visível a QUALQUER usuário do escritório, não só admin, mesmo critério da versão
// desktop: transparência não é um privilégio de administrador.
//
// "Ver como o suporte vê este escritório" (app/(app)/configuracoes/acessos/previa) NÃO foi
// portada para cá: é uma tabela comparativa (campo por campo, processo por processo) já densa
// no computador — em tela pequena ficaria uma grade de texto truncado, pior que não ter nada.
// Em vez de portar, o aviso abaixo diz onde encontrar essa conferência.
export default async function MobileAcessosPage() {
  const viewer = await getCurrentUser();
  if (!viewer) return null;

  const [activeSession, log, office, pendingRequests] = await Promise.all([
    getActiveSupportSession(viewer.officeId),
    listOfficeAccessLog(viewer.officeId, 90),
    prisma.office.findUnique({ where: { id: viewer.officeId }, select: { supportAccessPolicy: true } }),
    listPendingAccessRequests(viewer.officeId),
  ]);

  const totalEntradas = log.filter((l) => l.action === "ENTRADA").length;

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link href="/m/configuracoes" className="inline-flex items-center gap-1 text-xs font-semibold text-tx-2">
        <ArrowLeft size={13} /> Configurações
      </Link>

      <div>
        <h1 className="text-xl font-bold text-tx">Acessos da Lúmen</h1>
        <p className="text-sm text-tx-2">
          Toda vez que o suporte precisa entrar nos dados do seu escritório, fica registrado aqui.
        </p>
      </div>

      <Card>
        <div className="p-4 flex items-start gap-2.5">
          {totalEntradas === 0 ? (
            <>
              <ShieldCheck size={18} className="text-concluido shrink-0 mt-0.5" />
              <p className="text-sm text-tx">
                Nos últimos 90 dias, a Lúmen <strong>não acessou</strong> os dados do seu escritório nenhuma vez.
              </p>
            </>
          ) : (
            <>
              <ShieldAlert size={18} className="text-aviso shrink-0 mt-0.5" />
              <p className="text-sm text-tx">
                Nos últimos 90 dias, a Lúmen acessou dados do seu escritório <strong>{totalEntradas}</strong>{" "}
                {totalEntradas === 1 ? "vez" : "vezes"}.
              </p>
            </>
          )}
        </div>
      </Card>

      <a
        href="/api/configuracoes/acessos/exportar"
        download
        className="inline-flex items-center gap-1.5 bg-acao hover:bg-acao-hover text-acao-tx text-xs font-semibold rounded-lg px-3 py-2.5 w-full justify-center"
      >
        <Download size={14} /> Baixar extrato de acessos (CSV)
      </a>

      <Card>
        <div className="p-4 flex items-start gap-2.5">
          <Monitor size={18} className="text-tx-2 shrink-0 mt-0.5" />
          <p className="text-xs text-tx-2">
            A conferência campo a campo &ldquo;Ver como o suporte vê este escritório&rdquo; está disponível no computador
            (Configurações → Acessos da Lúmen) — é uma tabela densa, melhor numa tela maior.
          </p>
        </div>
      </Card>

      {viewer.isAdmin && office && (
        <Card>
          <CardHeader title="Política de acesso de suporte" subtitle="Como o suporte da Lúmen pode entrar no seu escritório" />
          <div className="p-4">
            <SupportAccessPolicyPicker current={office.supportAccessPolicy as "AUTO" | "APROVACAO"} />
          </div>
        </Card>
      )}

      {viewer.isAdmin && office?.supportAccessPolicy === "APROVACAO" && pendingRequests.length > 0 && (
        <Card>
          <CardHeader title="Pedidos aguardando aprovação" subtitle="Um sócio precisa liberar cada acesso antes dele acontecer" />
          <AccessRequestQueue requests={pendingRequests} />
        </Card>
      )}

      {activeSession && (
        <Card>
          <CardHeader title="Sessão ativa agora" subtitle="Alguém da Lúmen está com acesso ao seu escritório neste momento" />
          <div className="p-4 space-y-2.5">
            <div className="text-sm text-tx">
              <p>
                <strong>{activeSession.memberName}</strong> — {ACCESS_REASONS[activeSession.reasonCode as AccessReasonCode] ?? activeSession.reasonCode}
              </p>
              <p className="text-xs text-tx-2 mt-0.5">
                Entrou às {activeSession.startedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}, expira às{" "}
                {activeSession.expiresAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
            <EndSupportAccessButton sessionId={activeSession.id} />
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title="Histórico (90 dias)" subtitle="Somente leitura" />
        {log.length === 0 ? (
          <p className="px-4 py-6 text-sm text-tx-2">Nenhum acesso registrado neste período.</p>
        ) : (
          <div className="divide-y divide-regua">
            {log.map((entry) => (
              <div key={entry.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-tx">
                    {ACCESS_ACTION_LABEL[entry.action] ?? entry.action}
                  </span>
                  <span className="text-[11px] text-tx-2 shrink-0 whitespace-nowrap">
                    {entry.createdAt.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <p className="text-xs text-tx-2 mt-0.5">
                  {entry.memberName} · {entry.reasonLabel}
                  {entry.durationMinutes !== null && ` · ${entry.durationMinutes} min`}
                </p>
                {entry.scopeDescription && (
                  <p className="text-[11px] text-tx-2 mt-0.5">{entry.scopeDescription}</p>
                )}
                {entry.outOfBand && (
                  <Badge color="red" className="mt-1.5">
                    Fora do processo normal
                  </Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
