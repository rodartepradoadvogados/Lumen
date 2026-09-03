"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt?: () => void;
  userChoice?: Promise<unknown>;
};

// Mesmo mecanismo do "Instalar aplicativo" do app mobile (components/mobile/
// MobileInstallMenuItem.tsx), adaptado para o desktop: escuta beforeinstallprompt e oferece
// instalar o site completo (manifest-desktop.webmanifest, ver app/(app)/layout.tsx) como app
// próprio no Chrome/Edge. Sem equivalente para Safari desktop (não dispara beforeinstallprompt)
// — o botão fica visível, mas o clique só funciona quando o navegador sinaliza que pode instalar.
export default function InstallAppButton() {
  const [installed, setInstalled] = useState(true);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [notReadyWarning, setNotReadyWarning] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    setInstalled(standalone);
    if (standalone) return;

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setNotReadyWarning(false);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  async function handleClick() {
    if (!deferredPrompt?.prompt) {
      setNotReadyWarning(true);
      return;
    }
    setNotReadyWarning(false);
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  }

  if (installed) return null;

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex items-center gap-2 h-8 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-4 transition-colors"
      >
        <Download size={16} /> Instalar no computador
      </button>
      {notReadyWarning && (
        <p className="text-xs text-urgente mt-2">
          A instalação automática ainda não está disponível neste navegador — tente novamente em alguns instantes, ou atualize a página.
        </p>
      )}
    </div>
  );
}
