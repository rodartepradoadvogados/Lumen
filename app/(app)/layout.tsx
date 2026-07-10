import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import { getCurrentUser } from "@/lib/currentUser";

// TopBar consulta o banco em toda renderização (alertas, usuário logado) — nunca pré-renderizar estaticamente.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // O middleware só valida a assinatura do token (roda no Edge, sem acesso ao banco).
  // Aqui confirmamos que o usuário da sessão ainda existe/está ativo antes de liberar o app.
  const user = await getCurrentUser();
  if (!user || !user.active) {
    redirect("/login");
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar hasFinanceAccess={user.isAdmin || user.financeAccess} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 overflow-y-auto scrollbar-thin">{children}</main>
      </div>
    </div>
  );
}
