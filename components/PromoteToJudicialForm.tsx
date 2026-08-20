"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { promoteCaseToJudicial } from "@/lib/actions/cases";

export default function PromoteToJudicialForm({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      await promoteCaseToJudicial(caseId, {
        processNumber: String(formData.get("processNumber")),
        court: String(formData.get("court") || ""),
      });
      router.refresh();
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-wrap gap-2 items-end">
      <div>
        <label className="text-xs font-medium text-tx-2">Número do processo</label>
        <input name="processNumber" required className="pj-input" placeholder="0000000-00.2026.8.09.0051" />
      </div>
      <div>
        <label className="text-xs font-medium text-tx-2">Vara/Comarca</label>
        <input name="court" className="pj-input" />
      </div>
      <button type="submit" disabled={pending} className="bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-4 py-2 disabled:opacity-50">
        {pending ? "Convertendo..." : "Converter em Judicial"}
      </button>
      <style jsx global>{`
        .pj-input { margin-top: 0.25rem; border: 1px solid rgba(15,31,61,0.12); border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; }
        .pj-input:focus { outline: none; box-shadow: 0 0 0 2px rgba(198,160,92,0.4); }
      `}</style>
    </form>
  );
}
