"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { stageLabels, stageOptions, stageDot } from "@/lib/funil";
import { hrefDaLista } from "@/lib/conversaDaCentral";
import type { ContagensPorFase } from "@/lib/listaDeAtendimentos";

// ============================================================================
// O MINI-SELETOR DE FASE, AO LADO DE "INICIAR CONVERSA" (A4 do plano de 29/09/2026).
//
// As fases são EXATAMENTE as do funil (lib/funil.ts: stageOptions/stageLabels) — Novo, Aguardando,
// Qualificação, Proposta, Fechado, Perdido — mais "Todas" (ausência de filtro). Nenhuma lista nova.
//
// O FILTRO MORA NA URL (`?fase=`), e cada item é um <Link> para o endereço já filtrado, e não um
// botão com estado: o filtro sobrevive ao `router.refresh()` da atualização ao vivo, é
// compartilhável, e o botão Voltar do navegador o desfaz. O filtro é aplicado no SERVIDOR, no
// `where`, antes do `take` (senão esconderia conversa fora dos 200 mais recentes).
//
// ACESSIBILIDADE: botão com aria-haspopup/aria-expanded; itens `menuitemradio` com aria-checked; a
// contagem faz parte do nome acessível ("Qualificação, 3 conversas"); setas movem o foco, Esc fecha
// e devolve o foco ao botão, Tab fecha. O ponto colorido nunca é a única informação: o nome da
// fase está sempre escrito ao lado.
//
// A cor do ponto vem de `stageDot` (var(--...)), nunca hex. Este menu fica sobre a MOLDURA, que é
// escura nos dois temas; por isso "Novo" e "Qualificação" usam os tokens da moldura (os tokens do
// tema — `--tx-3`, `--acao` — somem ou reprovam contraste contra ela).
// ============================================================================

const PONTO_NA_MOLDURA: Record<string, string> = {
  ...stageDot,
  NOVO: "var(--frame-tx-2)",
  QUALIFICACAO: "var(--frame-accent)",
};

export default function SeletorDeFase({
  fase,
  contagens,
  q,
  arquivados,
  id,
}: {
  fase: string | null;
  contagens: ContagensPorFase;
  q: string;
  arquivados: boolean;
  id: string | null;
}) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const itens = useRef<Array<HTMLAnchorElement | null>>([]);

  const opcoes: Array<{ chave: string | null; rotulo: string }> = [
    { chave: null, rotulo: "Todas" },
    ...stageOptions.map((s) => ({ chave: s, rotulo: stageLabels[s] })),
  ];
  const indiceAtual = Math.max(0, opcoes.findIndex((o) => o.chave === fase));

  const fechar = useCallback((devolverFoco: boolean) => {
    setAberto(false);
    if (devolverFoco) botao.current?.focus();
  }, []);

  // Ao abrir, o foco vai para a opção marcada.
  useEffect(() => {
    if (aberto) itens.current[indiceAtual]?.focus();
  }, [aberto, indiceAtual]);

  // Clique fora fecha; a tecla F (atalho da Central) abre — o atalho vive em AtalhosDaCentral.
  useEffect(() => {
    const fora = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false);
    };
    const abrir = () => setAberto(true);
    document.addEventListener("mousedown", fora);
    document.addEventListener("atd-abrir-fase", abrir);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("atd-abrir-fase", abrir);
    };
  }, []);

  function aoTeclar(e: React.KeyboardEvent) {
    const atual = itens.current.findIndex((el) => el === document.activeElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      itens.current[(atual + 1) % opcoes.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      itens.current[(atual - 1 + opcoes.length) % opcoes.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      itens.current[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      itens.current[opcoes.length - 1]?.focus();
    } else if (e.key === "Escape") {
      // Esc fecha o MENU e não deixa a Central tratá-lo (fechar gaveta / voltar à lista).
      e.preventDefault();
      e.stopPropagation();
      fechar(true);
    } else if (e.key === "Tab") {
      setAberto(false);
    }
  }

  const rotuloAtual = fase ? stageLabels[fase] : "Todas";

  return (
    <div ref={raiz} className="relative min-w-0 flex-1">
      <button
        ref={botao}
        id="btn-fase"
        type="button"
        aria-haspopup="menu"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
        data-ativo={fase ? "true" : "false"}
        className={`flex min-h-9 w-full items-center justify-between gap-1.5 border bg-[var(--frame-bg)] px-2.5 text-etiqueta font-semibold text-[var(--frame-tx-0)] focus-visible:ring-2 focus-visible:ring-[var(--frame-accent)] ${
          fase ? "border-[var(--frame-accent)]" : "border-[var(--frame-border-strong)]"
        }`}
      >
        <span className="flex min-w-0 items-center gap-1.5 truncate">
          <span className="font-medium text-[var(--frame-tx-2)]">Fase</span>
          <span className="truncate">{rotuloAtual}</span>
        </span>
        <span aria-hidden="true" className="shrink-0 text-[var(--frame-tx-2)]">▾</span>
      </button>

      {aberto && (
        // FLUTUA sobre a lista, então tem sombra (DESIGN.md §4: sombra só onde algo literalmente flutua).
        <div
          role="menu"
          aria-label="Fase do funil"
          onKeyDown={aoTeclar}
          className="absolute inset-x-0 top-full z-20 mt-1 border border-[var(--frame-border-strong)] bg-[var(--frame-bg-raised)] p-1"
          style={{ boxShadow: "var(--atd-shadow-card)" }}
        >
          {opcoes.map((o, i) => {
            const marcada = (o.chave ?? null) === (fase ?? null);
            const n = contagens[o.chave ?? "TODAS"] ?? 0;
            return (
              <div key={o.chave ?? "TODAS"}>
                {i === 1 && <div className="my-1 border-t border-[var(--frame-border)]" />}
                <Link
                  ref={(el) => {
                    itens.current[i] = el;
                  }}
                  href={hrefDaLista({ fase: o.chave, q, arquivados, id })}
                  role="menuitemradio"
                  aria-checked={marcada}
                  aria-label={`${o.rotulo}, ${n} ${n === 1 ? "conversa" : "conversas"}`}
                  onClick={() => setAberto(false)}
                  className={`flex min-h-9 items-center gap-2 px-2.5 text-etiqueta text-[var(--frame-tx-0)] hover:bg-[var(--frame-accent-bg)] focus-visible:bg-[var(--frame-accent-bg)] focus-visible:outline-none ${
                    marcada ? "font-bold" : "font-medium"
                  }`}
                >
                  {o.chave && <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: PONTO_NA_MOLDURA[o.chave] }} />}
                  <span className="min-w-0 flex-1 truncate">{o.rotulo}</span>
                  <span className="shrink-0 tabular-nums text-[var(--frame-tx-2)]">{n}</span>
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
