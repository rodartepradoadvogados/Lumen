import Link from "next/link";
import { getCurrentUser } from "@/lib/currentUser";
import { redirect } from "next/navigation";
import { PageHeader, Card, CardHeader } from "@/components/ui";
import { listPedidosTitular } from "@/lib/actions/privacidade";
import PedidoTitularPanel from "@/components/privacidade/PedidoTitularPanel";
import TrilhaAuditoria from "@/components/privacidade/TrilhaAuditoria";
import { ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

// Nova rota do documento 07 (Fase 4 — Privacidade e LGPD): "o mecanismo já existe no código, o
// que falta é uma tela onde isso seja visível e auditável sem abrir o banco". Visível a QUALQUER
// pessoa do escritório (mesma transparência de app/(app)/configuracoes/acessos, já existente) —
// as ações de escrita (abrir/avaliar/executar pedido do titular) ficam restritas a admin dentro
// dos próprios componentes/actions, não escondendo a tela inteira de quem só quer consultar.
export default async function PrivacidadePage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");

  const pedidos = await listPedidosTitular();

  return (
    <div className="p-6 max-w-[1200px] mx-auto animate-fade-in space-y-6">
      <Link href="/configuracoes" className="text-xs font-semibold text-tx-3 hover:text-tx">
        ← Configurações
      </Link>
      <PageHeader
        title="Privacidade e trilha"
        subtitle="Máscara por padrão, revelação com motivo e prazo, e pedido do titular — tudo auditável aqui, sem abrir o banco"
      />

      <div className="grid grid-cols-1 md:grid-cols-[1fr_640px] gap-6 items-start">
        <div className="space-y-6 min-w-0">
          <Card>
            <CardHeader title="Máscara por padrão" subtitle="Vale para toda a equipe, inclusive admin" />
            <div className="p-5 space-y-2 text-sm text-tx-2">
              <p className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-concluido shrink-0" />
                CPF, CNPJ, telefone, endereço, e-mail e valor de honorário (sem acesso ao módulo Financeiro) ficam mascarados por padrão —
                quem tem o dado na mão é quem precisa dele para o ato.
              </p>
              <p className="text-xs text-tx-3">
                Revelar um campo exige motivo escrito (mínimo 20 caracteres) e dura 15 minutos — cada revelação fica na aba{" "}
                <strong>Revelações</strong> ao lado.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Acesso do suporte da plataforma" subtitle="A Lúmen só entra nos seus dados com motivo, chamado e prazo curto" />
            <div className="p-5">
              <Link href="/configuracoes/acessos" className="text-sm font-semibold text-acao hover:text-acao-hover">
                Ver política, sessão ativa e histórico de acessos →
              </Link>
            </div>
          </Card>

          <PedidoTitularPanel requests={pedidos} isAdmin={viewer.isAdmin} />
        </div>

        <TrilhaAuditoria />
      </div>
    </div>
  );
}
