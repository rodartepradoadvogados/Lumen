"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAttendanceStatus } from "@/lib/actions/attendance";
import { attendanceStatusLabels } from "@/lib/atendimentoStatus";

const options = ["NOVO", "EM_TRIAGEM", "CONVERTIDO", "ARQUIVADO"];

// Tokens semânticos (trocam de tema sozinhos, sem variante `dark:` própria — ver DESIGN-SYSTEM.md
// §2): NOVO é aviso (pendência de triagem), EM_TRIAGEM é acao (em andamento), CONVERTIDO é
// concluido (êxito).
const colors: Record<string, string> = {
  NOVO: "bg-aviso-bg text-aviso border-linha-aviso",
  EM_TRIAGEM: "bg-acao-bg text-marca-tx border-marca-tx",
  CONVERTIDO: "bg-concluido-bg text-concluido border-linha-concluido",
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
      // 2px e 44px, como todo controle da casa. Era pílula (`rounded-full`) e media ~30px — a mesma
      // dupla de defeitos que a guia do PWA corrigiu em seis telas e que esta ficou de fora.
      // AS CORES aqui ficam: elas dizem ESTADO (aguardando triagem, em andamento, êxito), que é
      // vocabulário de risco, e não categoria de conteúdo — é o uso legítimo da regra.
      className={`text-corpo font-semibold px-3 py-1.5 min-h-[44px] rounded-[2px] border cursor-pointer disabled:opacity-50 ${colors[status] ?? colors.ARQUIVADO}`}
    >
      {allOptions.map((o) => (
        <option key={o} value={o}>
          {attendanceStatusLabels[o] ?? o}
        </option>
      ))}
    </select>
  );
}
