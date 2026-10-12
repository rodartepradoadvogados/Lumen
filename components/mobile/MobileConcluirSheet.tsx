"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { DesfechoDeConclusao, MotivoDeDescarte } from "@/lib/desfechosDePublicacao";

export type OpcoesDeDescarteMobile = { bloquearProcesso: "ESCRITORIO" | "USUARIO" | null };

// CONCLUIR no celular: o mesmo conjunto de saídas do site (components/ConcluirMenu.tsx), num painel
// que sobe da base da tela. Três saídas: visto só para mim, concluir para todos, descartar.
// Aviso de intimação do Projudi não tem "só ciência" (o servidor também recusa).
// Bloqueio de remetente de e-mail fica só no site: o celular não carrega o remetente.
export default function MobileConcluirSheet({
  ehAviso,
  temCaso,
  jaVisto,
  busy,
  onFechar,
  onVisto,
  onConcluir,
  onDescartar,
}: {
  ehAviso: boolean;
  temCaso: boolean;
  jaVisto: boolean;
  busy: boolean;
  onFechar: () => void;
  onVisto: () => void;
  onConcluir: (desfecho: DesfechoDeConclusao) => void;
  onDescartar: (motivo: MotivoDeDescarte, opcoes: OpcoesDeDescarteMobile) => void;
}) {
  const [etapa, setEtapa] = useState<"menu" | "todos" | "descartar">("menu");
  const [desfecho, setDesfecho] = useState<DesfechoDeConclusao>(ehAviso ? "TRATADO_NO_TRIBUNAL" : "SO_CIENCIA");
  const [motivo, setMotivo] = useState<MotivoDeDescarte>("NAO_PUBLICACAO");
  const [bloquear, setBloquear] = useState(false);
  const [escopo, setEscopo] = useState<"ESCRITORIO" | "USUARIO">("ESCRITORIO");

  const item = "w-full text-left min-h-[52px] px-4 py-2 hover:bg-sf-apoio disabled:opacity-50";
  const opcao = "flex items-start gap-3 py-2 min-h-[44px] text-sm text-tx";
  const principal = "min-h-[48px] px-5 text-sm font-semibold bg-acao hover:bg-acao-hover text-acao-tx disabled:opacity-50";
  const secundario = "min-h-[48px] px-4 text-sm font-semibold text-tx-2 hover:bg-sf-apoio";

  return (
    <div className="fixed inset-0 z-50 bg-grafite-900/40 flex items-end" onClick={onFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Concluir esta publicação"
        className="bg-sf w-full max-h-[85vh] overflow-y-auto shadow-pop pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-regua">
          <h3 className="font-bold text-tx">{etapa === "menu" ? "Concluir" : etapa === "todos" ? "Concluir para todos" : "Descartar"}</h3>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="min-h-[44px] min-w-[44px] flex items-center justify-center text-tx-3 hover:text-tx">
            <X size={18} />
          </button>
        </div>

        {etapa === "menu" && (
          <div className="py-1">
            <button type="button" disabled={jaVisto || busy} onClick={onVisto} className={item}>
              <span className="block text-sm font-semibold text-tx">Visto, só para mim</span>
              <span className="block text-xs text-tx-2">Sai da sua fila. Continua para as outras pessoas.</span>
            </button>
            <button type="button" onClick={() => setEtapa("todos")} className={item}>
              <span className="block text-sm font-semibold text-tx">Concluir para todos…</span>
              <span className="block text-xs text-tx-2">{ehAviso ? "Depois de abrir e tratar a intimação no tribunal." : "Só ciência, sem providência ou duplicada."}</span>
            </button>
            <button type="button" onClick={() => setEtapa("descartar")} className={item}>
              <span className="block text-sm font-semibold text-tx">Descartar…</span>
              <span className="block text-xs text-tx-2">Não é publicação ou não é do escritório, com opção de bloquear.</span>
            </button>
          </div>
        )}

        {etapa === "todos" && (
          <div className="px-4 py-3 space-y-1">
            {(ehAviso
              ? ([
                  ["TRATADO_NO_TRIBUNAL", "Já abri no tribunal e tratei", "Fecha o aviso para todo o escritório."],
                  ["DUPLICADA", "Duplicada", ""],
                ] as const)
              : ([
                  ["SO_CIENCIA", "Só ciência", "Sem prazo e sem providência."],
                  ["SEM_PROVIDENCIA", "Sem providência", "Há prazo, mas nada a fazer."],
                  ["DUPLICADA", "Duplicada", "O mesmo ato já foi tratado em outro item."],
                ] as const)
            ).map(([valor, rotulo, ajuda]) => (
              <label key={valor} className={opcao}>
                <input type="radio" name="desfecho" className="mt-1 accent-[var(--acao)]" checked={desfecho === valor} onChange={() => setDesfecho(valor)} />
                <span>
                  {rotulo}
                  {ajuda && <span className="block text-xs text-tx-2">{ajuda}</span>}
                </span>
              </label>
            ))}
            {ehAviso && <p className="text-xs text-tx-2">“Só ciência” não existe para aviso de intimação: o prazo só é conhecido depois de abrir o aviso.</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEtapa("menu")} className={secundario}>Voltar</button>
              <button type="button" disabled={busy} onClick={() => onConcluir(desfecho)} className={principal}>Concluir</button>
            </div>
          </div>
        )}

        {etapa === "descartar" && (
          <div className="px-4 py-3 space-y-1">
            <label className={opcao}>
              <input type="radio" name="motivo" className="mt-1 accent-[var(--acao)]" checked={motivo === "NAO_PUBLICACAO"} onChange={() => setMotivo("NAO_PUBLICACAO")} />
              <span>Não é publicação</span>
            </label>
            <label className={opcao}>
              <input type="radio" name="motivo" className="mt-1 accent-[var(--acao)]" checked={motivo === "NAO_DO_ESCRITORIO"} onChange={() => setMotivo("NAO_DO_ESCRITORIO")} />
              <span>Não é do escritório</span>
            </label>
            <div className="border-l-2 border-regua-forte pl-3">
              {temCaso ? (
                <p className="text-xs text-tx-2 py-2">Processo cadastrado: não pode ser bloqueado.</p>
              ) : (
                <>
                  <label className={opcao}>
                    <input type="checkbox" className="mt-1 accent-[var(--acao)]" checked={bloquear} onChange={(e) => setBloquear(e.target.checked)} />
                    <span>
                      Bloquear este processo
                      <span className="block text-xs text-tx-2">As próximas publicações dele nem entram na fila.</span>
                    </span>
                  </label>
                  {bloquear && (
                    <label className="flex items-center gap-2 pl-8 pb-2 text-sm text-tx">
                      Para
                      <select value={escopo} onChange={(e) => setEscopo(e.target.value as "ESCRITORIO" | "USUARIO")} aria-label="Quem deixa de receber" className="border border-regua-forte bg-sf min-h-[44px] px-2 text-sm">
                        <option value="ESCRITORIO">todo o escritório</option>
                        <option value="USUARIO">só para mim</option>
                      </select>
                    </label>
                  )}
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEtapa("menu")} className={secundario}>Voltar</button>
              <button type="button" disabled={busy} onClick={() => onDescartar(motivo, { bloquearProcesso: !temCaso && bloquear ? escopo : null })} className={principal}>
                Descartar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
