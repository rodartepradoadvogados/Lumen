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
                <p className="text-xs font-medium text-urgente bg-urgente-bg border border-urgente/20 rounded-md px-3 py-2">{plano.error}</p>
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
                    <div className="border border-regua overflow-x-auto scrollbar-thin">
                      <table className="w-full text-xs">
                        <thead className="bg-sf-apoio">
                          <tr className="text-left text-[10px] uppercase tracking-wide text-tx-2">
                            {!resultado && <th className="px-3 py-2 font-semibold w-10"></th>}
                            <th className="px-3 py-2 font-semibold w-[10%]">Tipo</th>
                            <th className="px-3 py-2 font-semibold w-[30%]">Arquivo</th>
                            <th className="px-3 py-2 font-semibold">Destino</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-regua">
                          {itens.map((item) => {
                            const key = itemKey(item);
                            return (
                              <tr key={key}>
                                {!resultado && (
                                  <td className="px-3 py-2.5 align-top">
                                    <input
                                      type="checkbox"
                                      checked={selecionados.has(key)}
                                      onChange={() => toggle(key)}
                                      className="h-4 w-4 accent-marca"
                                    />
                                  </td>
                                )}
                                <td className="px-3 py-2.5 align-top text-tx-2">
                                  {item.kind === "ATTACHMENT" ? "Anexo" : "Doc. Assessoria"}
                                </td>
                                <td className="px-3 py-2.5 align-top font-medium text-tx">{item.name}</td>
                                <td className="px-3 py-2.5 align-top text-tx-2">{item.destino}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
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
                <span className="text-[11px] text-tx-2">Desmarque o que não quer mover agora — dá pra rodar de novo depois.</span>
              </div>
            )}
          </div>
        </ModalShell>
      )}
    </>
  );
}
