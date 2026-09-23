"use client";

// A LISTA DE VALIDAÇÃO DE CITAÇÕES, uma a uma — decisão do dono (22/09/2026). Dois grupos:
// ementas citadas (estruturadas pelo agente) e trechos não colocados como ementa (referência a
// julgado/súmula/tema solta no corpo — a mais perigosa, porque hoje escapa inteira da lista de
// jurisprudência). NÃO existe "confirmar todas" — de propósito, é o ponto inteiro da mudança.
//
// O texto abaixo precisa dizer, sem rodeio, que o sistema NÃO verificou nada — proibido usar
// "validado"/"verificado" como se o sistema tivesse conferido (decisão do dono, literal).
//
// ENDURECIMENTO 23/09/2026 (o quadro chegou a mostrar três citações-molde, sem fonte nenhuma, e
// ainda ofereceu "Li e revisei" para as três): três acréscimos.
//   1. Molde/exemplo devolvido pelo agente nunca vira citação — aparece como AVISO próprio.
//   2. Cada citação mostra a graduação de fonte (Passo 4 da skill pesquisa-jurisprudencia).
//   3. Botão "Excluir" por citação, e o passo final "Aprovar minuta / gerar peça" — separado do
//      "li e revisei" de cada uma — só libera com tudo confirmado e nada bloqueante.

import { useEffect, useState, useTransition } from "react";
import {
  confirmarCitacaoIndividual,
  excluirCitacao,
  aprovarMinutaGerarPeca,
  listarCitacoesParaValidacao,
  type CitacaoParaValidacao,
  type CitacaoExcluidaParaTela,
  type AvisoDeMoldeParaTela,
  type ListaDeCitacoesParaTela,
} from "@/lib/actions/peticionamento";

function formatarData(data: Date | string | null): string {
  if (!data) return "";
  const d = typeof data === "string" ? new Date(data) : data;
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function LinkDeFonte({ url, rotulo }: { url: string | null; rotulo: string }) {
  if (!url) return <span className="quiet">{rotulo}: não informada pelo agente</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer">
      {rotulo}
    </a>
  );
}

/** A graduação de fonte (Passo 4): nunca some, mesmo confirmada — dizer "condicional" é o ponto. */
function SeloDeFonte({ fonte }: { fonte: CitacaoParaValidacao["fonte"] }) {
  const cor = fonte.bloqueia ? "var(--danger, #b3261e)" : fonte.classificacao === "condicional" ? "var(--warn, #9a6700)" : "var(--ok-tx, #1b7a43)";
  return (
    <span className="quiet" style={{ color: cor, fontWeight: 600 }}>
      {fonte.bloqueia ? "⚠ " : ""}
      {fonte.rotulo}
    </span>
  );
}

function ItemCitacao({
  citacao,
  confirmando,
  excluindo,
  onConfirmar,
  onExcluir,
}: {
  citacao: CitacaoParaValidacao;
  confirmando: boolean;
  excluindo: boolean;
  onConfirmar: () => void;
  onExcluir: () => void;
}) {
  return (
    <li
      style={{
        border: "1px solid var(--card-border, #e2e2e2)",
        borderRadius: 8,
        padding: "10px 12px",
        background: citacao.confirmada ? "var(--ok-bg, #f0fbf4)" : "transparent",
      }}
    >
      <div style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 8 }}>{citacao.texto}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", fontSize: 12, marginBottom: 6 }}>
        <LinkDeFonte url={citacao.fonteUrl} rotulo="fonte original" />
        <LinkDeFonte url={citacao.fonteSecundariaUrl} rotulo="fonte secundária" />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", fontSize: 12 }}>
        <SeloDeFonte fonte={citacao.fonte} />
        <span style={{ flex: 1 }} />
        {citacao.confirmada ? (
          <span className="quiet">
            li e revisei — {citacao.confirmadaPorNome ?? "—"}
            {citacao.confirmadaEm ? ` em ${formatarData(citacao.confirmadaEm)}` : ""}
          </span>
        ) : (
          <button className="btn btn-primary btn-sm" disabled={confirmando || excluindo} onClick={onConfirmar}>
            {confirmando ? "Confirmando…" : "Li e revisei esta citação"}
          </button>
        )}
        <button className="btn btn-ghost btn-sm" disabled={confirmando || excluindo} onClick={onExcluir} title="Excluir o registro desta citação (não apaga o texto da minuta)">
          {excluindo ? "Excluindo…" : "Excluir"}
        </button>
      </div>
    </li>
  );
}

function ItemExcluida({ citacao }: { citacao: CitacaoExcluidaParaTela }) {
  return (
    <li style={{ border: "1px dashed var(--card-border, #e2e2e2)", borderRadius: 8, padding: "10px 12px", opacity: 0.75 }}>
      <div style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 6, textDecoration: "line-through" }}>{citacao.texto}</div>
      <div className="quiet" style={{ fontSize: 12 }}>
        excluída por {citacao.excluidaPorNome ?? "—"}
        {citacao.excluidaEm ? ` em ${formatarData(citacao.excluidaEm)}` : ""} — o registro saiu da lista, mas isto{" "}
        <strong>não muda o corpo da minuta</strong>.{" "}
        {citacao.aindaNoCorpo
          ? "O texto ainda aparece no corpo da minuta — o Lúmen só parou de cobrar confirmação dele."
          : "O texto não aparece mais no corpo da minuta."}
      </div>
    </li>
  );
}

function AvisoDeMolde({ aviso }: { aviso: AvisoDeMoldeParaTela }) {
  return (
    <li className="callout callout-danger" style={{ margin: 0 }}>
      <strong>O agente devolveu um molde, não um julgado.</strong> O trecho <span className="mono">&quot;{aviso.identificadorMolde}&quot;</span> tem forma de
      número de exemplo/máscara — não identifica processo nenhum, e por isso <strong>não entrou na lista de citações</strong>. A peça não pode usar isto; se a
      tese depender de precedente, peça ao agente para pesquisar de novo ou descreva a tese sem número.
      <div className="quiet" style={{ marginTop: 6, fontSize: 11.5 }}>
        {aviso.origem === "EMENTA" ? "Veio estruturado como ementa: " : "Encontrado solto no corpo da minuta: "}
        {aviso.textoOriginal}
      </div>
    </li>
  );
}

export function CitacoesClient({
  sessaoId,
  onContagemMudou,
  atualizarQuando,
}: {
  sessaoId: string;
  onContagemMudou?: (pendentes: number) => void;
  /** Muda de valor (ex.: um contador) toda vez que o corpo da minuta é salvo — força recarregar a lista, já que editar pode ter invalidado confirmações. */
  atualizarQuando?: unknown;
}) {
  const [dados, setDados] = useState<ListaDeCitacoesParaTela | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const [aprovando, setAprovando] = useState(false);
  const [aprovacaoOk, setAprovacaoOk] = useState(false);
  const [pendenteTransicao, iniciar] = useTransition();

  async function carregar() {
    try {
      const r = await listarCitacoesParaValidacao(sessaoId);
      setDados(r);
      onContagemMudou?.(r.citacoes.filter((c) => !c.confirmada).length);
    } catch {
      setErro("Não foi possível carregar a lista de citações desta minuta.");
    }
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessaoId, atualizarQuando]);

  function confirmar(id: string) {
    setConfirmandoId(id);
    setErro(null);
    iniciar(async () => {
      const r = await confirmarCitacaoIndividual(sessaoId, id);
      if ("error" in r) setErro(r.error);
      await carregar();
      setConfirmandoId(null);
    });
  }

  function excluir(id: string) {
    if (!window.confirm("Excluir o registro desta citação? Isto NÃO apaga o texto da minuta — se o trecho continuar no corpo, você será avisado.")) return;
    setExcluindoId(id);
    setErro(null);
    iniciar(async () => {
      const r = await excluirCitacao(sessaoId, id);
      if ("error" in r) setErro(r.error);
      await carregar();
      setExcluindoId(null);
    });
  }

  function aprovar() {
    setAprovando(true);
    setErro(null);
    setAprovacaoOk(false);
    iniciar(async () => {
      const r = await aprovarMinutaGerarPeca(sessaoId);
      if ("error" in r) setErro(r.error);
      else setAprovacaoOk(true);
      await carregar();
      setAprovando(false);
    });
  }

  if (dados === null) {
    return (
      <div className="note-box" style={{ marginBottom: 20 }}>
        <p className="quiet" style={{ margin: 0 }}>
          Carregando as citações desta minuta…
        </p>
      </div>
    );
  }

  const { citacoes, excluidas, avisosDeMolde, aprovacao } = dados;

  if (citacoes.length === 0 && excluidas.length === 0 && avisosDeMolde.length === 0) {
    return (
      <div className="note-box" style={{ marginBottom: 20 }}>
        <div className="head">
          <div className="ttl">Citações desta minuta</div>
        </div>
        <p className="quiet" style={{ margin: 0 }}>
          Nenhuma referência a jurisprudência, súmula ou tema foi encontrada nesta minuta — nada para revisar aqui.
        </p>
      </div>
    );
  }

  const ementas = citacoes.filter((c) => c.tipo === "EMENTA");
  const trechos = citacoes.filter((c) => c.tipo === "TRECHO");
  const totalPendentes = citacoes.filter((c) => !c.confirmada).length;

  return (
    <div className="note-box" style={{ marginBottom: 20 }}>
      <div className="head">
        <div className="ttl">Citações desta minuta — uma a uma</div>
        <div className="lockline">{totalPendentes > 0 ? (totalPendentes === 1 ? "falta 1" : `faltam ${totalPendentes}`) : "todas revisadas"}</div>
      </div>
      <p className="quiet" style={{ margin: "0 0 14px", fontSize: 12.5, lineHeight: 1.6 }}>
        <strong>O Lúmen não verificou nenhuma destas citações.</strong> O sistema continua sem saber se a jurisprudência abaixo existe de verdade, com a
        redação exata ou no tribunal indicado — confirmar aqui não é uma checagem técnica. É o registro de que <em>você</em> abriu os links, conferiu cada
        citação pessoalmente e assumiu a responsabilidade por ela antes de a peça sair. Editar o corpo da minuta desfaz a confirmação das citações cujo texto
        mudar — e, se uma nova geração trouxer outro link para uma citação já confirmada, a confirmação dela também cai: ela valia pelos links que você
        abriu, não só pelo texto.
      </p>
      {erro && (
        <div className="callout callout-danger" style={{ marginBottom: 12 }}>
          {erro}
        </div>
      )}

      {avisosDeMolde.length > 0 && (
        <>
          <div className="field-label" style={{ marginTop: 4 }}>
            Molde/exemplo devolvido pelo agente ({avisosDeMolde.length}) — não entrou na lista
          </div>
          <ul style={{ listStyle: "none", margin: "0 0 16px", padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {avisosDeMolde.map((a, i) => (
              <AvisoDeMolde key={`${a.origem}-${i}`} aviso={a} />
            ))}
          </ul>
        </>
      )}

      {ementas.length > 0 && (
        <>
          <div className="field-label" style={{ marginTop: 4 }}>
            Ementas citadas ({ementas.length})
          </div>
          <ul style={{ listStyle: "none", margin: "0 0 16px", padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {ementas.map((c) => (
              <ItemCitacao
                key={c.id}
                citacao={c}
                confirmando={pendenteTransicao && confirmandoId === c.id}
                excluindo={pendenteTransicao && excluindoId === c.id}
                onConfirmar={() => confirmar(c.id)}
                onExcluir={() => excluir(c.id)}
              />
            ))}
          </ul>
        </>
      )}

      {trechos.length > 0 && (
        <>
          <div className="field-label">Trechos não colocados como ementa ({trechos.length})</div>
          <p className="quiet" style={{ margin: "0 0 8px", fontSize: 11.5 }}>
            Referências a julgado, súmula ou tema soltas no corpo do texto, sem estar estruturadas como ementa — as que mais facilmente passam batido.
          </p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {trechos.map((c) => (
              <ItemCitacao
                key={c.id}
                citacao={c}
                confirmando={pendenteTransicao && confirmandoId === c.id}
                excluindo={pendenteTransicao && excluindoId === c.id}
                onConfirmar={() => confirmar(c.id)}
                onExcluir={() => excluir(c.id)}
              />
            ))}
          </ul>
        </>
      )}

      {excluidas.length > 0 && (
        <>
          <div className="field-label" style={{ marginTop: 16 }}>
            Excluídas ({excluidas.length})
          </div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {excluidas.map((c) => (
              <ItemExcluida key={c.id} citacao={c} />
            ))}
          </ul>
        </>
      )}

      <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--card-border, #e2e2e2)" }}>
        {aprovacao.aprovadaEm ? (
          <p className="quiet" style={{ margin: 0, fontSize: 12.5 }}>
            <strong>Minuta aprovada</strong> por {aprovacao.aprovadaPorNome ?? "—"} em {formatarData(aprovacao.aprovadaEm)}. Editar o corpo da minuta desfaz
            esta aprovação.
          </p>
        ) : (
          <>
            {!aprovacao.podeAprovar && aprovacao.motivos.length > 0 && (
              <ul className="quiet" style={{ margin: "0 0 10px", paddingLeft: 18, fontSize: 12 }}>
                {aprovacao.motivos.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            )}
            <button className="btn btn-primary" disabled={!aprovacao.podeAprovar || aprovando} onClick={aprovar}>
              {aprovando ? "Aprovando…" : "Aprovar minuta / gerar peça"}
            </button>
            {aprovacaoOk && (
              <span className="quiet" style={{ marginLeft: 10 }}>
                aprovada.
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
