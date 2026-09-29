"use client";

import { useEffect, useState } from "react";
import { definirGaveta, gavetaEstaAberta } from "@/lib/gavetaDoTrilho";

// O BOTÃO QUE ABRE (e o que fecha) A GAVETA DO TRILHO em janela estreita. Ver lib/gavetaDoTrilho.ts
// para o motivo de o estado morar no DOM. Só aparece abaixo de 1240px: a classe `atd-so-estreito`
// esconde o botão nas três colunas, onde o trilho já está à vista.
export default function BotaoDaGaveta({ modo }: { modo: "abrir" | "fechar" }) {
  const [aberta, setAberta] = useState(false);
  useEffect(() => {
    const ler = () => setAberta(gavetaEstaAberta());
    ler();
    document.addEventListener("atd-gaveta", ler);
    return () => document.removeEventListener("atd-gaveta", ler);
  }, []);

  if (modo === "fechar") {
    return (
      <button
        type="button"
        onClick={() => definirGaveta(false)}
        className="atd-so-estreito m-2 min-h-11 items-center self-end border border-[var(--atd-border-strong)] px-3 text-etiqueta font-semibold text-tx-2 hover:text-tx focus-visible:ring-2 focus-visible:ring-[var(--frame-accent)]"
      >
        Fechar ✕
      </button>
    );
  }
  return (
    <button
      type="button"
      aria-expanded={aberta}
      onClick={() => definirGaveta(!gavetaEstaAberta())}
      className="atd-so-estreito min-h-11 shrink-0 items-center border border-[var(--atd-border-strong)] px-3 text-etiqueta font-semibold text-tx-2 hover:bg-[var(--list-bg-hover)] hover:text-tx focus-visible:ring-2 focus-visible:ring-[var(--frame-accent)]"
    >
      Detalhes
    </button>
  );
}
