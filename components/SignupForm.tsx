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

  // Rótulo programático em TODOS os campos. A auditoria de 2026-09-16 achou oito campos de
  // formulário sem `<label>` em toda a superfície pública — login, cadastro e redefinição —, o que
  // reprova WCAG 1.3.1 e 3.3.2. É a tela em que o visitante entrega nome, e-mail e senha: leitor de
  // tela anunciava o campo sem dizer o que ele é, clicar no texto não focava o campo, e o
  // autopreenchimento do navegador errava. Os campos passam a usar a classe `campo`, a mesma do
  // resto do produto, em vez de borda própria mais fraca que a do formulário de login.
  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3.5" noValidate={false}>
      <div className="grid gap-1.5">
        <label htmlFor="cad-escritorio" className="text-etiqueta font-semibold uppercase tracking-[.07em] text-tx-2">
          Nome do escritório
        </label>
        <input
          id="cad-escritorio"
          name="cad-escritorio"
          required
          autoComplete="organization"
          value={officeName}
          onChange={(e) => setOfficeName(e.target.value)}
          className="campo"
        />
      </div>
      <div className="grid gap-1.5">
        <label htmlFor="cad-nome" className="text-etiqueta font-semibold uppercase tracking-[.07em] text-tx-2">
          Seu nome
        </label>
        <input
          id="cad-nome"
          name="cad-nome"
          required
          autoComplete="name"
          value={adminName}
          onChange={(e) => setAdminName(e.target.value)}
          className="campo"
        />
      </div>
      <div className="grid gap-1.5">
        <label htmlFor="cad-email" className="text-etiqueta font-semibold uppercase tracking-[.07em] text-tx-2">
          E-mail
        </label>
        <input
          id="cad-email"
          name="cad-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="campo"
        />
      </div>
      <div className="grid gap-1.5">
        <label htmlFor="cad-senha" className="text-etiqueta font-semibold uppercase tracking-[.07em] text-tx-2">
          Senha
        </label>
        <input
          id="cad-senha"
          name="cad-senha"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="campo"
        />
        <span className="text-etiqueta text-tx-3">mínimo de 6 caracteres</span>
      </div>
      <div className="grid gap-1.5">
        <label htmlFor="cad-senha-2" className="text-etiqueta font-semibold uppercase tracking-[.07em] text-tx-2">
          Confirme a senha
        </label>
        <input
          id="cad-senha-2"
          name="cad-senha-2"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="campo"
        />
      </div>
      {error && (
        <p role="alert" className="text-corpo text-urgente">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="h-11 bg-acao hover:bg-acao-hover disabled:opacity-50 text-acao-tx font-semibold px-4 text-corpo rounded-sm mt-1"
      >
        {pending ? "Criando conta..." : "Criar conta do escritório"}
      </button>
    </form>
  );
}
