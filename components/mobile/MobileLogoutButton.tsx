"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { logout } from "@/lib/actions/auth";

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
      await logout();
    });
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={pending}
      className="w-full flex items-center justify-center gap-2 border border-regua text-atencao font-semibold text-sm py-3 rounded-xl disabled:opacity-50"
    >
      <LogOut size={16} /> Sair
    </button>
  );
}
