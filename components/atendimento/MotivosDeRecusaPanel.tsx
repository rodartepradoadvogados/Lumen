"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, X, RotateCcw, Check } from "lucide-react";
import {
  acoesDoMotivo,
  LIMITE_DO_ROTULO,
  type MotivoResolvido,
} from "@/lib/motivosDeRecusa";
import {
  criarMotivoProprio,
  editarMotivo,
  removerMotivo,
  voltarAoPadrao,
  voltarListaAoPadrao,
} from "@/lib/actions/motivosDeRecusa";

// ============================================================================
// A LISTA DE MOTIVOS DE RECUSA DO ESCRITÓRIO.
//
// A tela precisa dizer, sem jargão, de onde veio cada linha — porque o que se pode fazer com ela
// depende disso, e porque o escritório tem de entender que mexer num motivo da Lúmen o desliga das
// correções futuras. Daí a etiqueta e a frase de rodapé: não é enfeite, é a explicação de por que
// dois motivos parecidos oferecem botões diferentes.
//
// "REMOVER" É A MESMA PALAVRA PARA DUAS COISAS, e é de propósito: para quem usa, tirar um motivo
// da lista é tirar um motivo da lista. Que por baixo isso seja exclusão (quando o motivo é do
// escritório) ou desativação (quando há padrão atrás) é problema do banco, não de quem clica. A
// diferença aparece onde importa: só o que tem padrão atrás ganha o botão de voltar.
// ============================================================================

const ETIQUETA: Record<MotivoResolvido["origem"], { texto: string; classe: string }> = {
  plataforma: { texto: "Padrão do Lúmen", classe: "border-regua text-tx-3" },
  "plataforma-editado": { texto: "Editado por você", classe: "border-marca-tx/40 text-marca-tx" },
  proprio: { texto: "Seu", classe: "border-regua-forte text-tx-2" },
};

export default function MotivosDeRecusaPanel({ motivos, podeEditar }: { motivos: MotivoResolvido[]; podeEditar: boolean }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState("");
  const [criando, setCriando] = useState(false);
  const [confirmandoTudo, setConfirmandoTudo] = useState(false);
  const [pendente, comecar] = useTransition();

  const temEdicao = motivos.some((m) => m.origem === "plataforma-editado");

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

  if (!podeEditar) {
    return (
      <div>
        <div className="divide-y divide-regua border border-regua">
          {motivos.map((m) => (
            <p key={m.id} className="px-4 py-3 text-sm text-tx">
              {m.rotulo}
            </p>
          ))}
        </div>
        <p className="mt-2 text-xs text-tx-3">Só um administrador do escritório muda esta lista.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="divide-y divide-regua border border-regua">
        {motivos.length === 0 && <p className="px-4 py-4 text-sm text-tx-3">Nenhum motivo na lista.</p>}

        {motivos.map((m) => {
          const acoes = acoesDoMotivo(m);
          const etiqueta = ETIQUETA[m.origem];
          const emEdicao = editando === m.id;

          return (
            <div key={m.id} className="px-4 py-3">
              {emEdicao ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    autoFocus
                    value={rascunho}
                    maxLength={LIMITE_DO_ROTULO}
                    onChange={(e) => setRascunho(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") rodar(() => editarMotivo(m.id, rascunho), () => setEditando(null));
                      if (e.key === "Escape") setEditando(null);
                    }}
                    className="min-w-0 flex-1 border border-regua-forte bg-sf px-3 py-2 text-sm text-tx focus:outline-none focus:ring-2 focus:ring-marca-tx"
                  />
                  <button
                    type="button"
                    disabled={pendente}
                    onClick={() => rodar(() => editarMotivo(m.id, rascunho), () => setEditando(null))}
                    className="inline-flex min-h-11 items-center gap-1.5 bg-acao px-4 text-xs font-semibold text-acao-tx hover:bg-acao-hover disabled:opacity-50"
                  >
                    <Check size={14} /> Salvar
                  </button>
                  <button type="button" onClick={() => setEditando(null)} className="min-h-11 px-3 text-xs font-semibold text-tx-3 hover:text-tx">
                    Cancelar
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="min-w-0 flex-1 text-sm text-tx">{m.rotulo}</span>
                  <span className={`shrink-0 border px-2 py-0.5 text-etiqueta font-semibold uppercase tracking-wide ${etiqueta.classe}`}>
                    {etiqueta.texto}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    {acoes.editar && (
                      <IconeBotao rotulo="Editar" onClick={() => { setEditando(m.id); setRascunho(m.rotulo); setErro(null); }}>
                        <Pencil size={14} />
                      </IconeBotao>
                    )}
                    {acoes.voltarAoPadrao && (
                      <IconeBotao rotulo="Voltar ao padrão do Lúmen" disabled={pendente} onClick={() => rodar(() => voltarAoPadrao(m.id))}>
                        <RotateCcw size={14} />
                      </IconeBotao>
                    )}
                    {(acoes.excluir || acoes.desativar) && (
                      <IconeBotao rotulo="Remover da lista" disabled={pendente} onClick={() => rodar(() => removerMotivo(m.id))}>
                        <X size={14} />
                      </IconeBotao>
                    )}
                  </div>
                  {m.descricao && <p className="w-full text-xs text-tx-3">{m.descricao}</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {criando ? (
          <div className="flex w-full flex-wrap items-center gap-2">
            <input
              autoFocus
              value={rascunho}
              maxLength={LIMITE_DO_ROTULO}
              placeholder="Escreva o motivo, numa frase"
              onChange={(e) => setRascunho(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") rodar(() => criarMotivoProprio(rascunho), () => { setCriando(false); setRascunho(""); });
                if (e.key === "Escape") setCriando(false);
              }}
              className="min-w-0 flex-1 border border-regua-forte bg-sf px-3 py-2 text-sm text-tx focus:outline-none focus:ring-2 focus:ring-marca-tx"
            />
            <button
              type="button"
              disabled={pendente}
              onClick={() => rodar(() => criarMotivoProprio(rascunho), () => { setCriando(false); setRascunho(""); })}
              className="inline-flex min-h-11 items-center gap-1.5 bg-acao px-4 text-xs font-semibold text-acao-tx hover:bg-acao-hover disabled:opacity-50"
            >
              <Check size={14} /> Acrescentar
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
            <Plus size={14} /> Acrescentar motivo
          </button>
        )}

        {/* Só aparece quando há o que desfazer — e pede confirmação, porque apaga de uma vez todas
            as edições que o escritório fez nos motivos do Lúmen. */}
        {temEdicao && !criando && (
          confirmandoTudo ? (
            <span className="flex items-center gap-2 text-xs text-tx-2">
              Isso desfaz todas as suas edições nos motivos do Lúmen.
              <button
                type="button"
                disabled={pendente}
                onClick={() => rodar(() => voltarListaAoPadrao(), () => setConfirmandoTudo(false))}
                className="min-h-11 border border-grave px-3 text-xs font-semibold text-grave-tx hover:bg-grave-bg disabled:opacity-50"
              >
                Desfazer tudo
              </button>
              <button type="button" onClick={() => setConfirmandoTudo(false)} className="min-h-11 px-2 font-semibold text-tx-3 hover:text-tx">
                Não
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmandoTudo(true)}
              className="inline-flex min-h-11 items-center gap-1.5 px-2 text-xs font-semibold text-tx-3 hover:text-tx"
            >
              <RotateCcw size={13} /> Voltar a lista inteira ao padrão
            </button>
          )
        )}
      </div>

      {erro && <p className="mt-2 text-xs font-medium text-urgente">{erro}</p>}

      <p className="mt-3 text-xs italic text-tx-3">
        Os motivos marcados como <strong className="not-italic">padrão do Lúmen</strong> recebem sozinhos as correções que o
        Lúmen fizer neles. Assim que você edita um, ele passa a ser seu e para de receber — e o botão de voltar ao padrão
        desfaz isso quando você quiser.
      </p>
    </div>
  );
}

function IconeBotao({
  rotulo,
  children,
  onClick,
  disabled,
}: {
  rotulo: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={rotulo}
      title={rotulo}
      className="inline-flex h-11 w-11 items-center justify-center text-tx-3 transition-colors hover:text-tx disabled:opacity-40"
    >
      {children}
    </button>
  );
}
