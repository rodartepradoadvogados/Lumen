"use client";

// A LISTA DE VALIDAÇÃO DE CITAÇÕES, uma a uma — decisão do dono (22/09/2026). Dois grupos:
// ementas citadas (estruturadas pelo agente) e trechos não colocados como ementa (referência a
// julgado/súmula/tema solta no corpo — a mais perigosa, porque hoje escapa inteira da lista de
// jurisprudência). NÃO existe "confirmar todas" — de propósito, é o ponto inteiro da mudança.
//
// O texto abaixo precisa dizer, sem rodeio, que o sistema NÃO verificou nada — proibido usar
// "validado"/"verificado" como se o sistema tivesse conferido (decisão do dono, literal).

import { useEffect, useState, useTransition } from "react";
import { confirmarCitacaoIndividual, listarCitacoesParaValidacao, type CitacaoParaValidacao } from "@/lib/actions/peticionamento";

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

function ItemCitacao({ citacao, confirmando, onConfirmar }: { citacao: CitacaoParaValidacao; confirmando: boolean; onConfirmar: () => void }) {
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
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", fontSize: 12 }}>
        <LinkDeFonte url={citacao.fonteUrl} rotulo="fonte original" />
        <LinkDeFonte url={citacao.fonteSecundariaUrl} rotulo="fonte secundária" />
        <span style={{ flex: 1 }} />
        {citacao.confirmada ? (
          <span className="quiet">
            li e revisei — {citacao.confirmadaPorNome ?? "—"}
            {citacao.confirmadaEm ? ` em ${formatarData(citacao.confirmadaEm)}` : ""}
          </span>
        ) : (
          <button className="btn btn-primary btn-sm" disabled={confirmando} onClick={onConfirmar}>
            {confirmando ? "Confirmando…" : "Li e revisei esta citação"}
          </button>
        )}
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
  const [citacoes, setCitacoes] = useState<CitacaoParaValidacao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [pendenteTransicao, iniciar] = useTransition();

  async function carregar() {
    try {
      const lista = await listarCitacoesParaValidacao(sessaoId);
      setCitacoes(lista);
      onContagemMudou?.(lista.filter((c) => !c.confirmada).length);
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

  if (citacoes === null) {
    return (
      <div className="note-box" style={{ marginBottom: 20 }}>
        <p className="quiet" style={{ margin: 0 }}>
          Carregando as citações desta minuta…
        </p>
      </div>
    );
  }

  if (citacoes.length === 0) {
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

      {ementas.length > 0 && (
        <>
          <div className="field-label" style={{ marginTop: 4 }}>
            Ementas citadas ({ementas.length})
          </div>
          <ul style={{ listStyle: "none", margin: "0 0 16px", padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {ementas.map((c) => (
              <ItemCitacao key={c.id} citacao={c} confirmando={pendenteTransicao && confirmandoId === c.id} onConfirmar={() => confirmar(c.id)} />
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
              <ItemCitacao key={c.id} citacao={c} confirmando={pendenteTransicao && confirmandoId === c.id} onConfirmar={() => confirmar(c.id)} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
