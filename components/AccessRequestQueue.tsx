"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveAccessRequestAsOffice, denyAccessRequestAsOffice } from "@/lib/actions/supportAccess";
import type { PendingAccessRequest } from "@/lib/supportAccess";
import { RECORD_SCOPE_LABEL, isRecordScopeType } from "@/lib/recordScopeMeta";
import { Check, X, Eye } from "lucide-react";

// Fase B: descreve em português claro O QUE está sendo pedido, a partir de scopeType/scopeLabel
// (resolvido do lado do servidor em lib/supportAccess.ts:listPendingAccessRequests). scopeType
// "CONFIGURACAO" é o pedido de entrada normal (Fase A, acesso mascarado ao escritório inteiro) —
// não é um registro específico, então não tenta descrever um.
function describeScope(req: PendingAccessRequest): string | null {
  if (!isRecordScopeType(req.scopeType)) return null;
  const kind = RECORD_SCOPE_LABEL[req.scopeType];
  return req.scopeLabel
    ? `quer ver os dados reais do ${kind} "${req.scopeLabel}".`
    : `quer ver os dados reais de um(a) ${kind} que não foi encontrado(a) (pode ter sido excluído).`;
}

// Formata "há Xh"/"há X min" — mesmo cálculo usado em app/(app)/configuracoes/page.tsx
// (formatRelativeTime), duplicado aqui porque aquele é um helper de página, não exportado.
function timeAgo(date: Date): string {
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60_000));
  if (minutes < 1) return "agora mesmo";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `há ${hours}h`;
}

// Fila de pedidos PENDENTE (Passo 3a), visível só quando o escritório está na política "Com
// aprovação" (checado na página, não aqui). Mesmo padrão de useTransition de
// components/EndSupportAccessButton.tsx: aprova/nega chama a Server Action e dá router.refresh()
// pra tela reconsultar listPendingAccessRequests (o item aprovado/negado sai da lista sozinho,
// já que ela só traz status PENDENTE).
export default function AccessRequestQueue({ requests }: { requests: PendingAccessRequest[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});

  function decide(id: string, approve: boolean) {
    setErrors((e) => ({ ...e, [id]: "" }));
    startTransition(async () => {
      const result = approve ? await approveAccessRequestAsOffice(id) : await denyAccessRequestAsOffice(id);
      if (result.error) {
        setErrors((e) => ({ ...e, [id]: result.error! }));
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="divide-y divide-navy-800/5 dark:divide-white/10">
      {requests.map((req) => (
        <div key={req.id} className="p-5 flex items-start justify-between gap-3 flex-wrap">
          <div className="text-sm text-navy-900 dark:text-cream-50">
            <p>
              <strong>{req.requesterName}</strong> — {req.reasonLabel}
            </p>
            <p className="text-xs text-navy-800/60 dark:text-cream-50/60 mt-0.5">Chamado: {req.ticketSubject}</p>
            {describeScope(req) && (
              <p className="text-xs font-semibold text-gold-700 dark:text-gold-400 mt-1 flex items-center gap-1">
                <Eye size={12} className="shrink-0" /> Suporte Lúmen {describeScope(req)}
              </p>
            )}
            {req.reasonNote && (
              <p className="text-xs text-navy-800/50 dark:text-cream-50/50 mt-0.5 italic">“{req.reasonNote}”</p>
            )}
            <p className="text-[11px] text-navy-800/45 dark:text-cream-50/45 mt-1">Pedido {timeAgo(req.requestedAt)}</p>
            {errors[req.id] && (
              <p className="text-[11px] text-red-600 dark:text-bordo-400 mt-1">{errors[req.id]}</p>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              disabled={pending}
              onClick={() => decide(req.id, true)}
              className="inline-flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold rounded-lg px-3 py-2 disabled:opacity-50"
            >
              <Check size={13} /> Aprovar
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => decide(req.id, false)}
              className="inline-flex items-center gap-1.5 bg-bordo-700 hover:bg-bordo-600 text-cream-50 text-xs font-semibold rounded-lg px-3 py-2 disabled:opacity-50"
            >
              <X size={13} /> Negar
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
