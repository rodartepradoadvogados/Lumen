"use client";

/* eslint-disable jsx-a11y/role-has-required-aria-props -- árvore com caixas de marcação: o estado é aria-checked ("mixed" no item parcial); aria-selected duplicaria o anúncio do leitor de tela */

// SELETOR DE DOCUMENTOS do passo "Documentos" (PR P2/P3). Pedido do dono: caixas de seleção de tipo
// (processo judicial, extrajudicial, licitação, demandas/pareceres) limitando a busca; abaixo, a lista
// do que sobrou, com busca inteligente ("quanto mais filtro, mais fácil"); cada processo/demanda/
// licitação abre RECOLHIDO, só com o título — só ao clicar expande e mostra os documentos.
//
// As regras (tipos, busca, contagens, seleção) moram em lib/peticionamentoSeletorDocumentos.ts (puro,
// testado). Este arquivo só desenha e liga o teclado. UM nível só (item → documentos): "accordion dentro
// de accordion" foi recusado pelo dono.
//
// ARIA: árvore (role=tree/treeitem, aria-level, aria-expanded, aria-checked="mixed" no item parcial) com
// foco itinerante. O checkbox do item é redundante ao teclado (Espaço) mas fica visível ao mouse e ao
// toque. A rolagem é SÓ da lista (a página não rola): filtros e resumo ficam fixos.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  CATEGORIAS,
  agruparPorItem,
  contarDocumentos,
  contarPorTipo,
  definirDocumento,
  definirItemInteiro,
  estadoDoItem,
  filtrarItens,
  rotuloDoTipo,
  sugestoesDeVazio,
  trechosDestacados,
  type CategoriaDoFiltro,
  type DocumentoDoSeletor,
  type ItemDoSeletor,
} from "@/lib/peticionamentoSeletorDocumentos";
import { DOCUMENT_TYPES } from "@/lib/documentTypes";

const ROTULO_DO_DOCTYPE = new Map(DOCUMENT_TYPES.map((t) => [t.key, t.label]));
const rotuloDoDoc = (docType: string) => ROTULO_DO_DOCTYPE.get(docType) ?? docType.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
/** Acima disto os documentos de um item aparecem em partes ("Mostrar mais") — o item aberto não cresce sem fim. */
const DOCUMENTOS_POR_VEZ = 50;

function Destaque({ texto, busca }: { texto: string; busca: string }): ReactNode {
  return (
    <>
      {trechosDestacados(texto, busca).map((t, i) => (t.destaque ? <mark key={i}>{t.texto}</mark> : <span key={i}>{t.texto}</span>))}
    </>
  );
}

/** Checkbox com estado "misto" — `indeterminate` só existe como propriedade do DOM, nunca como atributo. */
function CaixaTri({ estado, rotulo, aoMudar }: { estado: "todos" | "parcial" | "nenhum"; rotulo: string; aoMudar: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = estado === "parcial";
  }, [estado]);
  return <input ref={ref} className="sel-cb" type="checkbox" tabIndex={-1} checked={estado === "todos"} aria-label={rotulo} onClick={(e) => e.stopPropagation()} onChange={aoMudar} />;
}

export function SeletorDeDocumentos({
  documentos,
  selecionados,
  aoMudar,
  semDocumentos,
}: {
  documentos: DocumentoDoSeletor[];
  selecionados: string[];
  aoMudar: (novo: string[]) => void;
  semDocumentos: ReactNode;
}) {
  const itens = useMemo(() => agruparPorItem(documentos), [documentos]);
  const sel = useMemo(() => new Set(selecionados), [selecionados]);
  const [tipos, setTipos] = useState<ReadonlySet<CategoriaDoFiltro>>(new Set());
  const [busca, setBusca] = useState("");
  const [soSelecionados, setSoSelecionados] = useState(false);
  const [abertos, setAbertos] = useState<ReadonlySet<string>>(new Set());
  const [limites, setLimites] = useState<Record<string, number>>({});
  const [foco, setFoco] = useState<string | null>(null);
  const [ajuda, setAjuda] = useState(false);
  const buscaRef = useRef<HTMLInputElement>(null);
  const arvoreRef = useRef<HTMLDivElement>(null);
  const botaoAjudaRef = useRef<HTMLButtonElement>(null);
  const botaoFecharAjudaRef = useRef<HTMLButtonElement>(null);

  const filtros = useMemo(() => ({ tipos, busca, soSelecionados }), [tipos, busca, soSelecionados]);
  const visiveis = useMemo(() => filtrarItens(itens, filtros, sel), [itens, filtros, sel]);
  const contagemPorTipo = useMemo(() => contarPorTipo(itens, filtros, sel), [itens, filtros, sel]);
  const totalDocumentos = useMemo(() => contarDocumentos(itens), [itens]);
  const documentosVisiveis = useMemo(() => contarDocumentos(visiveis), [visiveis]);

  function alternarTipo(k: CategoriaDoFiltro) {
    setTipos((atual) => {
      const novo = new Set(atual);
      if (novo.has(k)) novo.delete(k);
      else novo.add(k);
      return novo;
    });
  }
  function limparFiltros() {
    setTipos(new Set());
    setBusca("");
    setSoSelecionados(false);
  }
  function alternarAberto(id: string, valor?: boolean) {
    setAbertos((atual) => {
      const novo = new Set(atual);
      const abrir = valor ?? !novo.has(id);
      if (abrir) novo.add(id);
      else novo.delete(id);
      return novo;
    });
  }
  const expandirTodos = () => setAbertos(new Set(visiveis.map((i) => i.id)));
  const recolherTodos = () => setAbertos(new Set());

  // Atalhos globais (nunca disparam com a ajuda aberta, exceto Esc que a fecha).
  useEffect(() => {
    function aoTeclar(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        if (ajuda) { setAjuda(false); botaoAjudaRef.current?.focus(); return; }
        if (busca) { setBusca(""); buscaRef.current?.focus(); return; }
        if (tipos.size || soSelecionados) { setTipos(new Set()); setSoSelecionados(false); }
        return;
      }
      if (ajuda) return;
      const alvo = e.target as HTMLElement;
      if (e.altKey && /^Digit[1-4]$/.test(e.code)) {
        e.preventDefault();
        alternarTipo(CATEGORIAS[Number(e.code.slice(5)) - 1].chave);
        return;
      }
      const digitando = (alvo.tagName === "INPUT" && (alvo as HTMLInputElement).type !== "checkbox") || alvo.tagName === "TEXTAREA" || alvo.isContentEditable;
      if (digitando || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "/") { e.preventDefault(); buscaRef.current?.focus(); }
      else if (e.key === "?") { e.preventDefault(); setAjuda(true); }
      else if (e.shiftKey && e.key === "E") { expandirTodos(); }
      else if (e.shiftKey && e.key === "C") { recolherTodos(); }
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  });
  useEffect(() => {
    if (ajuda) botaoFecharAjudaRef.current?.focus();
  }, [ajuda]);

  // ── teclado da árvore ────────────────────────────────────────────────────────────────────────
  function linhas(): HTMLElement[] {
    return Array.from(arvoreRef.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? []);
  }
  function irPara(el: HTMLElement | undefined) {
    if (!el) return;
    setFoco(el.dataset.linha ?? null);
    el.focus();
    el.scrollIntoView({ block: "nearest" });
  }
  function aoTeclarNaArvore(e: KeyboardEvent<HTMLDivElement>) {
    const linha = (e.target as HTMLElement).closest<HTMLElement>('[role="treeitem"]');
    if (!linha || e.altKey || e.ctrlKey || e.metaKey) return;
    if ((e.target as HTMLElement).tagName === "A") return; // Enter/Espaço no link "Abrir" é do link
    const todas = linhas();
    const i = todas.indexOf(linha);
    const ehItem = linha.dataset.tipo === "item";
    const id = linha.dataset.linha!;
    const itemId = linha.dataset.pai ?? id;
    const item = itens.find((x) => x.id === itemId);
    if (!item) return;
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); irPara(todas[Math.min(todas.length - 1, i + 1)]); break;
      case "ArrowUp": e.preventDefault(); if (i === 0) buscaRef.current?.focus(); else irPara(todas[i - 1]); break;
      case "Home": e.preventDefault(); irPara(todas[0]); break;
      case "End": e.preventDefault(); irPara(todas[todas.length - 1]); break;
      case "ArrowRight":
        e.preventDefault();
        if (ehItem) { if (!abertos.has(id)) alternarAberto(id, true); else irPara(todas[i + 1]); }
        break;
      case "ArrowLeft":
        e.preventDefault();
        if (ehItem) { if (abertos.has(id)) alternarAberto(id, false); }
        else irPara(todas.find((l) => l.dataset.linha === itemId));
        break;
      case "Enter":
        e.preventDefault();
        if (ehItem) alternarAberto(id);
        else aoMudar(definirDocumento(selecionados, id, !sel.has(id)));
        break;
      case " ":
        e.preventDefault();
        if (ehItem) aoMudar(definirItemInteiro(selecionados, item, estadoDoItem(item, sel) !== "todos"));
        else aoMudar(definirDocumento(selecionados, id, !sel.has(id)));
        break;
      default:
    }
  }

  const focoEfetivo = foco && (visiveis.some((i) => i.id === foco || (abertos.has(i.id) && i.docs.some((d) => d.id === foco)))) ? foco : visiveis[0]?.id ?? null;

  function chipsAtivos() {
    const chips: { chave: string; rotulo: string; valor: string; remover: () => void }[] = [];
    for (const c of CATEGORIAS) if (tipos.has(c.chave)) chips.push({ chave: `tipo:${c.chave}`, rotulo: "Tipo", valor: c.rotulo, remover: () => alternarTipo(c.chave) });
    if (busca.trim()) chips.push({ chave: "busca", rotulo: "Busca", valor: `“${busca.trim()}”`, remover: () => setBusca("") });
    if (soSelecionados) chips.push({ chave: "soSel", rotulo: "Mostrar", valor: "só com selecionados", remover: () => setSoSelecionados(false) });
    return chips;
  }
  const chips = chipsAtivos();

  function linhaDoItem(item: ItemDoSeletor) {
    const aberto = abertos.has(item.id);
    const estado = estadoDoItem(item, sel);
    const marcados = item.docs.filter((d) => sel.has(d.id)).length;
    const limite = limites[item.id] ?? DOCUMENTOS_POR_VEZ;
    const docsMostrados = item.docs.slice(0, limite);
    return (
      <div className="sel-item" key={item.id} role="none" data-aberto={aberto}>
        <div
          className="sel-cab"
          role="treeitem"
          aria-level={1}
          aria-expanded={aberto}
          aria-checked={estado === "todos" ? true : estado === "parcial" ? "mixed" : false}
          tabIndex={focoEfetivo === item.id ? 0 : -1}
          data-linha={item.id}
          data-tipo="item"
          onClick={() => { setFoco(item.id); alternarAberto(item.id); }}
        >
          <span className="sel-chev" aria-hidden="true">▸</span>
          <CaixaTri estado={estado} rotulo={`Selecionar todos os documentos de ${item.titulo}`} aoMudar={() => aoMudar(definirItemInteiro(selecionados, item, estado !== "todos"))} />
          <div className="sel-tit">
            <div className="sel-t" title={item.titulo}><Destaque texto={item.titulo} busca={busca} /></div>
            <div className="sel-m">
              <span className="sel-tag"><Destaque texto={rotuloDoTipo(item.tipo)} busca={busca} /></span>
              {item.numero ? <span className="sel-num"><Destaque texto={item.numero} busca={busca} /></span> : <span>sem número</span>}
              {item.partes && <span className="sel-partes" title={item.partes}><Destaque texto={item.partes} busca={busca} /></span>}
            </div>
          </div>
          <div className="sel-cont">
            <span className="sel-ndocs">{item.docs.length} {item.docs.length === 1 ? "doc" : "docs"}</span>
            {marcados > 0 && <span className="sel-marcados">{marcados} {marcados === 1 ? "marcado" : "marcados"}</span>}
          </div>
        </div>
        {aberto && (
          <div className="sel-docs" role="group" aria-label={`Documentos de ${item.titulo}`}>
            <div className="sel-docs-tools">
              <label>
                <CaixaTri estado={estado} rotulo={`Selecionar todos os ${item.docs.length} documentos`} aoMudar={() => aoMudar(definirItemInteiro(selecionados, item, estado !== "todos"))} />
                Selecionar todos os {item.docs.length} documentos
              </label>
              <span className="sel-docs-r">{marcados} de {item.docs.length} marcados</span>
            </div>
            {docsMostrados.map((d) => (
              <div
                key={d.id}
                className="sel-doc"
                role="treeitem"
                aria-level={2}
                aria-checked={sel.has(d.id)}
                tabIndex={focoEfetivo === d.id ? 0 : -1}
                data-linha={d.id}
                data-tipo="doc"
                data-pai={item.id}
                onClick={() => { setFoco(d.id); aoMudar(definirDocumento(selecionados, d.id, !sel.has(d.id))); }}
              >
                <input className="sel-cb" type="checkbox" tabIndex={-1} checked={sel.has(d.id)} aria-label={d.name} onClick={(e) => e.stopPropagation()} onChange={(e) => { setFoco(d.id); aoMudar(definirDocumento(selecionados, d.id, e.target.checked)); }} />
                <span className="sel-nm" title={d.name}>{d.name}</span>
                <span className="sel-ty">{rotuloDoDoc(d.docType)}</span>
                {d.driveUrl && /^https?:\/\//.test(d.driveUrl) && (
                  <a href={d.driveUrl} target="_blank" rel="noopener noreferrer" tabIndex={-1} onClick={(e) => e.stopPropagation()}>Abrir</a>
                )}
              </div>
            ))}
            {item.docs.length > limite && (
              <button type="button" className="btn btn-sm btn-ghost sel-mais" onClick={() => setLimites((l) => ({ ...l, [item.id]: limite + DOCUMENTOS_POR_VEZ }))}>
                Mostrar mais {Math.min(DOCUMENTOS_POR_VEZ, item.docs.length - limite)} documentos ({item.docs.length - limite} restantes)
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  function vazioDoFiltro() {
    const sugestoes = sugestoesDeVazio(itens, filtros, sel);
    return (
      <div className="sel-vazio">
        <h3>Nenhum item corresponde a estes filtros</h3>
        <p>Tente buscar por parte do nome, pelo número do processo ou desmarcar um tipo. A busca ignora acentos e maiúsculas.</p>
        <div className="sel-sug">
          {sugestoes.map((s) => (
            <button
              key={s.acao}
              type="button"
              className="btn btn-sm"
              onClick={() => (s.acao === "tipos" ? setTipos(new Set()) : s.acao === "busca" ? setBusca("") : setSoSelecionados(false))}
            >
              {s.rotulo} ({s.quantidade})
            </button>
          ))}
          <button type="button" className="btn btn-primary btn-sm" onClick={limparFiltros}>Limpar tudo</button>
        </div>
      </div>
    );
  }

  return (
    <section className="sel-picker" aria-label="Itens da assessoria e seus documentos">
      <div className="sel-filtros">
        <fieldset className="sel-tipos">
          <legend>Tipo <span>— marque um ou mais; nenhum marcado mostra todos</span></legend>
          <div className="sel-tipos-linha">
            {CATEGORIAS.map((c) => (
              <label key={c.chave} className="sel-tp" data-zero={contagemPorTipo[c.chave] === 0}>
                <input type="checkbox" checked={tipos.has(c.chave)} onChange={() => alternarTipo(c.chave)} />
                {c.rotulo} <span className="sel-n">{contagemPorTipo[c.chave]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="sel-linha-busca">
          <div className="sel-busca">
            <label className="sr-only" htmlFor="sel-q">Buscar por título, parte, número ou tipo</label>
            <input
              id="sel-q"
              ref={buscaRef}
              type="search"
              autoComplete="off"
              placeholder="Buscar título, parte, nº do processo (com ou sem máscara) ou tipo"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); irPara(linhas()[0]); } }}
            />
            <kbd className="sel-so-largo">/</kbd>
          </div>
          <label className="sel-toggle">
            <input type="checkbox" checked={soSelecionados} onChange={(e) => setSoSelecionados(e.target.checked)} /> Só com selecionados
          </label>
          <button ref={botaoAjudaRef} type="button" className="btn btn-sm btn-ghost sel-ajuda-btn" onClick={() => setAjuda(true)} aria-label="Atalhos de teclado">? Atalhos</button>
        </div>
        <div className="sel-ativos" aria-label="Filtros ativos">
          {chips.length > 0 ? (
            <>
              {chips.map((c) => (
                <span key={c.chave} className="sel-chip">
                  <span>{c.rotulo}: <b>{c.valor}</b></span>
                  <button type="button" aria-label={`Remover filtro ${c.rotulo}: ${c.valor}`} onClick={c.remover}>×</button>
                </span>
              ))}
              <button type="button" className="sel-limpar" onClick={limparFiltros}>Limpar tudo</button>
            </>
          ) : (
            <span className="sel-quieto">Nenhum filtro ativo — mostrando tudo. Cada filtro que você soma reduz a lista.</span>
          )}
        </div>
        <div className="sel-resultado" aria-live="polite">
          <strong>{visiveis.length}</strong>
          <span>de {itens.length} itens</span>
          <span className="sel-sub">· {documentosVisiveis} de {totalDocumentos} documentos</span>
          <span className="sel-acoes-lista">
            <button type="button" className="btn btn-sm btn-ghost" onClick={expandirTodos} disabled={visiveis.length === 0}>Expandir todos</button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={recolherTodos} disabled={abertos.size === 0}>Recolher todos</button>
          </span>
        </div>
      </div>

      <div className="sel-lista" ref={arvoreRef} role="tree" aria-label="Itens" aria-multiselectable="true" onKeyDown={aoTeclarNaArvore}>
        {itens.length === 0 ? <div className="sel-vazio">{semDocumentos}</div> : visiveis.length === 0 ? vazioDoFiltro() : visiveis.map(linhaDoItem)}
      </div>

      {ajuda && (
        <div className="modal-scrim" onClick={(e) => { if (e.target === e.currentTarget) setAjuda(false); }}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="sel-ajuda-t">
            <h2 id="sel-ajuda-t">Atalhos de teclado</h2>
            <dl className="sel-atalhos">
              <dt><kbd>/</kbd></dt><dd>Ir para a busca</dd>
              <dt><kbd>Alt</kbd>+<kbd>1</kbd>…<kbd>4</kbd></dt><dd>Marcar/desmarcar cada tipo</dd>
              <dt><kbd>↑</kbd> <kbd>↓</kbd></dt><dd>Mover entre itens e documentos visíveis</dd>
              <dt><kbd>→</kbd> / <kbd>←</kbd></dt><dd>Expandir / recolher o item (← em um documento volta ao item)</dd>
              <dt><kbd>Enter</kbd></dt><dd>Expandir/recolher o item · marcar o documento</dd>
              <dt><kbd>Espaço</kbd></dt><dd>Marcar o documento · no item, marcar/desmarcar todos os documentos dele</dd>
              <dt><kbd>Shift</kbd>+<kbd>E</kbd> / <kbd>Shift</kbd>+<kbd>C</kbd></dt><dd>Expandir todos / recolher todos (só os que estão na lista)</dd>
              <dt><kbd>Esc</kbd></dt><dd>Limpa a busca; de novo, limpa os filtros; de novo, fecha esta janela</dd>
            </dl>
            <p style={{ margin: "14px 0 0", textAlign: "right" }}>
              <button ref={botaoFecharAjudaRef} type="button" className="btn btn-primary btn-sm" onClick={() => { setAjuda(false); botaoAjudaRef.current?.focus(); }}>Entendi</button>
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
