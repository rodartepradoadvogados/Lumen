"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { salvarWizard } from "@/lib/actions/peticionamento";
import { avaliarProntidao, fraseDoQueFalta } from "@/lib/peticionamentoMinimo";
import { TIPOS_DE_PECA } from "@/lib/peticionamentoTipoPeca";
import { usaSublistaDeTipoDePeticao } from "@/lib/peticionamentoCategoriaPeca";
import { obterConfiguracaoQuestionario, ROTULO_PRAZO_PRECLUSIVO, EXPLICACAO_PRAZO_PRECLUSIVO } from "@/lib/peticionamentoQuestionario";
import { acrescentarTese, editarTese, removerTese, LIMITE_CARACTERES_TESE } from "@/lib/peticionamentoTeses";
import { useSaidaDoPeticionamento } from "./SaidaContext";

type Estado = {
  tipoPeca: string | null;
  tipoPecaOutro: string | null;
  fatos: string;
  pedidos: string[];
  prazoFatal: string;
  prazoPreclusivo: boolean;
  valorCausa: string;
  descumprimentoLiminar: string;
  teses: string[];
  observacoes: string;
};

/**
 * UMA CAIXA DE TESE — caixa de escrita, botão de salvar e botão de cancelar, como o dono pediu.
 *
 * Serve aos dois usos, e por isso não sabe qual é o seu: a caixa vazia do fim da lista e a caixa
 * de edição de uma tese já salva são o MESMO componente. Quem decide o que acontece depois é o
 * pai, pelos dois callbacks:
 *   - `aoSalvar` devolve `null` quando a tese foi aceita, ou o MOTIVO da recusa (texto pronto,
 *     vindo de lib/peticionamentoTeses.ts) — que aparece embaixo da caixa, sem apagar o que o
 *     advogado escreveu. Recusar sem devolver o texto seria perder o trabalho dele;
 *   - `aoCancelar` descarta. Na caixa nova, o pai troca a `key` e a caixa renasce vazia; na de
 *     edição, o pai sai do modo de edição e a tese volta a aparecer como estava.
 *
 * O contador de caracteres é a forma de o limite ser DITO na tela — e o texto nunca é cortado:
 * passar do limite recusa e explica, em vez de guardar uma frase pela metade.
 */
function CaixaDeTese({
  valorInicial,
  rotuloSalvar,
  aoSalvar,
  aoCancelar,
}: {
  valorInicial: string;
  rotuloSalvar: string;
  aoSalvar: (texto: string) => string | null;
  aoCancelar: () => void;
}) {
  const [texto, setTexto] = useState(valorInicial);
  const [recusa, setRecusa] = useState<string | null>(null);
  const escritos = texto.trim().length;
  const excedeu = escritos > LIMITE_CARACTERES_TESE;

  return (
    <div className={`tese-caixa${recusa ? " recusada" : ""}`}>
      <textarea
        value={texto}
        placeholder="Escreva a tese com suas palavras — uma por caixa."
        onChange={(e) => {
          setTexto(e.target.value);
          if (recusa) setRecusa(null);
        }}
      />
      <div className="tese-rodape">
        <span className={`tese-contador mono${excedeu ? " excedeu" : ""}`}>
          {escritos}/{LIMITE_CARACTERES_TESE}
        </span>
        <div className="tese-botoes">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setTexto(valorInicial);
              setRecusa(null);
              aoCancelar();
            }}
          >
            Cancelar
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setRecusa(aoSalvar(texto))}>
            {rotuloSalvar}
          </button>
        </div>
      </div>
      {recusa && <div className="tese-recusa">{recusa}</div>}
    </div>
  );
}

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
        prazoPreclusivo: estado.prazoPreclusivo,
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

  // ── TESES: escrita manual, sem rol fechado (pedido do dono, 22/09/2026) ────────────────────
  // A régua (vazia não entra, repetida não entra, ordem preservada, limite dito e nunca cortado em
  // silêncio) mora em lib/peticionamentoTeses.ts, e é a MESMA que os testes de mesa exercitam —
  // nunca uma segunda versão escrita aqui dentro, que divergiria da primeira com o tempo.
  const [emEdicao, setEmEdicao] = useState<number | null>(null);
  const [versaoDaCaixa, setVersaoDaCaixa] = useState(0);

  function salvarTeseNova(texto: string): string | null {
    const veredito = acrescentarTese(estado.teses, texto);
    if (!veredito.ok) return veredito.motivo;
    setEstado((e) => ({ ...e, teses: veredito.teses }));
    setVersaoDaCaixa((v) => v + 1);
    return null;
  }

  function salvarEdicaoDeTese(indice: number, texto: string): string | null {
    const veredito = editarTese(estado.teses, indice, texto);
    if (!veredito.ok) return veredito.motivo;
    setEstado((e) => ({ ...e, teses: veredito.teses }));
    setEmEdicao(null);
    return null;
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
                <input
                  className="field"
                  type="date"
                  value={estado.prazoFatal}
                  onChange={(e) =>
                    setEstado((s) => ({
                      ...s,
                      prazoFatal: e.target.value,
                      // Apagar a data apaga a marca junto: "preclusivo" sem prazo é afirmação sobre
                      // um prazo que não existe mais. O servidor refaz a mesma conta (salvarWizard),
                      // porque a tela nunca é a trava. Ligar a marca continua sendo só do advogado.
                      prazoPreclusivo: e.target.value ? s.prazoPreclusivo : false,
                    }))
                  }
                />
              </div>
              <div>
                <label className="field-label">{cfg.rotuloValor}</label>
                <input className="field" type="text" value={estado.valorCausa} onChange={(e) => setEstado((s) => ({ ...s, valorCausa: e.target.value }))} />
              </div>
            </div>
          )}
          {cfg.mostrarPrazoValor && cfg.mostrarPreclusivo && (
            <label className={`preclusivo-linha${estado.prazoFatal ? "" : " inativa"}`}>
              <input
                type="checkbox"
                checked={estado.prazoPreclusivo}
                disabled={!estado.prazoFatal}
                onChange={(e) => setEstado((s) => ({ ...s, prazoPreclusivo: e.target.checked }))}
              />
              <span>
                <span className="preclusivo-rotulo">{ROTULO_PRAZO_PRECLUSIVO}</span>
                <span className="preclusivo-ajuda">{estado.prazoFatal ? EXPLICACAO_PRAZO_PRECLUSIVO : "Informe a data acima para poder marcar."}</span>
              </span>
            </label>
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
          <label className="field-label">
            {cfg.labelTeses} <span className="quiet">· {estado.teses.length === 0 ? "nenhuma ainda" : `${estado.teses.length} escrita${estado.teses.length > 1 ? "s" : ""}`}</span>
          </label>
          <div className="tese-lista">
            {estado.teses.map((t, i) =>
              emEdicao === i ? (
                <CaixaDeTese key={`edicao-${i}`} valorInicial={t} rotuloSalvar="Salvar alteração" aoSalvar={(texto) => salvarEdicaoDeTese(i, texto)} aoCancelar={() => setEmEdicao(null)} />
              ) : (
                <div className="tese-item" key={`tese-${i}`}>
                  <div className="tese-texto">{t}</div>
                  <div className="tese-acoes">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEmEdicao(i)}>
                      Editar
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        // Sair do modo de edição junto: remover um item reindexa a lista, e uma
                        // caixa de edição aberta passaria a apontar para OUTRA tese sem avisar.
                        setEmEdicao(null);
                        setEstado((e) => ({ ...e, teses: removerTese(e.teses, i) }));
                      }}
                    >
                      Remover
                    </button>
                  </div>
                </div>
              ),
            )}
            {/* A caixa vazia do fim: a cada tese salva ela renasce (key nova) — é o "acréscimo de
                nova caixa abaixo a cada tese acrescentada" pedido pelo dono. */}
            <CaixaDeTese key={`nova-${versaoDaCaixa}`} valorInicial="" rotuloSalvar="Salvar tese" aoSalvar={salvarTeseNova} aoCancelar={() => setVersaoDaCaixa((v) => v + 1)} />
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
