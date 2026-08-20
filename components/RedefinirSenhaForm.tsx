"use client";

import { useState, useTransition } from "react";
import { resetPasswordWithToken } from "@/lib/actions/auth";

export default function RedefinirSenhaForm({ token }: { token: string }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }
    startTransition(async () => {
      const result = await resetPasswordWithToken(token, newPassword);
      if (result.error) setError(result.error);
      else setSuccess(true);
    });
  }

  if (success) {
    return (
      <div className="text-center">
        <p className="text-sm text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-400/15 border border-emerald-200 dark:border-emerald-400/20 px-3 py-2">
          Senha redefinida com sucesso.
        </p>
        <a href="/" className="inline-block mt-4 text-sm font-semibold text-tx underline">
          Voltar para o login
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input
        type="password"
        required
        minLength={6}
        autoComplete="new-password"
        placeholder="Nova senha (mín. 6 caracteres)"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        className="border border-regua bg-sf text-tx placeholder:text-tx-3 px-3 py-2 text-sm"
      />
      <input
        type="password"
        required
        minLength={6}
        autoComplete="new-password"
        placeholder="Confirme a nova senha"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        className="border border-regua bg-sf text-tx placeholder:text-tx-3 px-3 py-2 text-sm"
      />
      {error && <p className="text-sm text-urgente">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="bg-acao hover:bg-acao-hover disabled:opacity-50 text-acao-tx font-semibold px-4 py-2 text-sm"
      >
        {pending ? "Salvando..." : "Redefinir senha"}
      </button>
    </form>
  );
}
