"use client";

import Link from "next/link";
import { Moon, Sun } from "lucide-react";
import { useTema } from "@/components/atendimento-app/tema";

// O cabeçalho grafite das telas de aba (Conversas, Funil, Triagem, Mais). Igual nos dois temas, com
// texto claro PRÓPRIO (tokens --atd-hdr-*): no Dia o --gaveta-tinta é escuro e sumia sobre o grafite.
export default function CabecalhoDoApp({ officeName }: { officeName?: string }) {
  const { noite, definir } = useTema();
  return (
    <header className="atd-hdr sticky top-0 z-30 border-b-2 border-ouro-acento bg-atd-hdr text-atd-hdr-tx pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex min-h-14 max-w-md items-center justify-between gap-2 pl-4 pr-2">
        <Link href="/atendimento-app" className="flex min-w-0 items-center gap-2.5 py-2">
          <svg width="28" height="28" viewBox="0 0 120 120" className="shrink-0" aria-hidden="true">
            <rect width="120" height="120" rx="27" fill="#c9962f" />
            <rect x="4.5" y="4.5" width="111" height="111" rx="23" fill="none" stroke="#16191d" strokeOpacity=".35" strokeWidth="1.3" />
            <rect x="33" y="30" width="54" height="60" rx="3" fill="#16191d" />
            <rect x="50" y="30" width="6" height="46" fill="#c9962f" />
            <rect x="50" y="72" width="37" height="6" fill="#c9962f" />
            <rect x="50" y="72" width="6" height="6" fill="#cd5f77" />
            <rect x="33" y="88" width="54" height="2.4" fill="#cd5f77" />
          </svg>
          <span className="min-w-0 leading-tight">
            <span className="block text-corpo font-bold tracking-widest">ATENDIMENTO</span>
            {officeName && <span className="block truncate text-etiqueta text-atd-hdr-tx2">{officeName}</span>}
          </span>
        </Link>
        <button
          type="button"
          onClick={() => definir(noite ? "light" : "dark")}
          aria-label={noite ? "Mudar para o tema Dia" : "Mudar para o tema Noite"}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[2px] text-atd-hdr-tx2 hover:bg-atd-hdr-linha hover:text-atd-hdr-tx"
        >
          {noite ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
        </button>
      </div>
    </header>
  );
}
