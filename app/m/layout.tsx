import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, Menu } from "lucide-react";
import { getCurrentUser } from "@/lib/currentUser";
import { getCurrentSessionElapsedSeconds } from "@/lib/timesheet";
import { prisma } from "@/lib/prisma";
import MobileBottomNav from "@/components/mobile/MobileBottomNav";
import InstallPrompt from "@/components/mobile/InstallPrompt";
import MobileThemeToggle from "@/components/mobile/MobileThemeToggle";
import TimesheetTimer from "@/components/TimesheetTimer";
import InactivityNotice from "@/components/InactivityNotice";
import AppBadgeSync from "@/components/AppBadgeSync";
import LumenMark from "@/components/LumenMark";
import SupportAccessBanner from "@/components/SupportAccessBanner";
import OfficeSuspendedNotice from "@/components/OfficeSuspendedNotice";
import { UndoToastProvider } from "@/components/UndoToastProvider";
import { getAlertsCount, getTodayAgendaCount } from "@/lib/alerts";
import { getOfficeModules } from "@/lib/officeModules";

export const dynamic = "force-dynamic";

// Aplica a classe `mobile-dark` no nó #mobile-shell (não mais `dark` em <html>) de forma
// síncrona, antes do resto da árvore renderizar, para evitar o "flash" de tema errado. Mudança
// desta rodada (Portal Noturno estendido ao PWA, ver .impeccable/plano-portal/andamento-portal.md
// e ".mobile-shell" em app/globals.css): a Noite do PWA agora usa a paleta aproximada do Dracula
// (mesmos valores do portal), diferente da Noite do site público — por isso não pode mais
// compartilhar a classe global `.dark` de <html> (mudaria o tema escuro do site também). Chave de
// localStorage continua "rp-mobile-theme" (independente de "rp-site-theme", mesmo motivo de
// sempre — ver components/mobile/MobileThemeToggle.tsx), e o padrão continua "light" (Manhã):
// diferente do portal, o PWA não trocou o padrão, só ganhou a opção de Noite com a paleta nova.
// Como #mobile-shell é um nó só nosso (não herda nada do script de tema do site), basta ADICIONAR
// a classe quando preciso — sem risco do script do site interferir aqui. "auto" (extinto modo
// Tarde) continua migrando para escuro, mesma regra de sempre.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("rp-mobile-theme");
    var el = document.getElementById("mobile-shell");
    if (el && (stored === "dark" || stored === "auto")) el.classList.add("mobile-dark");
  } catch (e) {}
})();
`;

export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  // Auth (assinatura do token) já é garantida pelo middleware global, que roda no Edge sem
  // acesso ao banco — por isso não pega uma conta desativada DEPOIS de o token já emitido
  // (até 30 dias de validade). O layout do site (app/(app)/layout.tsx) já reconferia isso a
  // cada requisição; aqui não conferia, e um usuário desativado continuava com acesso total
  // pelo PWA até o token expirar.
  const user = await getCurrentUser();
  if (!user || !user.active) redirect("/");

  // Escritório suspenso/cancelado por inadimplência (Painel Mestre): mesmo gate do site
  // (app/(app)/layout.tsx), que faltava aqui — o bloqueio de cobrança só existia no desktop,
  // e o PWA continuava de pé pro escritório inteiro.
  const office = await prisma.office.findUnique({ where: { id: user.officeId }, select: { status: true, name: true } });
  if (office && office.status !== "ATIVA" && !user.isPlatformOwner) {
    return <OfficeSuspendedNotice officeName={office.name} />;
  }

  const hasFinanceAccess = Boolean(user.isAdmin || user.financeAccess);
  // Contagem TOTAL de alertas (menções, prazos vencidos, tarefas delegadas, contas vencidas,
  // publicações não lidas etc. — ver lib/alerts.ts) — alimenta o badge do ícone do PWA
  // (AppBadgeSync) e o badge do sino no cabeçalho (a aba "Alertas" saiu da barra inferior no
  // documento 08, o sino é o único caminho até /m/alertas agora). A contagem específica de
  // Publicações (usada no card próprio dela) já é buscada por app/m/page.tsx e
  // app/m/publicacoes/page.tsx, não precisa duplicar aqui.
  const [totalAlerts, todayAgendaCount, sessionSeconds, modules] = await Promise.all([
    getAlertsCount(user.officeId, hasFinanceAccess, user.id, user.isAdmin),
    // Compromissos que vencem HOJE (mesmo critério do reforço "Hoje" do Painel) — alimenta a
    // bolinha da aba "Agenda" na barra inferior (documento 08).
    getTodayAgendaCount(user.officeId),
    getCurrentSessionElapsedSeconds(user.id),
    // Alimenta o menu do "+" central (MobileBottomNav -> MobileNewEntitySheet): Atendimento e
    // Assessoria só aparecem como opção de cadastro se o módulo estiver contratado.
    getOfficeModules(user.officeId),
  ]);

  return (
    <UndoToastProvider>
    <div id="mobile-shell" className="mobile-shell min-h-screen bg-sf-fundo transition-colors">
      {/* eslint-disable-next-line react/no-danger -- THEME_INIT_SCRIPT é string 100% estática
          (definida logo acima neste arquivo), nenhum dado de usuário entra aqui. */}
      <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      <InactivityNotice />
      <AppBadgeSync initialCount={totalAlerts} />
      {/* `sticky` (não `fixed`) de propósito: empilhado num flex-col junto com a faixa de
          suporte abaixo, este bloco fica colado no topo ao rolar sem precisar saber de
          antemão se a faixa vai aparecer ou não — quando ela existe, empurra o cabeçalho pra
          baixo sozinha (ocupa espaço no fluxo normal); quando não existe, o cabeçalho fica
          exatamente onde ficava antes. Isso também elimina o precisar compensar a altura no
          `<main>` com um pt-[52px] fixo (o antigo cabeçalho `fixed` exigia isso). */}
      <div className="sticky top-0 inset-x-0 z-40 flex flex-col">
        <SupportAccessBanner />
        {/* Cabeçalho sempre grafite, nos 2 temas (Manhã/Noite) — mesma casca fixa do Rail
            desktop (DESIGN-SYSTEM.md §3: "grafite nos dois temas"), de propósito sem classes
            `dark:`, pra não mudar de cor junto com o resto da tela. Nome+foto do perfil saiu
            daqui — agora é só logo/nome do escritório + Alertas/Tema, pra bater com a proposta
            de Início nova; Perfil segue acessível por Menu (Mais). */}
        <header className="min-h-[52px] shrink-0 bg-gaveta border-b border-gaveta-linha text-gaveta-tinta flex items-center justify-between gap-2 px-4 py-2">
          <Link href="/m" className="flex items-center gap-2 min-w-0">
            <LumenMark size={24} />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold tracking-wide text-gaveta-tinta">LÚMEN</span>
                <span className="h-1.5 w-1.5 rounded-full bg-concluido shrink-0" aria-hidden="true" />
              </div>
              {office?.name && (
                <p className="text-corpo text-gaveta-tinta/55 truncate max-w-[160px] leading-tight">{office.name}</p>
              )}
            </div>
          </Link>
          <div className="flex items-center gap-1.5 shrink-0">
            <Link
              href="/m/alertas"
              aria-label={`Central de Alertas${totalAlerts > 0 ? `, ${totalAlerts} pendente(s)` : ""}`}
              className="relative h-11 w-11 shrink-0 rounded-full flex items-center justify-center text-gaveta-tinta-2 hover:text-rail-marca hover:bg-gaveta-fundo transition-colors"
            >
              {/* Emoji só quando há pendência de verdade (pedido do dono do projeto ao validar
                  o protótipo) — sem pendência, continua o ícone de linha neutro de sempre. */}
              {totalAlerts > 0 ? (
                <span aria-hidden="true" className="text-destaque leading-none">🔔</span>
              ) : (
                <Bell size={16} />
              )}
              {totalAlerts > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-atencao text-gaveta-tinta text-corpo font-bold flex items-center justify-center border border-gaveta">
                  {totalAlerts > 99 ? "99+" : totalAlerts}
                </span>
              )}
            </Link>
            <MobileThemeToggle />
            {/* Documento 08 (Fase 4 — PWA): a barra inferior vira 5 abas (Publicações/Agenda/
                Novo Atendimento/Processo/Financeiro) e "Menu" (Mais) sai dela — este ícone é o
                novo único caminho até /m/mais (Configurações, Perfil, Relatórios, Contatos,
                Painel Mestre continuam todos lá, intactos). */}
            <Link
              href="/m/mais"
              aria-label="Menu"
              className="h-11 w-11 shrink-0 rounded-full flex items-center justify-center text-gaveta-tinta-2 hover:text-rail-marca hover:bg-gaveta-fundo transition-colors"
            >
              <Menu size={18} />
            </Link>
            {/* Ping silencioso de timesheet: o componente fica "hidden lg:flex" (nunca visível
                na largura do app mobile), mas mantém o mecanismo de contagem de sessão do dia
                rodando aqui também, já que este layout antes não contabilizava tempo de uso. */}
            <TimesheetTimer initialSeconds={sessionSeconds} />
          </div>
        </header>
      </div>

      <main className="pb-20 min-h-screen max-w-md mx-auto">{children}</main>

      <MobileBottomNav todayAgendaCount={todayAgendaCount} modules={modules} />
      <InstallPrompt />
    </div>
    </UndoToastProvider>
  );
}
