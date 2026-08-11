"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateOfficeModules,
  updateOfficeBilling,
  generateAndSendInvoice,
  markInvoicePaid,
  setOfficeAccess,
} from "@/lib/actions/painelMestre";
import StartActingModal from "@/components/painelMestre/StartActingModal";
import CopyButton from "@/components/CopyButton";
import { formatCurrency } from "@/components/ui";
import { Send, CheckCircle2, Lock, Unlock } from "lucide-react";

type Invoice = {
  id: string;
  competencia: string;
  amount: number;
  dueDate: string;
  status: string;
  boletoUrl: string | null;
  paymentMethod: string | null;
  pixQrCodePayload: string | null;
  pixQrCodeImage: string | null;
};

const GENERATE_BUTTON_LABEL: Record<string, string> = {
  PIX_QRCODE: "Gerar Pix QR Code e enviar por e-mail",
  PIX_AUTOMATICO: "Registrar fatura do mês (cobrada via Pix Automático)",
  BOLETO: "Gerar boleto e enviar por e-mail",
};

const MODULE_OPTIONS: { key: "financeiro" | "whatsapp" | "atendimento" | "assessoria"; label: string }[] = [
  { key: "financeiro", label: "Financeiro" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "atendimento", label: "Atendimento" },
  { key: "assessoria", label: "Assessoria Jurídica" },
];

export default function OfficeDetailPanel({
  officeId,
  status,
  initialModules,
  initialBilling,
  paymentMethod,
  invoices,
}: {
  officeId: string;
  status: string;
  initialModules: { financeiro: boolean; whatsapp: boolean; atendimento: boolean; assessoria: boolean };
  initialBilling: { billingEmail: string; monthlyFee: number; billingDueDay: number; paymentGraceDays: number; cnpj: string };
  paymentMethod: string | null;
  invoices: Invoice[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [modules, setModules] = useState(initialModules);
  const [billing, setBilling] = useState(initialBilling);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ error?: string; btgWarning?: string; asaasWarning?: string }>) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await fn();
      if (result?.error) setError(result.error);
      else if (result?.btgWarning) setMessage(`E-mail enviado. Aviso do BTG: ${result.btgWarning}`);
      else if (result?.asaasWarning) setMessage(`E-mail enviado, mas a Asaas recusou a cobrança Pix: ${result.asaasWarning}`);
      else setMessage("Feito.");
      router.refresh();
    });
  }

  const pendingInvoice = invoices.find((i) => i.status === "PENDENTE");
  const blocked = status !== "ATIVA";

  return (
    <div className="space-y-5">
      {error && <p className="text-xs text-atencao bg-atencao/10 dark:bg-atencao/15 rounded-lg px-3 py-2">{error}</p>}
      {message && <p className="text-xs text-concluido bg-concluido-bg rounded-lg px-3 py-2">{message}</p>}

      <StartActingModal officeId={officeId} />

      <div>
        <p className="text-xs font-semibold text-white mb-2">Módulos contratados</p>
        <div className="grid grid-cols-2 gap-2 mb-2">
          {MODULE_OPTIONS.map((m) => (
            <label key={m.key} className="flex items-center gap-2 border border-white/15 rounded-lg px-3 py-2 text-sm text-white/85 cursor-pointer">
              <input
                type="checkbox"
                checked={modules[m.key]}
                onChange={(e) => setModules((prev) => ({ ...prev, [m.key]: e.target.checked }))}
                className="h-4 w-4 accent-marca"
              />
              {m.label}
            </label>
          ))}
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => updateOfficeModules(officeId, modules))}
          className="text-xs font-semibold text-marca-tx hover:underline disabled:opacity-50"
        >
          Salvar módulos
        </button>
      </div>

      <div>
        <p className="text-xs font-semibold text-white mb-2">Plano e cobrança</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-2">
          <div>
            <label className="text-[11px] text-white/50">E-mail de cobrança</label>
            <input value={billing.billingEmail} onChange={(e) => setBilling((p) => ({ ...p, billingEmail: e.target.value }))} className="mt-1 w-full border border-white/15 bg-grafite-700 text-white rounded-lg px-2.5 py-1.5 text-xs" />
          </div>
          <div>
            <label className="text-[11px] text-white/50">Mensalidade (R$)</label>
            <input type="number" min={0} step="0.01" value={billing.monthlyFee} onChange={(e) => setBilling((p) => ({ ...p, monthlyFee: Number(e.target.value) }))} className="mt-1 w-full border border-white/15 bg-grafite-700 text-white rounded-lg px-2.5 py-1.5 text-xs" />
          </div>
          <div>
            <label className="text-[11px] text-white/50">Dia de vencimento</label>
            <input type="number" min={1} max={28} value={billing.billingDueDay} onChange={(e) => setBilling((p) => ({ ...p, billingDueDay: Number(e.target.value) }))} className="mt-1 w-full border border-white/15 bg-grafite-700 text-white rounded-lg px-2.5 py-1.5 text-xs" />
          </div>
          <div>
            <label className="text-[11px] text-white/50">Carência até bloqueio (dias)</label>
            <input
              type="number"
              min={1}
              max={90}
              value={billing.paymentGraceDays}
              onChange={(e) => setBilling((p) => ({ ...p, paymentGraceDays: Number(e.target.value) }))}
              className="mt-1 w-full border border-white/15 bg-grafite-700 text-white rounded-lg px-2.5 py-1.5 text-xs"
            />
          </div>
          <div>
            <label className="text-[11px] text-white/50">CPF/CNPJ do escritório</label>
            <input
              value={billing.cnpj}
              onChange={(e) => setBilling((p) => ({ ...p, cnpj: e.target.value }))}
              placeholder="Necessário pra Asaas emitir boleto/Pix"
              className="mt-1 w-full border border-white/15 bg-grafite-700 text-white rounded-lg px-2.5 py-1.5 text-xs"
            />
          </div>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => updateOfficeBilling(officeId, billing))}
          className="text-xs font-semibold text-marca-tx hover:underline disabled:opacity-50"
        >
          Salvar cobrança
        </button>
      </div>

      <div>
        <p className="text-xs font-semibold text-white mb-2">Histórico de faturas</p>
        {invoices.length === 0 ? (
          <p className="text-xs text-white/45">Nenhuma fatura gerada ainda.</p>
        ) : (
          <div className="divide-y divide-white/10 border border-white/10 rounded-lg">
            {invoices.map((i) => (
              <div key={i.id} className="flex items-center justify-between px-3 py-2 text-xs">
                <span className="text-white/85">{i.competencia} — {formatCurrency(i.amount)}</span>
                <span className={i.status === "PAGO" ? "text-concluido" : "text-aviso"}>
                  {i.status === "PAGO" ? "pago" : `vence ${new Date(i.dueDate).toLocaleDateString("pt-BR")}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {pendingInvoice?.paymentMethod === "PIX_QRCODE" && pendingInvoice.pixQrCodePayload && (
        <div className="bg-white/5 border border-white/10 rounded-lg p-3 flex flex-wrap items-start gap-3">
          {pendingInvoice.pixQrCodeImage && (
            // eslint-disable-next-line @next/next/no-img-element -- base64 gerado em runtime, não é um asset estático
            <img src={`data:image/png;base64,${pendingInvoice.pixQrCodeImage}`} alt="QR Code Pix da fatura pendente" className="h-28 w-28 rounded shrink-0" />
          )}
          <div className="flex-1 min-w-[200px]">
            <p className="text-[11px] text-white/50 mb-1">Pix Copia e Cola da fatura {pendingInvoice.competencia}:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-[11px] text-white bg-grafite-800 border border-white/15 rounded px-2 py-1.5 break-all">
                {pendingInvoice.pixQrCodePayload}
              </code>
              <CopyButton text={pendingInvoice.pixQrCodePayload} label="Copiar" />
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => generateAndSendInvoice(officeId))}
          className="inline-flex items-center justify-center gap-1.5 bg-acao hover:bg-acao-hover disabled:opacity-50 text-acao-tx text-sm font-semibold rounded-lg px-4 py-2.5"
        >
          <Send size={14} /> {GENERATE_BUTTON_LABEL[paymentMethod ?? "BOLETO"] ?? GENERATE_BUTTON_LABEL.BOLETO}
        </button>
        {pendingInvoice && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => markInvoicePaid(pendingInvoice.id))}
            className="inline-flex items-center justify-center gap-1.5 border border-white/15 text-white text-sm font-semibold rounded-lg px-4 py-2.5"
          >
            <CheckCircle2 size={14} /> Dar baixa manual (recebi por fora)
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => setOfficeAccess(officeId, !blocked))}
          className={`inline-flex items-center justify-center gap-1.5 border text-sm font-semibold rounded-lg px-4 py-2.5 ${
            blocked
              ? "border-concluido text-concluido"
              : "border-atencao text-atencao"
          }`}
        >
          {blocked ? <Unlock size={14} /> : <Lock size={14} />}
          {blocked ? "Liberar acesso" : "Bloquear acesso agora"}
        </button>
      </div>
    </div>
  );
}
