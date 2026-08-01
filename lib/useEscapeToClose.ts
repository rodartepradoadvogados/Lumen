import { useEffect } from "react";

// Fecha uma janela/modal ao apertar Esc — hook pequeno para não reinventar o mesmo
// addEventListener em cada modal (ver components/ModalShell.tsx, que cobre a maioria das janelas
// do site, e os modais de casca própria que importam este hook diretamente, ex.:
// components/SettleModal.tsx, components/honorarios/LancarHonorariosModal.tsx).
//
// `active` deixa o hook seguro para chamar incondicionalmente (regra das Hooks do React não
// permite `if (open) useEffect(...)`) mesmo em componentes que só montam o próprio JSX do modal
// quando `open` é true — passe o mesmo booleano que já controla a renderização. `onClose` pode ser
// uma função "attempt" (ex.: NewAttendanceModal.tsx:handleCloseAttempt) que confirma antes de
// fechar quando há alteração não salva — Esc não deve pular essa checagem.
export function useEscapeToClose(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [active, onClose]);
}
