"use client";

import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PAGINA_A4, larguraUtilMm, paginarBlocos, type MargensDaPagina } from "@/lib/peticionamentoPaginaA4";
import { sanitizarMinutaHtml } from "@/lib/peticionamentoMinutaFormatada";
import type { ParteDoTimbrado, TimbradoDaPrevia } from "@/lib/peticionamentoTimbrado";

// ══════════════════════════════════════════════════════════════════════════════════════════════
// A PRÉVIA DA PEÇA NO PAPEL TIMBRADO DO ESCRITÓRIO — etapa B do editor de minuta.
//
// Pedido do dono: ao lado da minuta, um botão "mostrar prévia"; a prévia mostra o papel timbrado
// ANEXADO DO PRÓPRIO ESCRITÓRIO com o texto dentro, e muda enquanto ele digita.
//
// O QUE É DESENHADO, na ordem em que o .docx monta (lib/peticionamentoDocx.ts:montarPeticaoWord):
// o título da peça, a nota obrigatória, a nota de riscos (quando há) e o corpo — dentro de folhas
// A4 com as margens conciliadas (lib/peticionamentoPaginaA4.ts:margensDaFolha) e, em cada folha,
// o cabeçalho e o rodapé lidos do timbrado (lib/peticionamentoTimbrado.ts).
//
// AO VIVO: o HTML vem do mesmo estado que a folha de edição emite a cada tecla. useDeferredValue
// deixa a digitação na frente — a prévia acompanha um instante depois, sem travar o cursor.
//
// A PAGINAÇÃO É MEDIDA, não calculada por contagem de caracteres: o fluxo inteiro é desenhado uma
// vez, invisível, na largura exata da área de texto, e cada bloco vai para a folha em que cabe
// (paginarBlocos, provado em mesa). É aproximação do Word — um parágrafo que o Word partiria entre
// duas folhas aqui pula inteiro para a seguinte —, e a tela diz isso.
//
// O HTML QUE ENTRA NA FOLHA passa pelo MESMO saneamento que o servidor aplica antes de gravar
// (sanitizarMinutaHtml). A prévia nunca desenha HTML que o banco recusaria.
// ══════════════════════════════════════════════════════════════════════════════════════════════

const PX_POR_MM_CSS = 96 / 25.4;

function escapar(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Os blocos que vêm antes do corpo, na mesma ordem e com o mesmo texto do .docx. */
function cabecalhoDaPeca(titulo: string, notaObrigatoria: string, notaRiscos: string[]): string {
  const linhasNota = notaObrigatoria.split("\n").slice(1);
  const nota =
    `<div class="previa-nota"><p><strong>⚠ MINUTA GERADA POR IA — REVISÃO OBRIGATÓRIA</strong></p>` +
    linhasNota.map((l) => (l ? `<p>${escapar(l)}</p>` : "")).join("") +
    `</div>`;
  const riscos = notaRiscos.length
    ? `<div class="previa-nota previa-nota-riscos"><p><strong>RISCOS IDENTIFICADOS NESTA MINUTA — aponta, não decide</strong></p>` +
      notaRiscos.map((r) => `<p>• ${escapar(r)}</p>`).join("") +
      `</div>`
    : "";
  return `<p class="previa-titulo">${escapar(titulo)}</p>${nota}${riscos}`;
}

export function PreviaDaFolha({
  html,
  titulo,
  notaObrigatoria,
  notaRiscos,
  margens,
  timbrado,
  larguraDisponivelPx,
  imprimir,
  aoImprimir,
  imprimivel,
}: {
  html: string;
  titulo: string;
  notaObrigatoria: string;
  notaRiscos: string[];
  margens: MargensDaPagina;
  timbrado: TimbradoDaPrevia | null;
  /** Largura da coluna em que a prévia mora — a folha é reduzida (zoom) para caber nela. */
  larguraDisponivelPx: number;
  /** Há um pedido de impressão pendente ("Visualizar impressão"). */
  imprimir: boolean;
  /** Avisa que o diálogo de impressão foi aberto — o pedido foi atendido. */
  aoImprimir: () => void;
  /**
   * ETAPA C: a peça está liberada para sair (aprovada, sem citação pendente). Sem isto as folhas de
   * impressão nem existem — e o Ctrl+P do navegador imprime a tela, não a peça limpa no timbrado.
   */
  imprimivel: boolean;
}) {
  const htmlAdiado = useDeferredValue(html);
  const fluxo = useMemo(
    () => cabecalhoDaPeca(titulo, notaObrigatoria, notaRiscos) + sanitizarMinutaHtml(htmlAdiado),
    [htmlAdiado, notaObrigatoria, notaRiscos, titulo],
  );
  const medidorRef = useRef<HTMLDivElement>(null);
  const [paginas, setPaginas] = useState<string[]>([]);
  const [montado, setMontado] = useState(false);
  const util = larguraUtilMm(margens);

  useEffect(() => setMontado(true), []);

  useLayoutEffect(() => {
    const medidor = medidorRef.current;
    if (!medidor) return;
    const blocos = Array.from(medidor.children) as HTMLElement[];
    const pxPorMm = medidor.offsetWidth / util || PX_POR_MM_CSS;
    const capacidade = (PAGINA_A4.alturaMm - margens.topoMm - margens.baseMm) * pxPorMm;
    const indices = paginarBlocos(
      blocos.map((b) => ({ topo: b.offsetTop, altura: b.offsetHeight })),
      capacidade,
    );
    setPaginas(indices.map((pagina) => pagina.map((i) => blocos[i].outerHTML).join("")));
  }, [fluxo, margens, util]);

  // O diálogo de impressão abre DEPOIS de as folhas existirem — pedir antes imprimiria folha vazia.
  useEffect(() => {
    if (!imprimir || !imprimivel || paginas.length === 0) return;
    aoImprimir();
    window.print();
  }, [imprimir, imprimivel, paginas, aoImprimir]);

  const escala = Math.min(1, Math.max(0.2, (larguraDisponivelPx - 8) / (PAGINA_A4.larguraMm * PX_POR_MM_CSS)));
  const folhas = paginas.map((conteudo, i) => (
    <Folha key={i} conteudo={conteudo} margens={margens} timbrado={timbrado} numero={i + 1} total={paginas.length} />
  ));

  return (
    <>
      {/* O MEDIDOR: o fluxo inteiro, invisível, na largura da área de texto. É daqui que sai a
          altura de cada bloco — nunca de uma estimativa por número de caracteres. */}
      <div
        ref={medidorRef}
        className="previa-medidor previa-tipo minuta-corpo"
        style={{ width: `${util}mm` }}
        aria-hidden="true"
        // eslint-disable-next-line react/no-danger -- `fluxo` = texto escapado (título e notas) + corpo passado por sanitizarMinutaHtml, o mesmo saneamento do servidor antes de gravar.
        dangerouslySetInnerHTML={{ __html: fluxo }}
      />
      <div className="previa-folhas" style={{ zoom: escala }}>
        {folhas}
      </div>
      {/* A IMPRESSÃO: as MESMAS folhas, em tamanho real, fora do chassi da tela (que tem altura
          travada e cortaria a impressão na primeira folha). Invisível na tela; é a única coisa que
          aparece no papel quando o diálogo de impressão abre daqui. */}
      {montado &&
        imprimivel &&
        createPortal(
          <div className="peticionamento previa-impressao" data-theme="light" aria-hidden="true">
            {folhas}
          </div>,
          document.body,
        )}
    </>
  );
}

function Folha({
  conteudo,
  margens,
  timbrado,
  numero,
  total,
}: {
  conteudo: string;
  margens: MargensDaPagina;
  timbrado: TimbradoDaPrevia | null;
  numero: number;
  total: number;
}) {
  const ancoradas = [...(timbrado?.cabecalho.ancoradas ?? []), ...(timbrado?.rodape.ancoradas ?? [])];
  return (
    <div className="previa-pagina previa-tipo" aria-label={`Folha ${numero} de ${total}`}>
      {ancoradas.map((img, i) => (
        // eslint-disable-next-line @next/next/no-img-element -- data: URL lida do .docx do timbrado; o otimizador de imagem do Next não se aplica.
        <img
          key={`a-${i}`}
          src={img.src}
          alt=""
          className="previa-ancorada"
          style={{ left: `${img.esquerdaMm}mm`, top: `${img.topoMm}mm`, width: `${img.larguraMm}mm`, height: `${img.alturaMm}mm`, zIndex: img.atrasDoTexto ? 0 : 2 }}
        />
      ))}
      {timbrado && (
        <ParteDaFolha
          parte={timbrado.cabecalho}
          className="previa-cabecalho"
          style={{ top: `${timbrado.cabecalhoMm}mm`, left: `${margens.esquerdaMm}mm`, right: `${margens.direitaMm}mm` }}
        />
      )}
      <div
        className="previa-corpo minuta-corpo"
        style={{ top: `${margens.topoMm}mm`, left: `${margens.esquerdaMm}mm`, right: `${margens.direitaMm}mm`, bottom: `${margens.baseMm}mm` }}
        // eslint-disable-next-line react/no-danger -- o conteúdo é o outerHTML de blocos do medidor acima, que já saiu de sanitizarMinutaHtml.
        dangerouslySetInnerHTML={{ __html: conteudo }}
      />
      {timbrado && (
        <ParteDaFolha
          parte={timbrado.rodape}
          className="previa-rodape"
          style={{ bottom: `${timbrado.rodapeMm}mm`, left: `${margens.esquerdaMm}mm`, right: `${margens.direitaMm}mm` }}
        />
      )}
    </div>
  );
}

function ParteDaFolha({ parte, className, style }: { parte: ParteDoTimbrado; className: string; style: React.CSSProperties }) {
  if (parte.paragrafos.length === 0) return null;
  return (
    <div className={className} style={style}>
      {parte.paragrafos.map((p, i) => (
        <p key={i} style={{ textAlign: p.alinhamento }}>
          {p.imagens.map((img, j) => (
            // eslint-disable-next-line @next/next/no-img-element -- data: URL lida do .docx do timbrado.
            <img key={j} src={img.src} alt="" style={{ width: `${img.larguraMm}mm`, height: `${img.alturaMm}mm` }} />
          ))}
          {p.texto}
        </p>
      ))}
    </div>
  );
}
