"use client";

import { useState } from "react";
import { createUser } from "@/lib/actions/settings";

// Antes disso, o formulário chamava um Server Action "solto" (`<form action={...}>` com uma
// função "use server" inline na própria página) que só dava `console.error` no servidor quando
// falhava — o admin nunca via nada, e se o erro não fosse tratado (ver createUser em
// lib/actions/settings.ts), a página inteira caía no error.tsx. Client Component com estado
// próprio, no mesmo padrão de components/ChangePasswordForm.tsx, para mostrar o erro de verdade.
export default function AddUserForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(formData: FormData) {
    setError(null);
    setLoading(true);
    const result = await createUser({
      name: String(formData.get("name") || ""),
      email: String(formData.get("email") || ""),
      role: String(formData.get("role")),
      oab: String(formData.get("oab") || ""),
      color: String(formData.get("color") || "#0f1f3d"),
    });
    setLoading(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    (document.getElementById("add-user-form") as HTMLFormElement | null)?.reset();
  }

  return (
    <form id="add-user-form" action={submit} className="p-5 border-t border-regua space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
        <input name="name" required placeholder="Nome" className="cfg-input sm:col-span-2" />
        <input name="email" type="email" required placeholder="E-mail" className="cfg-input sm:col-span-2" />
        <select name="role" className="cfg-input">
          <option value="Advogado">Advogado</option>
          <option value="Sócio">Sócio</option>
          <option value="Estagiário">Estagiário</option>
          <option value="Financeiro">Financeiro</option>
          <option value="Recepcionista">Recepcionista</option>
          <option value="Marketing">Marketing</option>
          <option value="Contador">Contador</option>
        </select>
        <input name="oab" placeholder="OAB (opcional)" className="cfg-input" />
        <input name="color" type="color" defaultValue="#0f1f3d" className="cfg-input h-9 p-1" />
        <button
          type="submit"
          disabled={loading}
          className="sm:col-span-2 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-3 py-2 transition-colors disabled:opacity-50"
        >
          {loading ? "Adicionando..." : "Adicionar membro"}
        </button>
      </div>
      {error && <p className="text-xs text-urgente bg-urgente-bg rounded-md px-2.5 py-1.5">{error}</p>}
    </form>
  );
}
