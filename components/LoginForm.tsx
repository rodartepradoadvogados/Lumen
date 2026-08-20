"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { login } from "@/lib/actions/auth";
import ForgotPasswordModal from "@/components/ForgotPasswordModal";

// Formulário de login — extraído do antigo HomepageLoginCard (que ficava suspenso sobre o
// carrossel da homepage) pro layout real de /app/login/page.tsx (documento 09: a barra do
// site público só tem um link "Entrar", sem card embutido no hero).
async function action(_prevState: { error?: string }, formData: FormData) {
  const next = String(formData.get("next") || "");
  return login(String(formData.get("email") || ""), String(formData.get("password") || ""), next || undefined);
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full h-11 flex items-center justify-center bg-acao hover:bg-acao-hover text-acao-tx font-extrabold text-sm disabled:opacity-60"
    >
      {pending ? "Entrando…" : "Entrar"}
    </button>
  );
}

export default function LoginForm() {
  const [state, formAction] = useFormState(action, {});
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "";
  const [email, setEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      <input
        name="email"
        type="email"
        required
        autoComplete="email"
        autoFocus
        placeholder="E-mail"
        className="h-11 border border-regua-forte bg-sf px-3 text-sm text-tx placeholder:text-tx-3 focus:outline-none focus:border-acao"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <div className="relative">
        <input
          name="password"
          type={showPassword ? "text" : "password"}
          required
          autoComplete="current-password"
          placeholder="Senha"
          className="h-11 w-full border border-regua-forte bg-sf px-3 pr-11 text-sm text-tx placeholder:text-tx-3 focus:outline-none focus:border-acao"
        />
        <button
          type="button"
          aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
          className="absolute right-0 top-0 h-11 w-11 flex items-center justify-center text-tx-3 hover:text-tx"
          onClick={() => setShowPassword((v) => !v)}
        >
          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      <button type="button" className="self-start text-xs font-semibold text-tx-2 hover:text-tx underline underline-offset-2" onClick={() => setForgotOpen(true)}>
        Esqueci minha senha
      </button>
      {state?.error && <p className="text-xs font-medium text-atencao">{state.error}</p>}
      <SubmitButton />
      <Link href="/cadastro" className="text-center text-xs font-semibold text-tx-2 hover:text-tx underline underline-offset-2 mt-1">
        Ainda não é cliente? Cadastre seu escritório
      </Link>
      {forgotOpen && <ForgotPasswordModal initialEmail={email} onClose={() => setForgotOpen(false)} />}
    </form>
  );
}
