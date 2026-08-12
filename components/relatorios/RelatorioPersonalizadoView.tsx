"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { AlertTriangle, ExternalLink, FileDown, Loader2, Save, Trash2 } from "lucide-react";
import clsx from "clsx";
import ModalShell from "@/components/ModalShell";
import ChipsFiltro, { type OpcaoChip } from "@/components/relatorios/ChipsFiltro";
import {
  carregarModelo,
  excluirModelo,
  gerarRelatorio,
  listarModelos,
  listarOpcoes,
  salvarModelo,
} from "@/lib/actions/relatorioPersonalizado";
import {
  BASE_DATA_OPCOES,
  CONTAGEM_OPCOES,
  CRITERIO_AUTORIA_OPCOES,
  ORIGEM_OPCOES,
  SEM_ASSESSORIA,
  SEM_RESPONSAVEL,
  TIPO_COMPROMISSO_OPCOES,
  filtrosPadrao,
  type BaseData,
  type Contagem,
  type CriterioAutoria,
  type FiltroInexistente,
  type ModeloSalvo,
  type OpcoesRelatorio,
  type Origem,
  type RelatorioFiltros,
  type RelatorioResultado,
  type TipoCompromisso,
} from "@/lib/relatorioPersonalizado";

function dataBR(iso: string) {
  return new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("pt-BR");
}

// Delta contra o período anterior de mesma duração. Sem isso, "47 peças" não diz nada — é a
// comparação que transforma o número em informação (item validado pelo dono do escritório).
function Variacao({ atual, anterior }: { atual: number; anterior: number }) {
  const delta = atual - anterior;
  if (anterior === 0 && atual === 0) return <span className="text-[10.5px] text-tx-3">sem movimento no período anterior</span>;
  if (delta === 0) return <span className="text-[10.5px] text-tx-3">igual ao período anterior</span>;
  return (
    <span className={clsx("text-[10.5px] font-semibold tabular-nums", delta > 0 ? "text-concluido" : "text-urgente")}>
      {delta > 0 ? "▲" : "▼"} {Math.abs(delta)} vs. período anterior ({anterior})
    </span>
  );
}

function Barras({ linhas, vazio }: { linhas: { chave: string; rotulo: string; pecas: number; compromissos: number; total: number }[]; vazio: string }) {
  const max = Math.max(1, ...linhas.map((l) => l.total));
  if (linhas.length === 0) return <p className="text-xs text-tx-3 py-3">{vazio}</p>;
  return (
    <div className="flex flex-col gap-2.5">
      {linhas.map((l) => (
        <div key={l.chave} className="flex flex-col gap-1">
          <div className="flex justify-between items-baseline gap-3 text-xs">
            <span className="text-tx-2 truncate">{l.rotulo}</span>
            <span className="font-semibold text-tx shrink-0 tabular-nums">
              {l.pecas > 0 && `${l.pecas} peça${l.pecas > 1 ? "s" : ""}`}
              {l.pecas > 0 && l.compromissos > 0 && " · "}
              {l.compromissos > 0 && `${l.compromissos} compromisso${l.compromissos > 1 ? "s" : ""}`}
              {l.pecas === 0 && l.compromissos === 0 && `${l.total} item(ns)`}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-sf-apoio overflow-hidden">
            <div className="h-full rounded-full bg-acao" style={{ width: `${(l.total / max) * 100}%`, minWidth: l.total > 0 ? 4 : 0 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function RelatorioPersonalizadoView() {
  const [filtros, setFiltros] = useState<RelatorioFiltros>(filtrosPadrao);
  const [opcoes, setOpcoes] = useState<OpcoesRelatorio>({ assessorias: [], usuarios: [], gruposPeca: [] });
  const [modelos, setModelos] = useState<ModeloSalvo[]>([]);
  const [resultado, setResultado] = useState<RelatorioResultado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [gerando, startGerar] = useTransition();

  const [salvarAberto, setSalvarAberto] = useState(false);
  const [nomeModelo, setNomeModelo] = useState("");
  const [salvando, startSalvar] = useTransition();
  // Pop-up bloqueante do "não dá pra salvar porque tal filtro não existe mais" — a lista diz
  // exatamente o quê, em vez de um "erro ao salvar" genérico.
  const [inexistentes, setInexistentes] = useState<FiltroInexistente[] | null>(null);

  useEffect(() => {
    listarOpcoes().then(setOpcoes);
    listarModelos().then(setModelos);
  }, []);

  const executar = useCallback(
    (f: RelatorioFiltros) => {
      setErro(null);
      startGerar(async () => {
        const r = await gerarRelatorio(f);
        if (r.error) {
          setErro(r.error);
          setResultado(null);
        } else if (r.resultado) {
          setResultado(r.resultado);
        }
      });
    },
    []
  );

  // Primeira carga já traz o mês corrente pronto — a tela nunca aparece vazia sem motivo.
  useEffect(() => {
    executar(filtrosPadrao());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function set<K extends keyof RelatorioFiltros>(chave: K, valor: RelatorioFiltros[K]) {
    setFiltros((f) => ({ ...f, [chave]: valor }));
  }

  // "Tipo de peça" e "Tipo de compromisso" só fazem sentido quando aquela contagem está em jogo.
  // Contagem vazia = contar tudo, então os dois aparecem.
  const contaTudo = filtros.contar.length === 0;
  const mostrarTipoPeca = contaTudo || filtros.contar.includes("PECAS");
  const mostrarTipoCompromisso = contaTudo || filtros.contar.includes("COMPROMISSOS");

  const opcoesAssessoria: OpcaoChip[] = useMemo(
    () => [...opcoes.assessorias.map((a) => ({ value: a.id, label: a.nome })), { value: SEM_ASSESSORIA, label: "Sem assessoria (avulso)", vazio: true }],
    [opcoes.assessorias]
  );
  const opcoesResponsavel: OpcaoChip[] = useMemo(
    () => [...opcoes.usuarios.map((u) => ({ value: u.id, label: u.nome })), { value: SEM_RESPONSAVEL, label: "Sem responsável", vazio: true }],
    [opcoes.usuarios]
  );

  function abrirImpressao() {
    // `embed=1` faz o AppShell suprimir rail/TopBar/abas (ver components/AppShell.tsx) — sem isso
    // a casca do app sairia impressa junto com o relatório.
    const payload = typeof window !== "undefined" ? window.btoa(encodeURIComponent(JSON.stringify(filtros))) : "";
    window.open(`/relatorios/personalizado/imprimir?embed=1&f=${encodeURIComponent(payload)}`, "_blank", "noopener,noreferrer");
  }

  function confirmarSalvar() {
    setInexistentes(null);
    startSalvar(async () => {
      const r = await salvarModelo(nomeModelo, filtros);
      if (r.inexistentes && r.inexistentes.length > 0) {
        setInexistentes(r.inexistentes);
        return;
      }
      if (r.error) {
        setErro(r.error);
        return;
      }
      setSalvarAberto(false);
      setNomeModelo("");
      listarModelos().then(setModelos);
    });
  }

  async function aplicarModelo(id: string) {
    if (!id) return;
    const r = await carregarModelo(id);
    if (r.error || !r.filtros) {
      setErro(r.error ?? "Não foi possível carregar o modelo.");
      return;
    }
    // Mesmo checando na hora de salvar, um modelo salvo meses atrás pode ter perdido uma
    // assessoria ou uma pessoa desde então — avisar aqui evita o usuário olhar um relatório
    // vazio sem entender que o filtro é que ficou órfão.
    if (r.inexistentes && r.inexistentes.length > 0) setInexistentes(r.inexistentes);
    setFiltros(r.filtros);
    executar(r.filtros);
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ---------------- FILTROS ---------------- */}
      <div className="bg-sf-apoio border border-regua rounded-xl p-4 flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3 justify-between">
          <div className="flex flex-col gap-2">
            <span className="text-[10.5px] font-semibold uppercase tracking-[.11em] text-tx-2">Período</span>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="date"
                value={filtros.de}
                onChange={(e) => set("de", e.target.value)}
                className="text-sm border border-regua-forte bg-sf text-tx rounded-lg px-2.5 py-1.5 tabular-nums"
              />
              <span className="text-xs text-tx-2 font-medium">até</span>
              <input
                type="date"
                value={filtros.ate}
                onChange={(e) => set("ate", e.target.value)}
                className="text-sm border border-regua-forte bg-sf text-tx rounded-lg px-2.5 py-1.5 tabular-nums"
              />
              <span className="text-xs text-tx-2 font-medium ml-1">considerando a data de</span>
              <select
                value={filtros.baseData}
                onChange={(e) => set("baseData", e.target.value as BaseData)}
                className="text-sm border border-regua-forte bg-sf text-tx rounded-lg px-2 py-1.5"
              >
                {BASE_DATA_OPCOES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <span className="text-[10.5px] text-tx-3">{BASE_DATA_OPCOES.find((o) => o.value === filtros.baseData)?.ajuda}</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {modelos.length > 0 && (
              <select
                onChange={(e) => aplicarModelo(e.target.value)}
                defaultValue=""
                className="text-xs border border-regua-forte bg-sf text-tx rounded-lg px-2 py-2 max-w-[190px]"
              >
                <option value="">Abrir modelo salvo…</option>
                {modelos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => setSalvarAberto(true)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold border border-regua-forte bg-sf hover:bg-sf-apoio text-tx rounded-lg px-3 py-2"
            >
              <Save size={13} /> Salvar modelo
            </button>
            <button
              type="button"
              onClick={abrirImpressao}
              className="inline-flex items-center gap-1.5 text-xs font-semibold border border-regua-forte bg-sf hover:bg-sf-apoio text-tx rounded-lg px-3 py-2"
            >
              <FileDown size={13} /> Exportar PDF
            </button>
            <button
              type="button"
              onClick={() => executar(filtros)}
              disabled={gerando}
              className="inline-flex items-center gap-1.5 text-xs font-semibold bg-acao hover:bg-acao-hover text-acao-tx rounded-lg px-4 py-2 disabled:opacity-50"
            >
              {gerando ? <Loader2 size={13} className="animate-spin" /> : null}
              {gerando ? "Gerando…" : "Gerar relatório"}
            </button>
          </div>
        </div>

        <div className="h-px bg-regua-forte opacity-70" />

        <ChipsFiltro
          rotulo="O que contar"
          opcoes={CONTAGEM_OPCOES.map((o) => ({ value: o.value, label: o.label }))}
          selecionados={filtros.contar}
          onChange={(v) => set("contar", v as Contagem[])}
        />

        <ChipsFiltro
          rotulo="Origem do trabalho"
          opcoes={ORIGEM_OPCOES.map((o) => ({ value: o.value, label: o.label }))}
          selecionados={filtros.origens}
          onChange={(v) => set("origens", v as Origem[])}
        />

        <ChipsFiltro rotulo="Assessoria" opcoes={opcoesAssessoria} selecionados={filtros.assessoriaIds} onChange={(v) => set("assessoriaIds", v)} />

        <ChipsFiltro rotulo="Responsável" opcoes={opcoesResponsavel} selecionados={filtros.responsavelIds} onChange={(v) => set("responsavelIds", v)} />

        {mostrarTipoPeca && (
          <ChipsFiltro
            rotulo="Tipo de peça"
            ajuda="por grupo do catálogo de documentos"
            opcoes={opcoes.gruposPeca.map((g) => ({ value: g, label: g }))}
            selecionados={filtros.gruposPeca}
            onChange={(v) => set("gruposPeca", v)}
          />
        )}

        {mostrarTipoCompromisso && (
          <ChipsFiltro
            rotulo="Tipo de compromisso"
            opcoes={TIPO_COMPROMISSO_OPCOES.map((o) => ({ value: o.value, label: o.label }))}
            selecionados={filtros.tiposCompromisso}
            onChange={(v) => set("tiposCompromisso", v as TipoCompromisso[])}
          />
        )}

        <div className="flex flex-col gap-2">
          <span className="text-[10.5px] font-semibold uppercase tracking-[.11em] text-tx-2">Creditar o trabalho a</span>
          <div className="flex flex-wrap gap-1.5">
            {CRITERIO_AUTORIA_OPCOES.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => set("criterioAutoria", o.value as CriterioAutoria)}
                className={clsx(
                  "text-xs font-medium px-2.5 py-1 rounded-full border transition-colors",
                  filtros.criterioAutoria === o.value
                    ? "bg-acao text-acao-tx border-transparent font-semibold"
                    : "border-regua-forte bg-sf text-tx-2 hover:bg-sf-apoio"
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          <span className="text-[10.5px] text-tx-3">{CRITERIO_AUTORIA_OPCOES.find((o) => o.value === filtros.criterioAutoria)?.ajuda}</span>
        </div>
      </div>

      {erro && <p className="text-sm text-urgente bg-urgente-bg rounded-lg px-3 py-2">{erro}</p>}

      {/* ---------------- RESULTADO ---------------- */}
      {resultado && (
        <div className="flex flex-col gap-5">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <span className="text-[11px] font-semibold uppercase tracking-[.11em] text-tx-2">
              Resultado · {dataBR(resultado.periodo.de)} a {dataBR(resultado.periodo.ate)}
            </span>
            <span className="text-[11px] text-tx-3">
              comparando com {dataBR(resultado.periodo.anteriorDe)} a {dataBR(resultado.periodo.anteriorAte)}
            </span>
          </div>

          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(158px,1fr))" }}>
            {resultado.blocos.map((b) => (
              <div key={b.chave} className="bg-sf border border-regua rounded-xl p-3.5 border-l-[3px] border-l-acao flex flex-col gap-0.5">
                <span className="text-2xl font-bold text-tx tabular-nums leading-none">{b.valor}</span>
                <span className="text-[11.5px] font-semibold text-tx-2">{b.rotulo}</span>
                <Variacao atual={b.valor} anterior={b.anterior} />
                {b.detalhe && <span className="text-[10px] text-tx-3">{b.detalhe}</span>}
              </div>
            ))}
          </div>

          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))" }}>
            <div className="bg-sf border border-regua rounded-xl p-4 flex flex-col gap-3">
              <span className="text-[11px] font-semibold uppercase tracking-[.11em] text-tx-2">
                Volume por pessoa · {CRITERIO_AUTORIA_OPCOES.find((o) => o.value === filtros.criterioAutoria)?.label}
              </span>
              <Barras linhas={resultado.porPessoa} vazio="Nada no período com os filtros atuais." />
            </div>

            <div className="bg-sf border border-regua rounded-xl p-4 flex flex-col gap-3">
              <span className="text-[11px] font-semibold uppercase tracking-[.11em] text-tx-2">Volume por assessoria</span>
              <Barras linhas={resultado.porAssessoria} vazio="Nenhum item vinculado a assessoria no período." />
              {resultado.semVinculoAssessoria > 0 && (
                <p className="text-[11.5px] text-tx-2 bg-marca-bg border-l-[3px] border-marca rounded-r-lg px-3 py-2">
                  <strong className="text-tx">{resultado.semVinculoAssessoria} item(ns)</strong> do período ficaram de fora deste
                  corte por não terem assessoria vinculada — aparecem no detalhamento abaixo.
                </p>
              )}
            </div>
          </div>

          <div className="bg-sf border border-regua rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-regua">
              <span className="text-[11px] font-semibold uppercase tracking-[.11em] text-tx-2">
                Detalhamento — mostrando {resultado.detalhes.length} de {resultado.detalhesTotal}
              </span>
            </div>
            {resultado.detalhes.length === 0 ? (
              <p className="text-sm text-tx-2 p-5">Nenhum item encontrado com esses filtros.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-sf-apoio">
                    <tr>
                      <th className="text-left px-4 py-2 font-semibold text-tx-2 text-[10px] uppercase tracking-wide">Item</th>
                      <th className="text-left px-3 py-2 font-semibold text-tx-2 text-[10px] uppercase tracking-wide">Tipo</th>
                      <th className="text-left px-3 py-2 font-semibold text-tx-2 text-[10px] uppercase tracking-wide">Vínculo</th>
                      <th className="text-left px-3 py-2 font-semibold text-tx-2 text-[10px] uppercase tracking-wide">Anexou / concluiu</th>
                      <th className="text-left px-3 py-2 font-semibold text-tx-2 text-[10px] uppercase tracking-wide">Responsável</th>
                      <th className="text-right px-4 py-2 font-semibold text-tx-2 text-[10px] uppercase tracking-wide">Data</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-regua">
                    {resultado.detalhes.map((d) => (
                      <tr key={d.id}>
                        <td className="px-4 py-2 align-top">
                          {/* Peça leva direto ao arquivo no armazenamento; o resto leva à tela do
                              Lúmen correspondente. */}
                          {d.driveUrl ? (
                            <a
                              href={d.driveUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-acao hover:underline font-medium inline-flex items-center gap-1"
                            >
                              {d.nome} <ExternalLink size={11} className="shrink-0 opacity-70" />
                            </a>
                          ) : d.href ? (
                            <a href={d.href} className="text-acao hover:underline font-medium">
                              {d.nome}
                            </a>
                          ) : (
                            <span className="text-tx font-medium">{d.nome}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 align-top text-tx-2">{d.tipoLabel}</td>
                        <td className="px-3 py-2 align-top text-tx-2">
                          <span className="flex flex-wrap gap-1">
                            {d.assessoriaNome && (
                              <span className="text-[10px] font-semibold px-1.5 py-px rounded-full bg-marca-bg text-marca-tx">{d.assessoriaNome}</span>
                            )}
                            {d.origemLabel && (
                              <span className="text-[10px] font-semibold px-1.5 py-px rounded-full bg-acao-bg text-acao">{d.origemLabel}</span>
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-2 align-top text-tx-2">{d.anexadoPor ?? "—"}</td>
                        <td className="px-3 py-2 align-top text-tx-2">{d.responsavel ?? "—"}</td>
                        <td className="px-4 py-2 align-top text-right text-tx-2 tabular-nums whitespace-nowrap">{dataBR(d.data)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------------- MODAL: salvar modelo ---------------- */}
      {salvarAberto && (
        <ModalShell size="compacto" title="Salvar como modelo" subtitle="Guarda os filtros atuais para reusar depois" onClose={() => setSalvarAberto(false)}>
          <div className="p-5 flex flex-col gap-3">
            <label className="text-xs font-medium text-tx-2">Nome do modelo</label>
            <input
              value={nomeModelo}
              onChange={(e) => setNomeModelo(e.target.value)}
              placeholder="Ex.: Relatório mensal — Guapó"
              className="w-full text-sm border border-regua-forte bg-sf text-tx rounded-lg px-3 py-2"
            />
            <p className="text-[11px] text-tx-3">Salvar com um nome já existente substitui o modelo anterior.</p>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={confirmarSalvar}
                disabled={salvando || !nomeModelo.trim()}
                className="bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold rounded-lg px-4 py-2 disabled:opacity-50"
              >
                {salvando ? "Salvando…" : "Salvar"}
              </button>
              <button type="button" onClick={() => setSalvarAberto(false)} className="text-sm font-semibold text-tx-2 px-2">
                Cancelar
              </button>
            </div>
            {modelos.length > 0 && (
              <div className="pt-2 border-t border-regua flex flex-col gap-1.5">
                <span className="text-[10.5px] font-semibold uppercase tracking-[.11em] text-tx-2">Modelos salvos</span>
                {modelos.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-tx-2 truncate">{m.nome}</span>
                    <button
                      type="button"
                      onClick={async () => {
                        await excluirModelo(m.id);
                        listarModelos().then(setModelos);
                      }}
                      className="p-1 text-tx-3 hover:text-atencao shrink-0"
                      aria-label={`Excluir modelo ${m.nome}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ModalShell>
      )}

      {/* ---------------- MODAL: filtro inexistente ---------------- */}
      {inexistentes && inexistentes.length > 0 && (
        <ModalShell size="compacto" title="Filtro não encontrado" onClose={() => setInexistentes(null)}>
          <div className="p-5 flex flex-col gap-3">
            <div className="flex gap-2.5">
              <AlertTriangle size={18} className="text-aviso shrink-0 mt-0.5" />
              <p className="text-sm text-tx-2">
                Não é possível salvar este modelo: um ou mais filtros selecionados <strong className="text-tx">não existem mais</strong> no
                sistema. Desmarque os itens abaixo e tente de novo.
              </p>
            </div>
            <ul className="flex flex-col gap-1.5 bg-sf-apoio border border-regua rounded-lg p-3">
              {inexistentes.map((i, idx) => (
                <li key={idx} className="text-xs text-tx flex gap-2">
                  <span className="font-semibold text-tx-2 shrink-0">{i.dimensao}:</span>
                  <span className="font-mono">{i.valor}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setInexistentes(null)}
              className="self-start bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold rounded-lg px-4 py-2"
            >
              Entendi
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  );
}
