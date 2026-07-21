"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useSearchParams } from "next/navigation";
import { login } from "@/lib/actions/auth";
import styles from "@/app/homepage.module.css";

// Card de login suspenso sobre o banner (canto superior direito), fixo enquanto o carrossel
// de fundo troca de slide por trás. Substitui a antiga página dedicada /login (ver
// app/login/page.tsx, que agora só redireciona pra cá) — a ideia é não competir com o texto
// do carrossel, que fica ancorado embaixo, à esquerda.
async function action(_prevState: { error?: string }, formData: FormData) {
  const next = String(formData.get("next") || "");
  return login(String(formData.get("username") || ""), String(formData.get("password") || ""), next || undefined);
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

  return (
    <div id="entrar" className={styles.loginCard}>
      <span className={styles.loginEyebrow}>Já é cliente?</span>
      <form action={formAction} className={styles.loginForm}>
        <input type="hidden" name="next" value={next} />
        <input name="username" required autoComplete="username" placeholder="Usuário" className={styles.loginInput} />
        <input name="password" type="password" required autoComplete="current-password" placeholder="Senha" className={styles.loginInput} />
        {state?.error && <p className={styles.loginError}>{state.error}</p>}
        <SubmitButton />
      </form>
    </div>
  );
}
