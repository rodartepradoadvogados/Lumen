"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  ChevronDown,
  Highlighter,
  IndentDecrease,
  IndentIncrease,
  Italic,
  List,
  ListOrdered,
  Square,
  Table,
  Underline,
} from "lucide-react";
import {
  AREA_DE_TEXTO_MINIMA_MM,
  PAGINA_A4,
  PASSO_DE_RECUO_MM,
  larguraUtilMm,
  limitarMargem,
  type MargensDaPagina,
} from "@/lib/peticionamentoPaginaA4";

// ══════════════════════════════════════════════════════════════════════════════════════════════
// A FOLHA A4 COM RÉGUA EM CIMA E BARRA DE FORMATAÇÃO EMBAIXO — etapa A do editor de minuta,
// pedido do dono (23/09/2026), palavras dele: "podia ter uma régua em cima e uma abaixo, e estar
// com um tamanho padrão de A4. A régua de cima, igual ao word, para definir parágrafo, recuo,
// margens. Na parte de baixo, opções de editar o documento com Bold, italic, underline, tópicos
// em formas, tópicos em números, setinha de opções para mudar o formato dos tópicos, colocar
// sub-tópicos, justificar o texto, alinhar à esquerda, centralizado ou à direita. Opções de mudar
// a cor da letra, do fundo, desenhar linhas de tabela ao redor de texto, inserir tabelas com
// quantidade de colunas e linhas editável."
//
// SEM DEPENDÊNCIA NOVA: contentEditable + Selection API, como components/RichTextEditor.tsx já
// faz nas Anotações. `document.execCommand` é usado só onde ele é de fato o caminho mais curto e
// previsível (negrito/itálico/sublinhado, as duas listas, cor da letra e cor de fundo — este
// último trabalha em SELEÇÃO PARCIAL, coisa que um manipulador de nó escrito à mão faria pior).
// Alinhamento, recuo, formato de tópico, sub-tópico e tabela são feitos por manipulação direta de
// nó, porque aí o HTML gravado é previsível e passa inteiro pelo saneamento do servidor — o
// `indent` do navegador, por exemplo, devolve `<blockquote style="margin: 0 0 0 40px; border:
// none">`, e `margin` abreviado e `border` não estão na lista de estilos aceitos em
// lib/peticionamentoMinutaFormatada.ts: o recuo chegaria ao banco e desapareceria no saneamento.
//
// APENAS DESKTOP (decisão do dono: "não é o caso de celular agora"). A folha não encolhe abaixo
// de A4; em tela estreita a faixa rola na horizontal em vez de quebrar o layout da página.
// ══════════════════════════════════════════════════════════════════════════════════════════════

const SELETOR_DE_BLOCO = "p, div, li, h1, h2, h3, blockquote, td, th";

// `PASSO_DE_RECUO_MM` (1,25 cm) vem de lib/peticionamentoPaginaA4.ts: o recuo de cada nível de
// lista do .docx é montado com o MESMO passo, e escrevê-lo aqui de novo faria a tela e o Word
// discordarem na primeira vez que alguém ajustasse um dos dois.
const RECUO_MAXIMO_MM = 80;
/** Recuo negativo de primeira linha (parágrafo "pendente") até este limite — é uso corrente em petição. */
const RECUO_PRIMEIRA_LINHA_MINIMO_MM = -20;

type Alca = "margemEsquerda" | "margemDireita" | "primeiraLinha" | "recuoEsquerda" | "recuoDireita";

type Recuos = { primeiraLinhaMm: number; esquerdaMm: number; direitaMm: number };

const RECUOS_ZERADOS: Recuos = { primeiraLinhaMm: 0, esquerdaMm: 0, direitaMm: 0 };

const FORMATOS_DE_TOPICO: { rotulo: string; lista: "ul" | "ol"; estilo: string }[] = [
  { rotulo: "• Bolinha cheia", lista: "ul", estilo: "disc" },
  { rotulo: "◦ Bolinha vazia", lista: "ul", estilo: "circle" },
  { rotulo: "▪ Quadradinho", lista: "ul", estilo: "square" },
  { rotulo: "1. Números", lista: "ol", estilo: "decimal" },
  { rotulo: "a. Letras minúsculas", lista: "ol", estilo: "lower-alpha" },
  { rotulo: "A. Letras maiúsculas", lista: "ol", estilo: "upper-alpha" },
  { rotulo: "i. Romanos minúsculos", lista: "ol", estilo: "lower-roman" },
  { rotulo: "I. Romanos maiúsculos", lista: "ol", estilo: "upper-roman" },
];

/** Lê um estilo inline escrito em milímetro por esta tela. Zero quando não há nenhum. */
function mmDoEstilo(valor: string | undefined): number {
  if (!valor) return 0;
  const casa = valor.trim().match(/^(-?\d+(?:\.\d+)?)mm$/);
  return casa ? Number(casa[1]) : 0;
}

function arredondar(mm: number): number {
  return Math.round(mm * 10) / 10;
}

export function MinutaEditor({
  htmlInicial,
  onMudou,
  cabecalhoNaoEditavel,
}: {
  htmlInicial: string;
  onMudou: (html: string) => void;
  /** As notas obrigatória e de riscos — dentro da folha, FORA da área editável (especificação §3). */
  cabecalhoNaoEditavel?: React.ReactNode;
}) {
  const corpoRef = useRef<HTMLDivElement>(null);
  const trilhaRef = useRef<HTMLDivElement>(null);
  const [margens, setMargens] = useState<MargensDaPagina>(PAGINA_A4.margens);
  const [recuos, setRecuos] = useState<Recuos>(RECUOS_ZERADOS);
  const [formatosAbertos, setFormatosAbertos] = useState(false);
  const [tabelaAberta, setTabelaAberta] = useState(false);
  const [linhasNovaTabela, setLinhasNovaTabela] = useState(3);
  const [colunasNovaTabela, setColunasNovaTabela] = useState(3);

  // Semeia o DOM UMA vez. Nunca a cada tecla: reescrever innerHTML no meio da digitação joga o
  // cursor de volta para o começo do documento (mesmo cuidado de components/RichTextEditor.tsx).
  useEffect(() => {
    const corpo = corpoRef.current;
    if (!corpo) return;
    corpo.innerHTML = htmlInicial || "<p><br></p>";
    try {
      document.execCommand("defaultParagraphSeparator", false, "p");
    } catch {
      // Navegador que não conhece o comando continua funcionando — só cria <div> em vez de <p>,
      // e a derivação de texto puro trata os dois como bloco.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emitir = useCallback(() => {
    const corpo = corpoRef.current;
    if (corpo) onMudou(corpo.innerHTML);
  }, [onMudou]);

  // ── SELEÇÃO → BLOCOS ────────────────────────────────────────────────────────────────────────

  const blocosDaSelecao = useCallback((): HTMLElement[] => {
    const corpo = corpoRef.current;
    if (!corpo) return [];
    const selecao = window.getSelection();
    if (!selecao || selecao.rangeCount === 0) return [];
    const faixa = selecao.getRangeAt(0);
    if (!corpo.contains(faixa.commonAncestorContainer)) return [];
    const candidatos = Array.from(corpo.querySelectorAll<HTMLElement>(SELETOR_DE_BLOCO));
    // Só os blocos FOLHA: um <div> que contém três <p> também cruza a seleção, e aplicar recuo
    // nele e nos três de dentro somaria o recuo três vezes.
    const folhas = candidatos.filter((el) => !el.querySelector(SELETOR_DE_BLOCO) && faixa.intersectsNode(el));
    if (folhas.length > 0) return folhas;
    return candidatos.length === 0 ? [corpo] : [];
  }, []);

  /** Lê os recuos do primeiro bloco da seleção — é o que reposiciona os marcadores da régua. */
  const lerRecuosDaSelecao = useCallback(() => {
    const [primeiro] = blocosDaSelecao();
    if (!primeiro) return;
    setRecuos({
      primeiraLinhaMm: mmDoEstilo(primeiro.style.textIndent),
      esquerdaMm: mmDoEstilo(primeiro.style.marginLeft),
      direitaMm: mmDoEstilo(primeiro.style.marginRight),
    });
  }, [blocosDaSelecao]);

  useEffect(() => {
    const aoMudarSelecao = () => {
      const corpo = corpoRef.current;
      const selecao = window.getSelection();
      if (!corpo || !selecao || selecao.rangeCount === 0) return;
      if (!corpo.contains(selecao.getRangeAt(0).commonAncestorContainer)) return;
      lerRecuosDaSelecao();
    };
    document.addEventListener("selectionchange", aoMudarSelecao);
    return () => document.removeEventListener("selectionchange", aoMudarSelecao);
  }, [lerRecuosDaSelecao]);

  const focarCorpo = useCallback(() => corpoRef.current?.focus(), []);

  const comandar = useCallback(
    (comando: string, valor?: string, comCss = false) => {
      focarCorpo();
      try {
        document.execCommand("styleWithCSS", false, comCss ? "true" : "false");
        document.execCommand(comando, false, valor);
      } catch {
        return;
      }
      emitir();
    },
    [emitir, focarCorpo],
  );

  const aplicarNosBlocos = useCallback(
    (aplicar: (el: HTMLElement) => void) => {
      const blocos = blocosDaSelecao();
      if (blocos.length === 0) return;
      for (const bloco of blocos) aplicar(bloco);
      emitir();
    },
    [blocosDaSelecao, emitir],
  );

  // ── RÉGUA ───────────────────────────────────────────────────────────────────────────────────

  const aplicarRecuo = useCallback(
    (proximos: Recuos) => {
      setRecuos(proximos);
      aplicarNosBlocos((el) => {
        el.style.textIndent = `${arredondar(proximos.primeiraLinhaMm)}mm`;
        el.style.marginLeft = `${arredondar(proximos.esquerdaMm)}mm`;
        el.style.marginRight = `${arredondar(proximos.direitaMm)}mm`;
      });
    },
    [aplicarNosBlocos],
  );

  const moverAlca = useCallback(
    (alca: Alca, mmDaBorda: number) => {
      const util = larguraUtilMm(margens);
      const limitarRecuo = (v: number) => Math.min(Math.max(v, 0), Math.max(util - AREA_DE_TEXTO_MINIMA_MM / 2, 0));
      if (alca === "margemEsquerda") {
        setMargens((m) => ({ ...m, esquerdaMm: arredondar(limitarMargem(mmDaBorda, m.direitaMm)) }));
        return;
      }
      if (alca === "margemDireita") {
        setMargens((m) => ({ ...m, direitaMm: arredondar(limitarMargem(PAGINA_A4.larguraMm - mmDaBorda, m.esquerdaMm)) }));
        return;
      }
      if (alca === "primeiraLinha") {
        const bruto = mmDaBorda - margens.esquerdaMm - recuos.esquerdaMm;
        aplicarRecuo({ ...recuos, primeiraLinhaMm: arredondar(Math.min(Math.max(bruto, RECUO_PRIMEIRA_LINHA_MINIMO_MM), RECUO_MAXIMO_MM)) });
        return;
      }
      if (alca === "recuoEsquerda") {
        aplicarRecuo({ ...recuos, esquerdaMm: arredondar(limitarRecuo(mmDaBorda - margens.esquerdaMm)) });
        return;
      }
      aplicarRecuo({ ...recuos, direitaMm: arredondar(limitarRecuo(PAGINA_A4.larguraMm - margens.direitaMm - mmDaBorda)) });
    },
    [aplicarRecuo, margens, recuos],
  );

  const iniciarArraste = useCallback(
    (alca: Alca) => (evento: React.PointerEvent<HTMLElement>) => {
      evento.preventDefault();
      const trilha = trilhaRef.current;
      if (!trilha) return;
      const caixa = trilha.getBoundingClientRect();
      const pxPorMm = caixa.width / PAGINA_A4.larguraMm;
      if (pxPorMm <= 0) return;
      const mover = (ev: PointerEvent) => moverAlca(alca, (ev.clientX - caixa.left) / pxPorMm);
      const soltar = () => {
        window.removeEventListener("pointermove", mover);
        window.removeEventListener("pointerup", soltar);
        window.removeEventListener("pointercancel", soltar);
      };
      window.addEventListener("pointermove", mover);
      window.addEventListener("pointerup", soltar);
      window.addEventListener("pointercancel", soltar);
    },
    [moverAlca],
  );

  // ── TÓPICOS E SUB-TÓPICOS ───────────────────────────────────────────────────────────────────

  const trocarFormatoDeTopico = useCallback(
    (formato: (typeof FORMATOS_DE_TOPICO)[number]) => {
      setFormatosAbertos(false);
      focarCorpo();
      const blocos = blocosDaSelecao();
      const listas = new Set<HTMLElement>();
      for (const bloco of blocos) {
        const lista = bloco.closest("ul, ol");
        if (lista instanceof HTMLElement) listas.add(lista);
      }
      // Sem lista sob o cursor: cria uma do tipo pedido e já aplica o formato nela.
      if (listas.size === 0) {
        comandar(formato.lista === "ol" ? "insertOrderedList" : "insertUnorderedList");
        for (const bloco of blocosDaSelecao()) {
          const lista = bloco.closest("ul, ol");
          if (lista instanceof HTMLElement) listas.add(lista);
        }
      }
      for (const lista of listas) lista.style.listStyleType = formato.estilo;
      emitir();
    },
    [blocosDaSelecao, comandar, emitir, focarCorpo],
  );

  /**
   * SUB-TÓPICO de verdade: o item passa a ser filho do item ANTERIOR, numa lista aninhada — não um
   * item da mesma lista com um recuo maior. É a diferença entre parecer sub-tópico e ser: o
   * aninhamento é o que faz o formato do nível de baixo (letra, romano) valer só ali.
   *
   * Fora de lista, "aumentar recuo" é o que o pedido chama de recuo: um passo de 1,25 cm.
   */
  const aumentarNivel = useCallback(() => {
    focarCorpo();
    const blocos = blocosDaSelecao();
    let mexeu = false;
    for (const bloco of blocos) {
      if (bloco.tagName === "LI") {
        const lista = bloco.parentElement;
        const anterior = bloco.previousElementSibling;
        if (!lista || !anterior || anterior.tagName !== "LI") continue; // o primeiro item não tem de quem ser sub-tópico
        let sub = anterior.lastElementChild;
        if (!sub || (sub.tagName !== "UL" && sub.tagName !== "OL")) {
          sub = document.createElement(lista.tagName.toLowerCase());
          anterior.appendChild(sub);
        }
        sub.appendChild(bloco);
        mexeu = true;
        continue;
      }
      bloco.style.marginLeft = `${arredondar(Math.min(mmDoEstilo(bloco.style.marginLeft) + PASSO_DE_RECUO_MM, RECUO_MAXIMO_MM))}mm`;
      mexeu = true;
    }
    if (mexeu) {
      emitir();
      lerRecuosDaSelecao();
    }
  }, [blocosDaSelecao, emitir, focarCorpo, lerRecuosDaSelecao]);

  const diminuirNivel = useCallback(() => {
    focarCorpo();
    const blocos = blocosDaSelecao();
    let mexeu = false;
    for (const bloco of blocos) {
      if (bloco.tagName === "LI") {
        const sub = bloco.parentElement;
        const itemPai = sub?.parentElement;
        if (!sub || !itemPai || itemPai.tagName !== "LI") continue;
        const listaDeCima = itemPai.parentElement;
        if (!listaDeCima) continue;
        listaDeCima.insertBefore(bloco, itemPai.nextSibling);
        if (sub.children.length === 0) sub.remove();
        mexeu = true;
        continue;
      }
      bloco.style.marginLeft = `${arredondar(Math.max(mmDoEstilo(bloco.style.marginLeft) - PASSO_DE_RECUO_MM, 0))}mm`;
      mexeu = true;
    }
    if (mexeu) {
      emitir();
      lerRecuosDaSelecao();
    }
  }, [blocosDaSelecao, emitir, focarCorpo, lerRecuosDaSelecao]);

  // ── TABELA ──────────────────────────────────────────────────────────────────────────────────

  const inserirTabela = useCallback(() => {
    const linhas = Math.min(Math.max(Math.trunc(linhasNovaTabela) || 1, 1), 40);
    const colunas = Math.min(Math.max(Math.trunc(colunasNovaTabela) || 1, 1), 12);
    const celula = "<td><br></td>";
    const corpoTabela = Array.from({ length: linhas }, () => `<tr>${celula.repeat(colunas)}</tr>`).join("");
    setTabelaAberta(false);
    comandar("insertHTML", `<table><tbody>${corpoTabela}</tbody></table><p><br></p>`);
  }, [colunasNovaTabela, comandar, linhasNovaTabela]);

  /**
   * "DESENHAR LINHAS DE TABELA AO REDOR DE TEXTO": o trecho selecionado vira uma tabela de uma
   * célula — a MESMA forma que lib/peticionamentoDocx.ts já usa para a caixa da nota no Word
   * (OOXML não tem <div>; bloco com moldura é tabela 1x1). Assim o que o advogado vê emoldurado na
   * tela é o que o Word saberá emoldurar depois, sem inventar um segundo mecanismo de moldura.
   */
  const emoldurarSelecao = useCallback(() => {
    focarCorpo();
    const selecao = window.getSelection();
    const corpo = corpoRef.current;
    if (!corpo || !selecao || selecao.rangeCount === 0) return;
    const faixa = selecao.getRangeAt(0);
    if (!corpo.contains(faixa.commonAncestorContainer)) return;
    const embrulho = document.createElement("div");
    if (faixa.collapsed) {
      // Nada selecionado: emoldura o parágrafo inteiro em que o cursor está — é o que quem clica
      // sem selecionar espera, e emoldurar o vazio não serviria para nada.
      const [bloco] = blocosDaSelecao();
      if (!bloco || bloco === corpo) return;
      embrulho.innerHTML = bloco.innerHTML;
      bloco.innerHTML = `<table><tbody><tr><td>${embrulho.innerHTML}</td></tr></tbody></table>`;
      emitir();
      return;
    }
    embrulho.appendChild(faixa.cloneContents());
    comandar("insertHTML", `<table><tbody><tr><td>${embrulho.innerHTML}</td></tr></tbody></table>`);
  }, [blocosDaSelecao, comandar, emitir, focarCorpo]);

  // ── DESENHO ─────────────────────────────────────────────────────────────────────────────────

  const util = larguraUtilMm(margens);
  const porcento = (mm: number) => `${(mm / PAGINA_A4.larguraMm) * 100}%`;
  const marcas = Array.from({ length: Math.floor(PAGINA_A4.larguraMm / 10) + 1 }, (_, i) => i * 10);

  return (
    <div className="minuta-editor">
      {/* ── RÉGUA DE CIMA ───────────────────────────────────────────────────────────────── */}
      <div className="minuta-regua-faixa">
        <div className="minuta-regua" ref={trilhaRef} role="group" aria-label="Régua: margens e recuo do parágrafo">
          <div className="minuta-regua-fora" style={{ left: 0, width: porcento(margens.esquerdaMm) }} />
          <div className="minuta-regua-fora" style={{ right: 0, width: porcento(margens.direitaMm) }} />
          {marcas.map((mm) => (
            <div key={mm} className="minuta-regua-marca" style={{ left: porcento(mm) }}>
              <span>{mm / 10}</span>
            </div>
          ))}
          {marcas.slice(0, -1).map((mm) => (
            <div key={`meia-${mm}`} className="minuta-regua-meia" style={{ left: porcento(mm + 5) }} />
          ))}
          <button
            type="button"
            className="minuta-alca minuta-alca-margem"
            style={{ left: porcento(margens.esquerdaMm) }}
            onPointerDown={iniciarArraste("margemEsquerda")}
            title={`Margem esquerda — ${arredondar(margens.esquerdaMm / 10)} cm`}
            aria-label="Arrastar margem esquerda"
          />
          <button
            type="button"
            className="minuta-alca minuta-alca-margem"
            style={{ left: porcento(PAGINA_A4.larguraMm - margens.direitaMm) }}
            onPointerDown={iniciarArraste("margemDireita")}
            title={`Margem direita — ${arredondar(margens.direitaMm / 10)} cm`}
            aria-label="Arrastar margem direita"
          />
          <button
            type="button"
            className="minuta-alca minuta-alca-primeira"
            style={{ left: porcento(margens.esquerdaMm + recuos.esquerdaMm + recuos.primeiraLinhaMm) }}
            onPointerDown={iniciarArraste("primeiraLinha")}
            title={`Recuo da primeira linha (parágrafo) — ${arredondar(recuos.primeiraLinhaMm / 10)} cm`}
            aria-label="Arrastar recuo da primeira linha"
          />
          <button
            type="button"
            className="minuta-alca minuta-alca-esquerda"
            style={{ left: porcento(margens.esquerdaMm + recuos.esquerdaMm) }}
            onPointerDown={iniciarArraste("recuoEsquerda")}
            title={`Recuo à esquerda — ${arredondar(recuos.esquerdaMm / 10)} cm`}
            aria-label="Arrastar recuo à esquerda"
          />
          <button
            type="button"
            className="minuta-alca minuta-alca-direita"
            style={{ left: porcento(PAGINA_A4.larguraMm - margens.direitaMm - recuos.direitaMm) }}
            onPointerDown={iniciarArraste("recuoDireita")}
            title={`Recuo à direita — ${arredondar(recuos.direitaMm / 10)} cm`}
            aria-label="Arrastar recuo à direita"
          />
        </div>
        <div className="minuta-regua-legenda">
          A4 · margem {arredondar(margens.esquerdaMm / 10)}/{arredondar(margens.direitaMm / 10)} cm · área de texto {arredondar(util / 10)} cm · parágrafo{" "}
          {arredondar(recuos.primeiraLinhaMm / 10)} cm
        </div>
      </div>

      {/* ── A FOLHA A4 ──────────────────────────────────────────────────────────────────── */}
      <div className="minuta-folha-area">
        <article
          className="paper minuta-folha"
          style={{
            paddingTop: `${margens.topoMm}mm`,
            paddingRight: `${margens.direitaMm}mm`,
            paddingBottom: `${margens.baseMm}mm`,
            paddingLeft: `${margens.esquerdaMm}mm`,
          }}
        >
          {cabecalhoNaoEditavel}
          <div
            ref={corpoRef}
            className="minuta-corpo"
            contentEditable
            suppressContentEditableWarning
            spellCheck
            lang="pt-BR"
            role="textbox"
            aria-multiline="true"
            aria-label="Corpo da minuta"
            onInput={emitir}
            onBlur={emitir}
          />
        </article>
      </div>

      {/* ── BARRA DE FORMATAÇÃO DE BAIXO ────────────────────────────────────────────────── */}
      <div className="minuta-barra" role="toolbar" aria-label="Formatação da minuta">
        <Ferramenta rotulo="Negrito" aoClicar={() => comandar("bold")}>
          <Bold size={14} />
        </Ferramenta>
        <Ferramenta rotulo="Itálico" aoClicar={() => comandar("italic")}>
          <Italic size={14} />
        </Ferramenta>
        <Ferramenta rotulo="Sublinhado" aoClicar={() => comandar("underline")}>
          <Underline size={14} />
        </Ferramenta>

        <span className="minuta-barra-risco" aria-hidden="true" />

        <Ferramenta rotulo="Tópicos em formas" aoClicar={() => comandar("insertUnorderedList")}>
          <List size={14} />
        </Ferramenta>
        <Ferramenta rotulo="Tópicos em números" aoClicar={() => comandar("insertOrderedList")}>
          <ListOrdered size={14} />
        </Ferramenta>
        <div className="minuta-menu">
          <Ferramenta rotulo="Mudar o formato dos tópicos" aoClicar={() => setFormatosAbertos((v) => !v)} marcado={formatosAbertos}>
            <ChevronDown size={14} />
          </Ferramenta>
          {formatosAbertos && (
            <div className="minuta-menu-caixa" role="menu">
              {FORMATOS_DE_TOPICO.map((f) => (
                <button key={f.estilo} type="button" role="menuitem" onMouseDown={(e) => e.preventDefault()} onClick={() => trocarFormatoDeTopico(f)}>
                  {f.rotulo}
                </button>
              ))}
            </div>
          )}
        </div>
        <Ferramenta rotulo="Criar sub-tópico (aumentar recuo)" aoClicar={aumentarNivel}>
          <IndentIncrease size={14} />
        </Ferramenta>
        <Ferramenta rotulo="Voltar um nível (diminuir recuo)" aoClicar={diminuirNivel}>
          <IndentDecrease size={14} />
        </Ferramenta>

        <span className="minuta-barra-risco" aria-hidden="true" />

        <Ferramenta rotulo="Justificar o texto" aoClicar={() => aplicarNosBlocos((el) => (el.style.textAlign = "justify"))}>
          <AlignJustify size={14} />
        </Ferramenta>
        <Ferramenta rotulo="Alinhar à esquerda" aoClicar={() => aplicarNosBlocos((el) => (el.style.textAlign = "left"))}>
          <AlignLeft size={14} />
        </Ferramenta>
        <Ferramenta rotulo="Centralizar" aoClicar={() => aplicarNosBlocos((el) => (el.style.textAlign = "center"))}>
          <AlignCenter size={14} />
        </Ferramenta>
        <Ferramenta rotulo="Alinhar à direita" aoClicar={() => aplicarNosBlocos((el) => (el.style.textAlign = "right"))}>
          <AlignRight size={14} />
        </Ferramenta>

        <span className="minuta-barra-risco" aria-hidden="true" />

        <label className="minuta-cor" title="Cor da letra">
          <Baseline size={14} />
          <input type="color" defaultValue="#1c1a17" onChange={(e) => comandar("foreColor", e.target.value, true)} aria-label="Cor da letra" />
        </label>
        <label className="minuta-cor" title="Cor do fundo do texto">
          <Highlighter size={14} />
          <input type="color" defaultValue="#ffe9a8" onChange={(e) => comandar("hiliteColor", e.target.value, true)} aria-label="Cor do fundo do texto" />
        </label>

        <span className="minuta-barra-risco" aria-hidden="true" />

        <Ferramenta rotulo="Desenhar linhas de tabela ao redor do texto" aoClicar={emoldurarSelecao}>
          <Square size={14} />
        </Ferramenta>
        <div className="minuta-menu">
          <Ferramenta rotulo="Inserir tabela" aoClicar={() => setTabelaAberta((v) => !v)} marcado={tabelaAberta}>
            <Table size={14} />
          </Ferramenta>
          {tabelaAberta && (
            <div className="minuta-menu-caixa minuta-menu-tabela">
              <label>
                Linhas
                <input type="number" min={1} max={40} value={linhasNovaTabela} onChange={(e) => setLinhasNovaTabela(Number(e.target.value))} />
              </label>
              <label>
                Colunas
                <input type="number" min={1} max={12} value={colunasNovaTabela} onChange={(e) => setColunasNovaTabela(Number(e.target.value))} />
              </label>
              <button type="button" className="btn btn-primary btn-sm" onMouseDown={(e) => e.preventDefault()} onClick={inserirTabela}>
                Inserir
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Ferramenta({
  rotulo,
  aoClicar,
  marcado,
  children,
}: {
  rotulo: string;
  aoClicar: () => void;
  marcado?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`minuta-ferramenta${marcado ? " ativa" : ""}`}
      // Impede o mousedown de tirar a seleção do corpo antes do clique — sem isto o comando
      // rodaria sem nada selecionado (mesmo cuidado de components/RichTextEditor.tsx).
      onMouseDown={(e) => e.preventDefault()}
      onClick={aoClicar}
      title={rotulo}
      aria-label={rotulo}
    >
      {children}
    </button>
  );
}
