"use client";

import { useRef } from "react";
import { LogOut } from "lucide-react";
import { limparRastrosDoAparelho } from "@/lib/filaDoChat";

const TEMPO_PARA_DESINSCREVER_MS = 3_000;

// Desinscreve ESTE aparelho do aviso de mensagem nova (no servidor e no navegador). Melhor esforço: sem internet ou
// com o navegador recusando, o Sair não trava (o servidor também apaga as inscrições da pessoa ao encerrar a sessão).
async function desinscreverDoAviso(): Promise<void> {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    const reg = (await navigator.serviceWorker.getRegistration("/atendimento-app")) ?? null;
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await fetch("/api/atendimento/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }), cache: "no-store" }).catch(() => null);
    await sub.unsubscribe().catch(() => false);
  } catch {
    /* o Sair não pode travar por causa do aviso */
  }
}

// O botão Sair. Antes de encerrar a sessão apaga do aparelho todo texto de conversa que ele guardava
// (rascunhos e mensagens ainda não confirmadas) e desinscreve o aparelho do aviso de mensagem nova: sair é, também,
// deixar o aparelho limpo. A desinscrição espera no máximo 3 s e depois o Sair segue.
export default function FormularioDeSair({ action }: { action: () => void | Promise<void> }) {
  const pronto = useRef(false);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        limparRastrosDoAparelho();
        if (pronto.current) return;
        e.preventDefault();
        const formulario = e.currentTarget;
        void Promise.race([desinscreverDoAviso(), new Promise<void>((r) => window.setTimeout(r, TEMPO_PARA_DESINSCREVER_MS))]).then(() => {
          pronto.current = true;
          formulario.requestSubmit();
        });
      }}
    >
      <button type="submit" className="flex min-h-11 w-full items-center justify-center gap-2 rounded-atd-pilula bg-acao text-corpo font-bold text-acao-tx hover:bg-acao-hover active:opacity-90">
        <LogOut size={16} aria-hidden="true" /> Sair
      </button>
    </form>
  );
}
