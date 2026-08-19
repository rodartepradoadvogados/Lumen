"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registrarRevelacao } from "@/lib/actions/mask";
import type { MaskKind } from "@/lib/mask";
import { Lock, Unlock } from "lucide-react";

const REASON_MIN_LENGTH = 20;

// Break-glass INTERNO por campo (documento 07, Fase 4) — a própria equipe do escritório revelando
// um campo mascarado (ver components/Sensivel.tsx), nunca o quebra-vidro do suporte da plataforma
// (esse é components/BreakGlassReveal.tsx, ator/model diferentes — ver lib/actions/mask.ts).
//
// `revelado` vem do SERVIDOR: o Server Component da tela é quem decide, chamando
// revelacaoAtiva() antes de renderizar, se já existe uma revelação válida (≤15min) deste usuário
// para este registro+campo — só nesse caso ele passa o valor cru como prop. Sem revelação ativa,
// `revelado` vem undefined e o valor cru nunca trafega para o cliente. Depois de confirmar o
// motivo aqui, chamamos router.refresh() para o servidor rodar essa checagem de novo e, se
// aprovado, mandar o valor na renderização seguinte — nunca pelo retorno desta action.
//
// Filete 4px e rótulo BREAK-GLASS em `--vinho` (documento 07) — mesmo token de `--atencao`
// (ver tailwind.config.ts), já usado no único outro botão vinho sólido do produto (confirmação de
// exclusão, ver components/DeleteEntityButton.tsx).
export default function BreakGlassField({
  entityType,
  entityId,
  field,
  mascarado,
  revelado,
}: {
  entityType: string;
  entityId: string;
  field: MaskKind;
  mascarado: string;
  revelado?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (revelado !== undefined) {
    return (
      <span className="inline-flex items-center gap-1.5 border-l-4 border-atencao pl-2 tabular-nums">
        <Unlock size={11} className="text-atencao shrink-0" aria-hidden />
        <span>{revelado}</span>
        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-atencao">break-glass</span>
      </span>
    );
  }

  function confirmar() {
    setError(null);
    startTransition(async () => {
      const result = await registrarRevelacao({ entityType, entityId, field, reason });
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setReason("");
      router.refresh();
    });
  }

  if (!open) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Lock size={11} className="text-tx-3 shrink-0" aria-hidden />
        <span className="tabular-nums">{mascarado}</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-[11px] font-semibold text-atencao hover:underline"
        >
          Revelar
        </button>
      </span>
    );
  }

  return (
    <div className="mt-1.5 border-l-4 border-atencao bg-sf-apoio p-3 text-xs space-y-2 max-w-sm">
      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-atencao">Break-glass</p>
      <p className="text-tx-2">
        Revelar exige um motivo — fica registrado na trilha de auditoria do escritório e a revelação dura 15 minutos.
      </p>
      <textarea
        autoFocus
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder="Motivo (mínimo 20 caracteres)…"
        className="w-full border border-regua bg-sf text-tx px-2 py-1.5"
      />
      <p className="text-[11px] text-tx-3">{reason.trim().length}/{REASON_MIN_LENGTH}</p>
      {error && <p className="text-[11px] font-medium text-atencao">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending || reason.trim().length < REASON_MIN_LENGTH}
          onClick={confirmar}
          className="text-xs font-semibold text-white bg-atencao hover:opacity-90 disabled:opacity-40 px-3.5 py-2"
        >
          {pending ? "Revelando…" : "Revelar dado real"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setOpen(false);
            setReason("");
            setError(null);
          }}
          className="text-xs font-semibold text-tx-2 hover:text-tx px-2 py-2"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
