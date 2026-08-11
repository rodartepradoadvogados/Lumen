"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCaseAssessoria } from "@/lib/actions/assessoria";

type Option = { id: string; clientName: string };

export default function CaseAssessoriaSelect({
  caseId,
  assessoriaId,
  assessorias,
}: {
  caseId: string;
  assessoriaId: string | null;
  assessorias: Option[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (assessorias.length === 0 && !assessoriaId) return null;

  return (
    <select
      value={assessoriaId || ""}
      disabled={pending}
      onChange={(e) =>
        startTransition(async () => {
          await setCaseAssessoria(caseId, e.target.value || null);
          router.refresh();
        })
      }
      title="Vincular a uma assessoria"
      className={`text-xs font-semibold px-3 py-1.5 rounded-full border cursor-pointer ${
        assessoriaId
          ? "bg-marca-bg text-marca-tx border-marca/25"
          : "bg-sf-apoio text-tx-2 border-regua"
      }`}
    >
      <option value="">Vincular a uma assessoria</option>
      {assessorias.map((a) => (
        <option key={a.id} value={a.id}>
          {a.clientName}
        </option>
      ))}
    </select>
  );
}
