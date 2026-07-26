"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { endSupportAccessAsOffice } from "@/lib/actions/supportAccess";

// Botão "Encerrar agora" usado na página de transparência (app/(app)/configuracoes/acessos) —
// mesma ação usada na faixa de aviso (components/SupportAccessBannerClient.tsx), só que num
// estilo de botão normal de card em vez de faixa. Qualquer usuário do escritório pode clicar:
// é o cliente no controle, não o fornecedor.
export default function EndSupportAccessButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await endSupportAccessAsOffice(sessionId);
          router.refresh();
        })
      }
      className="inline-flex items-center gap-1.5 bg-bordo-700 hover:bg-bordo-600 text-cream-50 text-xs font-semibold rounded-lg px-3 py-2 disabled:opacity-50 shrink-0"
    >
      <X size={13} /> Encerrar agora
    </button>
  );
}
