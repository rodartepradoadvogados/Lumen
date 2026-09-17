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
  // Quando a lista foi buscada, e com qual contagem — é o que decide se ela ainda vale.
  const buscaRef = useRef<{ em: number; count: number } | null>(null);

  // Busca SOB DEMANDA, na abertura — ver a nota em lib/actions/alerts.ts sobre por que a lista
  // não vem junto com a barra de topo.
  //
  // E busca DE NOVO quando o que está em mãos não vale mais. A primeira versão guardava a lista
  // para sempre: numa aba deixada aberta a manhã inteira, o número do sino subia (ele vem do
  // servidor a cada navegação) e a gaveta continuava mostrando a lista da primeira abertura —
  // o número e a lista discordando na mesma peça, que é exatamente o defeito que esta rodada
  // começou corrigindo entre o site e o PWA.
  //
  // Dois gatilhos, e os dois são baratos:
  //   · a CONTAGEM mudou desde a busca — prova de que algo entrou ou saiu da Central;
  //   · passou mais de 60s — cobre o caso em que entrou e saiu a mesma quantidade, e o total
  //     ficou igual por coincidência.
  const VALIDADE_MS = 60_000;
  useEffect(() => {
    if (!aberto || carregando) return;
    const b = buscaRef.current;
    const valeAinda = b !== null && b.count === count && Date.now() - b.em < VALIDADE_MS;
    if (valeAinda) return;
    setCarregando(true);
    listarPreviaAlertas()
      .then((lista) => {
        setAlertas(lista);
        buscaRef.current = { em: Date.now(), count };
      })
      .finally(() => setCarregando(false));
  }, [aberto, carregando, count]);

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
            {/* "Carregando…" só quando não há nada em mãos. Numa revalidação a lista anterior
                fica na tela até a nova chegar — piscar a gaveta inteira a cada 60s seria pior
                que mostrar uma linha um minuto velha. */}
            {carregando && alertas === null && <p className="px-3 py-4 text-corpo text-tx-2">Carregando…</p>}
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
