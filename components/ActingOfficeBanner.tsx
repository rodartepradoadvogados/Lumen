"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { stopActingAsOffice } from "@/lib/officeActing";
import { Building2, X } from "lucide-react";

export default function ActingOfficeBanner({ officeName }: { officeName: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center justify-center gap-2.5 bg-bordo-700 dark:bg-bordo-600 text-cream-50 text-sm font-semibold px-4 py-2 shrink-0">
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
  );
}
