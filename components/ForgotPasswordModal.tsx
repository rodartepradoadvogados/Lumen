"use client";

import { useEffect, useState, useTransition } from "react";
import { checkLoginForReset, requestPasswordReset } from "@/lib/actions/auth";
import styles from "@/app/homepage.module.css";

type Step = "ask-login" | "confirm" | "not-found" | "sent" | "error";

export default function ForgotPasswordModal({ initialEmail, onClose }: { initialEmail: string; onClose: () => void }) {
  const [email, setEmail] = useState(initialEmail);
  const [step, setStep] = useState<Step>(initialEmail ? "confirm" : "ask-login");
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function checkLogin() {
    if (!email.trim()) return;
    startTransition(async () => {
      const result = await checkLoginForReset(email.trim());
      if (result.found) {
        setMaskedEmail(result.maskedEmail ?? null);
        setStep("confirm");
      } else {
        setStep("not-found");
      }
    });
  }

  function confirmSend() {
    startTransition(async () => {
      const result = await requestPasswordReset(email.trim());
      if (result.error) {
        setErrorMsg(result.error);
        setStep("error");
      } else {
        setStep("sent");
      }
    });
  }

  // Se o usuário já digitou o e-mail no formulário antes de clicar em "Esqueci minha
  // senha", verifica direto assim que o modal abre (uma única vez, ao montar).
  useEffect(() => {
    if (initialEmail) checkLogin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        {step === "ask-login" && (
          <>
            <p className={styles.modalTitle}>Esqueci minha senha</p>
            <p className={styles.modalText}>Digite seu e-mail cadastrado para localizarmos sua conta.</p>
            <input
              className={styles.modalInput}
              type="email"
              placeholder="E-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && checkLogin()}
              autoFocus
            />
            <div className={styles.modalActions}>
              <button className={styles.modalBtnSecondary} onClick={onClose}>Cancelar</button>
              <button className={styles.modalBtnPrimary} disabled={pending || !email.trim()} onClick={checkLogin}>
                {pending ? "Verificando..." : "Continuar"}
              </button>
            </div>
          </>
        )}

        {step === "confirm" && !maskedEmail && (
          <p className={styles.modalText}>Verificando...</p>
        )}

        {step === "confirm" && maskedEmail && (
          <>
            <p className={styles.modalTitle}>Redefinir por e-mail?</p>
            <p className={styles.modalText}>
              Vamos enviar um link de redefinição de senha para <strong>{maskedEmail}</strong>. Deseja continuar?
            </p>
            <div className={styles.modalActions}>
              <button className={styles.modalBtnSecondary} onClick={onClose}>Não</button>
              <button className={styles.modalBtnPrimary} disabled={pending} onClick={confirmSend}>
                {pending ? "Enviando..." : "Sim, enviar"}
              </button>
            </div>
          </>
        )}

        {step === "not-found" && (
          <>
            <p className={styles.modalTitle}>E-mail não encontrado</p>
            <p className={styles.modalText}>Não encontramos esse e-mail. Confira e tente novamente.</p>
            <div className={styles.modalActions}>
              <button className={styles.modalBtnSecondary} onClick={onClose}>Fechar</button>
              <button className={styles.modalBtnPrimary} onClick={() => { setMaskedEmail(null); setStep("ask-login"); }}>
                Tentar de novo
              </button>
            </div>
          </>
        )}

        {step === "sent" && (
          <>
            <p className={styles.modalTitle}>E-mail enviado</p>
            <p className={styles.modalText}>
              Enviamos um link de redefinição para <strong>{maskedEmail}</strong>. Ele expira em 1 hora.
            </p>
            <div className={styles.modalActions}>
              <button className={styles.modalBtnPrimary} onClick={onClose}>Fechar</button>
            </div>
          </>
        )}

        {step === "error" && (
          <>
            <p className={styles.modalTitle}>Não foi possível enviar</p>
            <p className={styles.modalText}>{errorMsg}</p>
            <div className={styles.modalActions}>
              <button className={styles.modalBtnSecondary} onClick={onClose}>Fechar</button>
              <button className={styles.modalBtnPrimary} disabled={pending} onClick={confirmSend}>
                Tentar de novo
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
