"use client";

import { useEffect, useState } from "react";
import { atualizarCorpoDaMinuta } from "@/lib/actions/peticionamento";
import { ExportarModal } from "@/components/peticionamento/ExportarModal";
import type { AvaliacaoDeExportacao } from "@/lib/peticionamentoAcesso";

export function MinutaClient({
  sessaoId,
  titulo,
  notaObrigatoria,
  notaRiscos,
  corpoInicial,
  podeExportar,
  exportada,
}: {
  sessaoId: string;
  titulo: string;
  notaObrigatoria: string; // já montada por lib/peticionamentoNotaObrigatoria.ts — NÃO editável (especificação §3)
  notaRiscos: string[];
  corpoInicial: string;
  podeExportar: AvaliacaoDeExportacao;
  exportada: boolean;
}) {
  const [corpo, setCorpo] = useState(corpoInicial);
  const [modalAberto, setModalAberto] = useState(false);
  const [salvo, setSalvo] = useState(true);

  useEffect(() => {
    if (corpo === corpoInicial) return;
    setSalvo(false);
    const t = setTimeout(async () => {
      await atualizarCorpoDaMinuta(sessaoId, corpo);
      setSalvo(true);
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corpo]);

  const linhasNota = notaObrigatoria.split("\n");

  return (
    <>
      <div className="doc-toolbar">
        <div className="title-block">
          <h1>{titulo}</h1>
          <div className="sub">
            <span className="edit-chip">Editável</span> {salvo ? "salvo automaticamente" : "salvando…"}
          </div>
        </div>
        <div className="toolbar-mid" style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button className="btn btn-primary btn-sm" onClick={() => setModalAberto(true)}>
            Exportar para Word
          </button>
        </div>
      </div>
      <div className="export-format-strip">
        Esta peça só é exportada em <strong>Word (.docx)</strong> — não há outro formato. Sai com o <strong>timbrado cadastrado do escritório</strong> quando
        houver um configurado; sem timbrado, avisamos no momento da exportação.
      </div>

      <div className="content">
        <div className="paper-wrap">
          <article className="paper">
            <div className="note-box">
              <div className="head">
                <div className="ttl">⚠ MINUTA GERADA POR IA — REVISÃO OBRIGATÓRIA</div>
                <div className="lockline">não editável nesta etapa</div>
              </div>
              {linhasNota.slice(1).map((linha, i) =>
                linha ? (
                  <p key={i} style={{ margin: i === 0 ? "0 0 8px" : "4px 0 0" }}>
                    {linha}
                  </p>
                ) : (
                  <div key={i} style={{ height: 6 }} />
                ),
              )}
            </div>

            {notaRiscos.length > 0 && (
              <div className="note-box risk">
                <div className="head">
                  <div className="ttl">Riscos identificados nesta minuta</div>
                  <div className="lockline">aponta, não decide</div>
                </div>
                <p style={{ margin: "0 0 9px" }} className="quiet">
                  Este bloco só aparece quando o agente identifica algo a observar — é diferente do aviso acima: aquele é sobre a minuta ser rascunho de IA,
                  este é sobre o mérito do caminho processual escolhido. Nada abaixo é estimativa de resultado ou chance de êxito.
                </p>
                <ul>
                  {notaRiscos.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            <textarea
              value={corpo}
              onChange={(e) => setCorpo(e.target.value)}
              style={{
                width: "100%",
                minHeight: 520,
                border: "none",
                background: "transparent",
                color: "var(--paper-tx)",
                fontSize: 14,
                lineHeight: 1.75,
                fontFamily: "inherit",
                resize: "vertical",
                outline: "none",
              }}
            />
          </article>
        </div>
      </div>

      {modalAberto && (
        <ExportarModal
          sessaoId={sessaoId}
          arquivoNomeSugerido={titulo}
          podeExportar={podeExportar}
          jaExportada={exportada}
          onFechar={() => setModalAberto(false)}
        />
      )}
    </>
  );
}
