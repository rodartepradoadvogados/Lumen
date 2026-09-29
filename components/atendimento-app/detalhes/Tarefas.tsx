"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Check, Plus } from "lucide-react";
import { agruparPorColuna, dataCurta, fraseDoPrazo, PRIORIDADES_DE_TAREFA, TIPOS_DE_TAREFA } from "@/lib/detalhesDoAtendimento";
import { criarTarefaDoAtendimento, definirConclusaoDaTarefa, definirResponsavelDaTarefa, moverTarefaDeColuna } from "@/lib/actions/detalhesDoAtendimento";
import { Campo, Gaveta, Vazio, cx, useRodar } from "./base";
import type { PropsDosDetalhes, Tarefa } from "./tipos";

function amanha(hoje: string): string {
  const d = new Date(`${hoje}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// TAREFAS DO ATENDIMENTO, no quadro real do escritório: uma coluna por vez (as colunas são as do Kanban do
// site — não há "A fazer / Em curso / Feitas" inventadas). Criar (com data, responsável e coluna), concluir e
// reabrir (o círculo), mover de coluna e trocar o responsável. Mover só troca a coluna, igual ao quadro do
// site; concluir é o círculo. As tarefas aparecem também na Agenda geral.
export default function Tarefas({ p }: { p: PropsDosDetalhes }) {
  const { rodar, pendente } = useRodar();
  const grupos = agruparPorColuna(p.colunas, p.tarefas);
  const [coluna, setColuna] = useState<string>(p.colunas[0]?.id ?? "");
  const [nova, setNova] = useState<{ titulo: string; tipo: string; prioridade: string; dia: string; responsavelId: string; colunaId: string } | null>(null);
  const [mover, setMover] = useState<{ tarefa: Tarefa; colunaId: string; responsavelId: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // A coluna escolhida some (o quadro mudou): volta à primeira.
  useEffect(() => {
    if (!p.colunas.some((c) => c.id === coluna)) setColuna(p.colunas[0]?.id ?? "");
  }, [p.colunas, coluna]);

  const lista = grupos.get(coluna) ?? [];
  const primeiroNome = (p.conversa.clientName || "").split(/\s+/)[0] || "o cliente";
  const sugestoes = [`Ligar para ${primeiroNome}`, "Enviar proposta de honorários", "Cobrar documento pendente"];

  function concluir(t: Tarefa) {
    const concluir = t.status !== "CONCLUIDO";
    return rodar({
      fazer: () => definirConclusaoDaTarefa(p.conversa.id, t.id, concluir),
      ok: concluir ? `Tarefa concluída: ${t.title}.` : `Tarefa reaberta: ${t.title}.`,
      desfazer: () => definirConclusaoDaTarefa(p.conversa.id, t.id, !concluir, t.columnId),
    });
  }

  async function criar() {
    if (!nova) return;
    setErro(null);
    if (!nova.titulo.trim()) return setErro("Escreva o que precisa ser feito.");
    if (!nova.dia) return setErro("A tarefa precisa de uma data.");
    const r = await rodar({
      fazer: () => criarTarefaDoAtendimento(p.conversa.id, { titulo: nova.titulo, tipo: nova.tipo, prioridade: nova.prioridade, dia: nova.dia, responsavelId: nova.responsavelId || null, colunaId: nova.colunaId || null }),
      ok: "Tarefa criada. Aparece também na Agenda.",
    });
    if (r.ok) {
      if (nova.colunaId) setColuna(nova.colunaId);
      setNova(null);
    } else setErro(r.error ?? null);
  }

  async function salvarMover() {
    if (!mover) return;
    setErro(null);
    const { tarefa } = mover;
    const trocouColuna = mover.colunaId !== (tarefa.columnId ?? p.colunas[0]?.id);
    const trocouResp = (mover.responsavelId || null) !== tarefa.responsibleId;
    if (!trocouColuna && !trocouResp) return setMover(null);
    const r = await rodar({
      fazer: async () => {
        if (trocouColuna) {
          const a = await moverTarefaDeColuna(p.conversa.id, tarefa.id, mover.colunaId);
          if (a.error) return a;
        }
        if (trocouResp) return definirResponsavelDaTarefa(p.conversa.id, tarefa.id, mover.responsavelId || null);
        return {};
      },
      ok: "Tarefa atualizada.",
      desfazer: async () => {
        if (trocouColuna) {
          const a = await moverTarefaDeColuna(p.conversa.id, tarefa.id, tarefa.columnId ?? p.colunas[0]?.id ?? "");
          if (a.error) return a;
        }
        if (trocouResp) return definirResponsavelDaTarefa(p.conversa.id, tarefa.id, tarefa.responsibleId);
        return {};
      },
    });
    if (r.ok) {
      if (trocouColuna) setColuna(mover.colunaId);
      setMover(null);
    } else setErro(r.error ?? null);
  }

  return (
    <div>
      {p.colunas.length === 0 ? (
        <Vazio>O quadro de tarefas do escritório ainda não tem colunas. Peça a um sócio para configurá-lo no site.</Vazio>
      ) : (
        <>
          <div role="group" aria-label="Coluna do quadro" className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
            {p.colunas.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={coluna === c.id}
                onClick={() => setColuna(c.id)}
                className={`min-h-11 shrink-0 rounded-[2px] border px-3 text-corpo font-semibold ${coluna === c.id ? "border-acao bg-acao text-acao-tx" : "border-regua-forte bg-sf text-tx"}`}
              >
                {c.name} <span className="tabular-nums">({grupos.get(c.id)?.length ?? 0})</span>
              </button>
            ))}
          </div>
          {lista.length === 0 ? (
            <Vazio>Nada em “{p.colunas.find((c) => c.id === coluna)?.name}”.</Vazio>
          ) : (
            <ul>
              {lista.map((t) => {
                const feita = t.status === "CONCLUIDO";
                const prazo = !feita ? fraseDoPrazo(t.dueDay, p.hoje) : null;
                return (
                  <li key={t.id} className="flex items-center gap-1 border-t border-regua first:border-t-0">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={feita}
                      aria-label={`${feita ? "Reabrir" : "Concluir"}: ${t.title}`}
                      disabled={pendente}
                      onClick={() => concluir(t)}
                      className="flex h-11 w-11 shrink-0 items-center justify-center disabled:opacity-60"
                    >
                      <span aria-hidden="true" className={`flex h-6 w-6 items-center justify-center rounded-[2px] border-2 ${feita ? "border-concluido bg-concluido text-sf" : "border-atd-campo bg-sf text-transparent"}`}>
                        <Check size={16} />
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setErro(null);
                        setMover({ tarefa: t, colunaId: t.columnId && p.colunas.some((c) => c.id === t.columnId) ? t.columnId : (p.colunas[0]?.id ?? ""), responsavelId: t.responsibleId ?? "" });
                      }}
                      aria-label={`Mover ou trocar o responsável: ${t.title}`}
                      className="flex min-h-[52px] min-w-0 flex-1 flex-col justify-center py-1 text-left"
                    >
                      <span className={`break-words text-corpo font-semibold ${feita ? "text-tx-2 line-through" : "text-tx"}`}>{t.title}</span>
                      <span className="text-etiqueta text-tx-2">
                        {TIPOS_DE_TAREFA[t.type] ?? t.type} · {PRIORIDADES_DE_TAREFA[t.priority] ?? t.priority} · {t.responsibleName ? t.responsibleName.split(" ")[0] : "sem responsável"}
                        {t.dueDay ? ` · ${dataCurta(t.dueDay)}` : ""}
                      </span>
                      {prazo && (
                        <span className={`flex items-center gap-1 text-etiqueta font-semibold ${prazo.tom === "vencido" ? "text-urgente" : prazo.tom === "hoje" ? "text-aviso" : "text-tx-2"}`}>
                          {prazo.tom !== "futuro" && <AlertCircle size={14} aria-hidden="true" />}
                          {prazo.texto}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <button
            type="button"
            className={`${cx.secundario} mt-3`}
            onClick={() => {
              setErro(null);
              setNova({ titulo: "", tipo: "TAREFA", prioridade: "MEDIA", dia: amanha(p.hoje), responsavelId: p.meuId, colunaId: coluna });
            }}
          >
            <Plus size={16} aria-hidden="true" /> Nova tarefa
          </button>
        </>
      )}
      <p className={`mt-2 ${cx.dica}`}>As tarefas também aparecem na Agenda geral. “Mover” só troca a coluna do quadro; para concluir, marque o círculo.</p>

      <Gaveta
        aberta={nova !== null}
        aoFechar={() => setNova(null)}
        titulo="Nova tarefa"
        rodape={
          <>
            <button type="button" className={cx.secundario} onClick={() => setNova(null)}>
              Cancelar
            </button>
            <button type="button" className={`${cx.primario} flex-1`} disabled={pendente} onClick={criar}>
              {pendente ? "Criando…" : "Criar tarefa"}
            </button>
          </>
        }
      >
        {nova && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {sugestoes.map((s) => (
                <button key={s} type="button" className={cx.secundario} onClick={() => setNova({ ...nova, titulo: s })}>
                  {s}
                </button>
              ))}
            </div>
            <Campo rotulo="O que fazer" erro={erro && !nova.titulo.trim() ? erro : null}>
              {({ id, descricao }) => <input id={id} aria-describedby={descricao} className={cx.campo} value={nova.titulo} maxLength={200} onChange={(e) => setNova({ ...nova, titulo: e.target.value })} placeholder="Ex.: Ligar para o cliente" autoComplete="off" />}
            </Campo>
            <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
              <Campo rotulo="Tipo">
                {({ id }) => (
                  <select id={id} className={cx.campo} value={nova.tipo} onChange={(e) => setNova({ ...nova, tipo: e.target.value })}>
                    {Object.entries(TIPOS_DE_TAREFA).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                )}
              </Campo>
              <Campo rotulo="Prioridade">
                {({ id }) => (
                  <select id={id} className={cx.campo} value={nova.prioridade} onChange={(e) => setNova({ ...nova, prioridade: e.target.value })}>
                    {Object.entries(PRIORIDADES_DE_TAREFA).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                )}
              </Campo>
            </div>
            <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
              <Campo rotulo="Data" erro={erro && nova.titulo.trim() && !nova.dia ? erro : null}>{({ id, descricao }) => <input id={id} aria-describedby={descricao} type="date" className={cx.campo} value={nova.dia} onChange={(e) => setNova({ ...nova, dia: e.target.value })} />}</Campo>
              <Campo rotulo="Responsável">
                {({ id }) => (
                  <select id={id} className={cx.campo} value={nova.responsavelId} onChange={(e) => setNova({ ...nova, responsavelId: e.target.value })}>
                    <option value="">Sem responsável</option>
                    {p.usuarios.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                )}
              </Campo>
            </div>
            <Campo rotulo="Coluna do quadro">
              {({ id }) => (
                <select id={id} className={cx.campo} value={nova.colunaId} onChange={(e) => setNova({ ...nova, colunaId: e.target.value })}>
                  {p.colunas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </Campo>
            {erro && nova.titulo.trim() && nova.dia && (
              <p role="alert" className={cx.erro}>
                {erro}
              </p>
            )}
          </div>
        )}
      </Gaveta>

      <Gaveta
        aberta={mover !== null}
        aoFechar={() => setMover(null)}
        titulo="Mover tarefa"
        rodape={
          <>
            <button type="button" className={cx.secundario} onClick={() => setMover(null)}>
              Cancelar
            </button>
            <button type="button" className={`${cx.primario} flex-1`} disabled={pendente} onClick={salvarMover}>
              {pendente ? "Salvando…" : "Salvar"}
            </button>
          </>
        }
      >
        {mover && (
          <div className="space-y-3">
            <p className="break-words text-corpo font-semibold text-tx">{mover.tarefa.title}</p>
            <div role="radiogroup" aria-label="Coluna" className="space-y-1">
              {p.colunas.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={mover.colunaId === c.id}
                  onClick={() => setMover({ ...mover, colunaId: c.id })}
                  className={`flex min-h-11 w-full items-center gap-3 rounded-[2px] border px-3 text-left text-corpo ${mover.colunaId === c.id ? "border-acao bg-acao-bg font-bold text-tx" : "border-regua bg-sf text-tx"}`}
                >
                  <span aria-hidden="true" className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${mover.colunaId === c.id ? "border-atd-ouro-texto" : "border-atd-campo"}`}>
                    {mover.colunaId === c.id && <span className="h-2.5 w-2.5 rounded-full bg-atd-ouro-texto" />}
                  </span>
                  {c.name}
                </button>
              ))}
            </div>
            <Campo rotulo="Responsável" erro={erro}>
              {({ id, descricao }) => (
                <select id={id} aria-describedby={descricao} className={cx.campo} value={mover.responsavelId} onChange={(e) => setMover({ ...mover, responsavelId: e.target.value })}>
                  <option value="">Sem responsável</option>
                  {p.usuarios.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              )}
            </Campo>
          </div>
        )}
      </Gaveta>
    </div>
  );
}
