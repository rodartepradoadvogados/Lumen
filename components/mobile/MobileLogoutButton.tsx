"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { logout } from "@/lib/actions/auth";
import { encerrarAssistenteLocal } from "@/lib/assistenteSessaoCliente";
import { PWA_APPS } from "@/lib/pwaApps";

// Deriva a inscrição de push do NAVEGADOR antes de submeter o logout — logout() já apaga a
// PushSubscription no servidor (lib/actions/auth.ts), mas isso não derruba a inscrição presa à
// origem no aparelho. Sem os dois lados, um aparelho compartilhado (tablet da recepção, celular
// de plantão) continuava recebendo pushes do usuário anterior mesmo depois dele sair — ver
// components/mobile/NotificationPreferences.tsx para o mesmo padrão de unsubscribe.
export default function MobileLogoutButton() {
  const [pending, startTransition] = useTransition();

  function handleLogout() {
    startTransition(async () => {
      try {
        if ("serviceWorker" in navigator && "PushManager" in window) {
          const registration = await navigator.serviceWorker.getRegistration();
          const sub = await registration?.pushManager.getSubscription();
          await sub?.unsubscribe();
        }
      } catch {
        // Best-effort — mesmo se o unsubscribe do navegador falhar, o logout não pode travar.
      }
      // Logout perde o chat da Antonella nesta aba (pedido do dono em 02/10/2026) — o mesmo
      // esquecer do X do widget. Best-effort junto com o unsubscribe: falhar storage não pode
      // bloquear sair.
      encerrarAssistenteLocal();
      await logout(PWA_APPS.mobile.entrar);
    });
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={pending}
      className="w-full flex items-center justify-center gap-2 border border-regua text-atencao font-semibold text-sm py-3 disabled:opacity-50"
    >
      <LogOut size={16} /> Sair
    </button>
  );
}
