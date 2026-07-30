import Link from "next/link";
import { getCurrentUser } from "@/lib/currentUser";
import { getOfficeModules } from "@/lib/officeModules";
import { logout } from "@/lib/actions/auth";
import { Card } from "@/components/ui";
import MobileInstallMenuItem from "@/components/mobile/MobileInstallMenuItem";
import { Phone, DollarSign, BarChart, Settings, LogOut, Lock, Newspaper, Briefcase, User } from "lucide-react";

export const dynamic = "force-dynamic";

const TILE_COLORS = {
  bordo: "bg-bordo-700/10 text-bordo-700 dark:bg-bordo-400/15 dark:text-bordo-400",
  gold: "bg-gold-500/10 text-gold-700 dark:bg-gold-400/15 dark:text-gold-400",
  navy: "bg-navy-900/8 text-navy-800 dark:bg-white/10 dark:text-cream-50",
} as const;

export default async function MobileMais() {
  const viewer = await getCurrentUser();
  const modules = viewer ? await getOfficeModules(viewer.officeId) : { financeiro: false, whatsapp: false, atendimento: false, assessoria: false };
  const showFinance = modules.financeiro && Boolean(viewer?.isAdmin || viewer?.financeAccess);
  const initials = viewer ? viewer.name.split(" ").map((n) => n[0]).slice(0, 2).join("") : "??";

  const items = [
    // Processos saiu da barra inferior (ver components/mobile/MobileBottomNav.tsx) — continua
    // a 1 toque na grade da Início, e ganha este atalho aqui pelo mesmo motivo de Publicações
    // logo abaixo: garantir que dá pra chegar lá de qualquer tela, não só da Início.
    { href: "/m/processos", label: "Processos", Icon: Briefcase, color: "navy" as const, show: true },
    // A aba do sino no menu inferior leva pra Central de Alertas (/m/alertas), não mais
    // direto pra Publicações — este atalho garante que Publicações continue alcançável a
    // partir do menu inferior existente (além do card na Início).
    { href: "/m/publicacoes", label: "Publicações", Icon: Newspaper, color: "navy" as const, show: true },
    { href: "/m/atendimento", label: "Atendimento", Icon: Phone, color: "bordo" as const, show: modules.atendimento },
    { href: "/m/financeiro", label: "Financeiro", Icon: DollarSign, color: "gold" as const, show: showFinance },
    { href: "/m/relatorios", label: "Relatórios", Icon: BarChart, color: "navy" as const, show: true },
    // Nome/foto do perfil saíram do cabeçalho (ver app/m/layout.tsx) — este é o único caminho
    // pra /m/perfil agora, então precisa continuar aqui mesmo o card acima já mostrando nome/foto.
    { href: "/m/perfil", label: "Meu Perfil", Icon: User, color: "navy" as const, show: true },
    { href: "/m/configuracoes", label: "Configurações", Icon: Settings, color: "navy" as const, show: true },
    // Só Jairo e Rodrigo (donos da plataforma) veem este item — mesma condição do cadeado na
    // TopBar do desktop (components/TopBar.tsx). Leva para /painel-mestre, a área da empresa
    // Lúmen, fora do escritório Rodarte Prado Advogados.
    { href: "/painel-mestre", label: "Painel Mestre", Icon: Lock, color: "bordo" as const, show: viewer?.isPlatformOwner ?? false },
  ].filter((i) => i.show);

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <h1 className="font-serif text-xl font-bold text-navy-900 dark:text-cream-50">Mais</h1>

      {viewer && (
        <div className="flex items-center gap-3 px-1">
          <div className="h-12 w-12 rounded-full bg-navy-800 text-gold-400 flex items-center justify-center text-sm font-serif font-bold shrink-0">
            {initials}
          </div>
          <div>
            <p className="font-serif font-bold text-navy-900 dark:text-cream-50 leading-tight">{viewer.name}</p>
            {viewer.role && (
              <span className="inline-block mt-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-bordo-700/10 text-bordo-700 dark:bg-bordo-400/15 dark:text-bordo-400">
                {viewer.role}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {items.map(({ href, label, Icon, color }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col gap-5 bg-white dark:bg-navy-900 border border-navy-800/8 dark:border-white/10 rounded-2xl p-4"
          >
            <span className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${TILE_COLORS[color]}`}>
              <Icon size={18} />
            </span>
            <span className="text-sm font-bold text-navy-900 dark:text-cream-50">{label}</span>
          </Link>
        ))}
      </div>

      <Card>
        <MobileInstallMenuItem />
      </Card>

      <form action={logout}>
        <button
          type="submit"
          className="w-full flex items-center justify-center gap-2 border border-bordo-700/30 dark:border-bordo-400/30 text-bordo-700 dark:text-bordo-400 font-semibold text-sm py-3 rounded-xl"
        >
          <LogOut size={16} /> Sair
        </button>
      </form>
    </div>
  );
}
