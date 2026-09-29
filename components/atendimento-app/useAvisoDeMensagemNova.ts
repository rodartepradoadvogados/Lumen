"use client";

import { useCallback, useEffect, useRef } from "react";
import { tituloComAviso } from "@/lib/avisoDeMensagemNova";

// O AVISO DE MENSAGEM NOVA EM SEGUNDO PLANO (regras em lib/avisoDeMensagemNova.ts). Devolve `registrar(n)`:
// chamado quando chegam `n` mensagens do cliente. Se a aba está fora de vista, soma ao contador e põe o número
// no TÍTULO da aba e no SELO do app instalado; ao voltar (ou sair da conversa) tudo é desfeito. Não toca na região
// `aria-live` (a aba escondida não tem quem ouvir) e não guarda nada em disco.
export function useAvisoDeMensagemNova(): (n: number) => void {
  const contador = useRef(0);
  const tituloDeSempre = useRef<string | null>(null);

  const limpar = useCallback(() => {
    if (contador.current === 0) return;
    contador.current = 0;
    if (tituloDeSempre.current !== null) document.title = tituloDeSempre.current;
    tituloDeSempre.current = null;
    try {
      void (navigator as Navigator & { clearAppBadge?: () => Promise<void> }).clearAppBadge?.()?.catch?.(() => {});
    } catch {
      /* sem selo neste aparelho */
    }
  }, []);

  useEffect(() => {
    const aoMudarVisibilidade = () => {
      if (document.visibilityState === "visible") limpar();
    };
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    return () => {
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
      limpar();
    };
  }, [limpar]);

  return useCallback((n: number) => {
    if (n <= 0 || document.visibilityState === "visible") return;
    if (tituloDeSempre.current === null) tituloDeSempre.current = document.title;
    contador.current += n;
    document.title = tituloComAviso(tituloDeSempre.current, contador.current);
    try {
      void (navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void> }).setAppBadge?.(contador.current)?.catch?.(() => {});
    } catch {
      /* sem selo neste aparelho */
    }
  }, []);
}
