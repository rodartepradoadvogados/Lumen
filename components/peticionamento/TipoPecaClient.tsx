"use client";

// A PRIMEIRA PERGUNTA da sessão — especificação §7 da adequação de 21/09/2026.
//
// PEDIDO DO DONO, 24/09/2026 (item 1): "o botão que seleciona abre a próxima página direto, com
// animação arrastando para a esquerda e a próxima página entrando deslizando da direita para a
// esquerda" — escolher a categoria não pede mais um "Continuar" à parte: ela já SALVA e JÁ
// NAVEGA para o contexto (app/peticionamento/[id]/contexto/page.tsx), com a troca visível (ver
// DURACAO_SAIDA_MS abaixo e a classe .passo-saindo em peticionamento.css — a entrada, do lado de
// ContextoClient.tsx, é .passo-entrando).
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { definirCategoriaPeca } from "@/lib/actions/peticionamento";
import { CATEGORIAS_DE_PECA, rotuloCategoriaPeca, type CategoriaDePeca } from "@/lib/peticionamentoCategoriaPeca";
import { useSaidaDoPeticionamento } from "./SaidaContext";

// Tem de casar com a duração de `peticionamento-sai-esquerda` em peticionamento.css — é o tempo
// que a navegação de verdade espera a animação de saída terminar antes de trocar de rota.
const DURACAO_SAIDA_MS = 200;

const DESCRICAO: Record<CategoriaDePeca, string> = {
  Petição: "Vai a juízo ou a um processo administrativo — inicial, contestação, recurso, manifestação.",
  Contrato: "Instrumento contratual entre partes — minuta para negociação ou assinatura.",
  Parecer: "Análise jurídica para orientar uma decisão — sem endereçamento a juízo.",
  "Notificação Extrajudicial": "Comunicação formal fora de processo — constituir em mora, notificar, interpelar.",
  // Decisão do dono (22/09/2026): a opção para quem ainda não sabe classificar o que precisa —
  // não é "nenhuma das anteriores" descartável, é onde o agente recebe MAIS perguntas, não menos.
  Geral: "Ainda não sabe que tipo de peça precisa? Escolha aqui — o questionário pergunta mais, para o agente identificar sozinho.",
};

export function TipoPecaClient({ sessaoId, categoriaAtual }: { sessaoId: string; categoriaAtual: string | null }) {
  const router = useRouter();
  const { marcarTrabalho } = useSaidaDoPeticionamento();
  const [categoria, setCategoria] = useState<string | null>(categoriaAtual);
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  // Dispara a animação de saída (peticionamento.css: .passo-saindo) só DEPOIS de
  // definirCategoriaPeca confirmar sucesso — nunca antes: uma categoria que falhou ao salvar não
  // pode levar a tela embora como se tivesse dado certo.
  const [saindo, setSaindo] = useState(false);

  // Aquece a rota de destino assim que a tela abre — reduz o intervalo entre o fim da animação de
  // saída e a de contexto aparecer (a troca em si continua sendo navegação de verdade do App
  // Router, não uma FLIP de uma página só; ver o comentário no topo do arquivo).
  useEffect(() => {
    router.prefetch(`/peticionamento/${sessaoId}/contexto`);
  }, [router, sessaoId]);

  function escolher(c: CategoriaDePeca) {
    if (pendente || saindo) return; // trava contra duplo clique durante o salvamento/a transição
    setCategoria(c);
    setErro(null);
    marcarTrabalho();
    iniciar(async () => {
      const resultado = await definirCategoriaPeca(sessaoId, c);
      if ("error" in resultado) {
        setErro(resultado.error);
        return;
      }
      setSaindo(true);
    });
  }

  useEffect(() => {
    if (!saindo) return;
    // `prefers-reduced-motion`: sem animação, a troca é imediata (0ms) — quem pediu não ver
    // movimento não deveria esperar a duração dele mesmo sem vê-lo.
    const reduzido = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = setTimeout(() => {
      // `entrando=1`: sinal de uso único para ContextoClient.tsx tocar a animação de ENTRADA
      // (.passo-entrando) só quando se chega por este caminho — nunca ao reabrir a etapa pelo
      // rail, por um link direto ou um F5. ContextoClient limpa o parâmetro da URL assim que lê.
      router.push(`/peticionamento/${sessaoId}/contexto?entrando=1`);
    }, reduzido ? 0 : DURACAO_SAIDA_MS);
    return () => clearTimeout(id);
  }, [saindo, router, sessaoId]);

  return (
    <div className={`passo-tela${saindo ? " passo-saindo" : ""}`}>
      <div className="page-head">
        <div>
          <h1>Que tipo de peça você vai redigir?</h1>
          <p>O nome da aba continua Peticionamento — mas o tipo escolhido aqui muda o que é perguntado a seguir e a estrutura da peça gerada.</p>
        </div>
      </div>

      <div className="content">
        {erro && <div className="callout callout-danger">{erro}</div>}

        <div className="matter-grid">
          {CATEGORIAS_DE_PECA.map((c) => (
            <button
              key={c}
              className={`matter-chip${categoria === c ? " selected" : ""}`}
              disabled={pendente || saindo}
              onClick={() => escolher(c)}
              style={{ flexDirection: "column", alignItems: "flex-start", gap: 4, padding: "14px 16px", minWidth: 220 }}
            >
              <span style={{ fontSize: 14 }}>{rotuloCategoriaPeca(c)}</span>
              <span className="quiet" style={{ fontWeight: 400, fontSize: 11.5, textAlign: "left", whiteSpace: "normal" }}>
                {DESCRICAO[c]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Sem botão "Continuar": escolher já avança sozinho (pedido do dono, 24/09/2026, item 1).
          A barra vira só um rodapé de status — o que está acontecendo, nunca uma ação a mais para
          clicar. */}
      <div className="sticky-bar">
        <div className="left">
          {saindo ? "Levando para o contexto…" : pendente ? "Salvando categoria…" : categoria ? `Categoria escolhida: ${rotuloCategoriaPeca(categoria)}` : "Escolha uma categoria para continuar"}
        </div>
      </div>
    </div>
  );
}
