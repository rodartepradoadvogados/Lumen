"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { stopActingAsOffice } from "@/lib/officeActing";
import { Building2, EyeOff, X } from "lucide-react";

export default function ActingOfficeBanner({ officeName }: { officeName: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    // Faixa de aviso persistente (vinho — ação/estado sensível, não cor de dado) — `bg-atencao`
    // troca de tom sozinho entre Manhã e Noite. A linha do Vidro Fosco não introduz cor nova
    // nenhuma — só opacidade sobre o mesmo texto branco.
    <div className="flex flex-col items-center gap-0.5 bg-atencao text-rotulo text-sm font-semibold px-4 py-2 shrink-0">
      <div className="flex items-center justify-center gap-2.5 flex-wrap">
        <Building2 size={15} />
        Você está atuando como <strong>{officeName}</strong>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await stopActingAsOffice();
              router.push("/painel-mestre");
              router.refresh();
            })
          }
          className="inline-flex items-center gap-1 bg-white/15 hover:bg-white/25 rounded-full px-2.5 py-0.5 text-xs disabled:opacity-50"
        >
          <X size={12} /> Sair
        </button>
      </div>
      {/* text-rotulo, não text-white/90. Duas coisas erradas numa classe só: (1) o fundo é
          bg-atencao, que é #670224 no Manhã e #b56f79 no Noite — branco sobre ele mede 3,81:1 no
          Noite e reprova AA; (2) a opacidade NÃO funcionaria de qualquer jeito: `/90` sobre uma
          cor vinda de `var()` não é aplicada pelo Tailwind — é a armadilha de opacidade já
          documentada em DESIGN.md. A raiz deste mesmo componente já usava `text-rotulo`; esta
          linha filha é que destoava. */}
      <div className="flex items-center justify-center gap-1.5 text-xs font-normal text-rotulo text-center">
        <EyeOff size={12} className="shrink-0" />
        Modo Vidro Fosco: nomes, valores e conteúdo estão mascarados.
      </div>
    </div>
  );
}
