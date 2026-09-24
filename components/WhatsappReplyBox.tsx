"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { replyWhatsapp } from "@/lib/actions/attendance";

// A caixa de resposta, presa no pé da conversa.
//
// O ENVIAR É O ÚNICO BOTÃO CHEIO DA TELA, e é por isso que ele é alto (44px de alvo) e ocupa a cor
// de ação sozinho: numa tela onde tudo é bordô, nada é urgente. As bolhas de saída deixaram de ser
// vermelhas exatamente para que esta cor ficasse significando uma coisa só.
//
// O NOME DO CLIENTE VAI NO CAMPO ("Escreva para Maria…") porque a pessoa do escritório atende dez
// conversas ao mesmo tempo, e o custo de mandar a mensagem para a conversa errada é alto. Só o
// primeiro nome: o nome completo no lugar de uma dica de campo fica comprido e deixa de ser lido.
export default function WhatsappReplyBox({ attendanceId, nomeDoCliente }: { attendanceId: string; nomeDoCliente?: string }) {
  const primeiroNome = (nomeDoCliente || "").trim().split(/\s+/)[0] || "";
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSend() {
    const text = body.trim();
    if (!text || isPending) return;
    setError(null);
    startTransition(async () => {
      const res = await replyWhatsapp(attendanceId, text);
      if (res.error) {
        setError(res.error);
        return;
      }
      setBody("");
      router.refresh();
    });
  }

  return (
    <div className="mt-3">
      <div className="flex items-end gap-3">
        <label htmlFor={`resposta-${attendanceId}`} className="sr-only">
          {primeiroNome ? `Sua resposta para ${primeiroNome}` : "Sua resposta"}
        </label>
        <textarea
          id={`resposta-${attendanceId}`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            // ENTER ENVIA, SHIFT+ENTER QUEBRA LINHA — o padrão do WhatsApp, e o que o dono pediu
            // explicitamente ("permitir enviar com Enter, e não apenas com o botão"). Antes só
            // Ctrl/Cmd+Enter enviava, um atalho que ninguém no WhatsApp usa e que a pessoa do
            // escritório não tinha como adivinhar sozinha — o hábito de dez conversas por dia é
            // Enter puro, e cada mensagem exigia pegar o mouse. Composição de IME (acento, chinês,
            // coreano) confirma com Enter sem disparar o envio: `isComposing` está true durante a
            // composição, e é isso que faz `e.key === "Enter"` não significar "terminei de digitar"
            // para esses teclados.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              handleSend();
            }
          }}
          rows={2}
          placeholder={primeiroNome ? `Escreva para ${primeiroNome}…` : "Escreva uma resposta pelo WhatsApp…"}
          title="Enter envia · Shift+Enter quebra linha"
          disabled={isPending}
          className="flex-1 resize-none border border-regua-forte bg-sf px-3.5 py-3 text-sm text-tx focus:outline-none focus:ring-2 focus:ring-marca-tx disabled:opacity-60"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={isPending || !body.trim()}
          className="inline-flex h-12 shrink-0 items-center gap-2 bg-acao px-6 text-sm font-semibold text-acao-tx transition-colors hover:bg-acao-hover disabled:opacity-50"
        >
          <Send size={15} />
          {isPending ? "Enviando…" : "Enviar"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs font-medium text-urgente">{error}</p>}
    </div>
  );
}
