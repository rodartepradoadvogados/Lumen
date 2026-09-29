"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// A ATUALIZAÇÃO PERIÓDICA DA CENTRAL (A2 do plano de 29/09/2026).
//
// O QUE HAVIA: nada. A Central é `force-dynamic` e só as ações da própria pessoa chamavam
// `router.refresh()` — mensagem de cliente só aparecia se alguém recarregasse a página. Sem isto o
// aviso "↓ N novas mensagens" nunca dispararia e a lista, ordenada por atividade, nunca reordenaria.
//
// A REGRA (decisão do dono): `router.refresh()` a cada 15 segundos, PAUSADO quando
//   - a aba está oculta (não há ninguém olhando; ao voltar, atualiza na hora se já passou o
//     intervalo), ou
//   - há TEXTO DIGITADO no campo de resposta — o refresh re-renderiza a página inteira no servidor e
//     não pode passar por cima do que a pessoa está escrevendo (R6 do plano).
// Nenhum dado sai do Lúmen: é o mesmo carregamento da página, só repetido.
//
// TEMPO REAL DE VERDADE (SSE/websocket) FICA FORA DO ESCOPO; uma rota leve "mudou desde X?" que só
// dispararia o refresh quando há novidade é o passo seguinte, se o custo de 1 render a cada 15 s
// pesar.
//
// COMO DETECTA "TEXTO DIGITADO": lê o `value` do textarea dentro de `[data-caixa-de-resposta]` (o pé
// da conversa, na página). Ler o DOM, e não o estado do WhatsappReplyBox, é o que permite não mexer
// naquele componente — que outras telas usam.
export const INTERVALO_DA_ATUALIZACAO_MS = 15_000;

/** Há texto digitado na caixa de resposta da conversa aberta? */
export function haTextoDigitado(doc: Document = document): boolean {
  const campos = doc.querySelectorAll<HTMLTextAreaElement | HTMLInputElement>("[data-caixa-de-resposta] textarea, [data-caixa-de-resposta] input[type='text']");
  return Array.from(campos).some((c) => c.value.trim().length > 0);
}

export default function AtualizarAoVivo({ intervaloMs = INTERVALO_DA_ATUALIZACAO_MS }: { intervaloMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    let ultima = Date.now();
    const atualizar = () => {
      if (document.visibilityState !== "visible") return;
      if (haTextoDigitado()) return;
      ultima = Date.now();
      router.refresh();
    };
    const relogio = window.setInterval(atualizar, intervaloMs);
    const aoVoltar = () => {
      // Voltou para a aba: se já passou o intervalo, não espera o próximo tique.
      if (document.visibilityState === "visible" && Date.now() - ultima >= intervaloMs) atualizar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      window.clearInterval(relogio);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [router, intervaloMs]);

  return null;
}
