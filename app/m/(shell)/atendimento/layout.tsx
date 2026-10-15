import { getCurrentUser } from "@/lib/currentUser";
import { getOfficeModules } from "@/lib/officeModules";
import ModuleDisabledNotice from "@/components/ModuleDisabledNotice";

// Mesmo gate de app/(app)/atendimento/layout.tsx, que faltava aqui: só a listagem (page.tsx)
// checava o módulo — /m/atendimento/[id] e /m/atendimento/novo abriam mesmo com Atendimento
// desligado.
export default async function MobileAtendimentoLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) return <>{children}</>;

  const modules = await getOfficeModules(user.officeId);
  if (!modules.atendimento) {
    return <ModuleDisabledNotice moduleName="Atendimento" />;
  }

  // ACABAMENTO DO APP DE ATENDIMENTO dentro do PWA geral (DESIGN.md §9, 15/10/2026): o escopo dos
  // tokens --atd-* (ouro, pílula, balão) vale só no Atendimento; o resto do /m continua o sistema
  // "Guias". O tema segue o do PWA (`.mobile-dark` na casca → bloco Noite do app, app/globals.css).
  return <div className="atendimento-shell atd-tema-do-pwa min-h-full bg-atd-tela text-tx">{children}</div>;
}
