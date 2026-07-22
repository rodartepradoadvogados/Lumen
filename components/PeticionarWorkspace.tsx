"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import LumenMark from "@/components/LumenMark";

const RESEARCH_LINKS = [
  { label: "Jusbrasil — Consulta processual", href: "https://www.jusbrasil.com.br/consulta-processual/" },
  { label: "STJ — Pesquisa de Jurisprudência", href: "https://scon.stj.jus.br/SCON/" },
  { label: "STF — Pesquisa de Jurisprudência", href: "https://jurisprudencia.stf.jus.br/pages/search" },
];

const NOTE_KEYS = ["peticionar-nota-1", "peticionar-nota-2", "peticionar-nota-3", "peticionar-nota-4"];

function NoteBox({ storageKey, index }: { storageKey: string; index: number }) {
  const [value, setValue] = useState("");

  useEffect(() => {
    setValue(localStorage.getItem(storageKey) || "");
  }, [storageKey]);

  return (
    <textarea
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        localStorage.setItem(storageKey, e.target.value);
      }}
      placeholder={`Anotação ${index + 1}`}
      className="w-full h-40 resize-none rounded-lg border border-navy-800/12 dark:border-white/15 dark:bg-navy-800 dark:text-cream-50 p-3 text-sm focus:outline-none focus:border-gold-500"
    />
  );
}

export default function PeticionarWorkspace() {
  return (
    <div className="min-h-screen bg-cream-50 dark:bg-navy-950 p-5 space-y-5">
      <div className="flex items-center gap-2">
        <LumenMark size={28} />
        <div>
          <h1 className="font-serif text-lg font-bold text-navy-900 dark:text-cream-50">Espaço de peticionamento</h1>
          <p className="text-xs text-navy-800/50 dark:text-cream-50/50">Pesquisa e anotações — deixe esta aba aberta ao lado do documento</p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {RESEARCH_LINKS.map((link) => (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm font-semibold text-navy-900 dark:text-cream-50 bg-white dark:bg-navy-900 border border-navy-800/12 dark:border-white/15 px-3.5 py-2 rounded-lg hover:border-gold-500"
          >
            {link.label} <ExternalLink size={13} />
          </a>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {NOTE_KEYS.map((key, i) => (
          <NoteBox key={key} storageKey={key} index={i} />
        ))}
      </div>
    </div>
  );
}
