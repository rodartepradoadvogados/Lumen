// Fase 3 — Cobrança Lúmen (Asaas): conteúdo do card "Cobrança" em Configurações, autoatendimento
// do próprio escritório-cliente (buscado via getOwnOfficeBilling()). Componente compartilhado
// entre o site (app/(app)/configuracoes/page.tsx) e o app mobile (app/m/configuracoes/page.tsx)
// para não duplicar o JSX nas duas telas — recebe os dados já buscados pelo Server Component
// que o usa, não busca nada sozinho.

import CopyButton from "@/components/CopyButton";
import { formatCurrency, formatDate } from "@/components/ui";
import type { OwnOfficeBilling } from "@/lib/actions/subscriptionBilling";

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  PIX_AUTOMATICO: "Pix Automático",
  PIX_QRCODE: "Pix QR Code",
  BOLETO: "Boleto",
};
const PIX_AUTH_STATUS_LABEL: Record<string, string> = {
  PENDENTE: "pendente (escaneie o QR Code para autorizar)",
  ATIVA: "ativa",
  CANCELADA: "cancelada",
  REJEITADA: "rejeitada",
};
const INVOICE_STATUS_LABEL: Record<string, string> = { PENDENTE: "pendente", PAGO: "pago", CANCELADO: "cancelado" };

function billingCycleLabel(billingCycle: string, discountPercent: number | null): string {
  if (billingCycle === "SEMESTRAL") {
    return discountPercent ? `Semestral (${discountPercent}% de desconto)` : "Semestral";
  }
  return "Mensal";
}

export default function OfficeBillingSummary({ billing }: { billing: OwnOfficeBilling }) {
  const { subscription, invoices } = billing;

  if (!subscription) {
    return (
      <p className="text-sm text-navy-800/60 dark:text-cream-50/60">
        Cobrança ainda não configurada — fale com o Rodarte Prado Advogados.
      </p>
    );
  }

  const latestInvoice = invoices[0];
  const showPix = latestInvoice?.status === "PENDENTE" && latestInvoice.pixQrCodePayload;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <p className="text-[11px] text-navy-800/50 dark:text-cream-50/50">Ciclo de cobrança</p>
          <p className="text-sm font-semibold text-navy-900 dark:text-cream-50 mt-0.5">
            {billingCycleLabel(subscription.billingCycle, subscription.discountPercent)}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-navy-800/50 dark:text-cream-50/50">Forma de pagamento</p>
          <p className="text-sm font-semibold text-navy-900 dark:text-cream-50 mt-0.5">
            {subscription.paymentMethod ? PAYMENT_METHOD_LABEL[subscription.paymentMethod] ?? subscription.paymentMethod : "Não configurada"}
          </p>
        </div>
        {subscription.paymentMethod === "PIX_AUTOMATICO" && (
          <div>
            <p className="text-[11px] text-navy-800/50 dark:text-cream-50/50">Autorização Pix Automático</p>
            <p className="text-sm font-semibold text-navy-900 dark:text-cream-50 mt-0.5">
              {subscription.pixAuthorizationStatus
                ? PIX_AUTH_STATUS_LABEL[subscription.pixAuthorizationStatus] ?? subscription.pixAuthorizationStatus
                : "ainda não gerada"}
            </p>
          </div>
        )}
      </div>

      {showPix && (
        <div className="bg-cream-100 dark:bg-white/5 border border-navy-800/8 dark:border-white/10 rounded-lg p-4 flex flex-wrap items-start gap-4">
          {latestInvoice.pixQrCodeImage && (
            // eslint-disable-next-line @next/next/no-img-element -- base64 gerado em runtime, não é um asset estático
            <img
              src={`data:image/png;base64,${latestInvoice.pixQrCodeImage}`}
              alt="QR Code Pix da fatura em aberto"
              className="h-36 w-36 rounded shrink-0"
            />
          )}
          <div className="flex-1 min-w-[220px]">
            <p className="text-xs font-semibold text-navy-900 dark:text-cream-50 mb-1">
              Fatura de {latestInvoice.competencia} — {formatCurrency(latestInvoice.amount)}, vence {formatDate(latestInvoice.dueDate)}
            </p>
            <p className="text-[11px] text-navy-800/50 dark:text-cream-50/50 mb-1.5">Pix Copia e Cola:</p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={latestInvoice.pixQrCodePayload ?? ""}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 min-w-0 text-[11px] font-mono text-navy-900 dark:text-cream-50 bg-white dark:bg-navy-800 border border-navy-800/12 dark:border-white/15 rounded px-2 py-1.5"
              />
              <CopyButton text={latestInvoice.pixQrCodePayload ?? ""} label="Copiar" />
            </div>
          </div>
        </div>
      )}

      <div>
        <p className="text-xs font-semibold text-navy-800 dark:text-cream-50 mb-2">Histórico de faturas</p>
        {invoices.length === 0 ? (
          <p className="text-xs text-navy-800/45 dark:text-cream-50/45">Nenhuma fatura gerada ainda.</p>
        ) : (
          <div className="divide-y divide-navy-800/5 dark:divide-white/10 border border-navy-800/8 dark:border-white/10 rounded-lg">
            {invoices.map((i) => (
              <div key={i.id} className="flex items-center justify-between px-3 py-2 text-xs">
                <span className="text-navy-800 dark:text-cream-50/85">
                  {i.competencia} — {formatCurrency(i.amount)}
                </span>
                <span className={i.status === "PAGO" ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}>
                  {i.status === "PAGO" ? "pago" : `${INVOICE_STATUS_LABEL[i.status] ?? i.status} — vence ${formatDate(i.dueDate)}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
