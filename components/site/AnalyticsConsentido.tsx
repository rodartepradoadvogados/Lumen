"use client";

import { useEffect, useState } from "react";
import { Analytics } from "@vercel/analytics/next";
import { CONSENT_CHANGE_EVENT, readConsent } from "@/lib/cookieConsent";

// Interruptor da medição de audiência (Vercel Analytics). Só monta <Analytics /> — e portanto só
// carrega o script de /_vercel/insights — quando a pessoa escolheu "Aceitar a medição" no aviso do
// site público. Sem escolha, ou com "Somente o essencial", nada é carregado.
//
// `beforeSend` cobre o caso inverso: quem aceitou e depois reabre as preferências e recusa. O
// script já carregado não se descarrega, mas cada evento passa por aqui e é descartado se a
// escolha atual não for "todos".
//
// Este componente vive no layout raiz, então vale também dentro do app logado — que não tem aviso
// próprio: quem entra direto por /login ou pelo PWA, sem nunca ter passado pelo aviso da Capa, não
// é medido. Ver app/privacidade/page.tsx (seção 9).
export default function AnalyticsConsentido() {
  const [ligado, setLigado] = useState(false);

  useEffect(() => {
    const sincroniza = () => setLigado(readConsent() === "todos");
    sincroniza();
    window.addEventListener(CONSENT_CHANGE_EVENT, sincroniza);
    // Outra aba do mesmo navegador mudou a escolha.
    window.addEventListener("storage", sincroniza);
    return () => {
      window.removeEventListener(CONSENT_CHANGE_EVENT, sincroniza);
      window.removeEventListener("storage", sincroniza);
    };
  }, []);

  if (!ligado) return null;
  return <Analytics beforeSend={(evento) => (readConsent() === "todos" ? evento : null)} />;
}
