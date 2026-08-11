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
      <p className="text-sm text-tx-2">
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
          <p className="text-[11px] text-tx-3">Ciclo de cobrança</p>
          <p className="text-sm font-semibold text-tx mt-0.5">
            {billingCycleLabel(subscription.billingCycle, subscription.discountPercent)}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-tx-3">Forma de pagamento</p>
          <p className="text-sm font-semibold text-tx mt-0.5">
            {subscription.paymentMethod ? PAYMENT_METHOD_LABEL[subscription.paymentMethod] ?? subscription.paymentMethod : "Não configurada"}
          </p>
        </div>
        {subscription.paymentMethod === "PIX_AUTOMATICO" && (
          <div>
            <p className="text-[11px] text-tx-3">Autorização Pix Automático</p>
            <p className="text-sm font-semibold text-tx mt-0.5">
              {subscription.pixAuthorizationStatus
                ? PIX_AUTH_STATUS_LABEL[subscription.pixAuthorizationStatus] ?? subscription.pixAuthorizationStatus
                : "ainda não gerada"}
            </p>
          </div>
        )}
      </div>

      {showPix && (
        <div className="bg-sf-apoio border border-regua rounded-lg p-4 flex flex-wrap items-start gap-4">
          {latestInvoice.pixQrCodeImage && (
            // eslint-disable-next-line @next/next/no-img-element -- base64 gerado em runtime, não é um asset estático
            <img
              src={`data:image/png;base64,${latestInvoice.pixQrCodeImage}`}
              alt="QR Code Pix da fatura em aberto"
              className="h-36 w-36 rounded shrink-0"
            />
          )}
          <div className="flex-1 min-w-[220px]">
            <p className="text-xs font-semibold text-tx mb-1">
              Fatura de {latestInvoice.competencia} — <span className="tabular-nums">{formatCurrency(latestInvoice.amount)}</span>, vence {formatDate(latestInvoice.dueDate)}
            </p>
            <p className="text-[11px] text-tx-3 mb-1.5">Pix Copia e Cola:</p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={latestInvoice.pixQrCodePayload ?? ""}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 min-w-0 text-[11px] font-mono text-tx bg-sf border border-regua-forte rounded px-2 py-1.5"
              />
              <CopyButton text={latestInvoice.pixQrCodePayload ?? ""} label="Copiar" />
            </div>
          </div>
        </div>
      )}

      <div>
        <p className="text-xs font-semibold text-tx mb-2">Histórico de faturas</p>
        {invoices.length === 0 ? (
          <p className="text-xs text-tx-3">Nenhuma fatura gerada ainda.</p>
        ) : (
          <div className="divide-y divide-regua border border-regua rounded-lg">
            {invoices.map((i) => (
              <div key={i.id} className="flex items-center justify-between px-3 py-2 text-xs">
                <span className="text-tx/85 tabular-nums">
                  {i.competencia} — {formatCurrency(i.amount)}
                </span>
                <span className={i.status === "PAGO" ? "text-concluido" : "text-aviso"}>
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
