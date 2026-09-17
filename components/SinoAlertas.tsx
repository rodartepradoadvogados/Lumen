"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Bell } from "lucide-react";
import { listarPreviaAlertas, type AlertaPrevia } from "@/lib/actions/alerts";

// O SINO DA BARRA DE TOPO — pedido do dono em 17/09/2026, aprovado em artefato:
//
//   "O sino de central de alertas pode ficar colorido quando selecionado, em amarelo com
//    transparência, discreto, mas colorido. Quando clicar nesse sino, não abre nova tela da
//    central de alertas, mas desliza para baixo os alertas, e só muda de tela se clicar em uma
//    das pendências."
//
// Antes era um <Link> puro: clicar trocava a tela inteira. Para a pergunta mais comum do sino —
// "tem alguma coisa nova?" — isso cobrava o preço máximo (perder a tela de trabalho e ter de
// voltar) pela resposta mais barata. Agora a gaveta desce, e só o clique numa pendência navega.
//
// A COR do estado aberto usa o vocabulário de aviso que o produto já tem (--aviso-bg / --aviso /
// --linha-aviso), declarado nas oito cascas: âmbar translúcido, não um amarelo novo inventado
// aqui. O contorno é `--linha-aviso`, a linha âmbar DESSATURADA da família — a primeira versão
// usava um contorno mais forte e o dono pediu para aliviar ("sem um contorno tão forte").
//
// O número continua sendo o TOTAL da Central (getAlertsCount, o mesmo do sino do PWA — ver
// components/TopBarActions.tsx). A lista aqui é uma PRÉVIA de 8 linhas: o rodapé leva à tela
// completa. Quem diz quantas existem é o número, não o tamanho da prévia.
export default function SinoAlertas({ count }: { count: number }) {
  const [aberto, setAberto] = useState(false);
  const [alertas, setAlertas] = useState<AlertaPrevia[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const caixaRef = useRef<HTMLDivElement>(null);

  // Busca SOB DEMANDA, uma vez por sessão de painel aberto — ver a nota em
  // lib/actions/alerts.ts sobre por que a lista não vem junto com a barra de topo.
  useEffect(() => {
    if (!aberto || alertas !== null || carregando) return;
    setCarregando(true);
    listarPreviaAlertas()
      .then(setAlertas)
      .finally(() => setCarregando(false));
  }, [aberto, alertas, carregando]);

  useEffect(() => {
    if (!aberto) return;
    function fora(e: MouseEvent) {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) setAberto(false);
    }
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(false);
    }
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  return (
    <div ref={caixaRef} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-label={`Central de Alertas${count > 0 ? `, ${count} pendente(s)` : ""}`}
        className={clsx(
          "relative h-9 w-9 flex items-center justify-center rounded-[2px] border transition-colors",
          aberto
            ? "bg-aviso-bg border-linha-aviso text-aviso"
            : "border-transparent text-tx hover:bg-sf-apoio"
        )}
      >
        <Bell size={19} strokeWidth={1.6} />
        {count > 0 && (
          <span // Bordô, igual ao badge do sino do PWA — contagem não é risco (dono, 2026-09-16).
          className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-acao text-acao-tx text-etiqueta font-bold flex items-center justify-center tabular-nums">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {aberto && (
        // `right-0`: a gaveta cresce para a ESQUERDA, ficando presa à borda direita do sino —
        // mesma regra do painel de busca ao lado.
        <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-[min(420px,calc(100vw-32px))] bg-sf border-2 border-regua-forte shadow-menu animate-menu-desce origin-top">
          <p className="px-3 py-2 text-etiqueta font-bold uppercase tracking-[.08em] text-tx-3 border-b border-regua bg-sf-apoio">
            Central de Alertas · {count} pendente{count === 1 ? "" : "s"}
          </p>

          <div className="max-h-[60vh] overflow-y-auto scrollbar-thin">
            {carregando && <p className="px-3 py-4 text-corpo text-tx-2">Carregando…</p>}
            {!carregando && alertas?.length === 0 && (
              <p className="px-3 py-4 text-corpo text-tx-2">Nada pendente. O escritório está em dia.</p>
            )}
            {alertas?.map((a) => (
              // A ÚNICA coisa aqui que troca de tela — exatamente o que foi pedido.
              <Link
                key={a.id}
                href={a.href}
                onClick={() => setAberto(false)}
                className="flex gap-2.5 items-start px-3 py-2.5 border-b border-regua last:border-b-0 hover:bg-sf-apoio transition-colors duration-100 ease-out"
              >
                {/* Severidade como filete, não como fundo colorido: cor é risco, e o filete diz o
                    risco sem pintar a linha inteira. */}
                <span
                  aria-hidden="true"
                  className={clsx(
                    "w-[3px] self-stretch shrink-0",
                    a.severity === "alta" ? "bg-urgente" : a.severity === "media" ? "bg-aviso" : "bg-concluido"
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-corpo font-semibold text-tx">{a.title}</span>
                  {a.subtitle && <span className="block text-etiqueta text-tx-3 truncate">{a.subtitle}</span>}
                </span>
              </Link>
            ))}
          </div>

          <Link
            href="/alertas?tab=pendentes"
            onClick={() => setAberto(false)}
            className="block px-3 py-2.5 text-etiqueta font-semibold uppercase tracking-[.07em] text-marca-tx hover:text-tx border-t border-regua bg-sf-apoio transition-colors duration-100 ease-out"
          >
            Ver a Central de Alertas →
          </Link>
        </div>
      )}
    </div>
  );
}
