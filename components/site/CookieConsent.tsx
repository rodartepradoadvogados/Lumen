"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const CONSENT_KEY = "lumen_cookie_consent_v1";

// Aviso de cookies do site público (documento 09 — LGPD: "escolha real, não 'aceitar tudo'
// apenas"). Três botões, cada um grava uma escolha distinta em localStorage — nenhum se
// disfarça de fechar sem responder. Não há SDK de analytics condicionado a isto ainda (nada
// no site hoje lê CONSENT_KEY); a gravação existe pra quando houver, sem re-perguntar.
export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(CONSENT_KEY)) setVisible(true);
  }, []);

  function escolher(valor: "todos" | "essenciais") {
    localStorage.setItem(CONSENT_KEY, valor);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed left-4 right-4 bottom-4 md:left-auto md:right-6 md:bottom-6 md:max-w-sm z-50 bg-grafite-800 text-neutro-100 p-5 shadow-modal">
      <p className="text-xs leading-relaxed text-neutro-300">
        Usamos cookies essenciais para o site funcionar e, com sua permissão, cookies de análise. Veja a{" "}
        <Link href="/privacidade" className="text-white underline underline-offset-2">
          política de privacidade
        </Link>
        .
      </p>
      <div className="flex flex-wrap gap-2 mt-4">
        <button
          type="button"
          onClick={() => escolher("todos")}
          className="h-9 px-4 bg-marca text-acao-tx font-semibold text-xs"
        >
          Aceitar todos
        </button>
        <button
          type="button"
          onClick={() => escolher("essenciais")}
          className="h-9 px-4 border-2 border-neutro-700 text-white font-semibold text-xs hover:bg-white/5"
        >
          Somente essenciais
        </button>
      </div>
    </div>
  );
}
