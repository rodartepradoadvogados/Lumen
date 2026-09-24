"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { atualizarCorpoDaMinuta, salvarMargensDaMinuta } from "@/lib/actions/peticionamento";
import { MinutaEditor } from "@/components/peticionamento/MinutaEditor";
import { PreviaDaFolha } from "@/components/peticionamento/PreviaDaFolha";
import type { MargensDaPagina, OrigemDaMargem } from "@/lib/peticionamentoPaginaA4";
import type { TimbradoDaPrevia } from "@/lib/peticionamentoTimbrado";
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
  margensIniciais,
  origemDaMargem,
  timbrado,
  formatoDoTimbrado,
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
  /** Já conciliadas no servidor: salva ▸ timbrado ▸ padrão (lib/peticionamentoPaginaA4.ts:margensDaFolha). */
  margensIniciais: MargensDaPagina;
  origemDaMargem: OrigemDaMargem;
  /** O timbrado .docx do escritório, lido para a prévia — null sem timbrado, com timbrado em PDF ou com falha ao baixar. */
  timbrado: TimbradoDaPrevia | null;
  /** "DOCX", "PDF" ou null (sem timbrado) — para a prévia dizer o que está mostrando, e o que não. */
  formatoDoTimbrado: string | null;
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

  // ── ETAPA B: margens gravadas e a prévia no papel timbrado ────────────────────────────────────
  const [margens, setMargens] = useState(margensIniciais);
  const [previaAberta, setPreviaAberta] = useState(false);
  const [imprimir, setImprimir] = useState(false);
  const impressaoAtendida = useCallback(() => setImprimir(false), []);
  const colunaRef = useRef<HTMLElement>(null);
  const [larguraDaColuna, setLarguraDaColuna] = useState(0);

  // A margem arrastada na régua é gravada (com a mesma espera do corpo), e só quando mudou de
  // verdade: abrir a folha e não mexer não transforma a margem do timbrado em escolha do advogado.
  useEffect(() => {
    if (margens === margensIniciais) return;
    const t = setTimeout(() => void salvarMargensDaMinuta(sessaoId, margens), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [margens]);

  useEffect(() => {
    const coluna = colunaRef.current;
    if (!coluna) return;
    const observador = new ResizeObserver(([entrada]) => setLarguraDaColuna(entrada.contentRect.width));
    observador.observe(coluna);
    return () => observador.disconnect();
  }, []);

  const avisoDoTimbrado =
    formatoDoTimbrado === "PDF"
      ? "O timbrado deste escritório está em PDF, e só o timbrado em Word (.docx) é aplicado na peça — a prévia mostra a folha sem ele, como o arquivo vai sair."
      : !formatoDoTimbrado
        ? "Este escritório não tem papel timbrado cadastrado (Configurações → Geral) — a prévia mostra a folha simples, como o arquivo vai sair."
        : !timbrado
          ? "Não foi possível abrir o timbrado cadastrado agora — a prévia mostra a folha simples."
          : null;
  const origemLegivel =
    origemDaMargem === "salva" ? "a que você ajustou na régua" : origemDaMargem === "timbrado" ? "a do timbrado do escritório" : "a padrão";

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

      {/* ETAPA B — A MINUTA E, AO LADO, A PRÉVIA. O espaço em branco à direita da folha (a coluna de
          conteúdo tem teto de 1040px) é onde a prévia mora — fechada, ela é só o botão. */}
      <div className="minuta-com-previa">
      <div className="content">
        {/* A FOLHA A4 com a régua em cima e a barra de formatação embaixo (etapa A do editor de
            minuta). As duas notas continuam DENTRO da folha e FORA da área editável — a
            especificação §3 é literal: a nota obrigatória não é editável nesta etapa. */}
        <MinutaEditor
          htmlInicial={htmlInicial}
          onMudou={setCorpo}
          margensIniciais={margensIniciais}
          onMargensMudaram={setMargens}
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

      <aside ref={colunaRef} className="minuta-previa-coluna" aria-label="Prévia no papel timbrado">
        <div className="minuta-previa-botoes">
          <button type="button" className="btn btn-ghost btn-sm" aria-pressed={previaAberta} onClick={() => setPreviaAberta((v) => !v)}>
            {previaAberta ? "Esconder prévia" : "Mostrar prévia"}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              // A impressão sai das folhas da prévia — sem ela aberta não há folha para imprimir.
              setPreviaAberta(true);
              setImprimir(true);
            }}
          >
            Visualizar impressão
          </button>
        </div>
        {previaAberta ? (
          <>
            <p className="minuta-previa-legenda">
              No papel timbrado do escritório, atualizada enquanto você digita. Margem: {margens === margensIniciais ? origemLegivel : "a que você ajustou na régua"}.
              A quebra de página é aproximada — o Word pode partir um parágrafo que aqui passa inteiro para a folha seguinte.
            </p>
            {avisoDoTimbrado && <p className="minuta-previa-aviso">{avisoDoTimbrado}</p>}
            {timbrado?.avisos.map((a) => (
              <p key={a} className="minuta-previa-aviso">
                {a}
              </p>
            ))}
            <PreviaDaFolha
              html={corpo}
              titulo={titulo}
              notaObrigatoria={notaObrigatoria}
              notaRiscos={notaRiscos}
              margens={margens}
              timbrado={timbrado}
              larguraDisponivelPx={larguraDaColuna}
              imprimir={imprimir}
              aoImprimir={impressaoAtendida}
            />
          </>
        ) : (
          <p className="minuta-previa-legenda">A prévia mostra a peça no papel timbrado do escritório, e muda enquanto você digita.</p>
        )}
      </aside>
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
