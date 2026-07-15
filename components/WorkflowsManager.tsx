"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Power } from "lucide-react";
import {
  createWorkflowTemplate,
  deleteWorkflowTemplate,
  toggleWorkflowActive,
  addWorkflowStep,
  deleteWorkflowStep,
} from "@/lib/actions/workflows";
import { Badge, taskTypeLabels, taskTypeColors, priorityColors } from "@/components/ui";

type Step = {
  id: string;
  order: number;
  title: string;
  taskType: string;
  offsetDays: number;
  priority: string;
  role: string | null;
  points: number | null;
};

type Template = {
  id: string;
  name: string;
  area: string | null;
  description: string | null;
  active: boolean;
  steps: Step[];
};

const TASK_TYPES = ["TAREFA", "EVENTO", "AUDIENCIA", "PERICIA", "PRAZO"];
const PRIORITIES = ["BAIXA", "MEDIA", "ALTA", "URGENTE"];

export default function WorkflowsManager({ templates, roles }: { templates: Template[]; roles: string[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result?.error) setError(result.error);
      else router.refresh();
    });
  }

  function handleCreate(formData: FormData) {
    const name = String(formData.get("name") || "").trim();
    if (!name) return;
    run(async () =>
      createWorkflowTemplate({
        name,
        area: String(formData.get("area") || ""),
        description: String(formData.get("description") || ""),
      })
    );
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      <form action={handleCreate} className="flex gap-2 flex-wrap items-start">
        <input name="name" required placeholder="Nome do workflow (ex: Ação Trabalhista)" className="cfg-input flex-1 min-w-[200px]" />
        <input name="area" placeholder="Área (opcional)" className="cfg-input min-w-[140px]" />
        <input name="description" placeholder="Descrição (opcional)" className="cfg-input flex-1 min-w-[180px]" />
        <button type="submit" disabled={pending} className="bg-navy-900 hover:bg-navy-800 text-white text-sm font-semibold rounded-lg px-4 py-2 disabled:opacity-50">
          Criar workflow
        </button>
      </form>

      {templates.length === 0 && <p className="text-sm text-navy-800/50">Nenhum workflow cadastrado ainda.</p>}

      {templates.map((tpl) => (
        <div key={tpl.id} className="rounded-xl border border-navy-800/10 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-cream-100/60 border-b border-navy-800/8">
            <p className="font-semibold text-navy-900 text-sm">{tpl.name}</p>
            {tpl.area && <Badge color="navy">{tpl.area}</Badge>}
            <Badge color={tpl.active ? "green" : "slate"}>{tpl.active ? "Ativo" : "Inativo"}</Badge>
            <div className="flex-1" />
            <button
              onClick={() => run(() => toggleWorkflowActive(tpl.id))}
              disabled={pending}
              data-tip={tpl.active ? "Inativar" : "Ativar"}
              className="p-1.5 rounded-lg text-navy-800/30 hover:text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-40"
            >
              <Power size={14} />
            </button>
            <button
              onClick={() => {
                if (window.confirm(`Excluir o workflow "${tpl.name}" e todos os seus passos?`)) run(() => deleteWorkflowTemplate(tpl.id));
              }}
              disabled={pending}
              data-tip="Excluir workflow"
              className="p-1.5 rounded-lg text-navy-800/30 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
            >
              <Trash2 size={14} />
            </button>
          </div>

          {tpl.description && <p className="px-4 pt-3 text-xs text-navy-800/55">{tpl.description}</p>}

          <div className="p-4 space-y-2">
            {tpl.steps.length === 0 ? (
              <p className="text-xs text-navy-800/40">Nenhum passo. Adicione o primeiro abaixo.</p>
            ) : (
              <ol className="space-y-1.5">
                {tpl.steps.map((step, i) => (
                  <li key={step.id} className="flex items-center gap-2 text-sm bg-white rounded-lg border border-navy-800/8 px-3 py-2">
                    <span className="text-xs font-semibold text-navy-800/40 w-5 shrink-0">{i + 1}.</span>
                    <span className="flex-1 min-w-0 text-navy-900 truncate">{step.title}</span>
                    <Badge color={taskTypeColors[step.taskType]}>{taskTypeLabels[step.taskType] ?? step.taskType}</Badge>
                    <Badge color={priorityColors[step.priority]}>{step.priority}</Badge>
                    <span className="text-[11px] text-navy-800/50 whitespace-nowrap">D+{step.offsetDays}</span>
                    {step.role && <span className="text-[11px] text-navy-800/50 whitespace-nowrap">{step.role}</span>}
                    {step.points != null && <span className="text-[11px] text-navy-800/50 whitespace-nowrap">{step.points} pts</span>}
                    <button
                      onClick={() => run(() => deleteWorkflowStep(step.id))}
                      disabled={pending}
                      data-tip="Excluir passo"
                      className="p-1 rounded-lg text-navy-800/30 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                    >
                      <Trash2 size={13} />
                    </button>
                  </li>
                ))}
              </ol>
            )}

            <AddStepForm templateId={tpl.id} roles={roles} pending={pending} onSubmit={run} />
          </div>
        </div>
      ))}
    </div>
  );
}

function AddStepForm({
  templateId,
  roles,
  pending,
  onSubmit,
}: {
  templateId: string;
  roles: string[];
  pending: boolean;
  onSubmit: (fn: () => Promise<{ error?: string }>) => void;
}) {
  function handleAdd(formData: FormData) {
    const title = String(formData.get("title") || "").trim();
    if (!title) return;
    const pointsRaw = String(formData.get("points") || "").trim();
    onSubmit(async () =>
      addWorkflowStep({
        templateId,
        title,
        taskType: String(formData.get("taskType") || "TAREFA"),
        offsetDays: Number(formData.get("offsetDays") || 0),
        priority: String(formData.get("priority") || "MEDIA"),
        role: String(formData.get("role") || ""),
        points: pointsRaw === "" ? undefined : Number(pointsRaw),
      })
    );
  }

  return (
    <form action={handleAdd} className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-2 border-t border-navy-800/8 items-end">
      <div className="sm:col-span-4">
        <label className="text-[11px] font-medium text-navy-800/55">Título do passo</label>
        <input name="title" required placeholder="Ex: Elaborar petição inicial" className="cfg-input w-full" />
      </div>
      <div className="sm:col-span-2">
        <label className="text-[11px] font-medium text-navy-800/55">Tipo</label>
        <select name="taskType" className="cfg-input w-full" defaultValue="TAREFA">
          {TASK_TYPES.map((t) => (
            <option key={t} value={t}>
              {taskTypeLabels[t]}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-1">
        <label className="text-[11px] font-medium text-navy-800/55">Dias</label>
        <input name="offsetDays" type="number" min={0} step={1} defaultValue={0} className="cfg-input w-full" />
      </div>
      <div className="sm:col-span-2">
        <label className="text-[11px] font-medium text-navy-800/55">Prioridade</label>
        <select name="priority" className="cfg-input w-full" defaultValue="MEDIA">
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="text-[11px] font-medium text-navy-800/55">Cargo</label>
        <select name="role" className="cfg-input w-full" defaultValue="">
          <option value="">Qualquer</option>
          {roles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-1">
        <label className="text-[11px] font-medium text-navy-800/55">Pontos</label>
        <input name="points" type="number" min={0} step={1} placeholder="auto" className="cfg-input w-full" />
      </div>
      <div className="sm:col-span-12">
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-1.5 bg-white border border-navy-800/15 hover:bg-cream-100 text-navy-900 text-xs font-semibold rounded-lg px-3 py-1.5 disabled:opacity-50"
        >
          <Plus size={14} /> Adicionar passo
        </button>
      </div>
    </form>
  );
}
