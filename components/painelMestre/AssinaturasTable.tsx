"use client";

// Fase 3 — Cobrança Lúmen (Asaas): tabela de Assinaturas do Painel Mestre, editável. Antes desta
// entrega a página era só leitura (ver comentário removido em app/painel-mestre/assinaturas/
// page.tsx) — aqui um botão "Editar" por linha abre um formulário inline com os 3 campos que
// updateSubscriptionBilling aceita, e os botões de Pix (autorização/teste) aparecem condicionados
// à forma de pagamento já salva. Estilo segue components/painelMestre/LumenUi.tsx (sempre navy +
// cream, sem variantes dark:, porque LumenPanel nunca muda de tema).

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSubscriptionBilling, triggerPixAutomaticoAuthorization, previewPixQrCode } from "@/lib/actions/subscriptionBilling";
import { formatCurrency } from "@/components/ui";
import { LumenStatusDot } from "@/components/painelMestre/LumenUi";
import CopyButton from "@/components/CopyButton";
import { Pencil, X, QrCode } from "lucide-react";

const STATUS_LABEL: Record<string, string> = { ATIVA: "Ativa", TESTE: "Teste", SUSPENSA: "Suspensa", CANCELADA: "Cancelada" };
const STATUS_TONE: Record<string, "ok" | "warn" | "risk" | "slate"> = {
  ATIVA: "ok",
  TESTE: "warn",
  SUSPENSA: "risk",
  CANCELADA: "risk",
};
const PAYMENT_METHOD_LABEL: Record<string, string> = {
  PIX_AUTOMATICO: "Pix Automático",
  PIX_QRCODE: "Pix QR Code",
  BOLETO: "Boleto",
};
const PIX_AUTH_STATUS_LABEL: Record<string, string> = {
  PENDENTE: "pendente",
  ATIVA: "ativa",
  CANCELADA: "cancelada",
  REJEITADA: "rejeitada",
};

type SubscriptionInfo = {
  monthlyFee: number;
  status: string;
  billingCycle: string;
  paymentMethod: string | null;
  discountPercent: number | null;
  pixAuthorizationStatus: string | null;
};

type OfficeRow = { id: string; name: string; isInternal: boolean; subscription: SubscriptionInfo | null };

type PaymentMethodOption = "" | "PIX_AUTOMATICO" | "PIX_QRCODE" | "BOLETO";

type FormState = { billingCycle: "MENSAL" | "SEMESTRAL"; paymentMethod: PaymentMethodOption; discountPercent: string };

type QrResult = { officeId: string; image: string | null; payload: string | null };

export default function AssinaturasTable({ offices, asaasConfigured }: { offices: OfficeRow[]; asaasConfigured: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ billingCycle: "MENSAL", paymentMethod: "", discountPercent: "" });
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [qr, setQr] = useState<QrResult | null>(null);

  function openEdit(office: OfficeRow) {
    setError(null);
    setMessage(null);
    setQr(null);
    setEditingId(office.id);
    setForm({
      billingCycle: (office.subscription?.billingCycle as "MENSAL" | "SEMESTRAL") ?? "MENSAL",
      paymentMethod: (office.subscription?.paymentMethod as PaymentMethodOption) ?? "",
      discountPercent: office.subscription?.discountPercent != null ? String(office.subscription.discountPercent) : "",
    });
  }

  function save(officeId: string) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await updateSubscriptionBilling(officeId, {
        billingCycle: form.billingCycle,
        paymentMethod: form.paymentMethod || null,
        discountPercent: form.discountPercent === "" ? null : Number(form.discountPercent),
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      setMessage("Cobrança salva.");
      setEditingId(null);
      router.refresh();
    });
  }

  function generateAutomatico(officeId: string) {
    setError(null);
    setMessage(null);
    setQr(null);
    startTransition(async () => {
      const result = await triggerPixAutomaticoAuthorization(officeId);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setQr({ officeId, image: result.qrCodeImage ?? null, payload: result.qrCode ?? null });
      router.refresh();
    });
  }

  function testQrCode(officeId: string) {
    setError(null);
    setMessage(null);
    setQr(null);
    startTransition(async () => {
      const result = await previewPixQrCode(officeId);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setQr({ officeId, image: result.qrCodeImage ?? null, payload: result.qrCodePayload ?? null });
    });
  }

  return (
    <div>
      {(error || message) && (
        <div className="px-5 pt-4">
          {error && <p className="text-xs text-bordo-400 bg-bordo-400/15 rounded-lg px-3 py-2 mb-2">{error}</p>}
          {message && <p className="text-xs text-emerald-400 bg-emerald-400/15 rounded-lg px-3 py-2 mb-2">{message}</p>}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] font-semibold text-cream-50/40 uppercase tracking-wide border-b border-white/10">
              <th className="px-5 py-2.5 font-semibold">Escritório</th>
              <th className="px-3 py-2.5 font-semibold">Ciclo</th>
              <th className="px-3 py-2.5 font-semibold">Valor</th>
              <th className="px-3 py-2.5 font-semibold">Forma de pagamento</th>
              <th className="px-3 py-2.5 font-semibold">Status</th>
              <th className="px-3 py-2.5 font-semibold" />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {offices.map((o) => {
              const s = o.subscription;
              const isEditing = editingId === o.id;
              return (
                <Fragment key={o.id}>
                  <tr>
                    <td className="px-5 py-3">
                      <span className="text-cream-50 font-medium">{o.name}</span>
                      {o.isInternal && (
                        <span className="ml-2 inline-flex items-center text-[10px] font-semibold uppercase tracking-wide text-cream-50/40 border border-white/15 rounded px-1.5 py-0.5">
                          interno
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-cream-50/80">
                      {s ? (s.billingCycle === "SEMESTRAL" ? (s.discountPercent ? `Semestral (${s.discountPercent}% desc.)` : "Semestral") : "Mensal") : "—"}
                    </td>
                    <td className="px-3 py-3 font-mono tabular-nums text-cream-50">{s ? formatCurrency(s.monthlyFee) : "—"}</td>
                    <td className="px-3 py-3 text-cream-50/80">
                      {s?.paymentMethod ? PAYMENT_METHOD_LABEL[s.paymentMethod] ?? s.paymentMethod : "Não configurado"}
                    </td>
                    <td className="px-3 py-3">
                      {s ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-cream-50/80">
                          <LumenStatusDot tone={STATUS_TONE[s.status] ?? "slate"} /> {STATUS_LABEL[s.status] ?? s.status}
                        </span>
                      ) : (
                        <span className="text-xs text-cream-50/40">sem assinatura</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => (isEditing ? setEditingId(null) : openEdit(o))}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-gold-400 hover:underline"
                      >
                        {isEditing ? <X size={13} /> : <Pencil size={13} />}
                        {isEditing ? "Cancelar" : "Editar"}
                      </button>
                    </td>
                  </tr>

                  {isEditing && (
                    <tr>
                      <td colSpan={6} className="px-5 py-4 bg-white/5">
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                          <div>
                            <label className="text-[11px] text-cream-50/50">Ciclo</label>
                            <select
                              value={form.billingCycle}
                              onChange={(e) =>
                                setForm((p) => ({
                                  ...p,
                                  billingCycle: e.target.value as "MENSAL" | "SEMESTRAL",
                                  discountPercent: e.target.value === "MENSAL" ? "" : p.discountPercent,
                                }))
                              }
                              className="mt-1 w-full border border-white/15 bg-navy-800 text-cream-50 rounded-lg px-2.5 py-1.5 text-xs"
                            >
                              <option value="MENSAL">Mensal</option>
                              <option value="SEMESTRAL">Semestral</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[11px] text-cream-50/50">Forma de pagamento</label>
                            <select
                              value={form.paymentMethod}
                              onChange={(e) => setForm((p) => ({ ...p, paymentMethod: e.target.value as PaymentMethodOption }))}
                              className="mt-1 w-full border border-white/15 bg-navy-800 text-cream-50 rounded-lg px-2.5 py-1.5 text-xs"
                            >
                              <option value="">Não configurado</option>
                              <option value="PIX_AUTOMATICO">Pix Automático</option>
                              <option value="PIX_QRCODE">Pix QR Code</option>
                              <option value="BOLETO">Boleto</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[11px] text-cream-50/50">Desconto (%)</label>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              disabled={form.billingCycle !== "SEMESTRAL"}
                              value={form.discountPercent}
                              onChange={(e) => setForm((p) => ({ ...p, discountPercent: e.target.value }))}
                              className="mt-1 w-full border border-white/15 bg-navy-800 text-cream-50 rounded-lg px-2.5 py-1.5 text-xs disabled:opacity-40"
                            />
                          </div>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => save(o.id)}
                            className="bg-gold-600 hover:bg-gold-500 disabled:opacity-50 text-navy-950 text-xs font-semibold rounded-lg px-4 py-2"
                          >
                            Salvar
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}

                  {!isEditing && s?.paymentMethod === "PIX_AUTOMATICO" && (
                    <tr>
                      <td colSpan={6} className="px-5 py-3 bg-white/[0.02]">
                        <div className="flex items-center gap-3 flex-wrap">
                          <button
                            type="button"
                            disabled={pending || !asaasConfigured}
                            onClick={() => generateAutomatico(o.id)}
                            className="inline-flex items-center gap-1.5 bg-navy-800 hover:bg-navy-700 disabled:opacity-40 text-cream-50 text-xs font-semibold rounded-lg px-3 py-1.5"
                          >
                            <QrCode size={13} /> Gerar autorização Pix Automático
                          </button>
                          {s.pixAuthorizationStatus && (
                            <span className="text-[11px] text-cream-50/50">
                              Autorização: {PIX_AUTH_STATUS_LABEL[s.pixAuthorizationStatus] ?? s.pixAuthorizationStatus}
                            </span>
                          )}
                          {!asaasConfigured && (
                            <span className="text-[11px] text-cream-50/40">Cadastre a chave Asaas primeiro (ver README_ASAAS.md).</span>
                          )}
                        </div>
                        {qr?.officeId === o.id && <QrPanel qr={qr} />}
                      </td>
                    </tr>
                  )}

                  {!isEditing && s?.paymentMethod === "PIX_QRCODE" && (
                    <tr>
                      <td colSpan={6} className="px-5 py-3 bg-white/[0.02]">
                        <div className="flex items-center gap-3 flex-wrap">
                          <button
                            type="button"
                            disabled={pending || !asaasConfigured}
                            onClick={() => testQrCode(o.id)}
                            className="inline-flex items-center gap-1.5 bg-navy-800 hover:bg-navy-700 disabled:opacity-40 text-cream-50 text-xs font-semibold rounded-lg px-3 py-1.5"
                          >
                            <QrCode size={13} /> Testar geração de QR Code
                          </button>
                          {!asaasConfigured && (
                            <span className="text-[11px] text-cream-50/40">Cadastre a chave Asaas primeiro (ver README_ASAAS.md).</span>
                          )}
                        </div>
                        {qr?.officeId === o.id && <QrPanel qr={qr} />}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {offices.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-cream-50/40 text-sm">
                  Nenhum escritório cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function QrPanel({ qr }: { qr: QrResult }) {
  return (
    <div className="mt-3 flex items-start gap-4 flex-wrap bg-navy-950/40 border border-white/10 rounded-lg p-3">
      {qr.image && (
        // eslint-disable-next-line @next/next/no-img-element -- base64 gerado em runtime, não é um asset estático
        <img src={`data:image/png;base64,${qr.image}`} alt="QR Code Pix" className="h-32 w-32 rounded" />
      )}
      {qr.payload && (
        <div className="flex-1 min-w-[220px]">
          <p className="text-[11px] text-cream-50/50 mb-1">Pix Copia e Cola</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-[11px] text-cream-50 bg-white/5 border border-white/10 rounded px-2 py-1.5 break-all">{qr.payload}</code>
            <CopyButton text={qr.payload} label="Copiar" />
          </div>
        </div>
      )}
      {!qr.image && !qr.payload && <p className="text-xs text-cream-50/50">Gerado, mas a Asaas não devolveu QR Code desta vez.</p>}
    </div>
  );
}
