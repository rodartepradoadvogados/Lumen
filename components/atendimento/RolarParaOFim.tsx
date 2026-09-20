"use client";

import { useEffect, useRef } from "react";

// Leva a conversa para o fim assim que a tela abre.
//
// POR QUE É UM COMPONENTE, E NÃO UM `scrollTop` NO PAI. A conversa é renderizada no servidor (as
// horas são de Brasília, formatadas lá), e o pai é um componente de servidor — que não tem efeito
// de montagem. Uma âncora no fim da lista resolve isso com poucas linhas e sem tornar a conversa
// inteira cliente.
//
// NÃO USA `scrollIntoView`, e isto é o ponto: `scrollIntoView` rola TODOS os ancestrais roláveis,
// e a tela do atendimento tem dois — a conversa e a página. O efeito seria a página inteira pular
// para o pé, escondendo o cabeçalho e o relógio, que é a informação mais importante da tela. Mexer
// no `scrollTop` de um elemento nomeado rola só ele.
//
// Sem animação de propósito: a conversa tem que JÁ ESTAR no fim quando a pessoa olha. Ver a tela
// rolar sozinha por dois segundos é a sensação de que o sistema está lento.
export default function RolarParaOFim() {
  const ancora = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const caixa = ancora.current?.closest<HTMLElement>("[data-rolagem-da-conversa]");
    if (caixa) caixa.scrollTop = caixa.scrollHeight;
  }, []);
  return <div ref={ancora} aria-hidden="true" />;
}
