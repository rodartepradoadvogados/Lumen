"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { setTaskTypePoints } from "@/lib/actions/taskscore";
import { taskTypeLabels, taskTypeColors, Badge } from "@/components/ui";

type Item = { type: string; points: number };

export default function TaskTypePointsManager({ items }: { items: Item[] }) {
  return (
    <div className="divide-y divide-navy-800/5">
      {items.map((item) => (
        <PointsRow key={item.type} item={item} />
      ))}
    </div>
  );
}

function PointsRow({ item }: { item: Item }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(String(item.points));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await setTaskTypePoints(item.type, Number(value));
      if (result.error) {
        setError(result.error);
      } else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex items-center gap-3 px-5 py-2.5">
      <Badge color={taskTypeColors[item.type]}>{taskTypeLabels[item.type] ?? item.type}</Badge>
      <div className="flex-1" />
      <input
        type="number"
        min={0}
        step={1}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        className="cfg-input w-24 text-right"
      />
      <span className="text-xs text-navy-800/40">pts</span>
      <button
        onClick={handleSave}
        disabled={pending}
        className="bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
      >
        {pending ? "Salvando..." : "Salvar"}
      </button>
      {saved && !pending && (
        <span className="text-emerald-600 flex items-center" title="Salvo">
          <Check size={16} />
        </span>
      )}
      {error && <span className="text-[11px] text-red-700">{error}</span>}
    </div>
  );
}
