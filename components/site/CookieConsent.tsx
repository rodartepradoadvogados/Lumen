"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CONSENT_OPEN_EVENT,
  readConsent,
  saveConsent,
  type Consent,
} from "@/lib/cookieConsent";

// Aviso de cookies do site público (documento 09 — LGPD: "escolha real, não 'aceitar tudo'
// apenas"). Dois botões de mesmo peso, cada um grava uma escolha distinta em localStorage.
//
// A escolha AGORA LIGA OU DESLIGA a medição: components/site/AnalyticsConsentido.tsx lê a mesma
// chave (lib/cookieConsent.ts) e só carrega o Vercel Analytics com "todos". Antes o aviso gravava e
// nada lia — "Somente essenciais" era decorativo.
//
// Só aparece 900ms depois da carga (não disputa a primeira dobra com o título) e é compacto: no
// celular ocupa a base da tela sem cobrir os botões do herói.
export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const primeiro = useRef<HTMLButtonElement>(null);
  const [foco, setFoco] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (readConsent() === null) {
      timer = setTimeout(() => {
        if (readConsent() === null) setVisible(true);
      }, 900);
    }
    // "Preferências de cookies" (rodapé): reabre o aviso, com o foco no primeiro botão.
    const reabrir = () => {
      setFoco(true);
      setVisible(true);
    };
    window.addEventListener(CONSENT_OPEN_EVENT, reabrir);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener(CONSENT_OPEN_EVENT, reabrir);
    };
  }, []);

  useEffect(() => {
    if (visible && foco) {
      primeiro.current?.focus();
      setFoco(false);
    }
  }, [visible, foco]);

  function escolher(valor: Consent) {
    saveConsent(valor);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    // role="region" + aria-label dão o "o que é"; aria-live="polite" dá o "algo novo apareceu", sem
    // interromper o que a tecnologia assistiva já estava lendo (WCAG 4.1.3, P2-6 do roteiro).
    <div
      role="region"
      aria-label="Aviso de cookies"
      aria-live="polite"
      // Movimento 8 · avisar (globals.css).
      className="animate-aviso-entra fixed left-3 right-3 bottom-3 md:left-auto md:right-5 md:bottom-5 md:max-w-[480px] z-50 bg-grafite-800 text-neutro-100 border-2 border-grafite-500 rounded-[2px] p-3 grid gap-2.5"
    >
      <p className="text-etiqueta leading-snug text-neutro-300">
        Usamos só o necessário para o site funcionar. A medição de audiência (Vercel Analytics) só é ligada se você aceitar.{" "}
        {/* eslint-disable-next-line no-restricted-syntax -- Aviso bg-grafite-800, fixo nos dois temas. */}
        <Link href="/privacidade" className="text-white underline underline-offset-2">
          Política de privacidade
        </Link>
        .
      </p>
      <div className="flex gap-2">
        <button
          ref={primeiro}
          type="button"
          onClick={() => escolher("essenciais")}
          // eslint-disable-next-line no-restricted-syntax -- Aviso bg-grafite-800, fixo nos dois temas.
          className="flex-1 min-h-[44px] px-3 border-2 border-grafite-300 text-white font-semibold text-etiqueta rounded-[2px] hover:border-neutro-300 transition-[border-color,transform] duration-100 ease-out active:translate-y-px"
        >
          Somente o essencial
        </button>
        <button
          type="button"
          onClick={() => escolher("todos")}
          // eslint-disable-next-line no-restricted-syntax -- Aviso bg-grafite-800, fixo nos dois temas.
          className="flex-1 min-h-[44px] px-3 border-2 border-grafite-300 text-white font-semibold text-etiqueta rounded-[2px] hover:border-neutro-300 transition-[border-color,transform] duration-100 ease-out active:translate-y-px"
        >
          Aceitar a medição
        </button>
      </div>
    </div>
  );
}
