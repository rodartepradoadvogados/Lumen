import { requirePlatformAccess } from "@/lib/platformMember";
import { PAINEL_MESTRE_THEME_INIT_SCRIPT } from "@/lib/painelMestreTheme";
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
    // "painel-mestre-shell" substitui o `dark`/`bg-grafite-900`/`text-white` cravados que existiam
    // aqui antes desta rodada — mesma técnica auto-contida de `.portal-shell`/`.mobile-shell` (ver
    // app/globals.css e DESIGN.md, seção "Painel da Empresa"). Rail e TopStrip continuam grafite
    // fixo (não usam os tokens que retemam aqui), só o conteúdo dentro de `<main>` muda de tema.
    <div id="painel-mestre-shell" className="painel-mestre-shell min-h-screen flex">
      {/* eslint-disable-next-line react/no-danger -- PAINEL_MESTRE_THEME_INIT_SCRIPT é string
          100% estática (lib/painelMestreTheme.ts), nenhum dado de usuário entra aqui. */}
      <script dangerouslySetInnerHTML={{ __html: PAINEL_MESTRE_THEME_INIT_SCRIPT }} />
      <LumenNavRail />
      <div className="flex-1 flex flex-col min-w-0">
        <LumenTopStrip memberName={access.name} />
        <InactivityNotice />
        <main className="flex-1 overflow-y-auto scrollbar-thin">{children}</main>
      </div>
    </div>
  );
}
