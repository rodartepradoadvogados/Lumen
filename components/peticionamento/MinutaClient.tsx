"use client";

import { useEffect, useState } from "react";
import { atualizarCorpoDaMinuta } from "@/lib/actions/peticionamento";
import { MinutaEditor } from "@/components/peticionamento/MinutaEditor";
import { ExportarModal } from "@/components/peticionamento/ExportarModal";
import { CitacoesClient } from "@/components/peticionamento/CitacoesClient";
import type { AvaliacaoDeExportacao } from "@/lib/peticionamentoAcesso";

export function MinutaClient({
  sessaoId,
  titulo,
  notaObrigatoria,
  notaRiscos,
  htmlInicial,
  podeExportar,
  exportada,
}: {
  sessaoId: string;
  titulo: string;
  notaObrigatoria: string; // já montada por lib/peticionamentoNotaObrigatoria.ts — NÃO editável (especificação §3)
  notaRiscos: string[];
  /**
   * O HTML com que a folha A4 abre — já resolvido no servidor por
   * lib/peticionamentoMinutaFormatada.ts:htmlParaAbrirAFolha (o gravado, quando existe; a semente
   * do texto puro, quando a sessão é de antes do editor). A tela NUNCA recebe o texto puro em
   * paralelo: o texto puro é DERIVADO deste HTML na gravação, e é essa derivação única que impede
   * as duas representações de divergirem (ver o contrato do schema em `minutaFormatadaHtml`).
   */
  htmlInicial: string;
  podeExportar: AvaliacaoDeExportacao;
  exportada: boolean;
}) {
  const [corpo, setCorpo] = useState(htmlInicial);
  const [modalAberto, setModalAberto] = useState(false);
  const [salvo, setSalvo] = useState(true);
  // Incrementa a cada salvamento do corpo — CitacoesClient observa isto para recarregar a lista,
  // já que editar a minuta pode ter invalidado a confirmação de alguma citação (decisão do dono).
  const [versaoSalva, setVersaoSalva] = useState(0);
  const [citacoesPendentes, setCitacoesPendentes] = useState(0);

  // Só grava quando o HTML de fato mudou em relação ao que abriu. É isto que garante a promessa do
  // contrato de schema: abrir uma minuta ANTIGA (sem HTML gravado) e não mexer em nada não
  // reescreve `minutaTexto` — nenhuma visita normaliza o corpo de ninguém pelas costas.
  useEffect(() => {
    if (corpo === htmlInicial) return;
    setSalvo(false);
    const t = setTimeout(async () => {
      await atualizarCorpoDaMinuta(sessaoId, corpo);
      setSalvo(true);
      setVersaoSalva((v) => v + 1);
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
        {/* A FOLHA A4 com a régua em cima e a barra de formatação embaixo (etapa A do editor de
            minuta). As duas notas continuam DENTRO da folha e FORA da área editável — a
            especificação §3 é literal: a nota obrigatória não é editável nesta etapa. */}
        <MinutaEditor
          htmlInicial={htmlInicial}
          onMudou={setCorpo}
          cabecalhoNaoEditavel={
            <>

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
            </>
          }
        />

        {/* Decisão do dono (22/09/2026): a lista de validação de citações vive AQUI, na mesma tela
            de onde se exporta — quem vai clicar "Exportar" vê, logo acima, o que ainda falta revisar. */}
        <div className="paper-wrap">
          <CitacoesClient sessaoId={sessaoId} atualizarQuando={versaoSalva} onContagemMudou={setCitacoesPendentes} />
        </div>
      </div>

      {modalAberto && (
        <ExportarModal
          sessaoId={sessaoId}
          arquivoNomeSugerido={titulo}
          podeExportar={podeExportar}
          jaExportada={exportada}
          citacoesPendentes={citacoesPendentes}
          onFechar={() => setModalAberto(false)}
        />
      )}
    </>
  );
}
