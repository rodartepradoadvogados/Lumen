"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { solicitarNovaCampanha } from "@/lib/actions/campanhasTela";
import { ordinal } from "@/lib/telaCampanhas";
import { formatCurrency } from "@/components/ui";
import type { PrecoDoModulo, PrecoOmitido } from "@/lib/moduloCampanhas";

// ============================================================================
// O POP-UP DE "SOLICITAR CAMPANHA" (§6.1-6.2 da especificação fechada).
//
// TRÊS COISAS QUE A ESPECIFICAÇÃO EXIGE POR ESCRITO, E QUE ESTE COMPONENTE NÃO PODE OMITIR:
//   1. O preço que será cobrado DEPOIS da aprovação (nunca antes — a cobrança só nasce quando o
//      painel mestre aprova, ver lib/actions/campanhasCobranca.ts:aprovarCampanhaSlotPago).
//   2. As três formas de pagamento, escolhidas AQUI, antes da aprovação.
//   3. Se o preço não está configurado, o pop-up diz isso por escrito e NÃO deixa solicitar —
//      nunca "R$ 0,00", nunca um botão que gera cobrança sem preço (§2, item em aberto).
// ============================================================================

const FORMAS_DE_PAGAMENTO = [
  { valor: "BOLETO", rotulo: "Boleto" },
  { valor: "PIX_QRCODE", rotulo: "Pix (QR Code)" },
  { valor: "PIX_AUTOMATICO", rotulo: "Pix automático recorrente" },
] as const;

export default function SolicitarCampanhaModal({
  numeroDaProximaCampanha,
  precoDoModulo,
  aoFechar,
}: {
  /** Sempre relativo ao que está ativo AGORA (§6.1) — vem já calculado por
   * lib/moduloCampanhas.ts:numeroDaProximaCampanha, nunca recontado aqui. */
  numeroDaProximaCampanha: number;
  precoDoModulo: PrecoDoModulo | PrecoOmitido;
  aoFechar: () => void;
}) {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [formaDePagamento, setFormaDePagamento] = useState<string>("BOLETO");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, comecar] = useTransition();

  function solicitar() {
    setErro(null);
    if (!nome.trim()) {
      setErro("Dê um nome a esta campanha.");
      return;
    }
    comecar(async () => {
      const r = await solicitarNovaCampanha({ nome, formaDePagamento });
      if (!r.ok) {
        setErro(r.motivo);
        return;
      }
      router.refresh();
      aoFechar();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-grafite-900/50 sm:items-center" role="dialog" aria-modal="true" aria-label="Solicitar campanha">
      <div className="flex w-full max-w-[520px] flex-col overflow-hidden border border-regua bg-sf sm:max-h-[90vh]">
        <div className="flex items-start justify-between gap-3 border-b border-regua px-5 py-4">
          <div>
            <h2 className="text-destaque font-semibold text-tx">Solicitar campanha</h2>
            <p className="mt-0.5 text-etiqueta text-tx-2">
              Esta será a sua {ordinal(numeroDaProximaCampanha)} campanha simultânea.
            </p>
          </div>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="shrink-0 rounded p-1.5 text-tx-2 hover:bg-sf-apoio">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-5">
          {erro && <p className="border border-linha-urgente bg-urgente-bg px-3 py-2 text-corpo text-urgente">{erro}</p>}

          {!precoDoModulo.configurado ? (
            <p className="border border-linha-aviso bg-aviso-bg px-3 py-2 text-corpo text-aviso">{precoDoModulo.motivo}</p>
          ) : (
            <div className="border border-regua bg-sf-apoio p-3">
              <p className="text-corpo text-tx">
                <strong>{formatCurrency(precoDoModulo.precoSlotExtra)}/mês</strong>, cobrados{" "}
                <strong>somente depois da aprovação</strong> do painel mestre — recorrente enquanto esta campanha
                estiver ativa. Ao finalizar a campanha, a cobrança deste slot para.
              </p>
            </div>
          )}

          <div>
            <label className="mb-1 block text-etiqueta font-semibold text-tx">Nome desta campanha</label>
            <input
              className="cfg-input w-full"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Campanha de Dia das Mães"
              disabled={!precoDoModulo.configurado}
            />
            <p className="mt-1 text-etiqueta text-tx-3">
              Só o nome interno agora — o roteiro completo (gatilho, perguntas, mensagens) você preenche depois de
              aprovada, no mesmo assistente de sempre.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-etiqueta font-semibold text-tx">Forma de pagamento</label>
            <div className="space-y-1.5">
              {FORMAS_DE_PAGAMENTO.map((f) => (
                <label
                  key={f.valor}
                  className="flex min-h-11 cursor-pointer items-center gap-2 border border-regua px-3 text-corpo text-tx hover:bg-sf-apoio"
                >
                  <input
                    type="radio"
                    name="formaDePagamento"
                    value={f.valor}
                    checked={formaDePagamento === f.valor}
                    onChange={() => setFormaDePagamento(f.valor)}
                    disabled={!precoDoModulo.configurado}
                    className="h-4 w-4 accent-[var(--acao)]"
                  />
                  {f.rotulo}
                </label>
              ))}
            </div>
            <p className="mt-1 text-etiqueta text-tx-3">Você escolhe agora; a cobrança só é gerada se o pedido for aprovado.</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-regua px-5 py-4">
          <button type="button" onClick={aoFechar} className="min-h-11 border border-regua px-4 text-etiqueta font-semibold text-tx hover:bg-sf-apoio">
            Cancelar
          </button>
          <button
            type="button"
            onClick={solicitar}
            disabled={pendente || !precoDoModulo.configurado}
            className="inline-flex min-h-11 items-center gap-1.5 bg-acao px-4 text-etiqueta font-semibold text-acao-tx hover:bg-acao-hover disabled:opacity-50"
          >
            {pendente ? "Enviando…" : "Solicitar campanha"}
          </button>
        </div>
      </div>
    </div>
  );
}
