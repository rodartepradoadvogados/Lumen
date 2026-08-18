import { requirePlatformAccess } from "@/lib/platformMember";
import LumenNavRail from "@/components/painelMestre/LumenNavRail";
import LumenTopStrip from "@/components/painelMestre/LumenTopStrip";
import InactivityNotice from "@/components/InactivityNotice";

export const dynamic = "force-dynamic";

export default async function PainelMestreLayout({ children }: { children: React.ReactNode }) {
  // requirePlatformAccess já usa ignoreActing internamente (a checagem é sobre a IDENTIDADE REAL
  // da sessão, nunca sobre um officeId trocado por "atuar como" — mesmo princípio de
  // lib/officeActing.ts) e cobre dono da plataforma E membro de equipe cadastrado (achado A12 da
  // revisão gauntlet — antes só o dono entrava aqui).
  const access = await requirePlatformAccess();

  return (
    <div className="dark min-h-screen bg-grafite-900 text-white flex">
      <LumenNavRail />
      <div className="flex-1 flex flex-col min-w-0">
        <LumenTopStrip memberName={access.name} />
        <InactivityNotice />
        <main className="flex-1 overflow-y-auto scrollbar-thin">{children}</main>
      </div>
    </div>
  );
}
