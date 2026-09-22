"use client";

// A PRIMEIRA PERGUNTA da sessão — especificação §7 da adequação de 21/09/2026. Escolhida a
// categoria, o "Continuar" segue para o contexto (app/peticionamento/[id]/contexto/page.tsx).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { definirCategoriaPeca } from "@/lib/actions/peticionamento";
import { CATEGORIAS_DE_PECA, type CategoriaDePeca } from "@/lib/peticionamentoCategoriaPeca";
import { useSaidaDoPeticionamento } from "./SaidaContext";

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

  function escolher(c: CategoriaDePeca) {
    setCategoria(c);
    setErro(null);
    marcarTrabalho();
    iniciar(async () => {
      const resultado = await definirCategoriaPeca(sessaoId, c);
      if ("error" in resultado) setErro(resultado.error);
    });
  }

  return (
    <>
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
            <button key={c} className={`matter-chip${categoria === c ? " selected" : ""}`} disabled={pendente} onClick={() => escolher(c)} style={{ flexDirection: "column", alignItems: "flex-start", gap: 4, padding: "14px 16px", minWidth: 220 }}>
              <span style={{ fontSize: 14 }}>{c}</span>
              <span className="quiet" style={{ fontWeight: 400, fontSize: 11.5, textAlign: "left", whiteSpace: "normal" }}>
                {DESCRICAO[c]}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="sticky-bar">
        <div className="left">{categoria ? `Categoria escolhida: ${categoria}` : "Escolha uma categoria para continuar"}</div>
        <button className="btn btn-primary" disabled={!categoria} onClick={() => router.push(`/peticionamento/${sessaoId}/contexto`)}>
          Continuar
        </button>
      </div>
    </>
  );
}
