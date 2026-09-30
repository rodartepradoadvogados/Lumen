"use client";

import { Sun, Moon, Monitor } from "lucide-react";
import { TituloDeTela } from "@/components/atendimento-app/ui";
import VoltarParaMais from "@/components/atendimento-app/VoltarParaMais";
import { useTema } from "@/components/atendimento-app/tema";
import { ROTULO_DO_TEMA, type PreferenciaDeTema } from "@/lib/temaDoAtendimentoApp";

const OPCOES: { valor: PreferenciaDeTema; Icone: typeof Sun; ajuda: string }[] = [
  { valor: "light", Icone: Sun, ajuda: "Fundo claro" },
  { valor: "dark", Icone: Moon, ajuda: "Fundo escuro" },
  { valor: "auto", Icone: Monitor, ajuda: "Segue o sistema" },
];

export default function TemaAppPage() {
  const { pref, definir } = useTema();

  return (
    <div className="animate-fade-in pb-4">
      <VoltarParaMais />
      <TituloDeTela titulo="Tema" />

      <div className="mx-4 mt-2 space-y-3 rounded-atd-balao bg-atd-pilula p-4">
        <p className="text-app-previa text-atd-previa">Escolha o modo de exibição do app. A escolha fica guardada neste aparelho.</p>

        <div role="radiogroup" aria-label="Tema do aplicativo" className="grid grid-cols-3 gap-2">
          {OPCOES.map(({ valor, Icone, ajuda }) => {
            const escolhida = pref === valor;
            return (
              <button
                key={valor}
                type="button"
                role="radio"
                aria-checked={escolhida}
                onClick={() => definir(valor)}
                className={`flex min-h-20 flex-col items-center justify-center gap-1 rounded-atd-balao p-3 transition-colors ${escolhida ? "bg-atd-ouro-suave" : "bg-atd-pilula-2 hover:bg-atd-linha-hover"}`}
              >
                <Icone size={22} aria-hidden="true" className={escolhida ? "text-atd-texto-ouro" : "text-atd-previa"} />
                <span className={`text-corpo font-semibold ${escolhida ? "text-atd-texto-ouro" : "text-tx"}`}>{ROTULO_DO_TEMA[valor]}</span>
                <span className="text-app-meta text-atd-previa">{ajuda}</span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="mt-6 text-center text-app-meta text-atd-terciario">Lúmen Atendimento — Preferência de tema</p>
    </div>
  );
}
