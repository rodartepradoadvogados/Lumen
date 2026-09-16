"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Plus, Scale, Landmark, Briefcase, Headset } from "lucide-react";

export default function NewEntityMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      {/* "Novo" é bordô mais claro que o Peticionar (components/PeticionarButton.tsx, a ação
          mais forte da tela) — pedido explícito para diferenciar as duas sem virar contorno
          neutro (ajuste de tema, agosto/2026: --acao-light em vez do outline anterior). Revisto
            em 2026-09-16 — ver o comentário abaixo. */}
      <button
        onClick={() => setOpen((o) => !o)}
        // "+ Novo" e "Peticionar" são vizinhos e eram bordô cheio os dois, indistinguíveis. Agora
        // o Peticionar fica preenchido e este fica em bordô TRANSLÚCIDO — campo claro de bordô com
        // texto e contorno em bordô (pedido do dono, 2026-09-16). A diferença passa a ser de
        // TRATAMENTO, não de matiz: só a ação mais forte da barra é preenchida.
        className="hidden sm:flex items-center gap-1.5 h-8 rounded-md bg-acao-suave border border-acao/40 hover:bg-acao hover:text-acao-tx text-marca-tx text-sm font-medium px-3.5 transition-colors"
      >
        <Plus size={16} /> Novo
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-56 rounded-lg bg-sf border border-regua shadow-menu z-50 overflow-hidden origin-top-right animate-popup-in">
          <Link href="/processos/novo?type=JUDICIAL" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-tx hover:bg-sf-apoio transition-colors">
            <Scale size={15} /> Processo Judicial
          </Link>
          {/* Setor de Processos Administrativos — mesmo formulário de Novo Processo, só que
              NovoCaseNaturezaSection.tsx troca o seletor de tribunal pelo de órgão administrativo
              (ver lib/orgaosAdministrativos.ts) assim que chega com type=ADMINISTRATIVO. */}
          <Link href="/processos/novo?type=ADMINISTRATIVO" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-tx hover:bg-sf-apoio transition-colors">
            <Landmark size={15} /> Processo Administrativo
          </Link>
          <Link href="/processos/novo?type=EXTRAJUDICIAL" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-tx hover:bg-sf-apoio transition-colors">
            <Briefcase size={15} /> Caso
          </Link>
          <Link href="/atendimento?novo=1" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-tx hover:bg-sf-apoio transition-colors">
            <Headset size={15} /> Atendimento
          </Link>
        </div>
      )}
    </div>
  );
}
