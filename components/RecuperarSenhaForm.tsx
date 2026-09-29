"use client";

import { useRef, useState, useTransition } from "react";
import { solicitarRecuperacaoDeSenha } from "@/lib/actions/auth";

// Recuperação de senha como PÁGINA (antes era um modal dentro do login). A resposta é a MESMA
// exista ou não a conta: o modal antigo dizia "Não encontramos esse e-mail" e mostrava o e-mail
// mascarado de quem existe — revelava quem é cliente. Aqui o texto de sucesso não confirma nada.
export default function RecuperarSenhaForm() {
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [pending, startTransition] = useTransition();
  const campo = useRef<HTMLInputElement>(null);

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      const r = await solicitarRecuperacaoDeSenha(email);
      if (r.error) {
        setErro(r.error);
        campo.current?.focus();
        return;
      }
      setEnviado(true);
    });
  }

  if (enviado) {
    return (
      <div className="grid gap-4">
        <p role="status" className="text-corpo text-tx">
          Se esse e-mail estiver cadastrado, o link chega em instantes. Ele vale por 1 hora.
        </p>
        <p className="text-corpo text-tx-2">
          Não chegou? Veja a caixa de spam ou peça a um administrador do seu escritório para gerar o link em
          Configurações, Equipe.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} noValidate className="grid gap-4">
      <p className="text-corpo text-tx-2">Digite o e-mail cadastrado. Enviaremos um link para criar uma nova senha.</p>
      <div className="grid gap-1.5">
        <label htmlFor="rec-email" className="text-etiqueta font-semibold uppercase tracking-[.07em] text-tx-2">
          E-mail
        </label>
        <input
          id="rec-email"
          ref={campo}
          name="email"
          type="email"
          inputMode="email"
          required
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="campo h-12"
        />
      </div>
      {erro && (
        <p role="alert" className="text-corpo font-semibold text-atencao">
          {erro}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full min-h-[48px] flex items-center justify-center bg-acao hover:bg-acao-hover text-acao-tx font-bold text-corpo rounded-[2px] disabled:opacity-60 transition-[background-color,transform] duration-100 ease-out active:translate-y-px"
      >
        {pending ? "Enviando…" : "Enviar link"}
      </button>
    </form>
  );
}
