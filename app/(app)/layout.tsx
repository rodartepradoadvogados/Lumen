import { Suspense } from "react";
import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import ClaudeAssistantWidget from "@/components/ClaudeAssistantWidget";
import InactivityNotice from "@/components/InactivityNotice";
import SiteBackgroundLayer from "@/components/SiteBackgroundLayer";
import AppBadgeSync from "@/components/AppBadgeSync";
import { UndoToastProvider } from "@/components/UndoToastProvider";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";

// TopBar consulta o banco em toda renderização (alertas, usuário logado) — nunca pré-renderizar estaticamente.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // O middleware só valida a assinatura do token (roda no Edge, sem acesso ao banco).
  // Aqui confirmamos que o usuário da sessão ainda existe/está ativo antes de liberar o app.
  const user = await getCurrentUser();
  if (!user || !user.active) {
    redirect("/");
  }

  const unreadPublications = await prisma.publication.count({ where: { read: false, officeId: user.officeId } });

  return (
    <UndoToastProvider>
      <div className="flex h-screen overflow-hidden">
        <InactivityNotice />
        <AppBadgeSync initialCount={unreadPublications} />
        <Suspense fallback={null}>
          <Sidebar hasFinanceAccess={user.isAdmin || user.financeAccess} isAdmin={user.isAdmin} unreadPublications={unreadPublications} />
        </Suspense>
        <div className="flex-1 flex flex-col min-w-0 relative">
          <Suspense fallback={null}>
            <SiteBackgroundLayer />
          </Suspense>
          <TopBar />
          <main className="flex-1 overflow-y-auto scrollbar-thin">{children}</main>
        </div>
        <ClaudeAssistantWidget userName={user.name} />
      </div>
    </UndoToastProvider>
  );
}
