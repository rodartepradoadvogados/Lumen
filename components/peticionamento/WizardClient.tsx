"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { salvarWizard } from "@/lib/actions/peticionamento";
import { avaliarProntidao, fraseDoQueFalta } from "@/lib/peticionamentoMinimo";
import { TIPOS_DE_PECA } from "@/lib/peticionamentoTipoPeca";

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

const PEDIDOS_SUGERIDOS = ["Manutenção da tutela deferida", "Multa por descumprimento", "Inversão do ônus da prova (CDC)", "Condenação em honorários"];
const TESES_SUGERIDAS = ["Rol da ANS é exemplificativo (Tema 990/1069 STJ)", "Urgência/emergência (Lei 9.656/98, art. 12)", "Abusividade de cláusula (CDC, art. 51)"];

export function WizardClient({ sessaoId, inicial }: { sessaoId: string; inicial: Estado }) {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>(inicial);
  const [passo, setPasso] = useState(0); // 0=tipo, 1=fatos, 2=pedido/urgência, 3=teses

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

  const prontidao = useMemo(() => avaliarProntidao({ fatos: estado.fatos, pedidos: estado.pedidos }), [estado.fatos, estado.pedidos]);

  function alternarChip(lista: "pedidos" | "teses", valor: string) {
    setEstado((e) => ({ ...e, [lista]: e[lista].includes(valor) ? e[lista].filter((v) => v !== valor) : [...e[lista], valor] }));
  }

  const totalPassos = 4;

  return (
    <div className="content wizard-wrap">
      <div className="wizard-head">
        <div>
          <h1>Questionário de contextualização</h1>
          <div className="step-label">
            <span className="num">Passo {passo + 2} de 5</span> · esta etapa pode ser pulada
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
          <span className={`rd-pill${estado.teses.length ? " done" : ""}`}>Teses · opcional</span>
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
          <h2>O que mudou nos autos desde a última manifestação?</h2>
          <p className="q-sub">Vira o ponto de partida da minuta — quanto mais específico, menos revisão depois. Este campo é o mínimo de fatos que o agente precisa para escrever.</p>
          <textarea value={estado.fatos} onChange={(e) => setEstado((s) => ({ ...s, fatos: e.target.value }))} placeholder="Descreva os fatos relevantes para esta peça…" />
        </div>
      )}

      {passo === 2 && (
        <div className="wcard">
          <span className="step-tag min">Mínimo para gerar</span>
          <h2>Pedido e urgência</h2>
          <p className="q-sub">
            O campo mínimo desta etapa é <strong>&quot;pedidos&quot;</strong> — prazo, valor e descumprimento são enriquecimento.
          </p>
          <div className="field-row">
            <div>
              <label className="field-label">Prazo fatal nestes autos</label>
              <input className="field" type="date" value={estado.prazoFatal} onChange={(e) => setEstado((s) => ({ ...s, prazoFatal: e.target.value }))} />
            </div>
            <div>
              <label className="field-label">Valor atualizado da causa</label>
              <input className="field" type="text" value={estado.valorCausa} onChange={(e) => setEstado((s) => ({ ...s, valorCausa: e.target.value }))} />
            </div>
          </div>
          <label className="field-label">Há descumprimento pelo réu?</label>
          <div className="pick-row">
            {["Sim, parcial", "Sim, total", "Não"].map((op) => (
              <button key={op} type="button" className={`pick-chip${estado.descumprimentoLiminar === op ? " sel" : ""}`} onClick={() => setEstado((s) => ({ ...s, descumprimentoLiminar: op }))}>
                {op}
              </button>
            ))}
          </div>
          <label className="field-label">Pedidos que a peça deve reiterar/formular</label>
          <div className="pick-row">
            {Array.from(new Set([...PEDIDOS_SUGERIDOS, ...estado.pedidos])).map((p) => (
              <button key={p} type="button" className={`pick-chip${estado.pedidos.includes(p) ? " sel" : ""}`} onClick={() => alternarChip("pedidos", p)}>
                {p}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Outro pedido — digite e pressione Enter"
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

      {passo === 3 && (
        <div className="wcard">
          <span className="step-tag plus">Enriquece a peça</span>
          <h2>Teses e observações</h2>
          <p className="q-sub">Marque o que já pesquisou. O agente ainda cita a fonte de cada precedente e avisa sobre validação cruzada.</p>
          <label className="field-label">Teses a considerar</label>
          <div className="pick-row">
            {Array.from(new Set([...TESES_SUGERIDAS, ...estado.teses])).map((t) => (
              <button key={t} type="button" className={`pick-chip${estado.teses.includes(t) ? " sel" : ""}`} onClick={() => alternarChip("teses", t)}>
                {t}
              </button>
            ))}
          </div>
          <label className="field-label">Outras observações para o agente (opcional)</label>
          <textarea
            style={{ minHeight: 70 }}
            placeholder="Algo mais que o agente precisa saber?"
            value={estado.observacoes}
            onChange={(e) => setEstado((s) => ({ ...s, observacoes: e.target.value }))}
          />
        </div>
      )}

      <div className="drag-hint quiet" style={{ fontSize: 12, textAlign: "center", marginTop: 4 }}>
        use os botões abaixo para navegar entre os passos
      </div>
      <div className="deck-actions">
        <button className="btn btn-ghost" onClick={() => setPasso((p) => Math.max(0, p - 1))} disabled={passo === 0}>
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
