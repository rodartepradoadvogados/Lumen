"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { unblockProcessNumber, type BlockedProcessNumberRow } from "@/lib/actions/publications";
import { Ban, X, RotateCcw } from "lucide-react";

// Lista de processos bloqueados (botão "Bloquear" em LinkPublicationMenu.tsx, só disponível para
// publicações/andamentos sem processo cadastrado) — reversão pede confirmação numa janela
// suspensa própria, mesmo padrão do bloqueio original, nunca window.confirm().
export default function BlockedProcessNumbersManager({ items }: { items: BlockedProcessNumberRow[] }) {
  const router = useRouter();
  const [toUnblock, setToUnblock] = useState<BlockedProcessNumberRow | null>(null);
  const [unblocking, setUnblocking] = useState(false);

  async function confirmUnblock() {
    if (!toUnblock) return;
    setUnblocking(true);
    await unblockProcessNumber(toUnblock.id);
    setUnblocking(false);
    setToUnblock(null);
    router.refresh();
  }

  if (items.length === 0) {
    return <p className="p-5 text-sm text-navy-800/50 dark:text-cream-50/50">Nenhum processo bloqueado.</p>;
  }

  return (
    <>
      <div className="divide-y divide-navy-800/5 dark:divide-white/10">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-navy-900 dark:text-cream-50 truncate">{item.displayNumber}</p>
              <p className="text-[11px] text-navy-800/45 dark:text-cream-50/45">
                Bloqueado em {new Date(item.createdAt).toLocaleDateString("pt-BR")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setToUnblock(item)}
              className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-navy-800/70 hover:text-navy-900 dark:text-cream-50/70 dark:hover:text-cream-50 px-3 py-1.5 rounded-lg bg-cream-100 hover:bg-cream-200 dark:bg-white/10 dark:hover:bg-white/15"
            >
              <RotateCcw size={13} /> Reverter
            </button>
          </div>
        ))}
      </div>

      {toUnblock && (
        <div className="fixed inset-0 z-50 bg-navy-950/40 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-navy-900 rounded-xl shadow-pop w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-navy-800/8 dark:border-white/10">
              <h3 className="font-serif font-bold text-navy-900 dark:text-cream-50 flex items-center gap-2">
                <Ban size={16} className="text-bordo-700 dark:text-bordo-400" /> Reverter bloqueio
              </h3>
              {!unblocking && (
                <button onClick={() => setToUnblock(null)} className="text-navy-800/40 hover:text-navy-900 dark:text-cream-50/40 dark:hover:text-cream-50">
                  <X size={18} />
                </button>
              )}
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-navy-800 dark:text-cream-50/85">
                Tem certeza que quer voltar a receber publicações e andamentos processuais do processo{" "}
                <strong>{toUnblock.displayNumber}</strong>?
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  disabled={unblocking}
                  onClick={() => setToUnblock(null)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-navy-800/70 dark:text-cream-50/70 hover:bg-cream-100 dark:hover:bg-white/10 disabled:opacity-50"
                >
                  Não
                </button>
                <button
                  type="button"
                  disabled={unblocking}
                  onClick={confirmUnblock}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-navy-900 hover:bg-navy-800 text-white disabled:opacity-50"
                >
                  {unblocking ? "Revertendo..." : "Sim"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
