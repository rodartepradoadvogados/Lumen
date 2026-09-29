"use client";

import { useState } from "react";
import { AlertCircle, Check, Plus, Trash2 } from "lucide-react";
import { ENVIAR_KIND_OPTIONS, SOLICITAR_KIND_OPTIONS, pendenciaKindLabel, pendenciaKindNeedsDescription } from "@/lib/pendencias";
import { dataCurta, fraseDoPrazo } from "@/lib/detalhesDoAtendimento";
import {
  completeAttendancePendencia,
  createAttendancePendencias,
  deleteAttendancePendencia,
  reopenAttendancePendencia,
  updateAttendancePendenciaFollowUp,
} from "@/lib/actions/attendancePendencias";
import { recriarPendencia } from "@/lib/actions/detalhesDoAtendimento";
import { Campo, Gaveta, Vazio, cx, useRodar } from "./base";
import type { Pendencia, PropsDosDetalhes } from "./tipos";

// PENDÊNCIAS: "Falta chegar do cliente" (o que se pediu) e "O escritório deve enviar" (o que se deve). Criar,
// resolver, reabrir, ajustar prazo e responsável, excluir — cada uma com aviso e, onde cabe, "Desfazer". As
// ações são as do site (lib/actions/attendancePendencias.ts), todas com o recorte de acesso. Anexar procuração,
// contrato ou declaração fecha sozinha a pendência de envio correspondente (regra do servidor).
export default function Pendencias({ p }: { p: PropsDosDetalhes }) {
  const { rodar, pendente } = useRodar();
  const [nova, setNova] = useState<{ direction: "SOLICITAR" | "ENVIAR"; kind: string; description: string; dueDay: string; responsibleId: string } | null>(null);
  const [ajuste, setAjuste] = useState<{ pend: Pendencia; dueDay: string; responsibleId: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [verConcluidas, setVerConcluidas] = useState(false);

  const abertas = p.pendencias.filter((x) => x.status !== "CONCLUIDA");
  const concluidas = p.pendencias.filter((x) => x.status === "CONCLUIDA");
  const faltam = abertas.filter((x) => x.direction === "SOLICITAR");
  const devemos = abertas.filter((x) => x.direction === "ENVIAR");
  const opcoes = (dir: string) => (dir === "ENVIAR" ? ENVIAR_KIND_OPTIONS : SOLICITAR_KIND_OPTIONS);
  const nome = (x: Pendencia) => x.description?.trim() || pendenciaKindLabel(x.direction, x.kind);

  function alternar(x: Pendencia) {
    const concluir = x.status !== "CONCLUIDA";
    return rodar({
      fazer: () => (concluir ? completeAttendancePendencia(x.id) : reopenAttendancePendencia(x.id)),
      ok: concluir ? `Pendência resolvida: ${nome(x)}.` : `Pendência reaberta: ${nome(x)}.`,
      desfazer: () => (concluir ? reopenAttendancePendencia(x.id) : completeAttendancePendencia(x.id)),
    });
  }

  function excluir(x: Pendencia) {
    return rodar({
      fazer: () => deleteAttendancePendencia(x.id),
      ok: `Pendência excluída: ${nome(x)}.`,
      desfazer: () =>
        recriarPendencia(p.conversa.id, {
          direction: x.direction,
          kind: x.kind,
          description: x.description,
          dueDay: x.dueDay,
          responsibleId: x.responsibleId,
          concluida: x.status === "CONCLUIDA",
        }),
    });
  }

  async function criar() {
    if (!nova) return;
    setErro(null);
    if (pendenciaKindNeedsDescription(nova.direction, nova.kind) && !nova.description.trim()) {
      setErro("Diga quais para este tipo de pendência.");
      return;
    }
    const r = await rodar({
      fazer: () =>
        createAttendancePendencias(p.conversa.id, [
          {
            direction: nova.direction,
            kind: nova.kind,
            description: nova.description.trim() || undefined,
            responsibleId: nova.responsibleId || undefined,
            dueDate: nova.dueDay || undefined,
          },
        ]),
      ok: "Pendência criada.",
    });
    if (r.ok) setNova(null);
    else setErro(r.error ?? null);
  }

  async function salvarAjuste() {
    if (!ajuste) return;
    const antes = { responsibleId: ajuste.pend.responsibleId, dueDate: ajuste.pend.dueDay };
    const r = await rodar({
      fazer: () => updateAttendancePendenciaFollowUp(ajuste.pend.id, { responsibleId: ajuste.responsibleId || null, dueDate: ajuste.dueDay || null }),
      ok: "Prazo e responsável atualizados.",
      desfazer: () => updateAttendancePendenciaFollowUp(ajuste.pend.id, antes),
    });
    if (r.ok) setAjuste(null);
    else setErro(r.error ?? null);
  }

  function linha(x: Pendencia) {
    const feita = x.status === "CONCLUIDA";
    const prazo = !feita ? fraseDoPrazo(x.dueDay, p.hoje) : null;
    return (
      <li key={x.id} className="flex items-center gap-1 border-t border-regua first:border-t-0">
        <button
          type="button"
          role="checkbox"
          aria-checked={feita}
          aria-label={`${feita ? "Reabrir" : "Resolver"}: ${nome(x)}`}
          disabled={pendente}
          onClick={() => alternar(x)}
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
            setAjuste({ pend: x, dueDay: x.dueDay ?? "", responsibleId: x.responsibleId ?? "" });
          }}
          className="flex min-h-[52px] min-w-0 flex-1 flex-col justify-center py-1 text-left"
          aria-label={`Ajustar prazo e responsável: ${nome(x)}`}
        >
          <span className={`break-words text-corpo font-semibold ${feita ? "text-tx-2 line-through" : "text-tx"}`}>{nome(x)}</span>
          <span className="text-etiqueta text-tx-2">
            {x.description ? `${pendenciaKindLabel(x.direction, x.kind)} · ` : ""}
            {x.responsibleName ? x.responsibleName.split(" ")[0] : "sem responsável"}
            {feita ? "" : x.dueDay ? ` · ${dataCurta(x.dueDay)}` : ""}
          </span>
          {prazo && (
            <span className={`flex items-center gap-1 text-etiqueta font-semibold ${prazo.tom === "vencido" ? "text-urgente" : prazo.tom === "hoje" ? "text-aviso" : "text-tx-2"}`}>
              {prazo.tom !== "futuro" && <AlertCircle size={14} aria-hidden="true" />}
              {prazo.texto}
            </span>
          )}
        </button>
        <button type="button" onClick={() => excluir(x)} disabled={pendente} aria-label={`Excluir: ${nome(x)}`} className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-tx-2 hover:text-urgente disabled:opacity-60">
          <Trash2 size={18} aria-hidden="true" />
        </button>
      </li>
    );
  }

  return (
    <div>
      <p className={`mb-1 ${cx.etiqueta}`}>Falta chegar do cliente</p>
      {faltam.length ? <ul>{faltam.map(linha)}</ul> : <Vazio>Nada a pedir ao cliente.</Vazio>}

      <p className={`mb-1 mt-3 ${cx.etiqueta}`}>O escritório deve enviar</p>
      {devemos.length ? <ul>{devemos.map(linha)}</ul> : <Vazio>O escritório não deve nada a este cliente.</Vazio>}

      {concluidas.length > 0 && (
        <div className="mt-2">
          <button type="button" aria-expanded={verConcluidas} onClick={() => setVerConcluidas(!verConcluidas)} className={`${cx.discreto} -ml-3`}>
            Concluídas ({concluidas.length})
          </button>
          {verConcluidas && <ul>{concluidas.map(linha)}</ul>}
        </div>
      )}

      <button
        type="button"
        className={`${cx.secundario} mt-3`}
        onClick={() => {
          setErro(null);
          setNova({ direction: "SOLICITAR", kind: SOLICITAR_KIND_OPTIONS[0].kind, description: "", dueDay: "", responsibleId: p.meuId });
        }}
      >
        <Plus size={16} aria-hidden="true" /> Nova pendência
      </button>
      <p className={`mt-2 ${cx.dica}`}>Ao anexar procuração, contrato de honorários ou declaração de hipossuficiência no atendimento, a pendência de envio correspondente fecha sozinha.</p>

      <Gaveta
        aberta={nova !== null}
        aoFechar={() => setNova(null)}
        titulo="Nova pendência"
        rodape={
          <>
            <button type="button" className={cx.secundario} onClick={() => setNova(null)}>
              Cancelar
            </button>
            <button type="button" className={`${cx.primario} flex-1`} disabled={pendente} onClick={criar}>
              {pendente ? "Criando…" : "Criar pendência"}
            </button>
          </>
        }
      >
        {nova && (
          <div className="space-y-3">
            <fieldset>
              <legend className={cx.rotulo}>Quem deve o quê</legend>
              <div className="mt-1 grid grid-cols-2 border border-atd-campo" role="radiogroup">
                {(["SOLICITAR", "ENVIAR"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={nova.direction === d}
                    onClick={() => setNova({ ...nova, direction: d, kind: opcoes(d)[0].kind })}
                    className={`min-h-11 px-2 text-corpo font-semibold ${nova.direction === d ? "bg-acao text-acao-tx" : "bg-sf text-tx-2"}`}
                  >
                    {d === "SOLICITAR" ? "Falta chegar do cliente" : "O escritório deve enviar"}
                  </button>
                ))}
              </div>
            </fieldset>
            <Campo rotulo="O que é">
              {({ id }) => (
                <select id={id} className={cx.campo} value={nova.kind} onChange={(e) => setNova({ ...nova, kind: e.target.value })}>
                  {opcoes(nova.direction).map((o) => (
                    <option key={o.kind} value={o.kind}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
            </Campo>
            {pendenciaKindNeedsDescription(nova.direction, nova.kind) && (
              <Campo rotulo="Quais?" erro={erro}>
                {({ id, descricao }) => <input id={id} aria-describedby={descricao} className={cx.campo} value={nova.description} maxLength={200} onChange={(e) => setNova({ ...nova, description: e.target.value })} autoComplete="off" />}
              </Campo>
            )}
            <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
              <Campo rotulo="Prazo (opcional)">{({ id }) => <input id={id} type="date" className={cx.campo} value={nova.dueDay} onChange={(e) => setNova({ ...nova, dueDay: e.target.value })} />}</Campo>
              <Campo rotulo="Responsável">
                {({ id }) => (
                  <select id={id} className={cx.campo} value={nova.responsibleId} onChange={(e) => setNova({ ...nova, responsibleId: e.target.value })}>
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
            {erro && !pendenciaKindNeedsDescription(nova.direction, nova.kind) && <p role="alert" className={cx.erro}>{erro}</p>}
          </div>
        )}
      </Gaveta>

      <Gaveta
        aberta={ajuste !== null}
        aoFechar={() => setAjuste(null)}
        titulo="Prazo e responsável"
        rodape={
          <>
            <button type="button" className={cx.secundario} onClick={() => setAjuste(null)}>
              Cancelar
            </button>
            <button type="button" className={`${cx.primario} flex-1`} disabled={pendente} onClick={salvarAjuste}>
              {pendente ? "Salvando…" : "Salvar"}
            </button>
          </>
        }
      >
        {ajuste && (
          <div className="space-y-3">
            <p className="break-words text-corpo font-semibold text-tx">{nome(ajuste.pend)}</p>
            <Campo rotulo="Prazo">{({ id }) => <input id={id} type="date" className={cx.campo} value={ajuste.dueDay} onChange={(e) => setAjuste({ ...ajuste, dueDay: e.target.value })} />}</Campo>
            <Campo rotulo="Responsável" erro={erro}>
              {({ id, descricao }) => (
                <select id={id} aria-describedby={descricao} className={cx.campo} value={ajuste.responsibleId} onChange={(e) => setAjuste({ ...ajuste, responsibleId: e.target.value })}>
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
