"use client";

import { useRouter } from "next/navigation";
import MobileNewTaskForm from "@/components/mobile/MobileNewTaskForm";

// Usado por /m/agenda?novo=1&tipo=... para criar um compromisso avulso (sem processo
// vinculado) direto da home. Depois de criar, volta para /m/agenda sem os parâmetros,
// onde o compromisso recém-criado já aparece na lista do dia.
export default function MobileAgendaQuickCreate({ defaultType }: { defaultType: string }) {
  const router = useRouter();

  return (
    <MobileNewTaskForm
      defaultType={defaultType}
      defaultOpen
      onCreated={() => router.push("/m/agenda")}
    />
  );
}
