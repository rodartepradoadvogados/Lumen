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
      {/* "Novo" é botão SECUNDÁRIO (DESIGN-SYSTEM.md §4: contorno neutro em --regua) — não
          primário; a ação primária mais visível do produto é Peticionar
          (components/PeticionarButton.tsx), que fica ao lado. */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="hidden sm:flex items-center gap-1.5 h-8 border border-regua bg-sf hover:bg-sf-apoio text-tx text-sm font-medium px-3.5 rounded-lg transition-colors"
      >
        <Plus size={16} /> Novo
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-56 bg-sf rounded-xl border border-regua shadow-menu z-50 overflow-hidden">
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
