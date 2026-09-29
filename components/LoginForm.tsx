"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { login } from "@/lib/actions/auth";

// Formulário de login — o cartão de /login (e das telas de entrada dos PWAs). A Capa não embute o
// formulário (decisão do plano: /login continua página, por causa do PWA); este cartão é o fim do
// funil da Capa e por isso tem o mesmo desenho: campos de 48px, foco igual, um único caminho de
// recuperação e, quando a tela não traz o seu, um único caminho de cadastro.
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
      className="w-full min-h-[48px] flex items-center justify-center bg-acao hover:bg-acao-hover text-acao-tx font-bold text-corpo rounded-[2px] disabled:opacity-60 transition-[background-color,transform] duration-100 ease-out active:translate-y-px"
    >
      {pending ? "Entrando…" : "Entrar"}
    </button>
  );
}

// `destino` (opcional): destino pós-login já validado pelo servidor — usado pelas telas de entrada
// dos PWAs (/m/entrar, /atendimento-app/entrar), que só aceitam voltar para dentro do próprio app.
// Sem ele, vale o ?next= da URL (login do site).
//
// `mostrarCadastro`: /login traz o link de cadastro no rodapé do cartão (TelaSessao) e passa false —
// eram DOIS links quase iguais na mesma tela. As entradas dos PWAs não têm rodapé próprio e mantêm o
// link aqui.
export default function LoginForm({ destino, mostrarCadastro = true }: { destino?: string; mostrarCadastro?: boolean } = {}) {
  const [state, formAction] = useFormState(action, {});
  const searchParams = useSearchParams();
  const next = destino ?? (searchParams.get("next") || "");
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      {/* Rótulo programático em TODOS os campos (WCAG 1.3.1 e 3.3.2). */}
      <div className="grid gap-1.5">
        <label htmlFor="login-email" className="text-etiqueta font-semibold uppercase tracking-[.07em] text-tx-2">
          E-mail
        </label>
        <input
          id="login-email"
          name="email"
          type="email"
          inputMode="email"
          required
          autoComplete="email"
          autoFocus
          className="campo h-12"
        />
      </div>
      <div className="grid gap-1.5">
        <label htmlFor="login-senha" className="text-etiqueta font-semibold uppercase tracking-[.07em] text-tx-2">
          Senha
        </label>
        <div className="relative">
          <input
            id="login-senha"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            className="campo h-12 pr-12"
          />
          <button
            type="button"
            aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            aria-pressed={showPassword}
            className="absolute right-0 top-0 h-12 w-12 flex items-center justify-center text-tx-2 hover:text-tx"
            onClick={() => setShowPassword((v) => !v)}
          >
            {showPassword ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
          </button>
        </div>
      </div>
      {/* Página, não modal: /recuperar-senha (resposta neutra, ver lib/actions/auth.ts). */}
      <Link
        href="/recuperar-senha"
        className="self-start inline-flex items-center min-h-[44px] text-corpo font-semibold text-tx-2 hover:text-tx underline underline-offset-4 decoration-regua-forte hover:decoration-current transition-[text-decoration-color] duration-100 ease-out"
      >
        Esqueci minha senha
      </Link>
      {state?.error && (
        <p role="alert" className="text-corpo font-semibold text-atencao">
          {state.error}
        </p>
      )}
      <SubmitButton />
      {mostrarCadastro && (
        <Link
          href="/cadastro"
          className="inline-flex items-center justify-center min-h-[44px] text-corpo font-semibold text-tx-2 hover:text-tx underline underline-offset-4 decoration-regua-forte hover:decoration-current"
        >
          Ainda não é cliente? Cadastre seu escritório
        </Link>
      )}
    </form>
  );
}
