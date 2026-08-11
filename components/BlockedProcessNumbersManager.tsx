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
    return <p className="p-5 text-sm text-tx-2">Nenhum processo bloqueado.</p>;
  }

  return (
    <>
      <div className="divide-y divide-regua">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-tx truncate">{item.displayNumber}</p>
              <p className="text-[11px] text-tx-2">
                Bloqueado em {new Date(item.createdAt).toLocaleDateString("pt-BR")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setToUnblock(item)}
              className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-tx-2 hover:text-tx px-3 py-1.5 rounded-lg bg-sf-apoio hover:bg-regua"
            >
              <RotateCcw size={13} /> Reverter
            </button>
          </div>
        ))}
      </div>

      {toUnblock && (
        <div className="fixed inset-0 z-50 bg-grafite-900/40 flex items-center justify-center p-4">
          <div className="bg-sf rounded-xl shadow-pop w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-regua">
              <h3 className="font-serif font-bold text-tx flex items-center gap-2">
                <Ban size={16} className="text-atencao" /> Reverter bloqueio
              </h3>
              {!unblocking && (
                <button onClick={() => setToUnblock(null)} className="text-tx-3 hover:text-tx">
                  <X size={18} />
                </button>
              )}
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-tx/85">
                Tem certeza que quer voltar a receber publicações e andamentos processuais do processo{" "}
                <strong>{toUnblock.displayNumber}</strong>?
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  disabled={unblocking}
                  onClick={() => setToUnblock(null)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-tx-2 hover:bg-sf-apoio disabled:opacity-50"
                >
                  Não
                </button>
                <button
                  type="button"
                  disabled={unblocking}
                  onClick={confirmUnblock}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-acao hover:bg-acao-hover text-acao-tx disabled:opacity-50"
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
