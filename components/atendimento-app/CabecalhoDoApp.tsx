"use client";

import { Moon, Sun } from "lucide-react";
import { useTema } from "@/components/atendimento-app/tema";
import TituloDeTela from "@/components/atendimento-app/ui/TituloDeTela";

// O cabeçalho das telas de aba (Conversas, Funil, Triagem, Mais), no acabamento WhatsApp: o título grande
// "Atendimento" (26px/700) com o nome do escritório em cinza discreto e o botão Dia/Noite SEM caixa. Sem faixa
// grafite, sem filete de ouro: é texto sobre o fundo da tela. A área segura do topo do aparelho é respeitada.
export default function CabecalhoDoApp({ officeName }: { officeName?: string }) {
  const { noite, definir } = useTema();
  return (
    <header className="bg-atd-tela pt-[env(safe-area-inset-top)]" data-cabecalho-do-app="">
      <div className="mx-auto max-w-md">
        <TituloDeTela
          titulo="Atendimento"
          comoH1={false}
          subtitulo={officeName}
          acao={
            <button
              type="button"
              onClick={() => definir(noite ? "light" : "dark")}
              aria-label={noite ? "Mudar para o tema Dia" : "Mudar para o tema Noite"}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-tx hover:bg-atd-linha-hover"
            >
              {noite ? <Sun size={22} aria-hidden="true" /> : <Moon size={22} aria-hidden="true" />}
            </button>
          }
        />
      </div>
    </header>
  );
}
