import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { getOfficeModules } from "@/lib/officeModules";
import ModuleDisabledNotice from "@/components/ModuleDisabledNotice";
import "./atendimento-central.css";

// ============================================================================
// CENTRAL DE ATENDIMENTO — a casca (ETAPA 1 de três; ver o handoff aprovado nos mockups).
//
// Rota PRÓPRIA, fora de app/(app)/ — mesma razão do Peticionamento (ver
// app/peticionamento/layout.tsx): o item "Atendimento" em lib/navSections.ts está marcado
// `abrirEmNovaAba: true`, então esta tela abre numa ABA NOVA do navegador de verdade, nunca
// dentro do AppShell/TopBar do resto do Lúmen — e por isso tem layout e folha de estilo
// próprios (./atendimento-central.css), como o Peticionamento tem os dela.
//
// A TRAVA DE NÍVEL (podeVerAtendimentos) NÃO fica aqui — fica em page.tsx, mesmo padrão de
// app/(app)/atendimento/layout.tsx (só checa o MÓDULO contratado) + app/(app)/atendimento/page.tsx
// (checa o NÍVEL de acesso). Dois portões, dois lugares, como o resto do Atendimento já faz.
//
// AS ROTAS ANTIGAS (/atendimento, /atendimento/funil) CONTINUAM EXISTINDO E FUNCIONANDO — esta
// etapa troca só a navegação; apagar rota é decisão de uma etapa futura.
export const metadata: Metadata = {
  title: "Atendimento | Lúmen",
  description: "Triagem e Atendimentos numa tela só — fila de espera, funil comercial, recusados e a conversa com o lead.",
};

export const dynamic = "force-dynamic";

export default async function AtendimentoCentralLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || !user.active) redirect("/");

  const modules = await getOfficeModules(user.officeId);
  if (!modules.atendimento) {
    return (
      <div className="atd-central min-h-screen">
        <ModuleDisabledNotice moduleName="Atendimento" />
      </div>
    );
  }

  return <div className="atd-central min-h-screen">{children}</div>;
}
