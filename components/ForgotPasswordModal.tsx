"use client";

import { useEffect, useState, useTransition } from "react";
import { checkLoginForReset, requestPasswordReset } from "@/lib/actions/auth";
import ModalShell from "@/components/ModalShell";

type Step = "ask-login" | "confirm" | "not-found" | "sent" | "error";

const btnPrimary = "h-9 px-4 flex items-center justify-center bg-acao hover:bg-acao-hover text-acao-tx font-semibold text-sm disabled:opacity-60";
const btnSecondary = "h-9 px-4 flex items-center justify-center border-2 border-regua-forte text-tx font-semibold text-sm hover:bg-sf-apoio";

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
    <ModalShell size="compacto" title="Esqueci minha senha" onClose={onClose}>
      <div className="p-5 flex flex-col gap-3">
        {step === "ask-login" && (
          <>
            <p className="text-sm text-tx-2">Digite seu e-mail cadastrado para localizarmos sua conta.</p>
            <input
              className="h-10 border border-regua-forte bg-sf px-3 text-sm text-tx"
              type="email"
              placeholder="E-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && checkLogin()}
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-1">
              <button className={btnSecondary} onClick={onClose}>Cancelar</button>
              <button className={btnPrimary} disabled={pending || !email.trim()} onClick={checkLogin}>
                {pending ? "Verificando…" : "Continuar"}
              </button>
            </div>
          </>
        )}

        {step === "confirm" && !maskedEmail && <p className="text-sm text-tx-2">Verificando…</p>}

        {step === "confirm" && maskedEmail && (
          <>
            <p className="text-sm text-tx-2">
              Vamos enviar um link de redefinição de senha para <strong className="text-tx">{maskedEmail}</strong>. Deseja continuar?
            </p>
            <div className="flex justify-end gap-2 mt-1">
              <button className={btnSecondary} onClick={onClose}>Não</button>
              <button className={btnPrimary} disabled={pending} onClick={confirmSend}>
                {pending ? "Enviando…" : "Sim, enviar"}
              </button>
            </div>
          </>
        )}

        {step === "not-found" && (
          <>
            <p className="text-sm text-tx-2">Não encontramos esse e-mail. Confira e tente novamente.</p>
            <div className="flex justify-end gap-2 mt-1">
              <button className={btnSecondary} onClick={onClose}>Fechar</button>
              <button
                className={btnPrimary}
                onClick={() => {
                  setMaskedEmail(null);
                  setStep("ask-login");
                }}
              >
                Tentar de novo
              </button>
            </div>
          </>
        )}

        {step === "sent" && (
          <>
            <p className="text-sm text-tx-2">
              Enviamos um link de redefinição para <strong className="text-tx">{maskedEmail}</strong>. Ele expira em 1 hora.
            </p>
            <div className="flex justify-end mt-1">
              <button className={btnPrimary} onClick={onClose}>Fechar</button>
            </div>
          </>
        )}

        {step === "error" && (
          <>
            <p className="text-sm text-atencao">{errorMsg}</p>
            <div className="flex justify-end gap-2 mt-1">
              <button className={btnSecondary} onClick={onClose}>Fechar</button>
              <button className={btnPrimary} disabled={pending} onClick={confirmSend}>
                Tentar de novo
              </button>
            </div>
          </>
        )}
      </div>
    </ModalShell>
  );
}
