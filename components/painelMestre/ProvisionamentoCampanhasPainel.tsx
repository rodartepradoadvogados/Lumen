"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { tentarProvisionarPerfilAgora } from "@/lib/actions/campanhasPainelMestre";
import { LumenBadge } from "@/components/painelMestre/LumenUi";
import { rotuloDaSituacaoDoProvisionamento } from "@/lib/telaCampanhas";
import type { SituacaoDoProvisionamento } from "@/lib/provisionamentoCampanhas";

// ============================================================================
// O ESTADO DE PROVISIONAMENTO DE CADA ESCRITÓRIO (§3/§4 da nota técnica) — é a tela onde Jairo
// AGE depois de receber o e-mail de falha definitiva (lib/actions/provisionamentoCampanhas.ts:
// avisarDonosDeFalhaDeProvisionamento). "Tentar de novo" chama a MESMA função que o cron de
// segurança chama — nunca uma segunda tentativa escrita à parte (ver a nota técnica da Frente C,
// item 3: "um reprocessamento manual futuro (Frente D)").
// ============================================================================

export type ProvisionamentoDeEscritorio = {
  perfilId: string;
  officeName: string;
  situacao: SituacaoDoProvisionamento;
};

const TOM_PARA_VARIANTE: Record<string, "success" | "warning" | "danger" | "default"> = {
  ok: "success",
  warn: "warning",
  risk: "danger",
  neutro: "default",
};

export default function ProvisionamentoCampanhasPainel({ escritorios }: { escritorios: ProvisionamentoDeEscritorio[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [processando, setProcessando] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

  function tentarDeNovo(perfilId: string) {
    setMensagem(null);
    setProcessando(perfilId);
    startTransition(async () => {
      const r = await tentarProvisionarPerfilAgora(perfilId);
      if ("error" in r) setMensagem(r.error);
      else setMensagem(`Resultado: ${r.resultado}`);
      setProcessando(null);
      router.refresh();
    });
  }

  if (escritorios.length === 0) {
    return <p className="px-5 py-8 text-center text-sm text-tx-3">Nenhum escritório com perfil de campanha ainda.</p>;
  }

  return (
    <div className="divide-y divide-regua">
      {mensagem && <p className="px-5 py-2 text-xs text-tx-2">{mensagem}</p>}
      {escritorios.map((e) => {
        const r = rotuloDaSituacaoDoProvisionamento(e.situacao);
        const podeTentarDeNovo = e.situacao.situacao === "TENTANDO_DE_NOVO" || e.situacao.situacao === "FALHOU_DEFINITIVAMENTE";
        return (
          <div key={e.perfilId} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
            <span className="flex-1 min-w-0 truncate text-sm font-semibold text-tx">{e.officeName}</span>
            <LumenBadge variant={TOM_PARA_VARIANTE[r.tom]}>{r.texto}</LumenBadge>
            {podeTentarDeNovo && (
              <button
                type="button"
                disabled={pending && processando === e.perfilId}
                onClick={() => tentarDeNovo(e.perfilId)}
                className="text-xs font-semibold text-marca-tx hover:underline disabled:opacity-50"
              >
                Tentar de novo
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
