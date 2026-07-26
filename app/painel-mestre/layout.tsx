import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import LumenNavRail from "@/components/painelMestre/LumenNavRail";
import LumenTopStrip from "@/components/painelMestre/LumenTopStrip";
import InactivityNotice from "@/components/InactivityNotice";

export const dynamic = "force-dynamic";

export default async function PainelMestreLayout({ children }: { children: React.ReactNode }) {
  // ignoreActing: true — a checagem de isPlatformOwner é sobre a IDENTIDADE REAL da sessão,
  // nunca sobre um officeId trocado por "atuar como" (mesmo princípio de
  // lib/officeActing.ts). Sem isso, alguém "atuando como" outro escritório poderia,
  // em tese, herdar acesso ao Painel da Empresa por engano.
  const viewer = await getCurrentUser({ ignoreActing: true });
  if (!viewer) redirect("/");
  if (!viewer.isPlatformOwner) redirect("/painel");

  return (
    <div className="dark min-h-screen bg-navy-950 dark:bg-navy-950 text-cream-50 dark:text-cream-50 flex">
      <LumenNavRail />
      <div className="flex-1 flex flex-col min-w-0">
        <LumenTopStrip memberName={viewer.name} />
        <InactivityNotice />
        <main className="flex-1 overflow-y-auto scrollbar-thin">{children}</main>
      </div>
    </div>
  );
}
