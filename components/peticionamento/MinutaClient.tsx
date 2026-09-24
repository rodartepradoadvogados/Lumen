"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { atualizarCorpoDaMinuta, conferirSaidaDaPeca, salvarMargensDaMinuta } from "@/lib/actions/peticionamento";
import { avaliarSaidaDaPeca } from "@/lib/peticionamentoAprovacao";
import { MinutaEditor } from "@/components/peticionamento/MinutaEditor";
import { PreviaDaFolha } from "@/components/peticionamento/PreviaDaFolha";
import { PAGINA_A4, type MargensDaPagina, type OrigemDaMargem } from "@/lib/peticionamentoPaginaA4";
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
  aprovadaInicial,
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
  /** ETAPA C: a minuta já estava aprovada quando a tela abriu (PeticionamentoSessao.minutaAprovadaEm). */
  aprovadaInicial: boolean;
}) {
  const [corpo, setCorpo] = useState(htmlInicial);
  const [modalAberto, setModalAberto] = useState(false);
  const [salvo, setSalvo] = useState(true);
  // Incrementa a cada salvamento do corpo — CitacoesClient observa isto para recarregar a lista,
  // já que editar a minuta pode ter invalidado a confirmação de alguma citação (decisão do dono).
  const [versaoSalva, setVersaoSalva] = useState(0);
  // null = o quadro de citações ainda não carregou; até lá a saída fica travada ("conferindo").
  const [citacoesPendentes, setCitacoesPendentes] = useState<number | null>(null);
  const [aprovada, setAprovada] = useState(aprovadaInicial);
  // A GRAVAÇÃO PODE FALHAR, E O SILÊNCIO É O PIOR DESFECHO. Sem isto, uma queda de rede deixava
  // `setSalvo(true)` sem rodar: a tela ficava em "salvando…" para SEMPRE, sem erro, e o advogado
  // seguia digitando acreditando que estava guardado. Numa tela de peça com prazo preclusivo,
  // perder trabalho em silêncio é a falha mais cara que existe aqui.
  const [erroDeGravacao, setErroDeGravacao] = useState<string | null>(null);

  // Só grava quando o HTML de fato mudou em relação ao que abriu. É isto que garante a promessa do
  // contrato de schema: abrir uma minuta ANTIGA (sem HTML gravado) e não mexer em nada não
  // reescreve `minutaTexto` — nenhuma visita normaliza o corpo de ninguém pelas costas.
  useEffect(() => {
    if (corpo === htmlInicial) return;
    setSalvo(false);
    // Editar desfaz a aprovação no servidor ao gravar (atualizarCorpoDaMinuta). Aqui ela cai JÁ, na
    // tecla: sem isto, nos 700 ms antes da gravação a tela ainda deixaria imprimir um texto que
    // ninguém aprovou.
    setAprovada(false);
    const t = setTimeout(async () => {
      try {
        // A ação devolve sempre { ok: true } e LANÇA quando falha — por isso o tratamento é o
        // catch, e não a inspeção do retorno.
        await atualizarCorpoDaMinuta(sessaoId, corpo);
        setErroDeGravacao(null);
        setSalvo(true);
        setVersaoSalva((v) => v + 1);
      } catch {
        // Rede caiu, aba dormiu, servidor recusou. O que NÃO pode acontecer é a tela continuar
        // dizendo "salvando…" como se ainda houvesse esperança.
        setErroDeGravacao("Não foi possível salvar. O que você escreveu ainda está nesta tela, mas NÃO foi gravado.");
      }
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
  const [sobreposta, setSobreposta] = useState(false);
  // LARGURA MÍNIMA PARA A PRÉVIA SER LEGÍVEL NA COLUNA. A folha A4 tem 210mm (~793px a 96dpi);
  // abaixo de 60% de escala o corpo de 14px cai para menos de 8,4px e deixa de ser leitura, vira
  // miniatura. 793 × 0,6 ≈ 476px, mais a folga da coluna. Medido: em 1440px a coluna resolve para
  // ~240px (escala 0,24 — página de 50px, texto de 3,4px) e em 1920px para ~77%, que funciona.
  const COLUNA_MINIMA_PX = 500;
  const colunaEstreita = larguraDaColuna > 0 && larguraDaColuna < COLUNA_MINIMA_PX;

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

  // ── ETAPA C: a aprovação é a trava da saída ───────────────────────────────────────────────────
  // Word, PDF e impressão obedecem a MESMA régua que o servidor confere (avaliarSaidaDaPeca). O
  // botão desabilitado é comodidade; a trava de verdade é a do servidor, em confirmarExportacao e
  // conferirSaidaDaPeca.
  const saida = avaliarSaidaDaPeca({ aprovada, citacoesPendentes });
  const [formatoDoModal, setFormatoDoModal] = useState<"docx" | "pdf">("docx");
  const [erroDeSaida, setErroDeSaida] = useState<string | null>(null);

  function abrirExportacao(formato: "docx" | "pdf") {
    setFormatoDoModal(formato);
    setModalAberto(true);
  }

  // A SAÍDA EM PDF É A IMPRESSÃO DO NAVEGADOR, e nenhuma dependência nova foi instalada. O PDF que
  // o dono quer é a peça no papel timbrado — e isso já existe desenhado na prévia (etapa B). Gerar
  // PDF no servidor exigiria converter o .docx (LibreOffice/Word, que não rodam numa função da
  // Vercel) ou redesenhar a peça numa biblioteca de PDF — uma segunda cópia da diagramação, que
  // divergiria da prévia no primeiro ajuste. O navegador imprime exatamente as folhas da prévia, e
  // "Salvar como PDF" existe no diálogo de impressão do Chrome, do Edge, do Firefox e do Safari.
  // O que isto NÃO dá: o PDF não vai para o Drive sozinho e depende de a pessoa escolher "Salvar
  // como PDF" no diálogo — por isso o modal diz isso em letras claras.
  async function imprimirSeLiberada() {
    setErroDeSaida(null);
    const r = await conferirSaidaDaPeca(sessaoId);
    if ("error" in r) {
      setErroDeSaida(r.error);
      return;
    }
    setPreviaAberta(true);
    setImprimir(true);
  }

  const linhasNota = notaObrigatoria.split("\n");

  return (
    <>
      <div className="doc-toolbar">
        <div className="title-block">
          <h1>{titulo}</h1>
          <div className="sub">
            <span className="edit-chip">Editável</span> {erroDeGravacao ? "NÃO SALVO" : salvo ? "salvo automaticamente" : "salvando…"}
          </div>
        </div>
        <div className="toolbar-mid" style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button className="btn btn-primary btn-sm" disabled={!saida.liberada} onClick={() => abrirExportacao("docx")}>
            Exportar para Word
          </button>
          <button className="btn btn-ghost btn-sm" disabled={!saida.liberada} onClick={() => abrirExportacao("pdf")}>
            Exportar para PDF
          </button>
        </div>
      </div>
      <div className="export-format-strip">
        A peça sai em <strong>Word (.docx)</strong> ou <strong>PDF</strong> — com o{" "}
        <strong>timbrado cadastrado do escritório</strong> quando houver um. Os dois ficam disponíveis{" "}
        <strong>depois que você aprovar a minuta</strong>. Para imprimir no papel, use o PDF.
      </div>
      {!saida.liberada && (
        <div className="minuta-saida-travada" role="status">
          <strong>Exportar e imprimir estão bloqueados.</strong> Falta:
          <ul>
            {saida.motivos.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}
      {erroDeSaida && (
        <div className="callout callout-danger" style={{ margin: "0 32px" }}>
          {erroDeSaida}
        </div>
      )}
      {/* A FALHA DE GRAVAÇÃO GRITA, e fica na tela até o próximo salvamento dar certo — some
          sozinha quando `erroDeGravacao` volta a null. `role="alert"` porque isto interrompe: quem
          está escrevendo uma peça com prazo precisa saber AGORA que o texto não está guardado. */}
      {erroDeGravacao && (
        <div className="callout callout-danger" role="alert" style={{ margin: "0 32px" }}>
          {erroDeGravacao} Não feche esta aba: copie o texto para algum lugar seguro antes, ou
          continue editando — a próxima tentativa acontece sozinha a cada alteração.
        </div>
      )}

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
          <CitacoesClient
            sessaoId={sessaoId}
            atualizarQuando={versaoSalva}
            onContagemMudou={setCitacoesPendentes}
            onAprovacaoMudou={setAprovada}
            papelPodeAprovar={podeExportar}
          />
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
            disabled={!saida.liberada}
            title={saida.liberada ? undefined : `Bloqueado: ${saida.motivos.join(" ")}`}
            // A impressão sai das folhas da prévia — imprimirSeLiberada abre a prévia e, conferida a
            // trava no servidor, o diálogo de impressão.
            onClick={() => void imprimirSeLiberada()}
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
            {colunaEstreita && !sobreposta && (
              <button className="btn btn-primary btn-sm" onClick={() => setSobreposta(true)}>
                Ver em tamanho real
              </button>
            )}
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
              imprimivel={saida.liberada}
              aprovada={aprovada}
            />
          </>
        ) : (
          <p className="minuta-previa-legenda">A prévia mostra a peça no papel timbrado do escritório, e muda enquanto você digita.</p>
        )}
      </aside>
      </div>
      {/* A PRÉVIA SOBREPOSTA — só existe quando a coluna não comporta e a pessoa pediu. Fica FORA
          de `.minuta-com-previa` de propósito: ali dentro ela herdaria a largura da coluna, que é
          justamente o problema que este modo resolve. */}
      {sobreposta && previaAberta && (
        <div className="previa-sobreposta" role="dialog" aria-modal="true" aria-label="Prévia em tamanho real">
          <div className="previa-sobreposta-topo">
            <span className="quiet">Prévia em tamanho real — no papel timbrado do escritório</span>
            <span style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setSobreposta(false)}>
                Voltar a editar
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setSobreposta(false);
                  setPreviaAberta(false);
                }}
              >
                Esconder prévia
              </button>
            </span>
          </div>
          <div className="previa-sobreposta-corpo">
            <PreviaDaFolha
              html={corpo}
              titulo={titulo}
              notaObrigatoria={notaObrigatoria}
              notaRiscos={notaRiscos}
              margens={margens}
              timbrado={timbrado}
              larguraDisponivelPx={PAGINA_A4.larguraMm * (96 / 25.4) + 8}
              imprimir={false}
              aoImprimir={impressaoAtendida}
              imprimivel={saida.liberada}
              aprovada={aprovada}
            />
          </div>
        </div>
      )}

      {modalAberto && (
        <ExportarModal
          sessaoId={sessaoId}
          arquivoNomeSugerido={titulo}
          podeExportar={podeExportar}
          jaExportada={exportada}
          citacoesPendentes={citacoesPendentes ?? 0}
          formato={formatoDoModal}
          onPdfConfirmado={() => {
            setPreviaAberta(true);
            setImprimir(true);
          }}
          onFechar={() => setModalAberto(false)}
        />
      )}
    </>
  );
}
