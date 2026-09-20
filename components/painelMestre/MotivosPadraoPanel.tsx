"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Eye, EyeOff, Check } from "lucide-react";
import { LIMITE_DO_ROTULO } from "@/lib/motivosDeRecusa";
import { criarMotivoPadrao, editarMotivoPadrao, desativarMotivoPadrao } from "@/lib/actions/motivosDeRecusa";

// ============================================================================
// OS MOTIVOS-PADRÃO DA LÚMEN.
//
// Esta tela mexe no texto que TODOS os escritórios veem — e, por causa da regra do catálogo, o que
// se escreve aqui chega sozinho a todo escritório que nunca editou aquele motivo. É o oposto da
// tela do escritório, onde mexer é local. Por isso o aviso fica em cima e não no rodapé.
//
// NÃO EXISTE EXCLUIR, só OCULTAR. Um motivo-padrão apagado deixaria órfãs as camadas dos
// escritórios que o editaram, e deixaria sem sentido o botão de "voltar ao padrão" deles. Ocultar
// tira das listas de todo mundo e é reversível — que é o que "excluir" precisa ser aqui.
// ============================================================================

export type MotivoPadrao = { id: string; rotulo: string; descricao: string | null; desativado: boolean; emUso: number };

export default function MotivosPadraoPanel({ motivos }: { motivos: MotivoPadrao[] }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState("");
  const [criando, setCriando] = useState(false);
  const [pendente, comecar] = useTransition();

  function rodar(acao: () => Promise<{ erro?: string }>, aoTerminar?: () => void) {
    setErro(null);
    comecar(async () => {
      const r = await acao();
      if (r.erro) setErro(r.erro);
      else {
        aoTerminar?.();
        router.refresh();
      }
    });
  }

  return (
    <div className="p-5">
      <p className="mb-4 border border-regua bg-sf-apoio px-3 py-2 text-xs text-tx-2">
        O que você escrever aqui chega sozinho a <strong className="text-tx">todo escritório que nunca editou</strong>{" "}
        aquele motivo. Quem editou fica com o texto dele — e continua podendo voltar ao padrão.
      </p>

      <div className="divide-y divide-regua border border-regua">
        {motivos.length === 0 && <p className="px-4 py-4 text-sm text-tx-3">Nenhum motivo-padrão cadastrado.</p>}

        {motivos.map((m) => {
          const emEdicao = editando === m.id;
          return (
            <div key={m.id} className={`px-4 py-3 ${m.desativado ? "opacity-55" : ""}`}>
              {emEdicao ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    autoFocus
                    value={rascunho}
                    maxLength={LIMITE_DO_ROTULO}
                    onChange={(e) => setRascunho(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") rodar(() => editarMotivoPadrao(m.id, rascunho, m.descricao ?? undefined), () => setEditando(null));
                      if (e.key === "Escape") setEditando(null);
                    }}
                    className="min-w-0 flex-1 border border-regua-forte bg-sf px-3 py-2 text-sm text-tx focus:outline-none focus:ring-2 focus:ring-marca-tx"
                  />
                  <button
                    type="button"
                    disabled={pendente}
                    onClick={() => rodar(() => editarMotivoPadrao(m.id, rascunho, m.descricao ?? undefined), () => setEditando(null))}
                    className="inline-flex min-h-11 items-center gap-1.5 bg-acao px-4 text-xs font-semibold text-acao-tx hover:bg-acao-hover disabled:opacity-50"
                  >
                    <Check size={14} /> Salvar
                  </button>
                  <button type="button" onClick={() => setEditando(null)} className="min-h-11 px-3 text-xs font-semibold text-tx-3 hover:text-tx">
                    Cancelar
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="min-w-0 flex-1 text-sm text-tx">{m.rotulo}</span>
                  {/* Quantos escritórios reescreveram este motivo. É o número que diz se o texto
                      está ruim: um motivo que metade reescreve é um motivo mal escrito. */}
                  {m.emUso > 0 && (
                    <span className="shrink-0 text-etiqueta text-tx-3">
                      {m.emUso} escritório{m.emUso === 1 ? "" : "s"} reescreveu
                    </span>
                  )}
                  {m.desativado && (
                    <span className="shrink-0 border border-regua px-2 py-0.5 text-etiqueta font-semibold uppercase tracking-wide text-tx-3">
                      Oculto
                    </span>
                  )}
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      aria-label="Editar"
                      title="Editar"
                      onClick={() => { setEditando(m.id); setRascunho(m.rotulo); setErro(null); }}
                      className="inline-flex h-11 w-11 items-center justify-center text-tx-3 hover:text-tx"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      disabled={pendente}
                      aria-label={m.desativado ? "Mostrar de novo" : "Ocultar de todos"}
                      title={m.desativado ? "Mostrar de novo" : "Ocultar de todos os escritórios"}
                      onClick={() => rodar(() => desativarMotivoPadrao(m.id, !m.desativado))}
                      className="inline-flex h-11 w-11 items-center justify-center text-tx-3 hover:text-tx disabled:opacity-40"
                    >
                      {m.desativado ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                  </div>
                  {m.descricao && <p className="w-full text-xs text-tx-3">{m.descricao}</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3">
        {criando ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              autoFocus
              value={rascunho}
              maxLength={LIMITE_DO_ROTULO}
              placeholder="O motivo, numa frase — é o que o lead vai ler"
              onChange={(e) => setRascunho(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") rodar(() => criarMotivoPadrao(rascunho), () => { setCriando(false); setRascunho(""); });
                if (e.key === "Escape") setCriando(false);
              }}
              className="min-w-0 flex-1 border border-regua-forte bg-sf px-3 py-2 text-sm text-tx focus:outline-none focus:ring-2 focus:ring-marca-tx"
            />
            <button
              type="button"
              disabled={pendente}
              onClick={() => rodar(() => criarMotivoPadrao(rascunho), () => { setCriando(false); setRascunho(""); })}
              className="inline-flex min-h-11 items-center gap-1.5 bg-acao px-4 text-xs font-semibold text-acao-tx hover:bg-acao-hover disabled:opacity-50"
            >
              <Check size={14} /> Cadastrar
            </button>
            <button type="button" onClick={() => setCriando(false)} className="min-h-11 px-3 text-xs font-semibold text-tx-3 hover:text-tx">
              Cancelar
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { setCriando(true); setRascunho(""); setErro(null); }}
            className="inline-flex min-h-11 items-center gap-1.5 border border-regua-forte bg-sf px-3.5 text-xs font-semibold text-tx-2 hover:bg-sf-apoio hover:text-tx"
          >
            <Plus size={14} /> Cadastrar motivo-padrão
          </button>
        )}
      </div>

      {erro && <p className="mt-2 text-xs font-medium text-urgente">{erro}</p>}
    </div>
  );
}
