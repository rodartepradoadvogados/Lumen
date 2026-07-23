"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { login } from "@/lib/actions/auth";
import ForgotPasswordModal from "@/components/ForgotPasswordModal";
import styles from "@/app/homepage.module.css";

// Card de login suspenso sobre o banner (canto superior direito), fixo enquanto o carrossel
// de fundo troca de slide por trás. Substitui a antiga página dedicada /login (ver
// app/login/page.tsx, que agora só redireciona pra cá) — a ideia é não competir com o texto
// do carrossel, que fica ancorado embaixo, à esquerda.
async function action(_prevState: { error?: string }, formData: FormData) {
  const next = String(formData.get("next") || "");
  return login(String(formData.get("email") || ""), String(formData.get("password") || ""), next || undefined);
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={styles.loginSubmit}>
      {pending ? "Entrando..." : "Entrar"}
    </button>
  );
}

export default function HomepageLoginCard() {
  const [state, formAction] = useFormState(action, {});
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "";
  const [email, setEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  return (
    <div id="entrar" className={styles.loginCard}>
      <span className={styles.loginEyebrow}>Já é cliente?</span>
      <form action={formAction} className={styles.loginForm}>
        <input type="hidden" name="next" value={next} />
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="E-mail"
          className={styles.loginInput}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div className={styles.passwordFieldWrap}>
          <input
            name="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            placeholder="Senha"
            className={styles.loginInput}
          />
          <button
            type="button"
            aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            className={styles.passwordToggle}
            onClick={() => setShowPassword((v) => !v)}
          >
            {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        <button type="button" className={styles.forgotLink} onClick={() => setForgotOpen(true)}>
          Esqueci minha senha
        </button>
        {state?.error && <p className={styles.loginError}>{state.error}</p>}
        <SubmitButton />
      </form>
      <Link href="/cadastro" className={styles.forgotLink}>
        Ainda não é cliente? Cadastre seu escritório
      </Link>
      {forgotOpen && <ForgotPasswordModal initialEmail={email} onClose={() => setForgotOpen(false)} />}
    </div>
  );
}
