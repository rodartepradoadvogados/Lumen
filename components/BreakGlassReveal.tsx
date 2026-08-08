"use client";

import { useState, useTransition } from "react";
import { revelarRegistro, solicitarAcessoRegistro } from "@/lib/actions/breakGlass";
import { RECORD_SCOPE_LABEL, FIELD_LABELS, revealFieldKinds, type RecordScopeType } from "@/lib/recordScopeMeta";
import { ACCESS_REASONS, type AccessReasonCode } from "@/lib/supportAccessConstants";
import type { MaskKind } from "@/lib/supportMasking";
import { Eye, Lock, X } from "lucide-react";

// Affordance de quebra-vidro POR REGISTRO (Fase B) — só deve ser renderizado quando
// viewer.supportMasked (ver lib/currentUser.ts), ou seja, só aparece pro suporte, nunca pro
// escritório-cliente vendo os próprios dados. Componente reutilizável: recebe só scopeType +
// scopeId (o registro), tudo o resto (rótulos, campos revelados) vem de lib/recordScopeMeta.ts.
//
// Hoje ligado em app/(app)/processos/[id]/page.tsx (o caso mais comum). Ver relatório para onde
// mais ficou de fora.
export default function BreakGlassReveal({ scopeType, scopeId }: { scopeType: RecordScopeType; scopeId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [needsRequest, setNeedsRequest] = useState(false);
  const [requested, setRequested] = useState(false);
  const [reasonCode, setReasonCode] = useState<AccessReasonCode>("DIAGNOSTICO_ERRO");
  const [reasonNote, setReasonNote] = useState("");
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  const kinds: Record<string, MaskKind> = revealFieldKinds(scopeType);
  const label = RECORD_SCOPE_LABEL[scopeType];

  function attemptReveal() {
    setError(null);
    startTransition(async () => {
      const result = await revelarRegistro(scopeType, scopeId);
      if (result.error) {
        setError(result.error);
        setNeedsRequest(true);
        setData(null);
        return;
      }
      setNeedsRequest(false);
      setRequested(false);
      setData(result.data ?? null);
    });
  }

  function sendRequest() {
    setError(null);
    startTransition(async () => {
      const result = await solicitarAcessoRegistro({
        scopeType,
        scopeId,
        reasonCode,
        reasonNote: reasonNote.trim() || undefined,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setRequested(true);
    });
  }

  function openAndTry() {
    setOpen(true);
    attemptReveal();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={openAndTry}
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-gold-700 dark:text-gold-400 hover:underline"
        title={`Este ${label} está mascarado pelo Vidro Fosco — pedir para ver os dados reais`}
      >
        <Lock size={11} /> Revelar dados reais
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-gold-600/30 dark:border-gold-400/30 bg-gold-500/5 dark:bg-gold-400/5 p-3 text-xs space-y-2 max-w-md">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-navy-900 dark:text-cream-50 flex items-center gap-1.5">
          <Eye size={13} /> Quebra-vidro — {label}
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-navy-800/40 dark:text-cream-50/40 hover:text-navy-900 dark:hover:text-cream-50"
        >
          <X size={14} />
        </button>
      </div>

      {pending && <p className="text-navy-800/50 dark:text-cream-50/50">Verificando…</p>}

      {!pending && data && (
        <div className="space-y-1">
          {Object.entries(data).map(([field, value]) => (
            <p key={field}>
              <span className="text-navy-800/50 dark:text-cream-50/50">{FIELD_LABELS[field] ?? field}: </span>
              <span className="text-navy-900 dark:text-cream-50 font-medium">{formatRevealedValue(kinds[field], value)}</span>
            </p>
          ))}
          <p className="text-[10px] text-navy-800/40 dark:text-cream-50/40 pt-1">
            Esta leitura foi registrada no histórico de acessos do escritório.
          </p>
        </div>
      )}

      {!pending && !data && (
        <div className="space-y-2">
          {error && <p className="text-bordo-700 dark:text-bordo-400">{error}</p>}
          {requested ? (
            <>
              <p className="text-gold-700 dark:text-gold-400">Pedido enviado — aguardando aprovação de um sócio do escritório.</p>
              <button
                type="button"
                disabled={pending}
                onClick={attemptReveal}
                className="inline-flex items-center gap-1 bg-navy-900 hover:bg-navy-800 disabled:opacity-50 text-white font-semibold rounded-lg px-2.5 py-1.5"
              >
                Já aprovaram? Tentar revelar
              </button>
            </>
          ) : needsRequest ? (
            <div className="space-y-2">
              <div>
                <label className="block text-navy-800 dark:text-cream-50 font-semibold mb-1">Motivo</label>
                <select
                  value={reasonCode}
                  onChange={(e) => setReasonCode(e.target.value as AccessReasonCode)}
                  className="w-full border border-navy-800/15 dark:border-white/15 dark:bg-navy-800 dark:text-cream-50 rounded-md px-2 py-1.5"
                >
                  {Object.entries(ACCESS_REASONS).map(([code, lbl]) => (
                    <option key={code} value={code}>
                      {lbl}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-navy-800 dark:text-cream-50 font-semibold mb-1">Observação (opcional)</label>
                <textarea
                  value={reasonNote}
                  onChange={(e) => setReasonNote(e.target.value)}
                  rows={2}
                  className="w-full border border-navy-800/15 dark:border-white/15 dark:bg-navy-800 dark:text-cream-50 rounded-md px-2 py-1.5"
                />
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={sendRequest}
                className="inline-flex items-center gap-1 bg-bordo-700 hover:bg-bordo-600 disabled:opacity-50 text-white font-semibold rounded-lg px-2.5 py-1.5"
              >
                Solicitar acesso a este registro
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function formatRevealedValue(kind: MaskKind | undefined, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (kind === "money") {
    return typeof value === "number" ? value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : String(value);
  }
  return String(value);
}
