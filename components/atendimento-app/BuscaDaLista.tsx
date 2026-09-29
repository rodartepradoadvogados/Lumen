"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { hrefDaListaApp } from "@/lib/conversasDoApp";

// O campo de busca fixo no topo da lista. Digitou, a lista se atualiza sozinha (com uma pausa de meio
// segundo para não consultar a cada letra); Enter busca na hora; o "x" limpa. Sem JavaScript o
// formulário GET continua funcionando — o filtro escolhido viaja num campo escondido.
export default function BuscaDaLista({ q, f, arq }: { q: string; f: string; arq: boolean }) {
  const router = useRouter();
  const [texto, setTexto] = useState(q);
  const ultimo = useRef(q);

  // A URL mudou por fora (chip, "ver todas"): o campo acompanha.
  useEffect(() => {
    setTexto(q);
    ultimo.current = q;
  }, [q]);

  useEffect(() => {
    if (texto.trim() === ultimo.current.trim()) return;
    const t = setTimeout(() => {
      ultimo.current = texto;
      router.replace(hrefDaListaApp({ f, q: texto, arq }), { scroll: false });
    }, 500);
    return () => clearTimeout(t);
  }, [texto, f, arq, router]);

  return (
    <form
      method="get"
      action="/atendimento-app"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        ultimo.current = texto;
        router.replace(hrefDaListaApp({ f, q: texto, arq }), { scroll: false });
      }}
      className="relative"
    >
      {f !== "todas" && <input type="hidden" name="f" value={f} />}
      {arq && <input type="hidden" name="arq" value="1" />}
      <label htmlFor="busca-da-lista" className="sr-only">
        Buscar conversas por nome, número ou assunto
      </label>
      <Search size={18} aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 text-tx-3" />
      <input
        id="busca-da-lista"
        type="search"
        name="q"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Buscar por nome, número ou assunto"
        autoComplete="off"
        enterKeyHint="search"
        className="min-h-11 w-full rounded-[2px] border border-atd-campo bg-sf py-2 pl-10 pr-11 text-capa-corpo text-tx placeholder:text-tx-3"
      />
      {texto && (
        <button
          type="button"
          onClick={() => setTexto("")}
          aria-label="Limpar a busca"
          className="absolute right-0 top-0 inline-flex h-11 w-11 items-center justify-center text-tx-2 hover:text-tx"
        >
          <X size={18} aria-hidden="true" />
        </button>
      )}
    </form>
  );
}
