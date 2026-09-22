"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { salvarWizard } from "@/lib/actions/peticionamento";
import { avaliarProntidao, fraseDoQueFalta } from "@/lib/peticionamentoMinimo";
import { TIPOS_DE_PECA } from "@/lib/peticionamentoTipoPeca";
import { usaSublistaDeTipoDePeticao } from "@/lib/peticionamentoCategoriaPeca";
import { obterConfiguracaoQuestionario } from "@/lib/peticionamentoQuestionario";
import { useSaidaDoPeticionamento } from "./SaidaContext";

type Estado = {
  tipoPeca: string | null;
  tipoPecaOutro: string | null;
  fatos: string;
  pedidos: string[];
  prazoFatal: string;
  valorCausa: string;
  descumprimentoLiminar: string;
  teses: string[];
  observacoes: string;
};

export function WizardClient({ sessaoId, categoriaPeca, inicial }: { sessaoId: string; categoriaPeca: string | null; inicial: Estado }) {
  const router = useRouter();
  const { marcarTrabalho } = useSaidaDoPeticionamento();
  const mostraSublistaDeTipo = usaSublistaDeTipoDePeticao(categoriaPeca);
  // Decisão do dono (22/09/2026): o questionário muda por categoria — o rótulo, o que é
  // perguntado e (só em "Geral") um passo a mais. Ver lib/peticionamentoQuestionario.ts.
  const cfg = useMemo(() => obterConfiguracaoQuestionario(categoriaPeca), [categoriaPeca]);
  const [estado, setEstado] = useState<Estado>(inicial);
  // Espec. §7: "o tipo muda o que é perguntado adiante" — a sublista de tipo de petição
  // (Inicial/Contestação/...) só faz sentido para a categoria "Petição"; nas demais, o
  // questionário já começa direto em "fatos" (passo 1 vira o primeiro exibido).
  const [passo, setPasso] = useState(mostraSublistaDeTipo ? 0 : 1);

  // Autosave "de verdade" (especificação §7: nunca perdido ao fechar a aba) — debounced, para não
  // disparar uma escrita a cada tecla.
  useEffect(() => {
    const t = setTimeout(() => {
      salvarWizard(sessaoId, {
        tipoPeca: estado.tipoPeca,
        tipoPecaOutro: estado.tipoPecaOutro,
        fatos: estado.fatos,
        pedidos: estado.pedidos,
        prazoFatal: estado.prazoFatal || null,
        valorCausa: estado.valorCausa,
        descumprimentoLiminar: estado.descumprimentoLiminar,
        teses: estado.teses,
        observacoes: estado.observacoes,
      });
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  // Espec. §4: assim que fatos/pedidos ganham conteúdo de verdade, a sessão passa a ter "trabalho
  // em andamento" — o pop-up de saída (SaidaContext) passa a valer a partir daqui, sem esperar o
  // próximo carregamento de página (que só saberia disso depois do autosave acima).
  useEffect(() => {
    if (estado.fatos.trim() || estado.pedidos.some((p) => p.trim())) marcarTrabalho();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado.fatos, estado.pedidos]);

  const prontidao = useMemo(() => avaliarProntidao({ fatos: estado.fatos, pedidos: estado.pedidos }), [estado.fatos, estado.pedidos]);

  function alternarChip(lista: "pedidos" | "teses", valor: string) {
    setEstado((e) => ({ ...e, [lista]: e[lista].includes(valor) ? e[lista].filter((v) => v !== valor) : [...e[lista], valor] }));
  }

  // Geral ganha um passo A MAIS (pistas) — nunca menos. As demais categorias têm os 4 passos de sempre.
  const totalPassos = cfg.temPassoDePistas ? 5 : 4;

  return (
    <div className="content wizard-wrap">
      <div className="wizard-head">
        <div>
          <h1>Questionário de contextualização</h1>
          <div className="step-label">
            <span className="num">
              Passo {passo + 2} de {totalPassos + 1}
            </span>{" "}
            · esta etapa pode ser pulada
          </div>
        </div>
        <a className="quiet" style={{ fontSize: 12, cursor: "pointer" }} onClick={() => router.push(`/peticionamento/${sessaoId}/documentos`)}>
          Pular questionário inteiro →
        </a>
      </div>

      <div className={`readiness-bar${prontidao.pronto ? " ready" : ""}`}>
        <div className="rd-main">
          <div className="rd-title">{prontidao.pronto ? "Já dá para gerar a minuta" : "Ainda não dá para gerar"}</div>
          <div className="rd-detail">
            {prontidao.pronto
              ? "Fatos e pedidos preenchidos — é o mínimo para o agente escrever. Tipo de peça e teses são enriquecimento."
              : `${fraseDoQueFalta(prontidao.faltando)} Sem alarme — os demais campos continuam opcionais.`}
          </div>
        </div>
        <div className="readiness-pills">
          <span className={`rd-pill${estado.fatos.trim() ? " done" : ""}`}>Fatos</span>
          <span className={`rd-pill${estado.pedidos.length ? " done" : ""}`}>Pedidos</span>
          <span className={`rd-pill${estado.tipoPeca ? " done" : ""}`}>Tipo · opcional</span>
          {(cfg.mostrarTeses || cfg.temPassoDePistas) && <span className={`rd-pill${estado.teses.length ? " done" : ""}`}>{cfg.mostrarTeses ? "Teses" : "Pistas"} · opcional</span>}
        </div>
      </div>

      <div className="progress-dots">
        <div className="seg done" />
        {Array.from({ length: totalPassos }).map((_, i) => (
          <div key={i} className={`seg${i < passo ? " done" : i === passo ? " now" : ""}`} />
        ))}
      </div>

      {passo === 0 && (
        <div className="wcard">
          <span className="step-tag plus">Enriquece a peça</span>
          <h2>Qual é o tipo da peça?</h2>
          <p className="q-sub">
            Mesma lista usada para nomear os arquivos no Lúmen — o tipo escolhido vira a categoria do nome do arquivo. Ajuda o agente, mas não é o mínimo para
            gerar: sem escolha aqui, o Lúmen tenta inferir o tipo pelo contexto vinculado.
          </p>
          <div className="piece-list">
            {TIPOS_DE_PECA.map((tipo) => (
              <label key={tipo} className={`piece-opt${estado.tipoPeca === tipo ? " sel" : ""}`}>
                <input type="radio" name="peca" checked={estado.tipoPeca === tipo} onChange={() => setEstado((e) => ({ ...e, tipoPeca: tipo }))} /> {tipo}
              </label>
            ))}
          </div>
          {estado.tipoPeca === "Outra" && (
            <input
              type="text"
              style={{ marginTop: 10 }}
              placeholder="Digite o tipo de peça"
              value={estado.tipoPecaOutro ?? ""}
              onChange={(e) => setEstado((s) => ({ ...s, tipoPecaOutro: e.target.value }))}
            />
          )}
        </div>
      )}

      {passo === 1 && (
        <div className="wcard">
          <span className="step-tag min">Mínimo para gerar</span>
          <h2>{cfg.tituloFatos}</h2>
          <p className="q-sub">{cfg.subFatos}</p>
          <textarea value={estado.fatos} onChange={(e) => setEstado((s) => ({ ...s, fatos: e.target.value }))} placeholder={cfg.placeholderFatos} />
        </div>
      )}

      {passo === 2 && (
        <div className="wcard">
          <span className="step-tag min">Mínimo para gerar</span>
          <h2>{cfg.tituloPedidos}</h2>
          <p className="q-sub">{cfg.subPedidos}</p>
          {cfg.mostrarPrazoValor && (
            <div className="field-row">
              <div>
                <label className="field-label">{cfg.rotuloPrazo}</label>
                <input className="field" type="date" value={estado.prazoFatal} onChange={(e) => setEstado((s) => ({ ...s, prazoFatal: e.target.value }))} />
              </div>
              <div>
                <label className="field-label">{cfg.rotuloValor}</label>
                <input className="field" type="text" value={estado.valorCausa} onChange={(e) => setEstado((s) => ({ ...s, valorCausa: e.target.value }))} />
              </div>
            </div>
          )}
          {cfg.mostrarDescumprimento && (
            <>
              <label className="field-label">{cfg.rotuloDescumprimento}</label>
              <div className="pick-row">
                {cfg.opcoesDescumprimento.map((op) => (
                  <button key={op} type="button" className={`pick-chip${estado.descumprimentoLiminar === op ? " sel" : ""}`} onClick={() => setEstado((s) => ({ ...s, descumprimentoLiminar: op }))}>
                    {op}
                  </button>
                ))}
              </div>
            </>
          )}
          <label className="field-label">{cfg.labelPedidos}</label>
          <div className="pick-row">
            {Array.from(new Set([...cfg.pedidosSugeridos, ...estado.pedidos])).map((p) => (
              <button key={p} type="button" className={`pick-chip${estado.pedidos.includes(p) ? " sel" : ""}`} onClick={() => alternarChip("pedidos", p)}>
                {p}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder={cfg.placeholderOutroPedido}
            onKeyDown={(e) => {
              const alvo = e.currentTarget;
              if (e.key === "Enter" && alvo.value.trim()) {
                alternarChip("pedidos", alvo.value.trim());
                alvo.value = "";
              }
            }}
          />
        </div>
      )}

      {passo === 3 && cfg.mostrarTeses && (
        <div className="wcard">
          <span className="step-tag plus">Enriquece a peça</span>
          <h2>{cfg.tituloTeses}</h2>
          <p className="q-sub">{cfg.subTeses}</p>
          <label className="field-label">{cfg.labelTeses}</label>
          <div className="pick-row">
            {Array.from(new Set([...cfg.tesesSugeridas, ...estado.teses])).map((t) => (
              <button key={t} type="button" className={`pick-chip${estado.teses.includes(t) ? " sel" : ""}`} onClick={() => alternarChip("teses", t)}>
                {t}
              </button>
            ))}
          </div>
          <label className="field-label">Outras observações para o agente (opcional)</label>
          <textarea
            style={{ minHeight: 70 }}
            placeholder={cfg.placeholderObservacoes}
            value={estado.observacoes}
            onChange={(e) => setEstado((s) => ({ ...s, observacoes: e.target.value }))}
          />
        </div>
      )}

      {passo === 3 && !cfg.mostrarTeses && (
        <div className="wcard">
          <span className="step-tag plus">Enriquece a peça</span>
          <h2>Observações finais</h2>
          <p className="q-sub">Qualquer coisa a mais que o agente precise saber antes de escrever.</p>
          <textarea
            style={{ minHeight: 90 }}
            placeholder={cfg.placeholderObservacoes}
            value={estado.observacoes}
            onChange={(e) => setEstado((s) => ({ ...s, observacoes: e.target.value }))}
          />
        </div>
      )}

      {passo === 4 && cfg.temPassoDePistas && (
        <div className="wcard">
          <span className="step-tag plus">Ajuda o agente a identificar o tipo</span>
          <h2>{cfg.tituloPistas}</h2>
          <p className="q-sub">{cfg.subPistas}</p>
          <label className="field-label">Marque o que já sabe</label>
          <div className="pick-row">
            {Array.from(new Set([...cfg.pistasSugeridas, ...estado.teses])).map((t) => (
              <button key={t} type="button" className={`pick-chip${estado.teses.includes(t) ? " sel" : ""}`} onClick={() => alternarChip("teses", t)}>
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="drag-hint quiet" style={{ fontSize: 12, textAlign: "center", marginTop: 4 }}>
        use os botões abaixo para navegar entre os passos
      </div>
      <div className="deck-actions">
        <button className="btn btn-ghost" onClick={() => setPasso((p) => Math.max(mostraSublistaDeTipo ? 0 : 1, p - 1))} disabled={passo === (mostraSublistaDeTipo ? 0 : 1)}>
          Voltar
        </button>
        {passo < totalPassos - 1 ? (
          <button className="btn btn-primary" onClick={() => setPasso((p) => p + 1)}>
            Continuar
          </button>
        ) : (
          <button className="btn btn-primary" onClick={() => router.push(`/peticionamento/${sessaoId}/documentos`)}>
            Ir para documentos
          </button>
        )}
      </div>
    </div>
  );
}
