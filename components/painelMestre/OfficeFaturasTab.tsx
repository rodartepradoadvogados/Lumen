"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateAndSendInvoice, markInvoicePaid } from "@/lib/actions/painelMestre";
import { formatCurrency } from "@/components/ui";
import { LumenPanel, LumenPanelHeader } from "@/components/painelMestre/LumenUi";
import CopyButton from "@/components/CopyButton";
import { Send, CheckCircle2, AlertTriangle, AlertCircle, HelpCircle } from "lucide-react";
import type { SaudeCobranca } from "@/lib/billingHealth";

type Invoice = {
  id: string;
  competencia: string;
  amount: number;
  dueDate: string;
  status: string; // PENDENTE | PAGO | CANCELADO
  paidAt: string | null;
  boletoUrl: string | null;
  paymentMethod: string | null;
  pixQrCodePayload: string | null;
  pixQrCodeImage: string | null;
  remindersSent: string[];
};

const GENERATE_BUTTON_LABEL: Record<string, string> = {
  PIX_QRCODE: "Gerar Pix QR Code e enviar por e-mail",
  PIX_AUTOMATICO: "Registrar fatura do mês (cobrada via Pix Automático)",
  BOLETO: "Gerar boleto e enviar por e-mail",
};

const NIVEL_LABEL: Record<SaudeCobranca["nivel"], string> = {
  OK: "Cobrança OK",
  ATENCAO: "Atenção",
  PROBLEMA: "Problema",
  NAO_CONFIGURADA: "Não configurada",
};
const NIVEL_ICON: Record<SaudeCobranca["nivel"], typeof CheckCircle2> = {
  OK: CheckCircle2,
  ATENCAO: AlertTriangle,
  PROBLEMA: AlertCircle,
  NAO_CONFIGURADA: HelpCircle,
};
const NIVEL_TEXT_CLASS: Record<SaudeCobranca["nivel"], string> = {
  OK: "text-concluido",
  ATENCAO: "text-aviso",
  PROBLEMA: "text-urgente",
  NAO_CONFIGURADA: "text-tx-3",
};

// Situação da última fatura e texto de "entrega" — movidos de components/painelMestre/
// AssinaturasTable.tsx (removido, ver .impeccable/plano-painel-mestre/andamento-painel-mestre.md,
// Fase 3): funções puras, sem estado de componente, então virarem locais aqui (único chamador
// agora) em vez de um módulo compartilhado pra uma função só.
function situacaoPagamento(fatura: Invoice | null, faturasVencidasAbertas: number): { label: string; tone: "ok" | "warn" | "risk" | "slate" } {
  if (!fatura) return { label: "Sem fatura gerada", tone: "slate" };
  if (fatura.status === "CANCELADO") return { label: "Cancelada", tone: "slate" };
  if (fatura.status === "PAGO") return { label: `Pago em ${fatura.paidAt ? new Date(fatura.paidAt).toLocaleDateString("pt-BR") : "—"}`, tone: "ok" };
  const venceu = new Date(fatura.dueDate).getTime() <= Date.now();
  if (venceu) {
    return { label: faturasVencidasAbertas > 1 ? `Vencida (${faturasVencidasAbertas} em aberto)` : "Vencida", tone: "risk" };
  }
  return { label: "Em aberto", tone: "warn" };
}

function entregaCobranca(paymentMethod: string | null, fatura: Invoice | null, pixAuthStatus: string | null): string {
  if (!paymentMethod) return "Forma de cobrança ainda não configurada.";
  if (paymentMethod === "PIX_AUTOMATICO") {
    if (pixAuthStatus === "ATIVA") return "Débito automático autorizado pelo cliente — não há boleto nem QR Code pra enviar a cada fatura.";
    if (pixAuthStatus === "PENDENTE") return "Autorização enviada ao cliente; aguardando confirmação no aplicativo do banco.";
    if (pixAuthStatus === "REJEITADA") return "Autorização foi rejeitada pelo banco do cliente — gere uma nova autorização.";
    if (pixAuthStatus === "CANCELADA") return "Autorização foi cancelada pelo cliente — o débito automático parou.";
    return "Autorização de Pix Automático ainda não foi gerada — use o botão na aba Cobrança & Assinatura.";
  }
  if (!fatura) return "Nenhuma fatura gerada ainda.";
  const enviado = fatura.remindersSent.length > 0;
  if (paymentMethod === "BOLETO") {
    if (!fatura.boletoUrl) return "Fatura gerada, mas o boleto ainda não foi emitido.";
    return enviado ? "Boleto emitido e já enviado por e-mail ao escritório." : "Boleto emitido, mas ainda não foi enviado por e-mail ao escritório.";
  }
  if (paymentMethod === "PIX_QRCODE") {
    if (!fatura.pixQrCodePayload) return "Fatura gerada, mas o QR Code ainda não foi gerado.";
    return enviado ? "QR Code gerado e já enviado por e-mail ao escritório." : "QR Code gerado, mas ainda não foi enviado por e-mail ao escritório.";
  }
  return "";
}

export default function OfficeFaturasTab({
  officeId,
  invoices,
  paymentMethod,
  pixAuthorizationStatus,
  faturasVencidasAbertas,
  saude,
}: {
  officeId: string;
  invoices: Invoice[];
  paymentMethod: string | null;
  pixAuthorizationStatus: string | null;
  faturasVencidasAbertas: number;
  saude: SaudeCobranca | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ error?: string; btgWarning?: string; asaasWarning?: string }>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  const ultimaFatura = invoices[0] ?? null;
  const situacao = situacaoPagamento(ultimaFatura, faturasVencidasAbertas);
  const entrega = paymentMethod ? entregaCobranca(paymentMethod, ultimaFatura, pixAuthorizationStatus) : "";
  const pendingInvoice = invoices.find((i) => i.status === "PENDENTE") ?? null;
  const NivelIcon = saude ? NIVEL_ICON[saude.nivel] : null;

  return (
    <div className="space-y-5">
      <LumenPanel>
        <LumenPanelHeader title="Situação atual" />
        <div className="p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-tx-2">Última fatura:</span>
            <span className="font-semibold text-tx">{situacao.label}</span>
          </div>
          {paymentMethod && <p className="text-corpo text-tx-2">{entrega}</p>}
          <div className="flex items-center gap-2 pt-1">
            <span className="text-sm text-tx-2">Saúde da cobrança:</span>
            {saude ? (
              <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${NIVEL_TEXT_CLASS[saude.nivel]}`}>
                {NivelIcon && <NivelIcon size={14} />}
                {NIVEL_LABEL[saude.nivel]}
              </span>
            ) : (
              <span className="text-sm text-tx-3">— interno —</span>
            )}
          </div>
          {saude && saude.nivel !== "OK" && saude.motivos.length > 0 && (
            <ul className="space-y-1">
              {saude.motivos.map((motivo, i) => (
                <li key={i} className={`text-corpo flex items-start gap-1.5 ${NIVEL_TEXT_CLASS[saude.nivel]}`}>
                  <span className="mt-1.5 h-1 w-1 rounded-full bg-current shrink-0" />
                  {motivo}
                </li>
              ))}
            </ul>
          )}
        </div>
      </LumenPanel>

      <LumenPanel>
        <LumenPanelHeader title="Histórico de faturas" />
        {invoices.length === 0 ? (
          <p className="text-xs text-tx-3 px-5 py-4">Nenhuma fatura gerada ainda.</p>
        ) : (
          <div className="divide-y divide-regua">
            {invoices.map((i) => (
              <div key={i.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <span className="text-tx-2">{i.competencia} — {formatCurrency(i.amount)}</span>
                <span className={i.status === "PAGO" ? "text-concluido" : "text-aviso"}>
                  {i.status === "PAGO" ? "pago" : `vence ${new Date(i.dueDate).toLocaleDateString("pt-BR")}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </LumenPanel>

      {pendingInvoice?.paymentMethod === "PIX_QRCODE" && pendingInvoice.pixQrCodePayload && (
        <div className="bg-sf-apoio border border-regua rounded-sm p-3 flex flex-wrap items-start gap-3">
          {pendingInvoice.pixQrCodeImage && (
            // eslint-disable-next-line @next/next/no-img-element -- base64 gerado em runtime, não é um asset estático
            <img src={`data:image/png;base64,${pendingInvoice.pixQrCodeImage}`} alt="QR Code Pix da fatura pendente" className="h-28 w-28 rounded-sm shrink-0" />
          )}
          <div className="flex-1 min-w-[200px]">
            <p className="text-etiqueta text-tx-3 mb-1">Pix Copia e Cola da fatura {pendingInvoice.competencia}:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-etiqueta text-tx bg-sf-superficie border border-regua-forte rounded-sm px-2 py-1.5 break-all">{pendingInvoice.pixQrCodePayload}</code>
              <CopyButton text={pendingInvoice.pixQrCodePayload} label="Copiar" />
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => generateAndSendInvoice(officeId))}
          className="inline-flex items-center justify-center gap-1.5 bg-acao hover:bg-acao-hover disabled:opacity-50 text-acao-tx text-sm font-semibold px-4 py-2.5"
        >
          <Send size={14} /> {GENERATE_BUTTON_LABEL[paymentMethod ?? "BOLETO"] ?? GENERATE_BUTTON_LABEL.BOLETO}
        </button>
        {pendingInvoice && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => markInvoicePaid(pendingInvoice.id))}
            className="inline-flex items-center justify-center gap-1.5 border border-regua-forte text-tx text-sm font-semibold px-4 py-2.5"
          >
            <CheckCircle2 size={14} /> Dar baixa manual (recebi por fora)
          </button>
        )}
      </div>
    </div>
  );
}
