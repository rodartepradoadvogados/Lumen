"use client";

// Fase 3 — Cobrança Lúmen (Asaas): tabela de Assinaturas do Painel Mestre, editável. Antes desta
// entrega a página era só leitura (ver comentário removido em app/painel-mestre/assinaturas/
// page.tsx) — aqui um botão "Editar" por linha abre um formulário inline com os 3 campos que
// updateSubscriptionBilling aceita, e os botões de Pix (autorização/teste) aparecem condicionados
// à forma de pagamento já salva. Estilo segue components/painelMestre/LumenUi.tsx (sempre navy +
// cream, sem variantes dark:, porque LumenPanel nunca muda de tema).
//
// Pedido do dono da plataforma ("bater o olho e saber se a cobrança está saudável, sem abrir
// cada escritório nem consultar o Asaas"): três acréscimos por escritório, todos calculados a
// partir da fatura mais recente que app/painel-mestre/assinaturas/page.tsx já carrega —
//   1. Vencimento + Situação do pagamento (Pago/Em aberto/Vencida/Cancelada/"sem fatura gerada");
//   2. Entrega da cobrança — texto CONDICIONAL à forma de pagamento (boleto/QR Code vs. Pix
//      Automático, que não tem nada pra "enviar" a cada fatura — só uma autorização única);
//   3. Selo "Cobrança" com o nível devolvido por lib/billingHealth.ts:avaliarSaudeCobranca
//      (já calculado no server, em app/painel-mestre/assinaturas/page.tsx) + a lista de motivos
//      em português, sempre visível abaixo do selo (não escondida atrás de hover), porque o
//      objetivo é o dono da plataforma saber o que fazer, não só que "tem algo errado".

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSubscriptionBilling, triggerPixAutomaticoAuthorization, previewPixQrCode } from "@/lib/actions/subscriptionBilling";
import { formatCurrency, formatDate } from "@/components/ui";
import { LumenStatusDot } from "@/components/painelMestre/LumenUi";
import CopyButton from "@/components/CopyButton";
import { Pencil, X, QrCode, CheckCircle2, AlertTriangle, AlertCircle, HelpCircle } from "lucide-react";
import type { NivelSaudeCobranca } from "@/lib/billingHealth";

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

const NIVEL_LABEL: Record<NivelSaudeCobranca, string> = {
  OK: "Cobrança OK",
  ATENCAO: "Atenção",
  PROBLEMA: "Problema",
  NAO_CONFIGURADA: "Não configurada",
};
const NIVEL_ICON: Record<NivelSaudeCobranca, typeof CheckCircle2> = {
  OK: CheckCircle2,
  ATENCAO: AlertTriangle,
  PROBLEMA: AlertCircle,
  NAO_CONFIGURADA: HelpCircle,
};
const NIVEL_TEXT_CLASS: Record<NivelSaudeCobranca, string> = {
  OK: "text-concluido",
  ATENCAO: "text-aviso",
  PROBLEMA: "text-urgente",
  NAO_CONFIGURADA: "text-white/50",
};

type SubscriptionInfo = {
  monthlyFee: number;
  status: string;
  billingCycle: string;
  paymentMethod: string | null;
  discountPercent: number | null;
  pixAuthorizationStatus: string | null;
};

type UltimaFatura = {
  competencia: string;
  amount: number;
  dueDate: string;
  status: string; // PENDENTE | PAGO | CANCELADO
  paidAt: string | null;
  boletoUrl: string | null;
  pixQrCodePayload: string | null;
  remindersSent: string[];
} | null;

type Saude = { nivel: NivelSaudeCobranca; motivos: string[] } | null;

type OfficeRow = {
  id: string;
  name: string;
  isInternal: boolean;
  subscription: SubscriptionInfo | null;
  ultimaFatura: UltimaFatura;
  faturasVencidasAbertas: number;
  saude: Saude;
};

type PaymentMethodOption = "" | "PIX_AUTOMATICO" | "PIX_QRCODE" | "BOLETO";

type FormState = { billingCycle: "MENSAL" | "SEMESTRAL"; paymentMethod: PaymentMethodOption; discountPercent: string };

type QrResult = { officeId: string; image: string | null; payload: string | null };

// Deriva a situação do pagamento a partir da fatura mais recente — puramente de exibição (não
// precisa ser testada isoladamente como avaliarSaudeCobranca; usa o relógio do navegador, mesmo
// padrão já usado em components/painelMestre/OfficeDetailPanel.tsx pro histórico de faturas).
function situacaoPagamento(fatura: UltimaFatura, faturasVencidasAbertas: number): { label: string; tone: "ok" | "warn" | "risk" | "slate" } {
  if (!fatura) return { label: "Sem fatura gerada", tone: "slate" };
  if (fatura.status === "CANCELADO") return { label: "Cancelada", tone: "slate" };
  if (fatura.status === "PAGO") return { label: `Pago em ${fatura.paidAt ? formatDate(fatura.paidAt) : "—"}`, tone: "ok" };
  // PENDENTE — vencida a partir do próprio dia do vencimento, mesmo critério de
  // lib/actions/billing.ts (diasParaVencer <= 0 dispara o lembrete "VENCIDA").
  const venceu = new Date(fatura.dueDate).getTime() <= Date.now();
  if (venceu) {
    return { label: faturasVencidasAbertas > 1 ? `Vencida (${faturasVencidasAbertas} em aberto)` : "Vencida", tone: "risk" };
  }
  return { label: "Em aberto", tone: "warn" };
}

// Texto de "entrega da cobrança" — a parte que o dono da plataforma disse não saber como
// mostrar pro Pix Automático ("não sei como seria"): não existe boleto nem QR Code pra enviar a
// cada fatura, é um débito autorizado uma única vez, então o texto explica isso em vez de
// deixar a célula vazia.
function entregaCobranca(paymentMethod: string | null, fatura: UltimaFatura, pixAuthStatus: string | null): string {
  if (!paymentMethod) return "Forma de cobrança ainda não configurada.";

  if (paymentMethod === "PIX_AUTOMATICO") {
    if (pixAuthStatus === "ATIVA") return "Débito automático autorizado pelo cliente — não há boleto nem QR Code pra enviar a cada fatura.";
    if (pixAuthStatus === "PENDENTE") return "Autorização enviada ao cliente; aguardando confirmação no aplicativo do banco.";
    if (pixAuthStatus === "REJEITADA") return "Autorização foi rejeitada pelo banco do cliente — gere uma nova autorização.";
    if (pixAuthStatus === "CANCELADA") return "Autorização foi cancelada pelo cliente — o débito automático parou.";
    return "Autorização de Pix Automático ainda não foi gerada — use o botão abaixo.";
  }

  if (!fatura) return "Nenhuma fatura gerada ainda.";

  // remindersSent guarda TODO e-mail de cobrança que saiu de verdade por esta fatura, não só os
  // lembretes do cron: "FATURA_INICIAL" é gravado por generateAndSendInvoice assim que o e-mail
  // com o boleto/QR Code é entregue (ver prisma/schema.prisma:TenantInvoice.remindersSent). Por
  // isso o texto fala em "enviado por e-mail" e não em "lembrete" — no dia em que a fatura é
  // gerada, o envio já conta.
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
          {error && <p className="text-xs text-urgente bg-urgente-bg rounded-lg px-3 py-2 mb-2">{error}</p>}
          {message && <p className="text-xs text-concluido bg-concluido-bg rounded-lg px-3 py-2 mb-2">{message}</p>}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] font-semibold text-white/40 uppercase tracking-wide border-b border-white/10">
              <th className="px-5 py-2.5 font-semibold">Escritório</th>
              <th className="px-3 py-2.5 font-semibold">Ciclo</th>
              <th className="px-3 py-2.5 font-semibold">Valor</th>
              <th className="px-3 py-2.5 font-semibold">Forma de pagamento</th>
              <th className="px-3 py-2.5 font-semibold">Vencimento</th>
              <th className="px-3 py-2.5 font-semibold">Situação do pagamento</th>
              <th className="px-3 py-2.5 font-semibold">Assinatura</th>
              <th className="px-3 py-2.5 font-semibold">Cobrança</th>
              <th className="px-3 py-2.5 font-semibold" />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {offices.map((o) => {
              const s = o.subscription;
              const isEditing = editingId === o.id;
              const situacao = situacaoPagamento(o.ultimaFatura, o.faturasVencidasAbertas);
              const entrega = s ? entregaCobranca(s.paymentMethod, o.ultimaFatura, s.pixAuthorizationStatus) : "";
              const NivelIcon = o.saude ? NIVEL_ICON[o.saude.nivel] : null;

              return (
                <Fragment key={o.id}>
                  <tr>
                    <td className="px-5 py-3 align-top">
                      <span className="text-white font-medium">{o.name}</span>
                      {o.isInternal && (
                        <span className="ml-2 inline-flex items-center text-[10px] font-semibold uppercase tracking-wide text-white/40 border border-white/15 rounded px-1.5 py-0.5">
                          interno
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 align-top text-white/80">
                      {s ? (s.billingCycle === "SEMESTRAL" ? (s.discountPercent ? `Semestral (${s.discountPercent}% desc.)` : "Semestral") : "Mensal") : "—"}
                    </td>
                    <td className="px-3 py-3 align-top font-mono tabular-nums text-white">{s ? formatCurrency(s.monthlyFee) : "—"}</td>
                    <td className="px-3 py-3 align-top text-white/80">
                      {s?.paymentMethod ? PAYMENT_METHOD_LABEL[s.paymentMethod] ?? s.paymentMethod : "Não configurada"}
                    </td>
                    <td className="px-3 py-3 align-top font-mono tabular-nums text-white/80 whitespace-nowrap">
                      {o.ultimaFatura ? formatDate(o.ultimaFatura.dueDate) : <span className="text-white/40 font-sans">sem fatura gerada</span>}
                    </td>
                    <td className="px-3 py-3 align-top whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/80">
                        <LumenStatusDot tone={situacao.tone} /> {situacao.label}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-top">
                      {s ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/80">
                          <LumenStatusDot tone={STATUS_TONE[s.status] ?? "slate"} /> {STATUS_LABEL[s.status] ?? s.status}
                        </span>
                      ) : (
                        <span className="text-xs text-white/40">sem assinatura</span>
                      )}
                    </td>
                    <td className="px-3 py-3 align-top whitespace-nowrap">
                      {o.isInternal || !o.saude ? (
                        <span className="text-xs text-white/40">— interno —</span>
                      ) : (
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${NIVEL_TEXT_CLASS[o.saude.nivel]}`}>
                          {NivelIcon && <NivelIcon size={13} />}
                          {NIVEL_LABEL[o.saude.nivel]}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 align-top text-right">
                      <button
                        type="button"
                        onClick={() => (isEditing ? setEditingId(null) : openEdit(o))}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-marca hover:underline"
                      >
                        {isEditing ? <X size={13} /> : <Pencil size={13} />}
                        {isEditing ? "Cancelar" : "Editar"}
                      </button>
                    </td>
                  </tr>

                  {/* Linha de detalhe — entrega da cobrança (condicional à forma) + motivos do selo
                      "Cobrança", sempre visível (não escondida atrás de hover/tooltip): o objetivo
                      é o dono da plataforma saber O QUE FAZER, não só que existe um problema. */}
                  {!isEditing && !o.isInternal && s?.paymentMethod && (
                    <tr>
                      <td colSpan={9} className="px-5 py-2.5 bg-white/[0.02]">
                        <p className="text-[11px] text-white/60">
                          <span className="font-semibold text-white/70">Entrega da cobrança: </span>
                          {entrega}
                        </p>
                        {o.saude && o.saude.nivel !== "OK" && o.saude.motivos.length > 0 && (
                          <ul className="mt-1 space-y-0.5">
                            {o.saude.motivos.map((motivo, i) => (
                              <li key={i} className={`text-[11px] flex items-start gap-1.5 ${NIVEL_TEXT_CLASS[o.saude!.nivel]}`}>
                                <span className="mt-1 h-1 w-1 rounded-full bg-current shrink-0" />
                                {motivo}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )}
                  {!isEditing && !o.isInternal && !s?.paymentMethod && o.saude && (
                    <tr>
                      <td colSpan={9} className="px-5 py-2.5 bg-white/[0.02]">
                        <p className="text-[11px] text-white/60">{o.saude.motivos[0]}</p>
                      </td>
                    </tr>
                  )}

                  {isEditing && (
                    <tr>
                      <td colSpan={9} className="px-5 py-4 bg-white/5">
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                          <div>
                            <label className="text-[11px] text-white/50">Ciclo</label>
                            <select
                              value={form.billingCycle}
                              onChange={(e) =>
                                setForm((p) => ({
                                  ...p,
                                  billingCycle: e.target.value as "MENSAL" | "SEMESTRAL",
                                  discountPercent: e.target.value === "MENSAL" ? "" : p.discountPercent,
                                }))
                              }
                              className="mt-1 w-full border border-white/15 bg-grafite-700 text-white rounded-lg px-2.5 py-1.5 text-xs"
                            >
                              <option value="MENSAL">Mensal</option>
                              <option value="SEMESTRAL">Semestral</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[11px] text-white/50">Forma de pagamento</label>
                            <select
                              value={form.paymentMethod}
                              onChange={(e) => setForm((p) => ({ ...p, paymentMethod: e.target.value as PaymentMethodOption }))}
                              className="mt-1 w-full border border-white/15 bg-grafite-700 text-white rounded-lg px-2.5 py-1.5 text-xs"
                            >
                              <option value="">Não configurado</option>
                              <option value="PIX_AUTOMATICO">Pix Automático</option>
                              <option value="PIX_QRCODE">Pix QR Code</option>
                              <option value="BOLETO">Boleto</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[11px] text-white/50">Desconto (%)</label>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              disabled={form.billingCycle !== "SEMESTRAL"}
                              value={form.discountPercent}
                              onChange={(e) => setForm((p) => ({ ...p, discountPercent: e.target.value }))}
                              className="mt-1 w-full border border-white/15 bg-grafite-700 text-white rounded-lg px-2.5 py-1.5 text-xs disabled:opacity-40"
                            />
                          </div>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => save(o.id)}
                            className="bg-acao hover:bg-acao-hover disabled:opacity-50 text-acao-tx text-xs font-semibold rounded-lg px-4 py-2 transition-colors"
                          >
                            Salvar
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}

                  {!isEditing && s?.paymentMethod === "PIX_AUTOMATICO" && (
                    <tr>
                      <td colSpan={9} className="px-5 py-3 bg-white/[0.02]">
                        <div className="flex items-center gap-3 flex-wrap">
                          <button
                            type="button"
                            disabled={pending || !asaasConfigured}
                            onClick={() => generateAutomatico(o.id)}
                            className="inline-flex items-center gap-1.5 bg-grafite-700 hover:bg-grafite-500 disabled:opacity-40 text-white text-xs font-semibold rounded-lg px-3 py-1.5"
                          >
                            <QrCode size={13} /> Gerar autorização Pix Automático
                          </button>
                          {s.pixAuthorizationStatus && (
                            <span className="text-[11px] text-white/50">
                              Autorização: {PIX_AUTH_STATUS_LABEL[s.pixAuthorizationStatus] ?? s.pixAuthorizationStatus}
                            </span>
                          )}
                          {!asaasConfigured && (
                            <span className="text-[11px] text-white/40">Cadastre a chave Asaas primeiro (ver README_ASAAS.md).</span>
                          )}
                        </div>
                        {qr?.officeId === o.id && <QrPanel qr={qr} />}
                      </td>
                    </tr>
                  )}

                  {!isEditing && s?.paymentMethod === "PIX_QRCODE" && (
                    <tr>
                      <td colSpan={9} className="px-5 py-3 bg-white/[0.02]">
                        <div className="flex items-center gap-3 flex-wrap">
                          <button
                            type="button"
                            disabled={pending || !asaasConfigured}
                            onClick={() => testQrCode(o.id)}
                            className="inline-flex items-center gap-1.5 bg-grafite-700 hover:bg-grafite-500 disabled:opacity-40 text-white text-xs font-semibold rounded-lg px-3 py-1.5"
                          >
                            <QrCode size={13} /> Testar geração de QR Code
                          </button>
                          {!asaasConfigured && (
                            <span className="text-[11px] text-white/40">Cadastre a chave Asaas primeiro (ver README_ASAAS.md).</span>
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
                <td colSpan={9} className="px-5 py-8 text-center text-white/40 text-sm">
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
    <div className="mt-3 flex items-start gap-4 flex-wrap bg-grafite-900/40 border border-white/10 rounded-lg p-3">
      {qr.image && (
        // eslint-disable-next-line @next/next/no-img-element -- base64 gerado em runtime, não é um asset estático
        <img src={`data:image/png;base64,${qr.image}`} alt="QR Code Pix" className="h-32 w-32 rounded" />
      )}
      {qr.payload && (
        <div className="flex-1 min-w-[220px]">
          <p className="text-[11px] text-white/50 mb-1">Pix Copia e Cola</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-[11px] text-white bg-white/5 border border-white/10 rounded px-2 py-1.5 break-all">{qr.payload}</code>
            <CopyButton text={qr.payload} label="Copiar" />
          </div>
        </div>
      )}
      {!qr.image && !qr.payload && <p className="text-xs text-white/50">Gerado, mas a Asaas não devolveu QR Code desta vez.</p>}
    </div>
  );
}
