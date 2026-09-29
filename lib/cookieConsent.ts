// Escolha do aviso de cookies do site público — fonte única para o aviso (CookieConsent), o
// interruptor da medição (AnalyticsConsentido) e o link "Preferências de cookies" do rodapé.
//
// O aviso existia desde 2026 e gravava esta chave, mas NADA a lia: o <Analytics /> da Vercel era
// renderizado incondicionalmente em app/layout.tsx, e "Somente essenciais" não mudava nada. Agora
// a medição só existe se a pessoa aceitou (auditoria da Capa, 29/09/2026).
export const CONSENT_KEY = "lumen_cookie_consent_v1";

/** Disparado em `window` quando a escolha muda (ou é apagada), para quem já está montado reagir. */
export const CONSENT_CHANGE_EVENT = "lumen-consent";

/** Disparado em `window` pelo link do rodapé para reabrir o aviso. */
export const CONSENT_OPEN_EVENT = "lumen-consent-abrir";

export type Consent = "todos" | "essenciais";

/** Lê a escolha salva. `null` = nunca escolheu (ou o armazenamento está indisponível): não mede. */
export function readConsent(): Consent | null {
  try {
    const v = window.localStorage.getItem(CONSENT_KEY);
    return v === "todos" || v === "essenciais" ? v : null;
  } catch {
    return null;
  }
}

export function saveConsent(value: Consent): void {
  try {
    window.localStorage.setItem(CONSENT_KEY, value);
  } catch {
    // Sem armazenamento a escolha vale só nesta sessão (o evento abaixo ainda avisa quem escuta).
  }
  window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT));
}
