"use client";

import { useEffect, useState } from "react";
import { Download, ChevronRight, Share, SquarePlus } from "lucide-react";

type Platform = "ios" | "android" | null;

type BeforeInstallPromptEvent = Event & {
  prompt?: () => void;
  userChoice?: Promise<unknown>;
};

// Item fixo do menu "Mais" para instalar o PWA. Diferente do InstallPrompt
// (banner dispensável que aparece uma única vez), este item continua
// disponível sempre que o app não estiver instalado — mesmo que o banner
// já tenha sido fechado antes.
export default function MobileInstallMenuItem() {
  // Assume instalado até a checagem no cliente terminar, pra evitar mostrar
  // o item por um instante a quem já instalou o app.
  const [installed, setInstalled] = useState(true);
  const [platform, setPlatform] = useState<Platform>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);
  const [notReadyWarning, setNotReadyWarning] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;

    setInstalled(standalone);
    if (standalone) return;

    const ua = window.navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
    setPlatform(isIOS ? "ios" : "android");

    if (isIOS) return;

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setNotReadyWarning(false);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  if (installed) return null;

  async function handleClick() {
    if (platform === "ios") {
      setShowIOSInstructions((v) => !v);
      return;
    }

    if (!deferredPrompt?.prompt) {
      setNotReadyWarning(true);
      return;
    }

    setNotReadyWarning(false);
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
      >
        <span className="h-9 w-9 rounded-lg bg-navy-900/5 dark:bg-white/5 text-navy-800 dark:text-cream-50/80 flex items-center justify-center shrink-0">
          <Download size={17} />
        </span>
        <span className="flex-1 text-sm font-medium text-navy-900 dark:text-cream-50">Instalar aplicativo</span>
        <ChevronRight size={16} className="text-navy-800/30 dark:text-cream-50/30" />
      </button>

      {platform === "ios" && showIOSInstructions && (
        <div className="px-4 pb-3.5 -mt-1">
          <p className="text-xs text-navy-800/60 dark:text-cream-50/60 leading-relaxed">
            Toque em <Share size={12} className="inline -mt-0.5" /> Compartilhar e depois em{" "}
            <SquarePlus size={12} className="inline -mt-0.5" /> &ldquo;Adicionar à Tela de Início&rdquo;.
          </p>
        </div>
      )}

      {notReadyWarning && (
        <div className="px-4 pb-3.5 -mt-1">
          <p className="text-xs text-bordo-600 dark:text-bordo-400 leading-relaxed">
            A instalação automática ainda não está disponível neste navegador — tente novamente em alguns instantes, ou atualize a página.
          </p>
        </div>
      )}
    </div>
  );
}
