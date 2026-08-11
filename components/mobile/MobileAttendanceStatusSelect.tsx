"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAttendanceStatus } from "@/lib/actions/attendance";

const options = ["NOVO", "EM_TRIAGEM", "CONVERTIDO", "ARQUIVADO"];

const labels: Record<string, string> = {
  NOVO: "Novo",
  EM_TRIAGEM: "Em Triagem",
  CONVERTIDO: "Convertido",
  ARQUIVADO: "Arquivado",
  RASCUNHO: "Rascunho",
};

// Tokens semânticos (trocam de tema sozinhos, sem variante `dark:` própria — ver DESIGN-SYSTEM.md
// §2): NOVO é aviso (pendência de triagem), EM_TRIAGEM é acao (em andamento), CONVERTIDO é
// concluido (êxito).
const colors: Record<string, string> = {
  NOVO: "bg-aviso-bg text-aviso border-aviso/25",
  EM_TRIAGEM: "bg-acao-bg text-acao border-acao/25",
  CONVERTIDO: "bg-concluido-bg text-concluido border-concluido/25",
  ARQUIVADO: "bg-sf-apoio text-tx-2 border-regua",
  RASCUNHO: "bg-sf-apoio text-tx-2 border-regua",
};

export default function MobileAttendanceStatusSelect({ attendanceId, status }: { attendanceId: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Garante que o status atual sempre apareça como opção, mesmo se for um valor
  // (ex.: RASCUNHO) fora da lista normal de destino de mudança de status.
  const allOptions = options.includes(status) ? options : [status, ...options];

  return (
    <select
      value={status}
      disabled={pending}
      onChange={(e) =>
        startTransition(async () => {
          await updateAttendanceStatus(attendanceId, e.target.value);
          router.refresh();
        })
      }
      className={`text-xs font-semibold px-3 py-1.5 rounded-full border cursor-pointer disabled:opacity-50 ${colors[status] ?? colors.ARQUIVADO}`}
    >
      {allOptions.map((o) => (
        <option key={o} value={o}>
          {labels[o] ?? o.replace("_", " ")}
        </option>
      ))}
    </select>
  );
}
