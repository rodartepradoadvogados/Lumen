"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Undo2 } from "lucide-react";

const UNDO_TOAST_DURATION_MS = 5000;

type UndoToast = { id: number; message: string; onUndo: () => void | Promise<void> };
type UndoToastContextValue = { showUndo: (opts: { message: string; onUndo: () => void | Promise<void> }) => void };

const UndoToastContext = createContext<UndoToastContextValue | null>(null);

// Toast leve de "desfazer" (canto inferior direito, com barra regressiva de 5s) — montado uma
// única vez no layout (desktop e mobile) para sobreviver mesmo quando o item que originou a
// ação (ex.: uma publicação marcada como lida) some da lista após o refresh.
export function UndoToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<UndoToast | null>(null);
  const idRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showUndo = useCallback((opts: { message: string; onUndo: () => void | Promise<void> }) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const id = ++idRef.current;
    setToast({ id, message: opts.message, onUndo: opts.onUndo });
    timerRef.current = setTimeout(() => setToast((t) => (t?.id === id ? null : t)), UNDO_TOAST_DURATION_MS);
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
        <div className="fixed bottom-5 right-5 z-[200] w-72 rounded-xl bg-navy-900 text-cream-50 shadow-pop overflow-hidden animate-fade-in">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-sm">{toast.message}</span>
            <button
              onClick={handleUndo}
              className="flex items-center gap-1 text-sm font-semibold text-gold-400 hover:text-gold-300 shrink-0"
            >
              <Undo2 size={14} /> Desfazer
            </button>
          </div>
          <div
            key={toast.id}
            className="h-1 bg-gold-500"
            style={{ animation: `undoToastShrink ${UNDO_TOAST_DURATION_MS}ms linear forwards` }}
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
