"use client";

import { useFormState, useFormStatus } from "react-dom";
import { login } from "@/lib/actions/auth";

async function action(_prevState: { error?: string }, formData: FormData) {
  return login(String(formData.get("username") || ""), String(formData.get("password") || ""));
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-gold-600 hover:bg-gold-700 text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50"
    >
      {pending ? "Entrando..." : "Entrar"}
    </button>
  );
}

export default function LoginForm() {
  const [state, formAction] = useFormState(action, {});

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="text-xs font-medium text-navy-800/60">Usuário</label>
        <input
          name="username"
          required
          autoFocus
          className="w-full mt-1 border border-navy-800/12 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-500/40"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-navy-800/60">Senha</label>
        <input
          name="password"
          type="password"
          required
          className="w-full mt-1 border border-navy-800/12 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-500/40"
        />
      </div>
      {state?.error && <p className="text-sm text-red-600 font-medium">{state.error}</p>}
      <SubmitButton />
    </form>
  );
}
