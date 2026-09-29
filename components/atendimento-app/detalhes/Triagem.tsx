"use client";

import { useState } from "react";
import { AlertTriangle, Check, Clock, Pencil, Plus, Trash2 } from "lucide-react";
import {
  propostaPedeDecisao,
  rotuloDaOrigem,
  LIMITE_RELATO,
  LIMITE_ROTULO,
  LIMITE_VALOR,
  type CampoDaTriagem,
  type EstadoDoCarimbo,
} from "@/lib/triagemApurada";
import {
  acrescentarNaTriagem,
  confirmarNaTriagem,
  corrigirNaTriagem,
  manterAtendimentoSemRecusar,
  reabrirPropostaDeRecusa,
  removerDaTriagem,
  retirarConfirmacaoDaTriagem,
} from "@/lib/actions/detalhesDoAtendimento";
import { Campo, Gaveta, Vazio, cx, useRodar } from "./base";
import type { PropsDosDetalhes } from "./tipos";

type Alvo = { campo: CampoDaTriagem } | { fatoId: string };
type Edicao = { alvo: Alvo; titulo: string; valor: string; longo: boolean; max: number };

// O QUE A TRIAGEM APUROU (N11). Cada linha diz DE ONDE VEIO: "Da triagem" (o que a atendente ou o cadastro
// gravou), "Anotado por {nome}", "Confirmado por" ou "Corrigido por". O aplicativo não finge que a Ana apurou
// o que ela não gravou: sem carimbo é "da triagem", e só. Confirmar, corrigir e acrescentar têm "Desfazer".
export default function Triagem({ p, aoRecusar }: { p: PropsDosDetalhes; aoRecusar: () => void }) {
  const c = p.conversa;
  const { rodar, pendente } = useRodar();
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [novo, setNovo] = useState<{ rotulo: string; valor: string } | null>(null);

  const decisaoAberta = !["RECUSADO", "CONVERTIDO"].includes(c.status) && propostaPedeDecisao(p.triagem, c.propostaDeRecusa, c.propostaDeRecusaEmISO);

  type LinhaBase = { campo: CampoDaTriagem; rotulo: string; valor: string | null; longo: boolean; max: number };
  const base: LinhaBase[] = [
    { campo: "area", rotulo: "Matéria", valor: c.area, longo: false, max: 80 },
    ...(c.documentoPendente ? [{ campo: "documento" as const, rotulo: "Documento esperado", valor: c.documentoPendente, longo: false, max: 300 }] : []),
  ];

  const aConfirmar =
    base.filter((l) => l.valor && !p.triagem.carimbos[l.campo]).length +
    (c.description && !p.triagem.carimbos.relato ? 1 : 0) +
    p.triagem.fatos.filter((f) => f.estado === "PESSOA").length;

  async function confirmar(alvo: Alvo) {
    await rodar({
      fazer: () => confirmarNaTriagem(c.id, alvo),
      ok: "Confirmado.",
      desfazer: () => retirarConfirmacaoDaTriagem(c.id, alvo),
    });
  }

  async function salvarEdicao() {
    if (!edicao) return;
    setErro(null);
    const anterior = "campo" in edicao.alvo ? valorDoCampo(edicao.alvo.campo) : (p.triagem.fatos.find((f) => f.id === (edicao.alvo as { fatoId: string }).fatoId)?.valor ?? "");
    const r = await rodar({
      fazer: () => corrigirNaTriagem(c.id, edicao.alvo, edicao.valor),
      ok: "Corrigido.",
      desfazer: () => corrigirNaTriagem(c.id, edicao.alvo, anterior),
    });
    if (r.ok) setEdicao(null);
    else setErro(r.error ?? null);
  }

  function valorDoCampo(campo: CampoDaTriagem): string {
    return campo === "area" ? (c.area ?? "") : campo === "documento" ? (c.documentoPendente ?? "") : (c.description ?? "");
  }

  async function acrescentar() {
    if (!novo) return;
    setErro(null);
    let criado: string | undefined;
    const r = await rodar({
      fazer: async () => {
        const x = await acrescentarNaTriagem(c.id, novo.rotulo, novo.valor);
        criado = x.fatoId;
        return x;
      },
      ok: "Informação adicionada.",
      desfazer: async () => (criado ? removerDaTriagem(c.id, criado) : { error: "Não foi possível desfazer." }),
    });
    if (r.ok) setNovo(null);
    else setErro(r.error ?? null);
  }

  async function remover(fatoId: string, rotulo: string, valor: string) {
    await rodar({
      fazer: () => removerDaTriagem(c.id, fatoId),
      ok: `“${rotulo}” removida.`,
      desfazer: () => acrescentarNaTriagem(c.id, rotulo, valor),
    });
  }

  const origem = (campo: CampoDaTriagem) => {
    const k = p.triagem.carimbos[campo];
    return rotuloDaOrigem(k?.estado ?? null, k?.por);
  };

  return (
    <div className="space-y-4">
      {decisaoAberta && (
        <div className="rounded-[2px] border-2 border-urgente bg-urgente-bg p-3" role="group" aria-label="Proposta de recusa da atendente">
          <p className="flex items-start gap-2 text-corpo font-semibold text-tx">
            <AlertTriangle size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-urgente" />
            A atendente propôs recusar este caso. Quem decide é você.
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words text-corpo text-tx">{c.propostaDeRecusa}</p>
          <p className={`mt-1 ${cx.dica}`}>
            Nota interna, escrita pela atendente{c.propostaDeRecusaEmLabel ? ` em ${c.propostaDeRecusaEmLabel}` : ""}. O cliente não leu isto.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={cx.primario} onClick={aoRecusar}>
              Recusar com motivo…
            </button>
            <button
              type="button"
              className={cx.secundario}
              disabled={pendente}
              onClick={() =>
                rodar({
                  fazer: () => manterAtendimentoSemRecusar(c.id),
                  ok: "Atendimento mantido. A nota da atendente fica guardada.",
                  desfazer: () => reabrirPropostaDeRecusa(c.id),
                })
              }
            >
              Manter atendimento
            </button>
          </div>
        </div>
      )}

      {c.documentoAteLabel && (
        <p className="flex items-start gap-2 rounded-[2px] border border-regua bg-sf-apoio p-3 text-corpo text-tx">
          <Clock size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-aviso" />
          <span>
            <strong>Esperando documento até {c.documentoAteLabel}.</strong> Isto não é recusa: o caso está guardado esperando o papel e continua na fila.
          </span>
        </p>
      )}

      <div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className={cx.etiqueta}>O que o cliente contou</p>
          {c.description && <span className={cx.chip}>{origem("relato")}</span>}
        </div>
        <p className={`mt-1 whitespace-pre-wrap break-words text-corpo ${c.description ? "text-tx" : "text-tx-2"}`}>{c.description || "Sem relato ainda."}</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {c.description && !p.triagem.carimbos.relato && (
            <button type="button" className={cx.secundario} disabled={pendente} onClick={() => confirmar({ campo: "relato" })}>
              <Check size={16} aria-hidden="true" /> Confirmar
            </button>
          )}
          <button
            type="button"
            className={cx.secundario}
            onClick={() => {
              setErro(null);
              setEdicao({ alvo: { campo: "relato" }, titulo: "Editar o relato", valor: c.description ?? "", longo: true, max: LIMITE_RELATO });
            }}
          >
            <Pencil size={16} aria-hidden="true" /> Editar o relato
          </button>
        </div>
      </div>

      <div>
        <p className={`mb-1 ${cx.etiqueta}`}>Informações apuradas</p>
        <ul className="divide-y divide-regua">
          {base.map((l) => (
            <li key={l.campo} className="py-2.5">
              <p className="flex flex-wrap items-center gap-x-2 text-etiqueta text-tx-2">
                {l.rotulo} {l.valor && <span className={cx.chip}>{origem(l.campo)}</span>}
              </p>
              <p className={`break-words text-corpo font-medium ${l.valor ? "text-tx" : "text-tx-2"}`}>{l.valor || "Não informada"}</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {l.valor && !p.triagem.carimbos[l.campo] && (
                  <button type="button" className={cx.secundario} disabled={pendente} onClick={() => confirmar({ campo: l.campo })}>
                    <Check size={16} aria-hidden="true" /> Confirmar
                  </button>
                )}
                <button
                  type="button"
                  className={cx.secundario}
                  onClick={() => {
                    setErro(null);
                    setEdicao({ alvo: { campo: l.campo }, titulo: l.valor ? `Corrigir: ${l.rotulo}` : `Informar: ${l.rotulo}`, valor: l.valor ?? "", longo: l.longo, max: l.max });
                  }}
                >
                  <Pencil size={16} aria-hidden="true" /> {l.valor ? "Corrigir" : "Informar"}
                </button>
              </div>
            </li>
          ))}
          {p.triagem.fatos.map((f) => (
            <li key={f.id} className="py-2.5">
              <p className="flex flex-wrap items-center gap-x-2 text-etiqueta text-tx-2">
                {f.rotulo} <span className={cx.chip}>{rotuloDaOrigem(f.estado as EstadoDoCarimbo | "PESSOA", f.por)}</span>
              </p>
              <p className="whitespace-pre-wrap break-words text-corpo font-medium text-tx">{f.valor}</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {f.estado === "PESSOA" && (
                  <button type="button" className={cx.secundario} disabled={pendente} onClick={() => confirmar({ fatoId: f.id })}>
                    <Check size={16} aria-hidden="true" /> Confirmar
                  </button>
                )}
                <button
                  type="button"
                  className={cx.secundario}
                  onClick={() => {
                    setErro(null);
                    setEdicao({ alvo: { fatoId: f.id }, titulo: `Corrigir: ${f.rotulo}`, valor: f.valor, longo: true, max: LIMITE_VALOR });
                  }}
                >
                  <Pencil size={16} aria-hidden="true" /> Corrigir
                </button>
                <button type="button" className={cx.discreto} disabled={pendente} onClick={() => remover(f.id, f.rotulo, f.valor)} aria-label={`Remover: ${f.rotulo}`}>
                  <Trash2 size={16} aria-hidden="true" /> Remover
                </button>
              </div>
            </li>
          ))}
        </ul>
        {p.triagem.fatos.length === 0 && !c.area && !c.documentoPendente && <Vazio>Nada apurado além do relato. Adicione o que você já sabe.</Vazio>}
        <button
          type="button"
          className={`${cx.secundario} mt-2`}
          onClick={() => {
            setErro(null);
            setNovo({ rotulo: "", valor: "" });
          }}
        >
          <Plus size={16} aria-hidden="true" /> Adicionar informação
        </button>
        <p className={`mt-2 ${cx.dica}`}>
          {aConfirmar > 0 ? `${aConfirmar} ${aConfirmar === 1 ? "item ainda não foi confirmado" : "itens ainda não foram confirmados"} por uma pessoa. ` : ""}
          A tela mostra de onde cada informação veio; nada é enviado ao cliente.
        </p>
      </div>

      <Gaveta
        aberta={edicao !== null}
        aoFechar={() => setEdicao(null)}
        titulo={edicao?.titulo ?? ""}
        rodape={
          <>
            <button type="button" className={cx.secundario} onClick={() => setEdicao(null)}>
              Cancelar
            </button>
            <button type="button" className={`${cx.primario} flex-1`} disabled={pendente} onClick={salvarEdicao}>
              {pendente ? "Salvando…" : "Salvar"}
            </button>
          </>
        }
      >
        {edicao && (
          <Campo rotulo={edicao.titulo} erro={erro} dica={`Até ${edicao.max} caracteres.`}>
            {({ id, descricao }) =>
              edicao.longo ? (
                <textarea id={id} aria-describedby={descricao} className={`${cx.campo} min-h-40`} rows={7} maxLength={edicao.max} value={edicao.valor} onChange={(e) => setEdicao({ ...edicao, valor: e.target.value })} />
              ) : (
                <input id={id} aria-describedby={descricao} className={cx.campo} maxLength={edicao.max} value={edicao.valor} onChange={(e) => setEdicao({ ...edicao, valor: e.target.value })} />
              )
            }
          </Campo>
        )}
      </Gaveta>

      <Gaveta
        aberta={novo !== null}
        aoFechar={() => setNovo(null)}
        titulo="Adicionar informação"
        rodape={
          <>
            <button type="button" className={cx.secundario} onClick={() => setNovo(null)}>
              Cancelar
            </button>
            <button type="button" className={`${cx.primario} flex-1`} disabled={pendente} onClick={acrescentar}>
              {pendente ? "Salvando…" : "Adicionar"}
            </button>
          </>
        }
      >
        {novo && (
          <div className="space-y-3">
            <Campo rotulo="O que é" dica="Por exemplo: Data do fato, Tem filhos menores, Valor da dívida.">
              {({ id, descricao }) => (
                <input id={id} aria-describedby={descricao} className={cx.campo} maxLength={LIMITE_ROTULO} value={novo.rotulo} onChange={(e) => setNovo({ ...novo, rotulo: e.target.value })} autoComplete="off" />
              )}
            </Campo>
            <Campo rotulo="O valor" erro={erro}>
              {({ id, descricao }) => (
                <textarea id={id} aria-describedby={descricao} className={`${cx.campo} min-h-24`} rows={3} maxLength={LIMITE_VALOR} value={novo.valor} onChange={(e) => setNovo({ ...novo, valor: e.target.value })} />
              )}
            </Campo>
          </div>
        )}
      </Gaveta>
    </div>
  );
}
