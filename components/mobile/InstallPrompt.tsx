"use client";

import { useEffect, useState } from "react";
import { X, Share, SquarePlus, Download } from "lucide-react";

const DISMISS_KEY = "rp_install_prompt_dismissed_v1";

type Platform = "ios" | "installable" | null;

// Convite para instalar o PWA na tela inicial. Aparece sozinho ao abrir o app
// (enquanto não estiver instalado e não tiver sido dispensado); no iOS/Safari
// mostra a instrução manual (não existe prompt nativo lá); no Android/Chrome
// usa o evento beforeinstallprompt para oferecer instalação com um toque.
// O navegador decide quando esse evento dispara (critério dele, não controlamos).
export default function InstallPrompt() {
  const [platform, setPlatform] = useState<Platform>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<Event & { prompt?: () => void; userChoice?: Promise<unknown> } | null>(null);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY)) return;

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    const ua = window.navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;

    if (isIOS) {
      setPlatform("ios");
      return;
    }

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as Event & { prompt?: () => void; userChoice?: Promise<unknown> });
      setPlatform("installable");
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setPlatform(null);
  }

  async function install() {
    if (!deferredPrompt?.prompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    localStorage.setItem(DISMISS_KEY, "1");
    setPlatform(null);
  }

  if (!platform) return null;

  return (
    <div className="fixed bottom-16 inset-x-0 z-50 px-3 pb-3 animate-fade-in">
      <div className="max-w-sm mx-auto bg-navy-900 text-cream-50 rounded-2xl shadow-pop p-4 flex items-start gap-3">
        <span className="h-9 w-9 rounded-lg bg-navy-700 text-gold-400 flex items-center justify-center text-xs font-bold shrink-0">
          RP
        </span>
        <div className="flex-1 min-w-0">
          {platform === "ios" ? (
            <>
              <p className="text-sm font-semibold">Instale o app na tela inicial</p>
              <p className="text-xs text-cream-50/70 mt-1 leading-relaxed">
                Toque em <Share size={12} className="inline -mt-0.5" /> Compartilhar e depois em{" "}
                <SquarePlus size={12} className="inline -mt-0.5" /> &ldquo;Adicionar à Tela de Início&rdquo;.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold">Instale o app RP Advogados</p>
              <p className="text-xs text-cream-50/70 mt-1">Acesso rápido direto da tela inicial do seu celular.</p>
              <button
                onClick={install}
                className="mt-2 inline-flex items-center gap-1.5 bg-gold-600 hover:bg-gold-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg"
              >
                <Download size={13} /> Instalar
              </button>
            </>
          )}
        </div>
        <button onClick={dismiss} className="text-cream-50/50 hover:text-cream-50 shrink-0" aria-label="Fechar aviso de instalação">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
