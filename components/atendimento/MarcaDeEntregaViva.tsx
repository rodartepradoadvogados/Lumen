"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CheckCheck } from "lucide-react";
import { ROTULO_DA_ENTREGA, type EntregaDaMensagem } from "@/lib/entregaDaMensagem";

// O TIQUE QUE SE DESENHA (DESIGN.md §9, 15/10/2026). Mostra o estado de entrega de uma mensagem
// nossa e, quando ele AVANÇA com a tela aberta (enviada → entregue → lida), o tique novo se desenha
// em vez de trocar seco (.atd-desenha em app/globals.css). Na primeira pintura não anima: uma
// conversa inteira de tiques se desenhando ao abrir seria barulho, não informação.
export default function MarcaDeEntregaViva({
  entrega,
  tamanho = 15,
  className = "",
  desenharAoMontar = false,
}: {
  entrega: EntregaDaMensagem;
  tamanho?: number;
  className?: string;
  /** A mensagem acabou de ser enviada DAQUI: o primeiro tique já se desenha. */
  desenharAoMontar?: boolean;
}) {
  const anterior = useRef(entrega);
  const [desenhar, setDesenhar] = useState(desenharAoMontar);
  useEffect(() => {
    if (anterior.current !== entrega) {
      anterior.current = entrega;
      setDesenhar(true);
    }
  }, [entrega]);
  const rotulo = ROTULO_DA_ENTREGA[entrega];
  const classe = desenhar ? "atd-desenha" : undefined;
  return (
    <span className={`inline-flex items-center ${entrega === "lida" ? "text-atd-lida" : ""} ${className}`} title={rotulo} data-entrega={entrega}>
      {entrega === "enviada" ? (
        <Check key={entrega} size={tamanho} aria-hidden="true" className={classe} />
      ) : (
        <CheckCheck key={entrega} size={tamanho} strokeWidth={entrega === "lida" ? 3 : 2} aria-hidden="true" className={classe} />
      )}
      <span className="sr-only">{rotulo}</span>
    </span>
  );
}
