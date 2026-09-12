"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateOfficePlanModules,
  migrateOfficeToModular,
  updateOfficeBilling,
  setOfficeAccess,
} from "@/lib/actions/painelMestre";
import { updateSubscriptionBilling, triggerPixAutomaticoAuthorization, previewPixQrCode } from "@/lib/actions/subscriptionBilling";
import { calcularMensalidadeModular, MODULOS } from "@/lib/officePricing";
import StartActingModal from "@/components/painelMestre/StartActingModal";
import CopyButton from "@/components/CopyButton";
import { formatCurrency } from "@/components/ui";
import { LumenPanel, LumenPanelHeader } from "@/components/painelMestre/LumenUi";
import MoneyInput from "@/components/MoneyInput";
import NullableMoneyInput from "@/components/painelMestre/NullableMoneyInput";
import { Lock, Unlock, QrCode } from "lucide-react";

type PlanOption = {
  id: string;
  key: string;
  name: string;
  isCustom: boolean;
  maxOabs: number | null;
  maxProcessos: number | null;
  moduloFinanceiro: boolean;
  moduloWhatsapp: boolean;
  moduloAtendimento: boolean;
  moduloAssessoria: boolean;
};
type ModulePriceOption = { moduleKey: string; label: string; price: number | null };
type ModuleFlags = { financeiro: boolean; whatsapp: boolean; atendimento: boolean; assessoria: boolean };
type ModulePrices = { financeiro: number | null; whatsapp: number | null; atendimento: number | null; assessoria: number | null };
type PaymentMethodOption = "" | "PIX_AUTOMATICO" | "PIX_QRCODE" | "BOLETO";
type SubscriptionForm = {
  billingCycle: "MENSAL" | "SEMESTRAL";
  paymentMethod: PaymentMethodOption;
  discountPercent: number | null;
  pixAuthorizationStatus: "PENDENTE" | "ATIVA" | "CANCELADA" | "REJEITADA" | null;
};

const MODULE_OPTIONS: { key: keyof ModuleFlags; priceKey: keyof ModulePrices; moduleKey: ModulePriceOption["moduleKey"]; label: string }[] = [
  { key: "financeiro", priceKey: "financeiro", moduleKey: "FINANCEIRO", label: "Financeiro" },
  { key: "assessoria", priceKey: "assessoria", moduleKey: "ASSESSORIA", label: "Assessoria Jurídica" },
  { key: "whatsapp", priceKey: "whatsapp", moduleKey: "WHATSAPP", label: "WhatsApp" },
  { key: "atendimento", priceKey: "atendimento", moduleKey: "ATENDIMENTO", label: "Atendimento" },
];

// Aba "Cobrança & Assinatura" — reforma do Painel da Empresa (Fase 3): junta o que antes eram
// duas telas separadas, components/painelMestre/OfficeDetailPanel.tsx (plano/módulos/limites/
// dados de cobrança do Office) e a edição por linha de components/painelMestre/AssinaturasTable.tsx
// (ciclo/forma de pagamento/desconto/Pix, hoje removida — página /painel-mestre/assinaturas
// não existe mais). Pedido do dono do projeto ("página de assinatura é pouco funcional, ou joga
// pra dentro da aba escritórios como sub-aba"). O que fica pra outra aba: histórico de faturas,
// situação de pagamento e saúde da cobrança vão para "Faturas" (OfficeFaturasTab.tsx) — aqui é só
// CONFIGURAÇÃO (como é cobrado), lá é STATUS (o que está acontecendo agora).
export default function OfficeCobrancaTab({
  officeId,
  status,
  plans,
  modulePrices,
  pricingMode,
  usage,
  initialPlanId,
  initialModules,
  initialModulePrices,
  initialOabLimit,
  initialCaseLimit,
  initialBilling,
  subscription,
  asaasConfigured,
}: {
  officeId: string;
  status: string;
  plans: PlanOption[];
  modulePrices: ModulePriceOption[];
  pricingMode: string;
  usage: { oabs: number; processos: number };
  initialPlanId: string | null;
  initialModules: ModuleFlags;
  initialModulePrices: ModulePrices;
  initialOabLimit: number | null;
  initialCaseLimit: number | null;
  initialBilling: { billingEmail: string; monthlyFee: number; billingDueDay: number; paymentGraceDays: number; cnpj: string };
  subscription: SubscriptionForm | null;
  asaasConfigured: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [planId, setPlanId] = useState(initialPlanId);
  const [modules, setModules] = useState(initialModules);
  const [prices, setPrices] = useState(initialModulePrices);
  const [oabLimit, setOabLimit] = useState<number | null>(initialOabLimit);
  const [caseLimit, setCaseLimit] = useState<number | null>(initialCaseLimit);
  const [billing, setBilling] = useState(initialBilling);
  const [subForm, setSubForm] = useState<SubscriptionForm>(
    subscription ?? { billingCycle: "MENSAL", paymentMethod: "", discountPercent: null, pixAuthorizationStatus: null }
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<{ image: string | null; payload: string | null } | null>(null);

  function run(fn: () => Promise<{ error?: string; btgWarning?: string; asaasWarning?: string }>) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await fn();
      if (result?.error) setError(result.error);
      else if (result?.btgWarning) setMessage(`Salvo. Aviso do BTG: ${result.btgWarning}`);
      else if (result?.asaasWarning) setMessage(`Salvo, mas a Asaas recusou a cobrança Pix: ${result.asaasWarning}`);
      else setMessage("Feito.");
      router.refresh();
    });
  }

  function applyPlan(id: string) {
    setPlanId(id || null);
    const plan = plans.find((p) => p.id === id);
    if (!plan || plan.isCustom) return;
    setModules({ financeiro: plan.moduloFinanceiro, whatsapp: plan.moduloWhatsapp, atendimento: plan.moduloAtendimento, assessoria: plan.moduloAssessoria });
    setOabLimit(plan.maxOabs);
    setCaseLimit(plan.maxProcessos);
  }

  function saveSubscription() {
    setError(null);
    setMessage(null);
    setQr(null);
    startTransition(async () => {
      const result = await updateSubscriptionBilling(officeId, {
        billingCycle: subForm.billingCycle,
        paymentMethod: subForm.paymentMethod || null,
        discountPercent: subForm.discountPercent,
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      setMessage("Cobrança salva.");
      router.refresh();
    });
  }

  function generateAutomatico() {
    setError(null);
    setMessage(null);
    setQr(null);
    startTransition(async () => {
      const result = await triggerPixAutomaticoAuthorization(officeId);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setQr({ image: result.qrCodeImage ?? null, payload: result.qrCode ?? null });
      router.refresh();
    });
  }

  function testQrCode() {
    setError(null);
    setMessage(null);
    setQr(null);
    startTransition(async () => {
      const result = await previewPixQrCode(officeId);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setQr({ image: result.qrCodeImage ?? null, payload: result.qrCodePayload ?? null });
    });
  }

  const blocked = status !== "ATIVA";
  const calc = calcularMensalidadeModular({
    moduloFinanceiro: modules.financeiro,
    moduloWhatsapp: modules.whatsapp,
    moduloAtendimento: modules.atendimento,
    moduloAssessoria: modules.assessoria,
    precoFinanceiro: prices.financeiro,
    precoWhatsapp: prices.whatsapp,
    precoAtendimento: prices.atendimento,
    precoAssessoria: prices.assessoria,
  });

  return (
    <div className="space-y-5">
      {error && <p className="text-xs text-urgente bg-urgente-bg rounded-sm px-3 py-2">{error}</p>}
      {message && <p className="text-xs text-concluido bg-concluido-bg rounded-sm px-3 py-2">{message}</p>}

      <StartActingModal officeId={officeId} />

      <LumenPanel>
        <LumenPanelHeader title="Plano e módulos" />
        <div className="p-5 space-y-3">
          <div>
            <label className="text-xs font-semibold text-tx mb-1.5 block">Plano</label>
            <select value={planId ?? ""} onChange={(e) => applyPlan(e.target.value)} className="w-full border border-regua-forte rounded-sm bg-sf-apoio text-tx px-2.5 py-1.5 text-xs">
              <option value="">Sem plano definido</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {MODULE_OPTIONS.map((m) => {
              const catalogPrice = modulePrices.find((mp) => mp.moduleKey === m.moduleKey)?.price ?? null;
              return (
                <div key={m.key} className="border border-regua-forte rounded-sm px-3 py-2">
                  <label className="flex items-center gap-2 text-sm text-tx-2 cursor-pointer mb-1.5">
                    <input type="checkbox" checked={modules[m.key]} onChange={(e) => setModules((prev) => ({ ...prev, [m.key]: e.target.checked }))} className="h-4 w-4 accent-marca" />
                    {m.label}
                  </label>
                  <NullableMoneyInput
                    value={prices[m.priceKey]}
                    onChange={(v) => setPrices((prev) => ({ ...prev, [m.priceKey]: v }))}
                    placeholder={catalogPrice != null ? `sugestão: ${formatCurrency(catalogPrice)}` : "sem preço"}
                    className="w-full border border-regua-forte rounded-sm bg-sf-superficie text-tx px-2 py-1 text-xs"
                  />
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-tx-3">OABs monitoradas (limite) — hoje: {usage.oabs}</label>
              <input
                type="number" min={0} value={oabLimit ?? ""} onChange={(e) => setOabLimit(e.target.value === "" ? null : Number(e.target.value))} placeholder="sem limite"
                className={`mt-1 w-full rounded-sm border px-2.5 py-1.5 text-xs bg-sf-apoio text-tx ${oabLimit != null && usage.oabs > oabLimit ? "border-atencao" : "border-regua-forte"}`}
              />
            </div>
            <div>
              <label className="text-[11px] text-tx-3">Processos (limite) — hoje: {usage.processos}</label>
              <input
                type="number" min={0} value={caseLimit ?? ""} onChange={(e) => setCaseLimit(e.target.value === "" ? null : Number(e.target.value))} placeholder="sem limite"
                className={`mt-1 w-full rounded-sm border px-2.5 py-1.5 text-xs bg-sf-apoio text-tx ${caseLimit != null && usage.processos > caseLimit ? "border-atencao" : "border-regua-forte"}`}
              />
            </div>
          </div>
          {((oabLimit != null && usage.oabs > oabLimit) || (caseLimit != null && usage.processos > caseLimit)) && (
            <p className="text-[11px] text-atencao">Este escritório está acima do limite do plano — considere um upgrade.</p>
          )}

          <p className="text-[11px] text-tx-3">
            Mensalidade calculada: <span className="text-tx font-semibold">{formatCurrency(calc.total)}</span>
            {calc.modulosSemPreco.length > 0 && (
              <span className="text-atencao"> — módulo sem preço: {calc.modulosSemPreco.map((k) => MODULOS.find((m) => m.key === k)?.label).join(", ")}</span>
            )}
          </p>

          <button type="button" disabled={pending} onClick={() => run(() => updateOfficePlanModules(officeId, { planId, modules, prices, oabLimit, caseLimit }))} className="text-xs font-semibold text-marca-tx hover:underline disabled:opacity-50">
            Salvar módulos e plano
          </button>
        </div>
      </LumenPanel>

      <LumenPanel>
        <LumenPanelHeader title="Dados de cobrança" />
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <div>
              <label className="text-[11px] text-tx-3">E-mail de cobrança</label>
              <input value={billing.billingEmail} onChange={(e) => setBilling((p) => ({ ...p, billingEmail: e.target.value }))} className="mt-1 w-full border border-regua-forte rounded-sm bg-sf-apoio text-tx px-2.5 py-1.5 text-xs" />
            </div>
            <div>
              <label className="text-[11px] text-tx-3">Mensalidade (R$){pricingMode === "MODULAR" ? " — calculada acima" : ""}</label>
              <MoneyInput value={String(billing.monthlyFee)} onChange={(v) => setBilling((p) => ({ ...p, monthlyFee: Number(v) }))} disabled={pricingMode === "MODULAR"} className="mt-1 w-full border border-regua-forte rounded-sm bg-sf-apoio text-tx px-2.5 py-1.5 text-xs disabled:opacity-50" />
            </div>
            <div>
              <label className="text-[11px] text-tx-3">Dia de vencimento</label>
              <input type="number" min={1} max={28} value={billing.billingDueDay} onChange={(e) => setBilling((p) => ({ ...p, billingDueDay: Number(e.target.value) }))} className="mt-1 w-full border border-regua-forte rounded-sm bg-sf-apoio text-tx px-2.5 py-1.5 text-xs" />
            </div>
            <div>
              <label className="text-[11px] text-tx-3">Carência até bloqueio (dias)</label>
              <input type="number" min={1} max={90} value={billing.paymentGraceDays} onChange={(e) => setBilling((p) => ({ ...p, paymentGraceDays: Number(e.target.value) }))} className="mt-1 w-full border border-regua-forte rounded-sm bg-sf-apoio text-tx px-2.5 py-1.5 text-xs" />
            </div>
            <div>
              <label className="text-[11px] text-tx-3">CPF/CNPJ do escritório</label>
              <input value={billing.cnpj} onChange={(e) => setBilling((p) => ({ ...p, cnpj: e.target.value }))} placeholder="Necessário pra Asaas emitir boleto/Pix" className="mt-1 w-full border border-regua-forte rounded-sm bg-sf-apoio text-tx px-2.5 py-1.5 text-xs" />
            </div>
            <div>
              <label className="text-[11px] text-tx-3">Ciclo</label>
              <select value={subForm.billingCycle} onChange={(e) => setSubForm((p) => ({ ...p, billingCycle: e.target.value as "MENSAL" | "SEMESTRAL", discountPercent: e.target.value === "MENSAL" ? null : p.discountPercent }))} className="mt-1 w-full border border-regua-forte rounded-sm bg-sf-apoio text-tx px-2.5 py-1.5 text-xs">
                <option value="MENSAL">Mensal</option>
                <option value="SEMESTRAL">Semestral</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-tx-3">Forma de pagamento</label>
              <select value={subForm.paymentMethod} onChange={(e) => setSubForm((p) => ({ ...p, paymentMethod: e.target.value as PaymentMethodOption }))} className="mt-1 w-full border border-regua-forte rounded-sm bg-sf-apoio text-tx px-2.5 py-1.5 text-xs">
                <option value="">Não configurada</option>
                <option value="PIX_AUTOMATICO">Pix Automático</option>
                <option value="PIX_QRCODE">Pix QR Code</option>
                <option value="BOLETO">Boleto</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-tx-3">Desconto semestral (%)</label>
              <input type="number" min={0} max={100} disabled={subForm.billingCycle !== "SEMESTRAL"} value={subForm.discountPercent ?? ""} onChange={(e) => setSubForm((p) => ({ ...p, discountPercent: e.target.value === "" ? null : Number(e.target.value) }))} className="mt-1 w-full border border-regua-forte rounded-sm bg-sf-apoio text-tx px-2.5 py-1.5 text-xs disabled:opacity-40" />
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap pt-1">
            <button type="button" disabled={pending} onClick={saveSubscription} className="text-xs font-semibold text-marca-tx hover:underline disabled:opacity-50">
              Salvar cobrança e ciclo
            </button>
            <button type="button" disabled={pending || pricingMode === "MODULAR"} onClick={() => run(() => updateOfficeBilling(officeId, billing))} className="text-xs font-semibold text-marca-tx hover:underline disabled:opacity-50">
              Salvar dados de cobrança
            </button>
            {pricingMode === "MANUAL" ? (
              <button type="button" disabled={pending} onClick={() => run(() => migrateOfficeToModular(officeId))} className="text-xs font-semibold text-tx-2 hover:text-tx hover:underline disabled:opacity-50" title="Confira que a mensalidade calculada acima bate com o que o cliente já paga antes de migrar">
                Migrar para cálculo automático
              </button>
            ) : (
              <span className="text-[11px] text-tx-3">Mensalidade calculada automaticamente pelos módulos</span>
            )}
          </div>

          {subForm.paymentMethod === "PIX_AUTOMATICO" && (
            <div className="pt-2 border-t border-regua">
              <div className="flex items-center gap-3 flex-wrap">
                <button type="button" disabled={pending || !asaasConfigured} onClick={generateAutomatico} className="inline-flex items-center gap-1.5 bg-sf-apoio hover:bg-sf-superficie disabled:opacity-40 text-tx text-xs font-semibold px-3 py-1.5 rounded-sm">
                  <QrCode size={13} /> Gerar autorização Pix Automático
                </button>
                {subForm.pixAuthorizationStatus && <span className="text-[11px] text-tx-3">Autorização: {subForm.pixAuthorizationStatus.toLowerCase()}</span>}
                {!asaasConfigured && <span className="text-[11px] text-tx-3">Cadastre a chave Asaas primeiro (ver README_ASAAS.md).</span>}
              </div>
              {qr && <QrPanel qr={qr} />}
            </div>
          )}
          {subForm.paymentMethod === "PIX_QRCODE" && (
            <div className="pt-2 border-t border-regua">
              <div className="flex items-center gap-3 flex-wrap">
                <button type="button" disabled={pending || !asaasConfigured} onClick={testQrCode} className="inline-flex items-center gap-1.5 bg-sf-apoio hover:bg-sf-superficie disabled:opacity-40 text-tx text-xs font-semibold px-3 py-1.5 rounded-sm">
                  <QrCode size={13} /> Testar geração de QR Code
                </button>
                {!asaasConfigured && <span className="text-[11px] text-tx-3">Cadastre a chave Asaas primeiro (ver README_ASAAS.md).</span>}
              </div>
              {qr && <QrPanel qr={qr} />}
            </div>
          )}
        </div>
      </LumenPanel>

      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => setOfficeAccess(officeId, !blocked))}
        className={`inline-flex items-center justify-center gap-1.5 border rounded-sm text-sm font-semibold px-4 py-2.5 ${blocked ? "border-concluido text-concluido" : "border-atencao text-atencao"}`}
      >
        {blocked ? <Unlock size={14} /> : <Lock size={14} />}
        {blocked ? "Liberar acesso" : "Bloquear acesso agora"}
      </button>
    </div>
  );
}

function QrPanel({ qr }: { qr: { image: string | null; payload: string | null } }) {
  return (
    <div className="mt-3 flex items-start gap-4 flex-wrap bg-sf-apoio border border-regua rounded-sm p-3">
      {qr.image && (
        // eslint-disable-next-line @next/next/no-img-element -- base64 gerado em runtime, não é um asset estático
        <img src={`data:image/png;base64,${qr.image}`} alt="QR Code Pix" className="h-32 w-32 rounded-sm" />
      )}
      {qr.payload && (
        <div className="flex-1 min-w-[220px]">
          <p className="text-[11px] text-tx-3 mb-1">Pix Copia e Cola</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-[11px] text-tx bg-sf-superficie border border-regua rounded-sm px-2 py-1.5 break-all">{qr.payload}</code>
            <CopyButton text={qr.payload} label="Copiar" />
          </div>
        </div>
      )}
      {!qr.image && !qr.payload && <p className="text-xs text-tx-3">Gerado, mas a Asaas não devolveu QR Code desta vez.</p>}
    </div>
  );
}
