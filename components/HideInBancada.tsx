"use client";

import type { ReactNode } from "react";
import { useViewMode } from "@/components/ViewModeProvider";

// Some por completo no modo de visualização Bancada — usado pela TopBar (components/TopBar.tsx)
// pra esconder o cluster de ações (Peticionar/Novo/Timesheet/Alertas/avatar), que nesse modo já
// aparece mais acima, dentro da faixa de menus (components/TopBarActions.tsx). Mesmo padrão de
// components/InternalTabsBar.tsx (que já some sozinho em Bancada pelo mesmo motivo de duplicidade).
export default function HideInBancada({ children }: { children: ReactNode }) {
  const { viewMode } = useViewMode();
  if (viewMode === "bancada") return null;
  return <>{children}</>;
}
