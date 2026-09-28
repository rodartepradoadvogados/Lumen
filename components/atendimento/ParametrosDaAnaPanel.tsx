"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, AlertCircle } from "lucide-react";
import {
  EIXOS,
  rotuloDoEixo,
  ajudaDoEixo,
  criteriosDoEixo,
  podeRecusarSozinha,
  valorLegivel,
  TAMANHO_MAXIMO_DO_CRITERIO,
  type Eixo,
  type ParametrosDaAna,
} from "@/lib/parametrosDaAna";
import { acrescentarCriterio, removerCriterio, salvarPiso } from "@/lib/actions/parametrosDaAna";

// ============================================================================
// OS PARÂMETROS DE RECUSA DA ANA — A TELA.
//
// A tela tem um trabalho que nenhuma outra de Configurações tem: deixar claro que o que se escreve
// aqui autoriza uma máquina a encerrar o atendimento de uma pessoa. Por isso o aviso do topo muda
// conforme a lista — enquanto não há contorno nenhum, ele diz em voz alta que a Ana não recusa
// ninguém; a partir do primeiro, ele diz o que ela passou a poder fazer.
//
// A ORDEM DOS TRÊS BLOCOS É A DA DECISÃO, e não a do banco: matéria (o que o escritório faz),
// comarca (onde), valor (a partir de quanto) e, por último e separado, documento — que está nesta
// tela por conviver com os outros, e não por ser da mesma natureza. Ele ganha moldura e frase
// próprias justamente para não ser lido como o quarto motivo de recusa.
// ============================================================================

export default function ParametrosDaAnaPanel({
  parametros,
  podeEditar,
}: {
  parametros: ParametrosDaAna;
  podeEditar: boolean;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<Record<string, string>>({});
  // Com separador de milhar, como está no resto do produto: um campo que devolve "15000,00" depois
  // de o escritório ter digitado "15.000,00" parece que perdeu a formatação — e quem vê isso
  // desconfia do que foi gravado, ainda que o número esteja certo.
  const [valor, setValor] = useState(
    parametros.valorMinimoDaCausa
      ? (parametros.valorMinimoDaCausa / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : "",
  );
  const [dias, setDias] = useState(String(parametros.diasParaODocumento));
  const [pendente, comecar] = useTransition();

  const recusaSozinha = podeRecusarSozinha(parametros);

  function rodar(acao: () => Promise<{ error?: string }>, aoTerminar?: () => void) {
    setErro(null);
    setAviso(null);
    comecar(async () => {
      const r = await acao();
      if (r.error) setErro(r.error);
      else {
        aoTerminar?.();
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {/* O aviso que muda. Não é decoração: é a diferença entre "a Ana só triaria" e "a Ana pode
          encerrar um atendimento", e o escritório precisa saber em qual dos dois estados está. */}
      <div
        className={`flex items-start gap-2 border px-4 py-3 text-corpo ${
          recusaSozinha ? "border-acao/40 bg-acao-bg text-tx" : "border-regua bg-sf-apoio text-tx-2"
        }`}
      >
        <AlertCircle size={18} className="mt-0.5 shrink-0" />
        <span>
          {recusaSozinha ? (
            <>
              A atendente <strong>encerra sozinha</strong> quando o caso bate exatamente num dos contornos abaixo, e o
              atendimento vai para a fila de recusados da Triagem. Em qualquer outra situação ela não encerra: transfere
              com a proposta anotada, e quem decide é o advogado.
            </>
          ) : (
            <>
              Enquanto esta lista estiver vazia, a atendente <strong>não recusa ninguém</strong>. Ela tria, pede
              documento e transfere. O que você escrever aqui é o que passa a autorizá-la a encerrar um atendimento em
              nome do escritório.
            </>
          )}
        </span>
      </div>

      {erro && <p className="text-xs font-medium text-urgente">{erro}</p>}
      {aviso && <p className="text-xs font-medium text-concluido">{aviso}</p>}

      {/* ── OS CONTORNOS ───────────────────────────────────────────────────── */}
      {(["MATERIA", "COMARCA"] as Eixo[]).map((eixo) => (
        <ListaDoEixo
          key={eixo}
          eixo={eixo}
          itens={criteriosDoEixo(parametros, eixo)}
          podeEditar={podeEditar}
          pendente={pendente}
          rascunho={rascunho[eixo] ?? ""}
          setRascunho={(t) => setRascunho((r) => ({ ...r, [eixo]: t }))}
          acrescentar={(t) => rodar(() => acrescentarCriterio(eixo, t), () => setRascunho((r) => ({ ...r, [eixo]: "" })))}
          remover={(id) => rodar(() => removerCriterio(id))}
        />
      ))}

      <div>
        <h4 className="text-corpo font-semibold text-tx">Valor mínimo de causa</h4>
        <p className="mt-0.5 text-etiqueta text-tx-3">
          Só vale quando a própria pessoa disser o valor. A atendente nunca estima o valor da causa — estimar é opinião
          sobre o caso, e isso é do advogado. Em branco: o escritório não usa este critério.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-corpo text-tx-3">R$</span>
          <input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            disabled={!podeEditar || pendente}
            placeholder="15.000,00"
            inputMode="decimal"
            className="w-40 border border-regua bg-sf px-3 py-2 text-corpo text-tx outline-none focus:border-marca-tx"
          />
          <span className="text-etiqueta text-tx-3">
            hoje: <strong className="text-tx-2">{valorLegivel(parametros.valorMinimoDaCausa)}</strong>
          </span>
        </div>
      </div>

      {/* ── O QUE NÃO É RECUSA ─────────────────────────────────────────────── */}
      <div className="border-l-[3px] border-aviso bg-sf-apoio p-4">
        <h4 className="text-corpo font-semibold text-tx">Documentos — isto não é recusa</h4>
        <p className="mt-0.5 text-etiqueta leading-snug text-tx-2">
          Documento que falta não faz o escritório dizer não: faz o atendimento <strong>esperar</strong>. A atendente
          pede, avisa até quando o caso fica guardado e o atendimento continua na fila. Ninguém recebe carta de recusa
          por não ter mandado um papel.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="text-corpo text-tx-2">O caso espera por</label>
          <input
            value={dias}
            onChange={(e) => setDias(e.target.value)}
            disabled={!podeEditar || pendente}
            inputMode="numeric"
            className="w-20 border border-regua bg-sf px-3 py-2 text-corpo text-tx outline-none focus:border-marca-tx"
          />
          <span className="text-corpo text-tx-2">dias corridos</span>
        </div>

        <div className="mt-3">
          <ListaDoEixo
            eixo="DOCUMENTO"
            itens={criteriosDoEixo(parametros, "DOCUMENTO")}
            podeEditar={podeEditar}
            pendente={pendente}
            semTitulo
            rascunho={rascunho.DOCUMENTO ?? ""}
            setRascunho={(t) => setRascunho((r) => ({ ...r, DOCUMENTO: t }))}
            acrescentar={(t) =>
              rodar(() => acrescentarCriterio("DOCUMENTO", t), () => setRascunho((r) => ({ ...r, DOCUMENTO: "" })))
            }
            remover={(id) => rodar(() => removerCriterio(id))}
          />
        </div>
      </div>

      {podeEditar && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={pendente}
            onClick={() => rodar(() => salvarPiso(valor, dias), () => setAviso("Parâmetros salvos."))}
            className="bg-acao px-4 py-2 text-corpo font-semibold text-acao-tx transition-colors hover:bg-acao-hover disabled:opacity-60"
          >
            {pendente ? "Salvando…" : "Salvar valor e prazo"}
          </button>
          <span className="text-etiqueta text-tx-3">As listas acima já são salvas ao acrescentar ou remover.</span>
        </div>
      )}

      {!podeEditar && (
        <p className="text-xs text-tx-3">Só um administrador do escritório muda estes parâmetros.</p>
      )}
    </div>
  );
}

function ListaDoEixo({
  eixo,
  itens,
  podeEditar,
  pendente,
  rascunho,
  setRascunho,
  acrescentar,
  remover,
  semTitulo,
}: {
  eixo: Eixo;
  itens: { id: string; valor: string }[];
  podeEditar: boolean;
  pendente: boolean;
  rascunho: string;
  setRascunho: (t: string) => void;
  acrescentar: (t: string) => void;
  remover: (id: string) => void;
  semTitulo?: boolean;
}) {
  return (
    <div>
      {!semTitulo && (
        <>
          <h4 className="text-corpo font-semibold text-tx">{rotuloDoEixo[eixo]}</h4>
          <p className="mt-0.5 text-etiqueta text-tx-3">{ajudaDoEixo[eixo]}</p>
        </>
      )}

      <div className="mt-2 divide-y divide-regua border border-regua">
        {itens.length === 0 ? (
          <p className="px-4 py-3 text-etiqueta text-tx-3">Nada nesta lista.</p>
        ) : (
          itens.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="min-w-0 flex-1 truncate text-corpo text-tx">{c.valor}</span>
              {podeEditar && (
                <button
                  type="button"
                  disabled={pendente}
                  onClick={() => remover(c.id)}
                  aria-label={`Remover ${c.valor}`}
                  className="shrink-0 text-tx-3 transition-colors hover:text-urgente disabled:opacity-50"
                >
                  <X size={15} />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {podeEditar && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={rascunho}
            onChange={(e) => setRascunho(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && rascunho.trim()) {
                e.preventDefault();
                acrescentar(rascunho);
              }
            }}
            disabled={pendente}
            maxLength={TAMANHO_MAXIMO_DO_CRITERIO}
            placeholder={eixo === "DOCUMENTO" ? "carteira de trabalho" : eixo === "COMARCA" ? "Manaus" : "trabalhista"}
            className="min-w-0 flex-1 border border-regua bg-sf px-3 py-2 text-corpo text-tx outline-none focus:border-marca-tx"
          />
          <button
            type="button"
            disabled={pendente || !rascunho.trim()}
            onClick={() => acrescentar(rascunho)}
            className="inline-flex items-center gap-1.5 border border-regua-forte px-3 py-2 text-corpo font-semibold text-tx-2 transition-colors hover:border-marca-tx hover:text-tx disabled:opacity-50"
          >
            <Plus size={14} /> Acrescentar
          </button>
        </div>
      )}
    </div>
  );
}

export { EIXOS };
