"use client";

import { useMemo, useState } from "react";
import { FolderTree } from "lucide-react";
import {
  planoReorganizacao,
  aplicarReorganizacaoSelecionada,
  type ReorgPlan,
  type ReorgPlanItem,
  type ReorgResult,
} from "@/lib/actions/driveReorg";
import ModalShell from "@/components/ModalShell";

function itemKey(i: { kind: string; id: string }): string {
  return `${i.kind}-${i.id}`;
}

// Duas etapas: primeiro monta o plano (não move nada) e mostra numa janela de 80% da tela —
// arquivo já na pasta certa fica de fora da lista (ver lib/actions/driveReorg.ts:planoReorganizacao).
// Cada linha tem checkbox próprio (marcado por padrão); só as marcadas são movidas quando
// "Aplicar" é clicado.
export default function ReorganizeAttachmentsButton() {
  const [open, setOpen] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [plano, setPlano] = useState<ReorgPlan | null>(null);
  const [resultado, setResultado] = useState<ReorgResult | null>(null);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  async function abrir() {
    setOpen(true);
    setCarregando(true);
    setResultado(null);
    const res = await planoReorganizacao();
    setCarregando(false);
    setPlano(res);
    if (!("error" in res)) {
      setSelecionados(new Set(res.itens.map(itemKey)));
    }
  }

  function toggle(key: string) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function aplicar() {
    if (!plano || "error" in plano) return;
    const alvo = plano.itens.filter((i) => selecionados.has(itemKey(i)));
    setAplicando(true);
    const res = await aplicarReorganizacaoSelecionada(
      alvo.map((i) => ({ kind: i.kind, id: i.id, fileId: i.fileId, targetFolderId: i.targetFolderId }))
    );
    setAplicando(false);
    setResultado(res);
  }

  const itens: ReorgPlanItem[] = useMemo(() => (plano && !("error" in plano) ? plano.itens : []), [plano]);

  // Agrupa por registro, preservando a ordem em que o plano veio. A chave já é única por
  // processo/atendimento/licitação/demanda/empresa.
  type Grupo = { contexto: ReorgPlanItem["contexto"]; itens: ReorgPlanItem[] };
  const grupos: Grupo[] = useMemo(() => {
    const mapa = new Map<string, Grupo>();
    for (const item of itens) {
      const atual = mapa.get(item.contexto.chave);
      if (atual) atual.itens.push(item);
      else mapa.set(item.contexto.chave, { contexto: item.contexto, itens: [item] });
    }
    return Array.from(mapa.values());
  }, [itens]);

  return (
    <>
      <button
        onClick={abrir}
        className="inline-flex items-center gap-2 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-4 py-2.5 w-fit"
      >
        <FolderTree size={16} /> Reorganizar anexos existentes no Drive
      </button>

      {open && (
        <ModalShell size="cheio" title="Reorganizar anexos existentes no Drive" onClose={() => setOpen(false)}>
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 space-y-3">
              {carregando && <p className="text-sm text-tx-2">Conferindo anexos e documentos de Assessoria no Drive...</p>}

              {plano && "error" in plano && (
                <p className="text-xs font-medium text-urgente bg-urgente-bg border border-linha-urgente rounded-md px-3 py-2">{plano.error}</p>
              )}

              {!carregando && plano && !("error" in plano) && (
                <>
                  {resultado ? (
                    <p className="text-xs text-tx-2">
                      {resultado.moved} arquivo(s) movido(s)
                      {resultado.errors.length > 0 && ` · ${resultado.errors.length} erro(s)`}
                    </p>
                  ) : (
                    <p className="text-xs text-tx-2">
                      Simulação — nada foi movido ainda: {itens.length} arquivo(s) fora do lugar
                      {plano.naoMovivel > 0 && ` · ${plano.naoMovivel} sem arquivo no Drive (link colado de outro serviço, ignorado)`}
                    </p>
                  )}

                  {itens.length === 0 ? (
                    <p className="text-sm text-tx-2">Nenhum anexo ou documento de Assessoria fora do lugar — tudo certo.</p>
                  ) : (
                    <div className="space-y-4">
                      {/* Uma SEÇÃO por registro, com cabeçalho que identifica do jeito que um
                          advogado identifica: tipo, título, número, tribunal/órgão e cliente.
                          Antes era uma tabela plana com uma coluna "Destino" que trazia só o
                          título — numa lista com dezenas de linhas, todo texto ficava parecido e
                          não dava para saber de que processo se tratava. */}
                      {grupos.map(({ contexto, itens: doGrupo }) => (
                        <div key={contexto.chave} className="border border-regua">
                          <div className="bg-sf-apoio border-t-2 border-faixa-ardosia px-3 py-2.5">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className="text-etiqueta font-semibold uppercase tracking-[.08em] text-tx-2 border border-regua-forte px-1.5 py-0.5">
                                {contexto.tipo}
                              </span>
                              <span className="text-corpo font-semibold text-tx">{contexto.titulo}</span>
                              <span className="ml-auto text-etiqueta font-semibold text-tx-2 tabular-nums">
                                {doGrupo.length} {doGrupo.length === 1 ? "documento" : "documentos"}
                              </span>
                            </div>
                            <div className="flex items-center gap-x-3 gap-y-1 flex-wrap mt-1.5 text-etiqueta text-tx-2">
                              {contexto.numero && (
                                <span className="tabular-nums">
                                  <span className="text-tx-3">nº</span> {contexto.numero}
                                </span>
                              )}
                              {contexto.tribunal && (
                                <span>
                                  <span className="text-tx-3">órgão</span> {contexto.tribunal}
                                </span>
                              )}
                              {contexto.cliente && (
                                <span>
                                  <span className="text-tx-3">cliente</span> {contexto.cliente}
                                </span>
                              )}
                              <span className="ml-auto">
                                <span className="text-tx-3">vai para</span> {contexto.pasta}
                              </span>
                            </div>
                          </div>
                          <div className="divide-y divide-regua">
                            {doGrupo.map((item) => {
                              const key = itemKey(item);
                              return (
                                <label
                                  key={key}
                                  className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-sf-apoio"
                                >
                                  {!resultado && (
                                    <input
                                      type="checkbox"
                                      checked={selecionados.has(key)}
                                      onChange={() => toggle(key)}
                                      className="h-4 w-4 accent-marca shrink-0"
                                    />
                                  )}
                                  <span className="text-corpo text-tx min-w-0 truncate">{item.name}</span>
                                  <span className="ml-auto text-etiqueta text-tx-3 shrink-0">
                                    {item.kind === "ATTACHMENT" ? "Anexo" : "Doc. Assessoria"}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {resultado && resultado.errors.length > 0 && (
                    <ul className="space-y-0.5 text-xs text-urgente">
                      {resultado.errors.slice(0, 10).map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                      {resultado.errors.length > 10 && <li>...e mais {resultado.errors.length - 10}.</li>}
                    </ul>
                  )}
                </>
              )}
            </div>

            {plano && !("error" in plano) && !resultado && itens.length > 0 && (
              <div className="shrink-0 border-t-2 border-regua-forte px-5 py-3 flex items-center gap-3">
                <button
                  onClick={aplicar}
                  disabled={aplicando || selecionados.size === 0}
                  className="inline-flex items-center gap-2 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-4 py-2.5 disabled:opacity-50"
                >
                  {aplicando ? "Movendo..." : `Aplicar (${selecionados.size} de ${itens.length})`}
                </button>
                <span className="text-etiqueta text-tx-2">Desmarque o que não quer mover agora — dá pra rodar de novo depois.</span>
              </div>
            )}
          </div>
        </ModalShell>
      )}
    </>
  );
}
