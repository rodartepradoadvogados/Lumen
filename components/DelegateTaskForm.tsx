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
  responsibleIds: [] as string[],
  type: "TAREFA",
  referTo: null as ReferTo | null,
  linkQuery: "",
  selectedLink: null as LinkHit | null,
  title: "",
  dueDate: "",
  dueTime: "",
  priority: "MEDIA",
  description: "",
  meetingType: "" as "" | "PRESENCIAL" | "ONLINE",
  location: "",
  meetingUrl: "",
  strategy: "",
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
  // Pré-seleciona o tipo (ex.: atalhos "Gerar Prazo"/"Marcar Audiência" em PublicationRow —
  // ver AGENDA_TYPE_SHORTCUTS) — usuário ainda pode trocar no passo 2.
  type?: string;
  // Pré-seleciona responsável e prazo — usado pela triagem por teclado de /publicacoes
  // (documento 05: "Enter abre o modal de tarefa já preenchido"). Quando os três primeiros
  // passos já chegam decididos (responsável, tipo, vínculo), o formulário pula direto pro
  // passo 4 (revisão) em vez de forçar o usuário a clicar "Avançar" três vezes à toa.
  responsibleIds?: string[];
  dueDate?: string;
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
            ? "bg-acao text-acao-tx"
            : active
              ? "bg-marca text-grafite-900"
              : "bg-sf-apoio text-tx-3"
        }`}
      >
        {done ? <Check size={12} /> : label}
      </span>
    </div>
  );
}

// Passo inicial: só pula direto pro passo 4 (revisão) quando responsável, tipo E vínculo (ou
// "Outros", que dispensa vínculo) já chegaram todos prontos — do contrário, mesmo com um ou
// outro campo pré-preenchido, o usuário passa pelos passos normalmente (o campo já vem marcado
// quando ele chegar lá).
function initialStepFor(initial?: DelegateTaskInitial): number {
  const hasResponsible = Boolean(initial?.responsibleIds?.length);
  const hasType = Boolean(initial?.type);
  const hasLink = initial?.referTo === "OUTROS" || Boolean(initial?.selectedLink);
  return hasResponsible && hasType && hasLink ? 4 : 1;
}

export default function DelegateTaskForm({
  users,
  initial,
  onSuccess,
}: {
  users: Option[];
  initial?: DelegateTaskInitial;
  // Chamado assim que a delegação é confirmada com sucesso (antes da tela de "Delegado com
  // sucesso!" aparecer), com os ids dos responsáveis escolhidos — usado pela triagem por teclado
  // de /publicacoes para avançar para a próxima publicação da fila sem esperar o usuário fechar
  // o modal manualmente, e para atualizar o responsável exibido sem esperar o servidor.
  onSuccess?: (responsibleIds: string[]) => void;
}) {
  const [state, setState] = useState(() => ({
    ...emptyState,
    step: initialStepFor(initial),
    responsibleIds: initial?.responsibleIds ?? emptyState.responsibleIds,
    referTo: initial?.referTo ?? emptyState.referTo,
    selectedLink: initial?.selectedLink ?? emptyState.selectedLink,
    title: initial?.title ?? emptyState.title,
    type: initial?.type ?? emptyState.type,
    dueDate: initial?.dueDate ?? emptyState.dueDate,
  }));
  const [linkResults, setLinkResults] = useState<LinkHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ responsibleNames: string[]; title: string } | null>(null);
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
      step: initialStepFor(initial),
      responsibleIds: initial?.responsibleIds ?? emptyState.responsibleIds,
      referTo: initial?.referTo ?? emptyState.referTo,
      selectedLink: initial?.selectedLink ?? emptyState.selectedLink,
      title: initial?.title ?? emptyState.title,
      type: initial?.type ?? emptyState.type,
      dueDate: initial?.dueDate ?? emptyState.dueDate,
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

  function toggleResponsible(id: string) {
    setState((s) => ({
      ...s,
      responsibleIds: s.responsibleIds.includes(id) ? s.responsibleIds.filter((r) => r !== id) : [...s.responsibleIds, id],
    }));
  }

  function canAdvanceFromStep(step: number): boolean {
    if (step === 1) return state.responsibleIds.length > 0;
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
      responsibleIds: state.responsibleIds,
      type: state.type,
      title: state.title.trim(),
      dueDate: state.dueDate,
      dueTime: state.dueTime || undefined,
      priority: state.priority,
      description: state.description || undefined,
      meetingType: state.meetingType || undefined,
      location: state.location || undefined,
      meetingUrl: state.meetingUrl || undefined,
      strategy: state.type === "AUDIENCIA" ? state.strategy || undefined : undefined,
      caseId: state.referTo === "PROCESSO" || state.referTo === "CASO" ? state.selectedLink?.id : undefined,
      attendanceId: state.referTo === "ATENDIMENTO" ? state.selectedLink?.id : undefined,
      publicationId: initial?.publicationId,
    });
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    const responsibleNames = users.filter((u) => state.responsibleIds.includes(u.id)).map((u) => u.name);
    setSuccess({ responsibleNames, title: state.title.trim() });
    onSuccess?.(state.responsibleIds);
  }

  if (success) {
    return (
      <div className="p-8 flex flex-col items-center text-center gap-3">
        <span className="h-12 w-12 rounded-full bg-green-500/15 text-green-600 dark:text-green-400 flex items-center justify-center">
          <Check size={22} />
        </span>
        <h3 className=" font-bold text-tx text-lg">Delegado com sucesso!</h3>
        <p className="text-sm text-tx-2 max-w-sm">
          &ldquo;{success.title}&rdquo; foi atribuído a{" "}
          <span className="font-semibold">
            {success.responsibleNames.length > 1
              ? `${success.responsibleNames.slice(0, -1).join(", ")} e ${success.responsibleNames.slice(-1)}`
              : success.responsibleNames[0]}
          </span>
          . {success.responsibleNames.length > 1 ? "Cada pessoa recebe seu próprio" : "A pessoa vai receber um"} alerta na Central de Alertas e o
          compromisso já aparece na Agenda.
        </p>
        {/* Só quando a delegação nasceu de uma publicação: aí ela sai da fila de TODO MUNDO do
            escritório, não só de quem clicou (ver lib/publicationResolution.ts). É uma
            consequência que passa despercebida se não for dita — quem delega precisa saber que
            acabou de baixar o item para os colegas também. */}
        {initial?.publicationId && (
          <p className="text-sm text-tx-2 max-w-sm">
            Como agora existe responsável, a publicação sai da lista de pendências de <span className="font-semibold">todo o escritório</span> —
            continua acessível na aba <span className="font-semibold">Lidas</span> e dentro do processo.
          </p>
        )}
        <button
          onClick={resetAll}
          className="mt-2 inline-flex items-center gap-1.5 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-4 py-2"
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
        <span className="h-px flex-1 bg-sf-apoio" />
        <StepDot active={state.step === 2} done={state.step > 2} label="2" />
        <span className="h-px flex-1 bg-sf-apoio" />
        <StepDot active={state.step === 3} done={state.step > 3} label="3" />
        <span className="h-px flex-1 bg-sf-apoio" />
        <StepDot active={state.step === 4} done={false} label="4" />
      </div>

      {state.step === 1 && (
        <div className="space-y-3">
          <div>
            <h3 className=" font-bold text-tx text-base">Quem vai receber?</h3>
            <p className="text-xs text-tx-2 mt-0.5">
              Selecione um ou mais membros da equipe — cada um recebe sua própria tarefa.
            </p>
          </div>
          <div className="border border-regua divide-y divide-regua max-h-64 overflow-y-auto scrollbar-thin">
            {users.map((u) => {
              const checked = state.responsibleIds.includes(u.id);
              return (
                <label
                  key={u.id}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-sf-apoio"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleResponsible(u.id)}
                    className="h-4 w-4 rounded border-regua text-acao focus:ring-acao/40"
                  />
                  <span className="text-tx">{u.name}</span>
                </label>
              );
            })}
          </div>
          {state.responsibleIds.length > 0 && (
            <p className="text-xs text-tx-2">
              {state.responsibleIds.length} pessoa{state.responsibleIds.length > 1 ? "s" : ""} selecionada{state.responsibleIds.length > 1 ? "s" : ""}
            </p>
          )}
        </div>
      )}

      {state.step === 2 && (
        <div className="space-y-3">
          <div>
            <h3 className=" font-bold text-tx text-base">Qual o tipo de compromisso?</h3>
            <p className="text-xs text-tx-2 mt-0.5">Escolha o tipo — igual ao que já existe em Kanban/Agenda.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {TYPE_OPTIONS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setState((s) => ({ ...s, type: t.value }))}
                className={`text-sm font-semibold px-4 py-2 border transition-colors ${
                  state.type === t.value
                    ? "bg-acao text-acao-tx border-acao"
                    : "bg-sf text-tx-2 border-regua hover:bg-sf-apoio"
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
            <h3 className=" font-bold text-tx text-base">A que se refere?</h3>
            <p className="text-xs text-tx-2 mt-0.5">Isso filtra a busca a seguir.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {REFER_OPTIONS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() =>
                  setState((s) => ({ ...s, referTo: r.value, linkQuery: "", selectedLink: null }))
                }
                className={`text-sm font-semibold px-4 py-2 border transition-colors ${
                  state.referTo === r.value
                    ? "bg-acao text-acao-tx border-acao"
                    : "bg-sf text-tx-2 border-regua hover:bg-sf-apoio"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          {needsLink && (
            <div className="pt-2">
              {state.selectedLink ? (
                <div className="flex items-center justify-between gap-2 border border-regua px-3 py-2 bg-sf-apoio">
                  <span className="text-sm text-tx truncate">{state.selectedLink.label}</span>
                  <button
                    type="button"
                    onClick={() => setState((s) => ({ ...s, selectedLink: null, linkQuery: "" }))}
                    className="text-xs font-semibold text-tx-2 hover:text-tx shrink-0"
                  >
                    Trocar
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-tx-3" />
                    <input
                      value={state.linkQuery}
                      onChange={(e) => setState((s) => ({ ...s, linkQuery: e.target.value }))}
                      placeholder={
                        state.referTo === "ATENDIMENTO" ? "Buscar por cliente ou assunto..." : "Buscar por título ou número..."
                      }
                      className="w-full border border-regua pl-8 pr-3 py-2 text-sm bg-sf text-tx"
                    />
                  </div>
                  {searching && <p className="text-xs text-tx-3 mt-1.5">Buscando...</p>}
                  {!searching && linkResults.length > 0 && (
                    <div className="mt-1.5 border border-regua divide-y divide-regua max-h-48 overflow-y-auto scrollbar-thin">
                      {linkResults.map((hit) => (
                        <button
                          key={hit.id}
                          type="button"
                          onClick={() => setState((s) => ({ ...s, selectedLink: hit, linkQuery: "" }))}
                          className="w-full text-left px-3 py-2 text-sm text-tx hover:bg-sf-apoio"
                        >
                          {hit.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {!searching && state.linkQuery.trim().length >= 2 && linkResults.length === 0 && (
                    <p className="text-xs text-tx-3 mt-1.5">Nenhum resultado encontrado.</p>
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
            <h3 className=" font-bold text-tx text-base">Dados do compromisso</h3>
            <p className="text-xs text-tx-2 mt-0.5">Por último, os detalhes do que está sendo delegado.</p>
          </div>
          <div>
            <label className="text-xs font-medium text-tx-2">Título</label>
            <input
              value={state.title}
              onChange={(e) => setState((s) => ({ ...s, title: e.target.value }))}
              placeholder="Ex: Elaborar contestação"
              className="w-full mt-1 border border-regua px-3 py-2 text-sm bg-sf text-tx"
            />
          </div>

          <div className=" border border-regua bg-sf-apoio px-3 py-2">
            <p className="text-[11px] font-semibold text-tx-2 uppercase tracking-wide">Data da solicitação</p>
            <p className="text-sm text-tx mt-0.5">
              {new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })} (hoje)
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-tx-2">Prazo fatal</label>
              <input
                type="date"
                value={state.dueDate}
                onChange={(e) => setState((s) => ({ ...s, dueDate: e.target.value }))}
                className="w-full mt-1 border border-regua px-3 py-2 text-sm bg-sf text-tx"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-tx-2">Hora do prazo fatal (opcional)</label>
              <input
                type="time"
                value={state.dueTime}
                onChange={(e) => setState((s) => ({ ...s, dueTime: e.target.value }))}
                className="w-full mt-1 border border-regua px-3 py-2 text-sm bg-sf text-tx"
              />
            </div>
          </div>

          {state.dueDate && (
            <div className=" border border-amber-500/30 bg-amber-500/10 px-3 py-2 flex items-start gap-2">
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
            <label className="text-xs font-medium text-tx-2">Prioridade</label>
            <select
              value={state.priority}
              onChange={(e) => setState((s) => ({ ...s, priority: e.target.value }))}
              className="w-full mt-1 border border-regua px-3 py-2 text-sm bg-sf text-tx"
            >
              <option value="BAIXA">Baixa</option>
              <option value="MEDIA">Média</option>
              <option value="ALTA">Alta</option>
              <option value="URGENTE">Urgente</option>
            </select>
          </div>
          {(state.type === "EVENTO" || state.type === "AUDIENCIA") && (
            <div className=" border border-marca/25 bg-marca-bg p-3 space-y-3">
              <p className="text-xs font-semibold text-marca-tx uppercase tracking-wide">
                {state.type === "AUDIENCIA" ? "Local da audiência (opcional)" : "Reunião (opcional)"}
              </p>
              <div className="flex gap-4">
                <label className="flex items-center gap-1.5 text-sm text-tx">
                  <input
                    type="radio"
                    checked={state.meetingType === "PRESENCIAL"}
                    onChange={() => setState((s) => ({ ...s, meetingType: "PRESENCIAL" }))}
                  />
                  Presencial
                </label>
                <label className="flex items-center gap-1.5 text-sm text-tx">
                  <input
                    type="radio"
                    checked={state.meetingType === "ONLINE"}
                    onChange={() => setState((s) => ({ ...s, meetingType: "ONLINE" }))}
                  />
                  Online
                </label>
              </div>
              {state.meetingType === "PRESENCIAL" ? (
                <div>
                  <label className="text-xs font-medium text-tx-2">Endereço (opcional)</label>
                  <input
                    value={state.location}
                    onChange={(e) => setState((s) => ({ ...s, location: e.target.value }))}
                    placeholder="Ex: Rua X, nº 123, Sala 4 - Goiânia/GO"
                    className="w-full mt-1 border border-regua px-3 py-2 text-sm bg-sf text-tx"
                  />
                </div>
              ) : (
                <div>
                  <label className="text-xs font-medium text-tx-2">
                    {state.type === "AUDIENCIA" ? "Link da audiência (opcional)" : "Link da reunião (opcional)"}
                  </label>
                  <input
                    type="url"
                    value={state.meetingUrl}
                    onChange={(e) => setState((s) => ({ ...s, meetingUrl: e.target.value }))}
                    placeholder="https://meet.google.com/..."
                    className="w-full mt-1 border border-regua px-3 py-2 text-sm bg-sf text-tx"
                  />
                </div>
              )}
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-tx-2">Descrição (opcional)</label>
            <textarea
              value={state.description}
              onChange={(e) => setState((s) => ({ ...s, description: e.target.value }))}
              rows={3}
              className="w-full mt-1 border border-regua px-3 py-2 text-sm bg-sf text-tx resize-y max-h-[40vh]"
            />
          </div>

          {state.type === "AUDIENCIA" && (
            <div>
              <label className="text-xs font-medium text-tx-2">Estratégia (opcional)</label>
              <textarea
                value={state.strategy}
                onChange={(e) => setState((s) => ({ ...s, strategy: e.target.value }))}
                rows={3}
                placeholder="Teses, pontos de atenção, preparo para a audiência..."
                className="w-full mt-1 border border-regua px-3 py-2 text-sm bg-sf text-tx resize-y max-h-[40vh]"
              />
            </div>
          )}
        </div>
      )}

      {error && <p className="text-xs font-medium text-urgente mt-3">{error}</p>}

      <div className="flex items-center justify-between mt-6 pt-4 border-t border-regua">
        <button
          type="button"
          onClick={() => goTo(state.step - 1)}
          disabled={state.step === 1}
          className="inline-flex items-center gap-1 text-sm font-semibold text-tx-2 hover:text-tx disabled:opacity-0 px-3 py-2"
        >
          <ChevronLeft size={15} /> Voltar
        </button>
        {state.step < 4 ? (
          <button
            type="button"
            onClick={() => goTo(state.step + 1)}
            disabled={!canAdvanceFromStep(state.step)}
            className="inline-flex items-center gap-1 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-4 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Avançar <ChevronRight size={15} />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="inline-flex items-center gap-1.5 bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-5 py-2 disabled:opacity-50"
          >
            <UserPlus size={15} /> {loading ? "Delegando..." : "Delegar"}
          </button>
        )}
      </div>
    </div>
  );
}
