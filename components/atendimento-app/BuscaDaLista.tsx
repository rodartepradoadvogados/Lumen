"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { hrefDaListaApp } from "@/lib/conversasDoApp";
import { CampoPilula } from "@/components/atendimento-app/ui/Pilula";

// O campo de busca em PÍLULA no topo da lista. Digitou, a lista se atualiza sozinha (com uma pausa de meio
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
    >
      {f !== "todas" && <input type="hidden" name="f" value={f} />}
      {arq && <input type="hidden" name="arq" value="1" />}
      <CampoPilula
        id="busca-da-lista"
        rotulo="Buscar conversas por nome, número ou assunto"
        icone={<Search size={20} />}
        type="search"
        name="q"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Buscar por nome, número ou assunto"
        autoComplete="off"
        enterKeyHint="search"
        aoLimpar={() => setTexto("")}
        rotuloDoLimpar="Limpar a busca"
      />
    </form>
  );
}
