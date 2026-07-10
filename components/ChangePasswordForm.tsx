"use client";

import { useState } from "react";
import { changeOwnPassword } from "@/lib/actions/settings";

export default function ChangePasswordForm() {
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
    (document.getElementById("change-password-form") as HTMLFormElement | null)?.reset();
  }

  return (
    <form id="change-password-form" action={submit} className="space-y-3 max-w-sm">
      <div>
        <label className="text-xs font-medium text-navy-800/60">Senha atual</label>
        <input name="currentPassword" type="password" required className="cfg-input w-full" />
      </div>
      <div>
        <label className="text-xs font-medium text-navy-800/60">Nova senha</label>
        <input name="newPassword" type="password" required minLength={6} className="cfg-input w-full" />
      </div>
      <div>
        <label className="text-xs font-medium text-navy-800/60">Confirmar nova senha</label>
        <input name="confirmPassword" type="password" required minLength={6} className="cfg-input w-full" />
      </div>
      {error && <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">{error}</p>}
      {success && <p className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">Senha alterada com sucesso.</p>}
      <button type="submit" disabled={loading} className="bg-navy-900 hover:bg-navy-800 text-white text-sm font-semibold rounded-lg px-4 py-2 disabled:opacity-50">
        {loading ? "Salvando..." : "Alterar senha"}
      </button>
    </form>
  );
}
