"use client";

import { useEffect, useRef, useState } from "react";

// Moldura do diagrama de cada linha de recurso do site público. Existe por um motivo só: dizer ao
// CSS QUANDO o diagrama entrou na tela, para que a animação daquele mecanismo toque uma vez — item
// D4 do roteiro de dinamismo, aprovado pelo dono em 2026-09-16.
//
// Por que um observador e não animação no carregamento: as cinco linhas de recurso ficam abaixo da
// dobra. Animar no carregamento é animar para ninguém — quando o leitor chegar ali, a sequência já
// terminou há muito. E por que UMA vez: `unobserve` no primeiro cruzamento. Um diagrama que
// reanima a cada rolagem para cima e para baixo vira decoração piscando, que é exatamente o que
// `reference/animate.md` chama de dívida de animação.
//
// O SVG chega como `children`, renderizado no servidor: este componente não conhece nenhum
// diagrama, só carrega o interruptor. A animação de cada mecanismo vive em app/globals.css
// (Movimento 10), presa a `[data-visivel="true"]`.
export default function FeatureFigure({
  figure,
  ordem,
  children,
}: {
  figure: string;
  ordem: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // DOIS estados, e não um booleano de visibilidade — esta é a diferença entre a página funcionar
  // e a página sumir. `observando` só fica verdadeiro depois que este efeito rodou no navegador, e
  // é ELE que autoriza o CSS a esconder as peças que vão animar. O HTML que sai do servidor não
  // tem nenhum dos dois atributos, então, se o JS nunca rodar (falha de rede no bundle, script
  // bloqueado, hidratação quebrada), os cinco diagramas aparecem inteiros em vez de ficarem
  // invisíveis para sempre. Esconder por padrão e revelar por JS é como se perde conteúdo.
  const [estado, setEstado] = useState<"inicial" | "observando" | "visivel">("inicial");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Sem suporte a IntersectionObserver, o diagrama nasce no estado final — nunca escondido.
    if (typeof IntersectionObserver === "undefined") return;
    setEstado("observando");
    const obs = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) {
            setEstado("visivel");
            obs.unobserve(e.target);
          }
        }
      },
      // 25% do diagrama dentro da faixa de leitura: cedo o bastante para o leitor ver a sequência
      // inteira, tarde o bastante para ela não tocar enquanto ainda está no rodapé da tela.
      { rootMargin: "0px 0px -15% 0px", threshold: 0.25 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-observando={estado !== "inicial" ? "true" : undefined}
      data-visivel={estado === "visivel" ? "true" : undefined}
      className={`diagrama aspect-[4/3] border-2 border-regua-forte bg-sf rounded-[2px] flex items-center p-10 ${
        ordem % 2 === 1 ? "md:order-1" : ""
      }`}
    >
      <svg viewBox="0 0 100 70" role="img" aria-label={figure} className="w-full h-full">
        {children}
      </svg>
    </div>
  );
}
