"use client";

import { SOLICITAR_KIND_OPTIONS, ENVIAR_KIND_OPTIONS, PENDENCIA_DIRECTION_LABELS, type PendenciaDirection } from "@/lib/pendencias";

export type PendenciaRow = {
  key: string;
  direction: PendenciaDirection;
  kind: string;
  description: string;
  responsibleId: string;
  dueDate: string; // YYYY-MM-DD
};

const inputCls =
  "w-full text-xs border border-navy-800/12 dark:border-white/15 dark:bg-navy-900 dark:text-cream-50 rounded-md px-2 py-1";

// Duas colunas de caixas de seleção (Solicitar ao lead / Enviar ao lead) — marcar uma abre, na
// hora, uma pergunta a mais ("quais?" quando o tipo pedir) e os campos de responsável/prazo,
// exatamente como pedido na Fase 5. Reaproveitado tanto no Novo Atendimento (rows ainda sem
// attendanceId — só viram AtendimentoPendencia de verdade depois que o atendimento é criado, ver
// createAttendance) quanto na tela de detalhe (para acrescentar pendência depois). `compact`
// empilha as duas colunas em uma só, para o formulário mobile.
export default function PendenciasEditor({
  rows,
  onChange,
  users,
  compact,
}: {
  rows: PendenciaRow[];
  onChange: (rows: PendenciaRow[]) => void;
  users: { id: string; name: string }[];
  compact?: boolean;
}) {
  function toggle(direction: PendenciaDirection, kind: string, checked: boolean) {
    if (checked) {
      onChange([
        ...rows,
        { key: crypto.randomUUID(), direction, kind, description: "", responsibleId: "", dueDate: "" },
      ]);
    } else {
      onChange(rows.filter((r) => !(r.direction === direction && r.kind === kind)));
    }
  }

  function patch(key: string, patchData: Partial<PendenciaRow>) {
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patchData } : r)));
  }

  function Column({ direction, options }: { direction: PendenciaDirection; options: typeof SOLICITAR_KIND_OPTIONS }) {
    return (
      <div className="space-y-2">
        <p className="text-[11px] font-semibold text-navy-800/55 dark:text-cream-50/55 uppercase tracking-wide">
          {PENDENCIA_DIRECTION_LABELS[direction]}
        </p>
        <div className="space-y-1.5">
          {options.map((opt) => {
            const row = rows.find((r) => r.direction === direction && r.kind === opt.kind);
            const checked = Boolean(row);
            return (
              <div key={opt.kind} className="rounded-lg border border-navy-800/8 dark:border-white/10 bg-white/50 dark:bg-white/5 px-2.5 py-1.5">
                <label className="flex items-center gap-2 text-xs text-navy-800/80 dark:text-cream-50/80 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => toggle(direction, opt.kind, e.target.checked)}
                  />
                  {opt.label}
                </label>
                {row && (
                  <div className="mt-1.5 pl-5 space-y-1.5">
                    {opt.needsDescription && (
                      <input
                        value={row.description}
                        onChange={(e) => patch(row.key, { description: e.target.value })}
                        placeholder="Quais?"
                        className={inputCls}
                      />
                    )}
                    <div className="grid grid-cols-2 gap-1.5">
                      <select
                        value={row.responsibleId}
                        onChange={(e) => patch(row.key, { responsibleId: e.target.value })}
                        className={inputCls}
                      >
                        <option value="">Responsável</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="date"
                        value={row.dueDate}
                        onChange={(e) => patch(row.key, { dueDate: e.target.value })}
                        title="Prazo"
                        className={inputCls}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={compact ? "space-y-4" : "grid grid-cols-1 sm:grid-cols-2 gap-4"}>
      <Column direction="SOLICITAR" options={SOLICITAR_KIND_OPTIONS} />
      <Column direction="ENVIAR" options={ENVIAR_KIND_OPTIONS} />
    </div>
  );
}
