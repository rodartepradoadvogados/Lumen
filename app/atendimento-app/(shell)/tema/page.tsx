"use client";

import Link from "next/link";
import { ArrowLeft, Sun, Moon, Monitor } from "lucide-react";
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
    <div className="p-4 space-y-4 animate-fade-in">
      <Link href="/atendimento-app/mais" className="inline-flex min-h-11 items-center gap-1 text-corpo font-semibold text-tx-2">
        <ArrowLeft size={13} /> Mais
      </Link>

      <h1 className="text-xl font-bold text-tx">Tema</h1>

      <div className="bg-sf-apoio border border-regua rounded-[2px] p-4 space-y-3">
        <p className="text-sm text-tx-2">Escolha o modo de exibição do app. A escolha fica guardada neste aparelho.</p>

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
                className={`flex min-h-20 flex-col items-center justify-center gap-1 rounded-[2px] border-2 p-3 transition-colors ${
                  escolhida ? "border-ouro-acento bg-ouro-bg" : "border-regua hover:border-ouro-acento"
                }`}
              >
                <Icone size={22} aria-hidden="true" className={escolhida ? "text-ouro-acento" : "text-tx-2"} />
                <span className={`text-corpo font-semibold ${escolhida ? "text-ouro-acento" : "text-tx"}`}>{ROTULO_DO_TEMA[valor]}</span>
                <span className="text-etiqueta text-tx-3">{ajuda}</span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-tx-3 text-center mt-4">Lúmen Atendimento — Preferência de tema</p>
    </div>
  );
}
