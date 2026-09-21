"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { liberarCampanhaSlot } from "@/lib/actions/campanhasPainelMestre";
import { LumenBadge } from "@/components/painelMestre/LumenUi";

// ============================================================================
// "LIBERAR CAMPANHA" (§6.3-6.4) — a tela que abre ao clicar na solicitação pendente. Aprovar ou
// recusar chama DIRETO as ações da Frente B (lib/actions/campanhasCobranca.ts); nenhuma regra de
// cobrança é decidida aqui.
//
// QUEM APROVA: a §6.4 dizia "qualquer login do painel mestre, sem papel granular", e o dono
// REVISOU isso depois de ver a tela pronta — agora são quatro papéis (Comercial, Marketing,
// Financeiro, Sócio), em lib/aprovacaoDeCampanha.ts. A tela esconde os botões de quem não pode E
// diz por quê; a trava que vale mora na Server Action, porque esconder botão não impede ninguém
// de chamar a ação direto.
// ============================================================================

export type SolicitacaoDeCampanha = {
  slotId: string;
  officeName: string;
  campanhaNome: string;
  formaDePagamento: string | null;
  solicitadoEm: string;
};

const ROTULO_FORMA: Record<string, string> = {
  BOLETO: "Boleto",
  PIX_QRCODE: "Pix (QR Code)",
  PIX_AUTOMATICO: "Pix automático recorrente",
};

export default function SolicitacoesDeCampanhaPainel({
  solicitacoes,
  podeDecidir,
}: {
  solicitacoes: SolicitacaoDeCampanha[];
  podeDecidir: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [processando, setProcessando] = useState<string | null>(null);

  function decidir(slotId: string, decisao: "APROVAR" | "RECUSAR") {
    setErro(null);
    setProcessando(slotId);
    startTransition(async () => {
      const r = await liberarCampanhaSlot(slotId, decisao);
      if (!r.ok) setErro(r.motivo ?? "Não foi possível processar agora.");
      setProcessando(null);
      router.refresh();
    });
  }

  if (solicitacoes.length === 0) {
    return <p className="px-5 py-8 text-center text-sm text-tx-3">Nenhuma solicitação de campanha pendente.</p>;
  }

  return (
    <div className="divide-y divide-regua">
      {erro && <p className="px-5 py-2 text-xs text-urgente">{erro}</p>}
      {solicitacoes.map((s) => (
        <div key={s.slotId} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-tx">
              {s.officeName} <span className="font-normal text-tx-2">— {s.campanhaNome}</span>
            </p>
            <p className="text-xs text-tx-3">
              Pedido em {s.solicitadoEm} · forma de pagamento: {s.formaDePagamento ? ROTULO_FORMA[s.formaDePagamento] ?? s.formaDePagamento : "não escolhida"}
            </p>
          </div>
          <LumenBadge variant="warning">Aguardando decisão</LumenBadge>
          {podeDecidir ? (
            <>
              <button
                type="button"
                disabled={pending && processando === s.slotId}
                onClick={() => decidir(s.slotId, "APROVAR")}
                className="text-xs font-semibold text-concluido hover:underline disabled:opacity-50"
              >
                Aprovar
              </button>
              <button
                type="button"
                disabled={pending && processando === s.slotId}
                onClick={() => decidir(s.slotId, "RECUSAR")}
                className="text-xs font-semibold text-urgente hover:underline disabled:opacity-50"
              >
                Recusar
              </button>
            </>
          ) : (
            // Some o botão, mas NUNCA a informação: quem não decide continua vendo a fila e o
            // motivo de não poder agir — tela que esconde sem explicar vira chamado de suporte.
            <span className="text-xs text-tx-3">Sem permissão para decidir</span>
          )}
        </div>
      ))}
    </div>
  );
}
