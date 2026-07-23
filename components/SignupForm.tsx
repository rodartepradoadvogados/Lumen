"use client";

import { useState, useTransition } from "react";
import { signupOffice } from "@/lib/actions/signup";

export default function SignupForm() {
  const [officeName, setOfficeName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }
    startTransition(async () => {
      const result = await signupOffice({ officeName, adminName, email, password });
      if (result?.error) setError(result.error);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input
        required
        placeholder="Nome do escritório"
        value={officeName}
        onChange={(e) => setOfficeName(e.target.value)}
        className="border border-navy-900/15 rounded-lg px-3 py-2 text-sm"
      />
      <input
        required
        placeholder="Seu nome"
        value={adminName}
        onChange={(e) => setAdminName(e.target.value)}
        className="border border-navy-900/15 rounded-lg px-3 py-2 text-sm"
      />
      <input
        type="email"
        required
        autoComplete="email"
        placeholder="Seu e-mail"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="border border-navy-900/15 rounded-lg px-3 py-2 text-sm"
      />
      <input
        type="password"
        required
        minLength={6}
        autoComplete="new-password"
        placeholder="Senha (mín. 6 caracteres)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="border border-navy-900/15 rounded-lg px-3 py-2 text-sm"
      />
      <input
        type="password"
        required
        minLength={6}
        autoComplete="new-password"
        placeholder="Confirme a senha"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        className="border border-navy-900/15 rounded-lg px-3 py-2 text-sm"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-navy-900 font-semibold rounded-lg px-4 py-2 text-sm"
      >
        {pending ? "Criando conta..." : "Criar conta do escritório"}
      </button>
    </form>
  );
}
