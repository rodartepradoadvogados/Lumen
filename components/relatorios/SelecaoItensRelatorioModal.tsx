"use client";

import { useMemo, useState } from "react";
import { CheckSquare, ExternalLink, Square } from "lucide-react";
import ModalShell from "@/components/ModalShell";
import { itemPertenceAoBloco, type RelatorioResultado } from "@/lib/relatorioPersonalizado";

function dataBR(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR");
}

// Janela de conferência aberta antes de imprimir/baixar em Word — mostra tudo que ENTRARIA no
// relatório com os filtros atuais e deixa desmarcar item a item (todos marcados por padrão).
// Não muda nada no escritório: é só uma curadoria pontual desta emissão, aplicada via
// RelatorioFiltros.itensExcluidos (ver lib/relatorioPersonalizado.ts) só na hora de gerar o
// arquivo final. Serve, por exemplo, pra contar só uma das versões de um documento reanexado —
// sem apagar a outra, que continua no processo normalmente.
export default function SelecaoItensRelatorioModal({
  resultado,
  onConfirmar,
  onFechar,
}: {
  resultado: RelatorioResultado;
  onConfirmar: (itensExcluidos: string[]) => void;
  onFechar: () => void;
}) {
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(resultado.detalhes.map((d) => d.id)));
  const [busca, setBusca] = useState("");

  const todosMarcados = marcados.size === resultado.detalhes.length;
  const nenhumMarcado = marcados.size === 0;

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return resultado.detalhes;
    return resultado.detalhes.filter((d) => d.nome.toLowerCase().includes(termo) || d.tipoLabel.toLowerCase().includes(termo));
  }, [resultado.detalhes, busca]);

  function alternar(id: string) {
    setMarcados((prev) => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function marcarTodos(valor: boolean) {
    setMarcados(valor ? new Set(resultado.detalhes.map((d) => d.id)) : new Set());
  }

  const blocosAoVivo = resultado.blocos.map((b) => ({
    ...b,
    valorSelecionado: resultado.detalhes.filter((d) => marcados.has(d.id) && itemPertenceAoBloco(b.chave, d)).length,
  }));

  return (
    <ModalShell
      size="cheio"
      title="Conferir itens do relatório"
      subtitle="Tudo o que entraria no relatório com os filtros atuais — desmarque o que não deve constar (ex.: uma versão repetida de um documento)"
      onClose={onFechar}
    >
      <div className="flex-1 min-h-0 flex flex-col">
        {/* ---------- cards de indicador, ao vivo conforme a seleção ---------- */}
        <div className="shrink-0 px-5 pt-4 flex flex-col gap-3 border-b border-regua pb-4">
          <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))" }}>
            {blocosAoVivo.map((b) => (
              <div key={b.chave} className="bg-sf-apoio border border-regua px-3 py-2 border-l-[3px] border-l-acao">
                <div className="text-xl font-bold text-tx tabular-nums leading-none">{b.valorSelecionado}</div>
                <div className="text-[10.5px] font-semibold text-tx-2 mt-0.5">{b.rotulo}</div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => marcarTodos(!todosMarcados)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold border border-regua-forte bg-sf hover:bg-sf-apoio text-tx px-3 py-1.5"
            >
              {todosMarcados ? <Square size={13} /> : <CheckSquare size={13} />}
              {todosMarcados ? "Desmarcar todos" : "Marcar todos"}
            </button>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome ou tipo…"
              className="text-xs border border-regua-forte bg-sf text-tx px-2.5 py-1.5 w-full max-w-[260px]"
            />
            <span className="text-xs font-medium text-tx-2 tabular-nums">
              {marcados.size} de {resultado.detalhes.length} selecionado(s)
              {resultado.detalhesTotal > resultado.detalhes.length && (
                <> · {resultado.detalhesTotal - resultado.detalhes.length} item(ns) fora da lista abaixo (mostrando os {resultado.detalhes.length} mais recentes) entram no relatório sem passar por esta seleção</>
              )}
            </span>
          </div>
        </div>

        {/* ---------- lista com flag por item ---------- */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-2">
          {visiveis.length === 0 ? (
            <p className="text-sm text-tx-2 py-6 text-center">Nenhum item bate com essa busca.</p>
          ) : (
            <div className="divide-y divide-regua">
              {visiveis.map((d) => {
                const marcado = marcados.has(d.id);
                return (
                  <label
                    key={d.id}
                    className="flex items-start gap-3 py-2.5 cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={() => alternar(d.id)}
                      className="mt-0.5 shrink-0 h-4 w-4 accent-[var(--acao)]"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={marcado ? "text-sm font-medium text-tx" : "text-sm font-medium text-tx-3 line-through"}>{d.nome}</span>
                        {d.driveUrl && (
                          <a
                            href={d.driveUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-tx-3 hover:text-acao shrink-0"
                            aria-label="Abrir arquivo"
                          >
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                      <p className="text-[11px] text-tx-3 mt-0.5">
                        {d.tipoLabel}
                        {d.assessoriaNome && <> · {d.assessoriaNome}</>}
                        {d.origemLabel && <> · {d.origemLabel}</>}
                        {" · "}
                        {dataBR(d.data)}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* ---------- rodapé ---------- */}
        <div className="shrink-0 flex items-center justify-end gap-2 px-5 py-3 border-t border-regua">
          <button type="button" onClick={onFechar} className="text-sm font-semibold text-tx-2 px-2">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              const excluidos = resultado.detalhes.filter((d) => !marcados.has(d.id)).map((d) => d.id);
              onConfirmar(excluidos);
            }}
            disabled={nenhumMarcado}
            className="bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-4 py-2 disabled:opacity-50"
          >
            Confirmar seleção e continuar
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
