"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BLOCOS_DOS_DETALHES, resumoDoAtendimento, type ChaveDoBloco } from "@/lib/detalhesDoAtendimento";
import { BlocoRecolhivel, ProvedorDeAvisos, cx } from "./base";
import Contato from "./Contato";
import Triagem from "./Triagem";
import Pendencias from "./Pendencias";
import Processo from "./Processo";
import Dados from "./Dados";
import Anexos from "./Anexos";
import Tarefas from "./Tarefas";
import Anotacoes from "./Anotacoes";
import Encerrar from "./Encerrar";
import type { PropsDosDetalhes } from "./tipos";

// A ABA DETALHES: resumo de uma linha, o cartão de quem é, e blocos que abrem e fecham (Triagem, Pendências e
// Processo abertos; o resto fechado). O índice de chips fica preso ao topo da rolagem — a aba rola por dentro,
// o cabeçalho da conversa fica parado — e "Voltar ao chat" está sempre à vista. Tocar num chip abre o bloco e
// leva até ele.
export default function DetalhesDoApp(props: PropsDosDetalhes) {
  return (
    <ProvedorDeAvisos>
      <Corpo {...props} />
    </ProvedorDeAvisos>
  );
}

function Corpo(p: PropsDosDetalhes) {
  const c = p.conversa;
  const [abertos, setAbertos] = useState<Record<ChaveDoBloco, boolean>>(() => Object.fromEntries(BLOCOS_DOS_DETALHES.map((b) => [b.chave, b.abertoPorPadrao])) as Record<ChaveDoBloco, boolean>);
  const [ativo, setAtivo] = useState<ChaveDoBloco>("triagem");
  const [nomeAberto, setNomeAberto] = useState(false);
  const [pedidoDeRecusa, setPedidoDeRecusa] = useState(false);
  const rolagem = useRef<HTMLDivElement>(null);
  const indice = useRef<HTMLElement>(null);

  const abrirEIr = useCallback((chave: ChaveDoBloco) => {
    setAbertos((a) => ({ ...a, [chave]: true }));
    setAtivo(chave);
    // Espera o bloco abrir (o conteúdo só existe depois) e leva a tela até ele; o foco vai ao cabeçalho do bloco.
    requestAnimationFrame(() => {
      const sec = document.getElementById(`bloco-${chave}`);
      const reduz = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      sec?.scrollIntoView({ block: "start", behavior: reduz ? "auto" : "smooth" });
      document.querySelector<HTMLButtonElement>(`#titulo-${chave} button`)?.focus({ preventScroll: true });
    });
  }, []);

  // O chip do bloco à vista fica marcado: o último bloco cujo topo já passou da linha do índice.
  useEffect(() => {
    const el = rolagem.current;
    if (!el) return;
    const aoRolar = () => {
      const linha = el.getBoundingClientRect().top + (indice.current?.offsetHeight ?? 0) + 24;
      let atual: ChaveDoBloco = BLOCOS_DOS_DETALHES[0].chave;
      for (const b of BLOCOS_DOS_DETALHES) {
        const sec = document.getElementById(`bloco-${b.chave}`);
        if (sec && sec.getBoundingClientRect().top <= linha) atual = b.chave;
      }
      setAtivo(atual);
    };
    el.addEventListener("scroll", aoRolar, { passive: true });
    return () => el.removeEventListener("scroll", aoRolar);
  }, []);

  const abertas = p.pendencias.filter((x) => x.status !== "CONCLUIDA");
  const resumo = resumoDoAtendimento({ area: c.area, stage: c.stage, estimatedValue: c.estimatedValue, prazosAbertos: abertas.map((x) => x.dueDay), hoje: p.hoje });
  const aConfirmar =
    (c.area && !p.triagem.carimbos.area ? 1 : 0) + (c.documentoPendente && !p.triagem.carimbos.documento ? 1 : 0) + (c.description && !p.triagem.carimbos.relato ? 1 : 0) + p.triagem.fatos.filter((f) => f.estado === "PESSOA").length;
  const meta: Partial<Record<ChaveDoBloco, string>> = {
    triagem: aConfirmar ? `${aConfirmar} a confirmar` : undefined,
    pendencias: `${abertas.length} ${abertas.length === 1 ? "aberta" : "abertas"}`,
    anexos: String(p.anexos.length),
    tarefas: String(p.tarefas.length),
    anotacoes: "só você vê",
    processo: c.convertedCase ? "convertido" : undefined,
    encerrar: p.recusa ? "recusado" : c.status === "ARQUIVADO" ? "arquivado" : undefined,
  };

  const irParaEncerrar = () => abrirEIr("encerrar");

  const corpos: Record<ChaveDoBloco, React.ReactNode> = {
    triagem: (
      <Triagem
        p={p}
        aoRecusar={() => {
          abrirEIr("encerrar");
          setPedidoDeRecusa(true);
        }}
      />
    ),
    pendencias: <Pendencias p={p} />,
    processo: <Processo p={p} aoDefinirNome={() => setNomeAberto(true)} aoDesfazerRecusa={irParaEncerrar} />,
    dados: <Dados p={p} />,
    anexos: <Anexos p={p} />,
    tarefas: <Tarefas p={p} />,
    anotacoes: <Anotacoes p={p} />,
    encerrar: <Encerrar p={p} pedido={pedidoDeRecusa} aoConsumirPedido={() => setPedidoDeRecusa(false)} />,
  };

  return (
    <div ref={rolagem} className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-28" data-rolagem-dos-detalhes="">
      <h2 className="sr-only">Detalhes de {c.clientName}</h2>

      <nav ref={indice} aria-label="Ir para um bloco dos detalhes" className="sticky top-0 z-10 flex items-center border-b border-regua bg-sf-fundo py-1.5 pl-1.5">
        <Link href={`/atendimento-app/${c.id}`} replace className={`${cx.discreto} shrink-0 border-r border-regua pl-2 pr-3`} data-voltar-ao-chat="">
          <ArrowLeft size={18} aria-hidden="true" /> Voltar ao chat
        </Link>
        <ul className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-2">
          {BLOCOS_DOS_DETALHES.map((b) => (
            <li key={b.chave} className="shrink-0">
              <button
                type="button"
                onClick={() => abrirEIr(b.chave)}
                aria-current={ativo === b.chave ? "true" : undefined}
                className={`inline-flex min-h-11 items-center rounded-[2px] border px-3 text-corpo ${ativo === b.chave ? "border-acao bg-acao font-bold text-acao-tx" : "border-regua-forte bg-sf font-semibold text-tx"}`}
              >
                {b.rotulo}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <p className="mx-3 mt-3 rounded-[2px] bg-sf-apoio px-3 py-2 text-corpo font-semibold text-tx" role="note" data-resumo="">
        {resumo}
      </p>

      <Contato p={p} nomeAberto={nomeAberto} aoMudarNomeAberto={setNomeAberto} />

      {BLOCOS_DOS_DETALHES.map((b) => (
        <BlocoRecolhivel key={b.chave} chave={b.chave} titulo={b.titulo} meta={meta[b.chave]} aberto={abertos[b.chave]} aoAlternar={(v) => setAbertos((a) => ({ ...a, [b.chave]: v }))}>
          {corpos[b.chave]}
        </BlocoRecolhivel>
      ))}
    </div>
  );
}
