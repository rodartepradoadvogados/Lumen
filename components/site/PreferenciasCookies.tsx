"use client";

import { CONSENT_OPEN_EVENT } from "@/lib/cookieConsent";

// Link do rodapé que reabre o aviso de cookies: a escolha precisa ser reversível sem limpar o
// armazenamento do navegador.
export default function PreferenciasCookies({ className }: { className: string }) {
  return (
    <button type="button" className={`${className} text-left`} onClick={() => window.dispatchEvent(new Event(CONSENT_OPEN_EVENT))}>
      Preferências de cookies
    </button>
  );
}
