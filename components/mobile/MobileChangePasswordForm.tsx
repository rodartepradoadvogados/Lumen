"use client";

import { useState } from "react";
import { changeOwnPassword } from "@/lib/actions/settings";

const inputClass =
  "w-full mt-1 border border-navy-800/12 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-navy-900 dark:text-cream-50 bg-white dark:bg-navy-950 focus:outline-none focus:ring-2 focus:ring-gold-500/40";
const labelClass = "text-xs font-medium text-navy-800/60 dark:text-cream-50/60";

// Versão mobile compacta do ChangePasswordForm do desktop (mesma server action
// changeOwnPassword) — disponível para qualquer usuário logado, sem depender de nenhuma
// tela do site.
export default function MobileChangePasswordForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function submit(formData: FormData) {
    setError(null);
    setSuccess(false);
    const currentPassword = String(formData.get("currentPassword") || "");
    const newPassword = String(formData.get("newPassword") || "");
    const confirmPassword = String(formData.get("confirmPassword") || "");
    if (newPassword !== confirmPassword) {
      setError("A confirmação não confere com a nova senha.");
      return;
    }
    setLoading(true);
    const result = await changeOwnPassword(currentPassword, newPassword);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSuccess(true);
    (document.getElementById("mobile-change-password-form") as HTMLFormElement | null)?.reset();
  }

  return (
    <form id="mobile-change-password-form" action={submit} className="space-y-3">
      <div>
        <label className={labelClass}>Senha atual</label>
        <input name="currentPassword" type="password" required className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Nova senha</label>
        <input name="newPassword" type="password" required minLength={6} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Confirmar nova senha</label>
        <input name="confirmPassword" type="password" required minLength={6} className={inputClass} />
      </div>
      {error && (
        <p className="text-xs text-bordo-700 dark:text-bordo-400 bg-bordo-500/10 border border-bordo-500/20 rounded-lg px-2.5 py-1.5">
          {error}
        </p>
      )}
      {success && (
        <p className="text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2.5 py-1.5">
          Senha alterada com sucesso.
        </p>
      )}
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-navy-900 dark:bg-gold-600 text-white text-sm font-semibold rounded-lg px-4 py-2.5 disabled:opacity-50"
      >
        {loading ? "Salvando..." : "Alterar senha"}
      </button>
    </form>
  );
}
