"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Undo2 } from "lucide-react";

const UNDO_TOAST_DURATION_MS = 5000;

type UndoToast = { id: number; message: string; onUndo: () => void | Promise<void>; durationMs: number };
type UndoToastContextValue = {
  // durationMs é opcional (default 5s, o mesmo de sempre) — só a triagem de Publicações
  // (components/PublicationsTriage.tsx) passa 4s, pra bater com o ritmo mais rápido de triar
  // várias publicações em sequência pelo teclado.
  showUndo: (opts: { message: string; onUndo: () => void | Promise<void>; durationMs?: number }) => void;
};

const UndoToastContext = createContext<UndoToastContextValue | null>(null);

// Toast leve de "desfazer" (canto inferior direito, com barra regressiva de 5s) — montado uma
// única vez no layout (desktop e mobile) para sobreviver mesmo quando o item que originou a
// ação (ex.: uma publicação marcada como lida) some da lista após o refresh.
export function UndoToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<UndoToast | null>(null);
  const idRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showUndo = useCallback((opts: { message: string; onUndo: () => void | Promise<void>; durationMs?: number }) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const id = ++idRef.current;
    const durationMs = opts.durationMs ?? UNDO_TOAST_DURATION_MS;
    setToast({ id, message: opts.message, onUndo: opts.onUndo, durationMs });
    timerRef.current = setTimeout(() => setToast((t) => (t?.id === id ? null : t)), durationMs);
  }, []);

  async function handleUndo() {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (toast) await toast.onUndo();
    setToast(null);
  }

  return (
    <UndoToastContext.Provider value={{ showUndo }}>
      {children}
      {toast && (
        // Toast flutuante — grafite fixo nos dois temas, de propósito, igual ao rail e ao
        // botão do assistente: precisa continuar legível sobre qualquer fundo por trás dele.
        <div className="fixed bottom-5 right-5 z-[200] w-72 bg-grafite-800 text-white shadow-pop overflow-hidden animate-fade-in">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-sm">{toast.message}</span>
            <button
              onClick={handleUndo}
              className="flex items-center gap-1 text-sm font-semibold text-marca hover:opacity-80 shrink-0"
            >
              <Undo2 size={14} /> Desfazer
            </button>
          </div>
          <div
            key={toast.id}
            className="h-1 bg-marca"
            style={{ animation: `undoToastShrink ${toast.durationMs}ms linear forwards` }}
          />
        </div>
      )}
    </UndoToastContext.Provider>
  );
}

export function useUndoToast(): UndoToastContextValue {
  const ctx = useContext(UndoToastContext);
  if (!ctx) throw new Error("useUndoToast precisa estar dentro de <UndoToastProvider>");
  return ctx;
}
