"use client";

import { useEffect, useRef, useState } from "react";
import { delegateTask, searchCasesForDelegation, searchAttendancesForDelegation } from "@/lib/actions/tasks";
import { Check, ChevronLeft, ChevronRight, Search, UserPlus, Hourglass } from "lucide-react";

type Option = { id: string; name: string };
type LinkHit = { id: string; label: string };
type ReferTo = "PROCESSO" | "CASO" | "ATENDIMENTO" | "OUTROS";

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "TAREFA", label: "Tarefa" },
  { value: "PRAZO", label: "Prazo" },
  { value: "AUDIENCIA", label: "Audiência" },
  { value: "PERICIA", label: "Perícia" },
  { value: "EVENTO", label: "Evento" },
];

const REFER_OPTIONS: { value: ReferTo; label: string }[] = [
  { value: "PROCESSO", label: "Processo" },
  { value: "CASO", label: "Caso" },
  { value: "ATENDIMENTO", label: "Atendimento" },
  { value: "OUTROS", label: "Outros" },
];

const emptyState = {
  step: 1,
  responsibleId: "",
  type: "TAREFA",
  referTo: null as ReferTo | null,
  linkQuery: "",
  selectedLink: null as LinkHit | null,
  title: "",
  dueDate: "",
  dueTime: "",
  priority: "MEDIA",
  description: "",
};

// Contexto pré-preenchido quando o formulário é aberto a partir de um lugar que já sabe a
// que processo/caso a delegação se refere (ex.: botão "Delegar" de uma publicação em
// PublicationRow) — pula a busca do passo 3, que já chega com o vínculo resolvido. `publicationId`
// é repassado à action pra também linkar a Task criada à publicação de origem.
export type DelegateTaskInitial = {
  referTo?: ReferTo;
  selectedLink?: LinkHit;
  title?: string;
  publicationId?: string;
};

// Prévia do prazo de segurança (24h antes do prazo fatal) exibida no passo 4 — mesma conta
// que o servidor faz de verdade em delegateTask/computeSafetyDueDate (lib/actions/tasks.ts),
// só que aqui em cima do texto já digitado, pra o usuário ver antes de confirmar.
function formatSafetyPreview(dueDateStr: string, dueTimeStr: string): string | null {
  if (!dueDateStr) return null;
  const due = new Date(`${dueDateStr}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  const safety = new Date(due.getTime() - 24 * 60 * 60 * 1000);
  const dateLabel = safety.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  return dueTimeStr ? `${dateLabel} às ${dueTimeStr}` : dateLabel;
}

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
          done
            ? "bg-navy-900 text-white dark:bg-gold-500 dark:text-navy-950"
            : active
              ? "bg-gold-500 text-navy-950"
              : "bg-navy-800/10 dark:bg-white/10 text-navy-800/40 dark:text-cream-50/40"
        }`}
      >
        {done ? <Check size={12} /> : label}
      </span>
    </div>
  );
}

export default function DelegateTaskForm({ users, initial }: { users: Option[]; initial?: DelegateTaskInitial }) {
  const [state, setState] = useState(() => ({
    ...emptyState,
    referTo: initial?.referTo ?? emptyState.referTo,
    selectedLink: initial?.selectedLink ?? emptyState.selectedLink,
    title: initial?.title ?? emptyState.title,
  }));
  const [linkResults, setLinkResults] = useState<LinkHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ responsibleName: string; title: string } | null>(null);
  const searchReqId = useRef(0);

  const needsLink = state.referTo === "PROCESSO" || state.referTo === "CASO" || state.referTo === "ATENDIMENTO";

  // Busca dinâmica (debounce de 300ms) de Processo/Caso/Atendimento, conforme o que
  // foi escolhido no passo 3 — descarta respostas obsoletas via searchReqId.
  useEffect(() => {
    if (!needsLink || state.selectedLink) return;
    const q = state.linkQuery.trim();
    if (q.length < 2) {
      setLinkResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const reqId = ++searchReqId.current;
    const timer = setTimeout(async () => {
      const res =
        state.referTo === "PROCESSO"
          ? await searchCasesForDelegation(q, true)
          : state.referTo === "CASO"
            ? await searchCasesForDelegation(q, false)
            : await searchAttendancesForDelegation(q);
      if (reqId !== searchReqId.current) return;
      setLinkResults(res);
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.linkQuery, state.referTo, state.selectedLink, needsLink]);

  function resetAll() {
    setState({
      ...emptyState,
      referTo: initial?.referTo ?? emptyState.referTo,
      selectedLink: initial?.selectedLink ?? emptyState.selectedLink,
      title: initial?.title ?? emptyState.title,
    });
    setLinkResults([]);
    setSearching(false);
    setError("");
    setSuccess(null);
  }

  function goTo(step: number) {
    setError("");
    setState((s) => ({ ...s, step }));
  }

  function canAdvanceFromStep(step: number): boolean {
    if (step === 1) return Boolean(state.responsibleId);
    if (step === 2) return Boolean(state.type);
    if (step === 3) return state.referTo === "OUTROS" || (needsLink && Boolean(state.selectedLink));
    return true;
  }

  async function handleSubmit() {
    if (!state.title.trim() || !state.dueDate) {
      setError("Preencha título e data.");
      return;
    }
    setError("");
    setLoading(true);
    const result = await delegateTask({
      responsibleId: state.responsibleId,
      type: state.type,
      title: state.title.trim(),
      dueDate: state.dueDate,
      dueTime: state.dueTime || undefined,
      priority: state.priority,
      description: state.description || undefined,
      caseId: state.referTo === "PROCESSO" || state.referTo === "CASO" ? state.selectedLink?.id : undefined,
      attendanceId: state.referTo === "ATENDIMENTO" ? state.selectedLink?.id : undefined,
      publicationId: initial?.publicationId,
    });
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    const responsibleName = users.find((u) => u.id === state.responsibleId)?.name ?? "";
    setSuccess({ responsibleName, title: state.title.trim() });
  }

  if (success) {
    return (
      <div className="p-8 flex flex-col items-center text-center gap-3">
        <span className="h-12 w-12 rounded-full bg-green-500/15 text-green-600 dark:text-green-400 flex items-center justify-center">
          <Check size={22} />
        </span>
        <h3 className="font-serif font-bold text-navy-900 dark:text-cream-50 text-lg">Delegado com sucesso!</h3>
        <p className="text-sm text-navy-800/60 dark:text-cream-50/60 max-w-sm">
          &ldquo;{success.title}&rdquo; foi atribuído a <span className="font-semibold">{success.responsibleName}</span>. A pessoa vai receber um
          alerta na Central de Alertas e o compromisso já aparece na Agenda.
        </p>
        <button
          onClick={resetAll}
          className="mt-2 inline-flex items-center gap-1.5 bg-navy-900 hover:bg-navy-800 text-white text-sm font-semibold rounded-lg px-4 py-2"
        >
          <UserPlus size={15} /> Delegar outra
        </button>
      </div>
    );
  }

  return (
    <div className="p-5">
      <div className="flex items-center gap-2 mb-6">
        <StepDot active={state.step === 1} done={state.step > 1} label="1" />
        <span className="h-px flex-1 bg-navy-800/10 dark:bg-white/10" />
        <StepDot active={state.step === 2} done={state.step > 2} label="2" />
        <span className="h-px flex-1 bg-navy-800/10 dark:bg-white/10" />
        <StepDot active={state.step === 3} done={state.step > 3} label="3" />
        <span className="h-px flex-1 bg-navy-800/10 dark:bg-white/10" />
        <StepDot active={state.step === 4} done={false} label="4" />
      </div>

      {state.step === 1 && (
        <div className="space-y-3">
          <div>
            <h3 className="font-serif font-bold text-navy-900 dark:text-cream-50 text-base">Quem vai receber?</h3>
            <p className="text-xs text-navy-800/50 dark:text-cream-50/50 mt-0.5">Selecione o membro da equipe que vai ficar responsável.</p>
          </div>
          <select
            value={state.responsibleId}
            onChange={(e) => setState((s) => ({ ...s, responsibleId: e.target.value }))}
            className="w-full border border-navy-800/12 dark:border-white/15 rounded-lg px-3 py-2 text-sm bg-white dark:bg-navy-800 text-navy-900 dark:text-cream-50"
          >
            <option value="">Selecione um membro da equipe</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {state.step === 2 && (
        <div className="space-y-3">
          <div>
            <h3 className="font-serif font-bold text-navy-900 dark:text-cream-50 text-base">Qual o tipo de compromisso?</h3>
            <p className="text-xs text-navy-800/50 dark:text-cream-50/50 mt-0.5">Escolha o tipo — igual ao que já existe em Kanban/Agenda.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {TYPE_OPTIONS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setState((s) => ({ ...s, type: t.value }))}
                className={`text-sm font-semibold px-4 py-2 rounded-lg border transition-colors ${
                  state.type === t.value
                    ? "bg-navy-900 text-white border-navy-900 dark:bg-gold-500 dark:text-navy-950 dark:border-gold-500"
                    : "bg-white dark:bg-navy-800 text-navy-800/70 dark:text-cream-50/70 border-navy-800/12 dark:border-white/15 hover:bg-cream-100 dark:hover:bg-white/5"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {state.step === 3 && (
        <div className="space-y-3">
          <div>
            <h3 className="font-serif font-bold text-navy-900 dark:text-cream-50 text-base">A que se refere?</h3>
            <p className="text-xs text-navy-800/50 dark:text-cream-50/50 mt-0.5">Isso filtra a busca a seguir.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {REFER_OPTIONS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() =>
                  setState((s) => ({ ...s, referTo: r.value, linkQuery: "", selectedLink: null }))
                }
                className={`text-sm font-semibold px-4 py-2 rounded-lg border transition-colors ${
                  state.referTo === r.value
                    ? "bg-navy-900 text-white border-navy-900 dark:bg-gold-500 dark:text-navy-950 dark:border-gold-500"
                    : "bg-white dark:bg-navy-800 text-navy-800/70 dark:text-cream-50/70 border-navy-800/12 dark:border-white/15 hover:bg-cream-100 dark:hover:bg-white/5"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          {needsLink && (
            <div className="pt-2">
              {state.selectedLink ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-navy-800/12 dark:border-white/15 px-3 py-2 bg-cream-50 dark:bg-white/5">
                  <span className="text-sm text-navy-900 dark:text-cream-50 truncate">{state.selectedLink.label}</span>
                  <button
                    type="button"
                    onClick={() => setState((s) => ({ ...s, selectedLink: null, linkQuery: "" }))}
                    className="text-xs font-semibold text-navy-800/50 dark:text-cream-50/50 hover:text-navy-900 dark:hover:text-cream-50 shrink-0"
                  >
                    Trocar
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-800/30 dark:text-cream-50/30" />
                    <input
                      value={state.linkQuery}
                      onChange={(e) => setState((s) => ({ ...s, linkQuery: e.target.value }))}
                      placeholder={
                        state.referTo === "ATENDIMENTO" ? "Buscar por cliente ou assunto..." : "Buscar por título ou número..."
                      }
                      className="w-full border border-navy-800/12 dark:border-white/15 rounded-lg pl-8 pr-3 py-2 text-sm bg-white dark:bg-navy-800 text-navy-900 dark:text-cream-50"
                    />
                  </div>
                  {searching && <p className="text-xs text-navy-800/40 dark:text-cream-50/40 mt-1.5">Buscando...</p>}
                  {!searching && linkResults.length > 0 && (
                    <div className="mt-1.5 border border-navy-800/10 dark:border-white/10 rounded-lg divide-y divide-navy-800/5 dark:divide-white/10 max-h-48 overflow-y-auto scrollbar-thin">
                      {linkResults.map((hit) => (
                        <button
                          key={hit.id}
                          type="button"
                          onClick={() => setState((s) => ({ ...s, selectedLink: hit, linkQuery: "" }))}
                          className="w-full text-left px-3 py-2 text-sm text-navy-900 dark:text-cream-50 hover:bg-cream-100 dark:hover:bg-white/5"
                        >
                          {hit.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {!searching && state.linkQuery.trim().length >= 2 && linkResults.length === 0 && (
                    <p className="text-xs text-navy-800/40 dark:text-cream-50/40 mt-1.5">Nenhum resultado encontrado.</p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {state.step === 4 && (
        <div className="space-y-3">
          <div>
            <h3 className="font-serif font-bold text-navy-900 dark:text-cream-50 text-base">Dados do compromisso</h3>
            <p className="text-xs text-navy-800/50 dark:text-cream-50/50 mt-0.5">Por último, os detalhes do que está sendo delegado.</p>
          </div>
          <div>
            <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Título</label>
            <input
              value={state.title}
              onChange={(e) => setState((s) => ({ ...s, title: e.target.value }))}
              placeholder="Ex: Elaborar contestação"
              className="w-full mt-1 border border-navy-800/12 dark:border-white/15 rounded-lg px-3 py-2 text-sm bg-white dark:bg-navy-800 text-navy-900 dark:text-cream-50"
            />
          </div>

          <div className="rounded-lg border border-navy-800/10 dark:border-white/10 bg-cream-50 dark:bg-white/5 px-3 py-2">
            <p className="text-[11px] font-semibold text-navy-800/50 dark:text-cream-50/50 uppercase tracking-wide">Data da solicitação</p>
            <p className="text-sm text-navy-900 dark:text-cream-50 mt-0.5">
              {new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })} (hoje)
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Prazo fatal</label>
              <input
                type="date"
                value={state.dueDate}
                onChange={(e) => setState((s) => ({ ...s, dueDate: e.target.value }))}
                className="w-full mt-1 border border-navy-800/12 dark:border-white/15 rounded-lg px-3 py-2 text-sm bg-white dark:bg-navy-800 text-navy-900 dark:text-cream-50"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Hora do prazo fatal (opcional)</label>
              <input
                type="time"
                value={state.dueTime}
                onChange={(e) => setState((s) => ({ ...s, dueTime: e.target.value }))}
                className="w-full mt-1 border border-navy-800/12 dark:border-white/15 rounded-lg px-3 py-2 text-sm bg-white dark:bg-navy-800 text-navy-900 dark:text-cream-50"
              />
            </div>
          </div>

          {state.dueDate && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 flex items-start gap-2">
              <Hourglass size={14} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 uppercase tracking-wide">
                  Prazo de segurança (automático)
                </p>
                <p className="text-sm text-amber-900 dark:text-amber-200 mt-0.5">{formatSafetyPreview(state.dueDate, state.dueTime)}</p>
                <p className="text-[11px] text-amber-800/70 dark:text-amber-300/70 mt-0.5">
                  Sempre 24h antes do prazo fatal — vai aparecer na Agenda nos dois dias, em cores diferentes.
                </p>
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Prioridade</label>
            <select
              value={state.priority}
              onChange={(e) => setState((s) => ({ ...s, priority: e.target.value }))}
              className="w-full mt-1 border border-navy-800/12 dark:border-white/15 rounded-lg px-3 py-2 text-sm bg-white dark:bg-navy-800 text-navy-900 dark:text-cream-50"
            >
              <option value="BAIXA">Baixa</option>
              <option value="MEDIA">Média</option>
              <option value="ALTA">Alta</option>
              <option value="URGENTE">Urgente</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Descrição (opcional)</label>
            <textarea
              value={state.description}
              onChange={(e) => setState((s) => ({ ...s, description: e.target.value }))}
              rows={3}
              className="w-full mt-1 border border-navy-800/12 dark:border-white/15 rounded-lg px-3 py-2 text-sm bg-white dark:bg-navy-800 text-navy-900 dark:text-cream-50 resize-y max-h-[40vh]"
            />
          </div>
        </div>
      )}

      {error && <p className="text-xs font-medium text-bordo-600 dark:text-bordo-400 mt-3">{error}</p>}

      <div className="flex items-center justify-between mt-6 pt-4 border-t border-navy-800/8 dark:border-white/10">
        <button
          type="button"
          onClick={() => goTo(state.step - 1)}
          disabled={state.step === 1}
          className="inline-flex items-center gap-1 text-sm font-semibold text-navy-800/60 dark:text-cream-50/60 hover:text-navy-900 dark:hover:text-cream-50 disabled:opacity-0 px-3 py-2"
        >
          <ChevronLeft size={15} /> Voltar
        </button>
        {state.step < 4 ? (
          <button
            type="button"
            onClick={() => goTo(state.step + 1)}
            disabled={!canAdvanceFromStep(state.step)}
            className="inline-flex items-center gap-1 bg-navy-900 hover:bg-navy-800 text-white text-sm font-semibold rounded-lg px-4 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Avançar <ChevronRight size={15} />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="inline-flex items-center gap-1.5 bg-gold-600 hover:bg-gold-700 text-white text-sm font-semibold rounded-lg px-5 py-2 disabled:opacity-50"
          >
            <UserPlus size={15} /> {loading ? "Delegando..." : "Delegar"}
          </button>
        )}
      </div>
    </div>
  );
}
