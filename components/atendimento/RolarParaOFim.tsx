"use client";

import { useEffect, useRef, useState } from "react";

// A ROLAGEM DA CONVERSA: abre na última mensagem, vai ao fim ao trocar de conversa, e — quando chega
// mensagem nova — ou rola sozinha ou avisa, conforme a pessoa esteja no fim ou lendo mais acima.
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
//
// O QUE FALTAVA (A2 do plano de 29/09/2026), em duas partes:
//
//  1. TROCAR DE CONVERSA. O efeito tinha dependências `[]`: pela lista da Central o mesmo <Conversa>
//     era reaproveitado e o efeito de montagem não rodava de novo — a conversa nova abria onde a
//     anterior tinha parado. Agora o efeito depende de `conversa` (a identidade dela), e a página
//     ainda dá `key` ao <Conversa>: dois cintos.
//
//  2. MENSAGEM NOVA. Quando a atualização periódica (AtualizarAoVivo) traz mensagem, a regra é a do
//     WhatsApp: quem está NO FIM continua no fim (rola sozinho); quem está lendo acima NÃO é
//     arrancado de lá — aparece "↓ N novas mensagens", que rola ao clicar e some quando a pessoa
//     chega ao fim por conta própria.
//
//     "ESTAR NO FIM" É MEDIDO NA ÚLTIMA ROLAGEM, e não no instante em que a mensagem chega. Quando o
//     efeito roda, o DOM já cresceu com a bolha nova: medir a distância ali dá "a altura da bolha"
//     para quem estava exatamente no fim, e uma mensagem de 100px faria quem estava no fim ser
//     tratado como quem está lendo acima. O ouvinte de rolagem grava a resposta antes do
//     crescimento; a tolerância é de 80px.
const TOLERANCIA_DO_FIM = 80;

export default function RolarParaOFim({ conversa, chave, total }: { conversa: string; chave: string; total: number }) {
  const ancora = useRef<HTMLDivElement>(null);
  const noFim = useRef(true);
  const vistas = useRef(total);
  const conversaVista = useRef<string | null>(null);
  const [novas, setNovas] = useState(0);

  const caixa = () => ancora.current?.closest<HTMLElement>("[data-rolagem-da-conversa]") ?? null;
  const irAoFim = (c: HTMLElement) => {
    c.scrollTop = c.scrollHeight;
  };

  // 1. Montagem e TROCA de conversa: vai ao fim e zera o aviso.
  useEffect(() => {
    const c = caixa();
    if (!c) return;
    conversaVista.current = conversa;
    noFim.current = true;
    vistas.current = total;
    setNovas(0);
    // DUAS BATIDAS, e a segunda é a que resolve. No efeito de montagem a caixa ainda não tem a
    // altura final — no telefone, a barra de abas e o compositor acabam de entrar no fluxo, e o
    // `scrollHeight` lido aqui é menor do que o de meio segundo depois. Medido no navegador: a
    // última mensagem ficava cortada pela metade. A batida do quadro seguinte lê a altura de
    // verdade; a primeira existe para o caso normal, em que nada mais mexe.
    irAoFim(c);
    const quadro = requestAnimationFrame(() => requestAnimationFrame(() => irAoFim(c)));
    return () => cancelAnimationFrame(quadro);
    // `total` fica de fora de propósito: mensagem nova na MESMA conversa é o efeito 2.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversa]);

  // 2. Chegou mensagem na mesma conversa.
  useEffect(() => {
    if (conversaVista.current !== conversa) return; // primeira passada: o efeito 1 cuida
    const c = caixa();
    if (!c) return;
    if (noFim.current) {
      vistas.current = total;
      setNovas(0);
      irAoFim(c);
    } else {
      setNovas(Math.max(0, total - vistas.current));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, total]);

  // 2b. A CAIXA MUDOU DE TAMANHO — o caso que o efeito 1 não vê. No celular a Central mostra a lista OU
  // a conversa (display: none na que não está à vista), e a conversa do primeiro da lista já é
  // montada ESCONDIDA: o efeito de montagem roda com a caixa em `display: none` (altura 0) e o
  // `scrollTop` gravado ali não vale nada. Tocar nessa mesma linha só troca o CSS — nada remonta —
  // e a conversa aparecia no COMEÇO (medido em 390x780: 5328px do fim). Vale também para girar o
  // aparelho e para o teclado virtual que encolhe a caixa. A regra é a mesma do resto: quem está no
  // fim (última rolagem) continua no fim; quem lê acima não é mexido.
  useEffect(() => {
    const c = caixa();
    if (!c || typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(() => {
      if (noFim.current) irAoFim(c);
    });
    obs.observe(c);
    return () => obs.disconnect();
  }, [conversa]);

  // 3. A pessoa rolou: guarda se está no fim e, chegando lá, o aviso some sozinho.
  useEffect(() => {
    const c = caixa();
    if (!c) return;
    const aoRolar = () => {
      const perto = c.scrollHeight - c.scrollTop - c.clientHeight < TOLERANCIA_DO_FIM;
      noFim.current = perto;
      if (perto) {
        vistas.current = total;
        setNovas(0);
      }
    };
    c.addEventListener("scroll", aoRolar, { passive: true });
    return () => c.removeEventListener("scroll", aoRolar);
  }, [total]);

  return (
    <>
      <div ref={ancora} aria-hidden="true" />
      {/* O contador é o ÚNICO aria-live: o log da conversa não é, senão o leitor de tela leria tudo a
          cada atualização. */}
      <span className="sr-only" aria-live="polite">
        {novas > 0 ? `${novas} ${novas === 1 ? "nova mensagem" : "novas mensagens"}` : ""}
      </span>
      {novas > 0 && (
        // `sticky bottom`: fica colado ao pé da caixa que rola, sem tirar nada do fluxo. FLUTUA sobre
        // as mensagens, então é o único ponto da conversa com sombra (DESIGN.md §4).
        <div className="pointer-events-none sticky bottom-3 flex justify-center">
          <button
            type="button"
            onClick={() => {
              const c = caixa();
              if (c) irAoFim(c);
              noFim.current = true;
              vistas.current = total;
              setNovas(0);
            }}
            className="pointer-events-auto min-h-9 bg-acao px-4 text-etiqueta font-semibold text-acao-tx hover:bg-acao-hover focus-visible:ring-2 focus-visible:ring-[var(--frame-accent)]"
            style={{ boxShadow: "var(--atd-shadow-card)" }}
          >
            ↓ {novas} {novas === 1 ? "nova mensagem" : "novas mensagens"}
          </button>
        </div>
      )}
    </>
  );
}
