import Link from "next/link";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";
import { getOfficeModules } from "@/lib/officeModules";
import { Card } from "@/components/ui";
import MobileGlobalSearch from "@/components/mobile/MobileGlobalSearch";
import {
  CalendarPlus,
  ListTodo,
  CalendarClock,
  Gavel,
  Stethoscope,
  Phone,
  Search,
  Bell,
  DollarSign,
  Wallet,
  FileBarChart,
  LineChart,
  BookOpen,
  ChevronDown,
  Building2,
  type LucideIcon,
} from "lucide-react";

export const dynamic = "force-dynamic";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

export default async function MobileHome() {
  const user = await getCurrentUser();
  const [unreadCount, assessoriaCount] = await Promise.all([
    user ? prisma.publication.count({ where: { read: false, officeId: user.officeId } }) : Promise.resolve(0),
    user ? prisma.assessoria.count({ where: { status: "ATIVA", officeId: user.officeId } }) : Promise.resolve(0),
  ]);

  const firstName = user?.name.split(" ")[0] ?? "";
  const modules = user ? await getOfficeModules(user.officeId) : { financeiro: false, whatsapp: false, atendimento: false, assessoria: false };
  const showFinance = modules.financeiro && Boolean(user?.isAdmin || user?.financeAccess);

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <div>
        <h1 className="font-serif text-xl font-bold text-navy-900 dark:text-cream-50">
          {greeting()}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="text-sm text-navy-800/50 dark:text-cream-50/50">O que você quer resolver agora?</p>
      </div>

      <MobileGlobalSearch />

      <div className="space-y-3">
        <HubCard
          title="Novo Compromisso"
          icon={CalendarPlus}
          tone="gold"
          defaultOpen
          chips={[
            { href: "/m/agenda?novo=1&tipo=TAREFA", label: "Tarefa", icon: ListTodo, tone: "gold" },
            { href: "/m/agenda?novo=1&tipo=PRAZO", label: "Prazo", icon: CalendarClock, tone: "bordo" },
            { href: "/m/agenda?novo=1&tipo=AUDIENCIA", label: "Audiência", icon: Gavel, tone: "bordo" },
            { href: "/m/agenda?novo=1&tipo=PERICIA", label: "Perícia", icon: Stethoscope, tone: "gold" },
          ]}
        />

        <div className={modules.atendimento ? "grid grid-cols-2 gap-3" : ""}>
          {modules.atendimento && (
            <Link href="/m/atendimento/novo" className="block h-full">
              <Card className="p-4 h-full">
                <span className="h-9 w-9 rounded-lg bg-navy-900/5 dark:bg-white/5 text-navy-800 dark:text-cream-50/80 flex items-center justify-center mb-2.5">
                  <Phone size={17} />
                </span>
                <p className="text-sm font-semibold text-navy-900 dark:text-cream-50">Novo Atendimento</p>
              </Card>
            </Link>
          )}
          <Link href="/m/processos" className="block h-full">
            <Card className="p-4 h-full">
              <span className="h-9 w-9 rounded-lg bg-navy-900/5 dark:bg-white/5 text-navy-800 dark:text-cream-50/80 flex items-center justify-center mb-2.5">
                <Search size={17} />
              </span>
              <p className="text-sm font-semibold text-navy-900 dark:text-cream-50">Buscar Processo</p>
            </Card>
          </Link>
        </div>

        <Link href="/m/publicacoes" className="block">
          <Card className="p-4 flex items-center gap-3">
            <span className="h-10 w-10 rounded-lg bg-bordo-500/15 dark:bg-bordo-400/10 text-bordo-600 dark:text-bordo-400 flex items-center justify-center shrink-0">
              <Bell size={18} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-navy-900 dark:text-cream-50">Publicações / Andamentos</p>
              <p className="text-xs text-navy-800/50 dark:text-cream-50/50">{unreadCount} não lida(s)</p>
            </div>
            {unreadCount > 0 && (
              <span className="min-w-[24px] h-6 px-1.5 rounded-full bg-bordo-600 dark:bg-bordo-500 text-white text-xs font-bold flex items-center justify-center shrink-0">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Card>
        </Link>

        {modules.assessoria && (
          <Link href="/m/assessoria" className="block">
            <Card className="p-4 flex items-center gap-3">
              <span className="h-10 w-10 rounded-lg bg-gold-500/15 dark:bg-gold-400/10 text-gold-700 dark:text-gold-400 flex items-center justify-center shrink-0">
                <Building2 size={18} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-navy-900 dark:text-cream-50">Assessoria Jurídica</p>
                <p className="text-xs text-navy-800/50 dark:text-cream-50/50">{assessoriaCount} empresa(s) ativa(s)</p>
              </div>
            </Card>
          </Link>
        )}

        {showFinance && (
          <HubCard
            title="Financeiro"
            icon={DollarSign}
            tone="bordo"
            chips={[
              { href: "/m/financeiro/contas-a-pagar", label: "Contas a Pagar", icon: Wallet, tone: "bordo" },
              { href: "/m/financeiro/contas-a-receber", label: "Contas a Receber", icon: Wallet, tone: "gold" },
              { href: "/m/financeiro/relatorios", label: "Relatórios Gerenciais", icon: FileBarChart, tone: "gold" },
              { href: "/m/financeiro/fluxo-de-caixa", label: "Fluxo de Caixa", icon: LineChart, tone: "gold" },
              { href: "/m/financeiro/dre", label: "DRE", icon: FileBarChart, tone: "gold" },
              { href: "/m/financeiro/livro-caixa", label: "Livro Caixa", icon: BookOpen, tone: "gold" },
            ]}
          />
        )}
      </div>
    </div>
  );
}

type Tone = "gold" | "bordo";

type Chip = { href: string; label: string; icon: LucideIcon; tone: Tone };

// Hub suspenso (<details>/<summary>): expande mostrando chips de atalho, com uma sombra
// discreta de flutuação quando aberto (open:shadow-pop).
function HubCard({
  title,
  icon: Icon,
  tone,
  chips,
  defaultOpen,
}: {
  title: string;
  icon: LucideIcon;
  tone: Tone;
  chips: Chip[];
  defaultOpen?: boolean;
}) {
  const iconToneClasses =
    tone === "bordo"
      ? "bg-bordo-500/15 dark:bg-bordo-400/10 text-bordo-600 dark:text-bordo-400"
      : "bg-gold-500/15 dark:bg-gold-400/10 text-gold-700 dark:text-gold-400";

  return (
    <details
      open={defaultOpen}
      className="group rounded-xl2 border border-navy-800/8 dark:border-white/10 bg-white dark:bg-navy-900 shadow-card open:shadow-pop transition-shadow"
    >
      <summary className="flex items-center gap-3 px-4 py-3.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <span className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${iconToneClasses}`}>
          <Icon size={18} />
        </span>
        <span className="flex-1 text-sm font-semibold text-navy-900 dark:text-cream-50">{title}</span>
        <ChevronDown
          size={16}
          className="text-navy-800/30 dark:text-cream-50/30 transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="px-4 pb-4 grid grid-cols-2 gap-2">
        {chips.map((chip) => (
          <HubChip key={chip.href} {...chip} />
        ))}
      </div>
    </details>
  );
}

function HubChip({ href, label, icon: Icon, tone }: Chip) {
  const toneClasses =
    tone === "bordo"
      ? "bg-bordo-500/10 text-bordo-700 border-bordo-500/20 dark:bg-bordo-400/10 dark:text-bordo-400 dark:border-bordo-400/25"
      : "bg-gold-500/10 text-gold-800 border-gold-500/25 dark:bg-gold-400/10 dark:text-gold-400 dark:border-gold-400/25";

  return (
    <Link
      href={href}
      className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-semibold transition-colors ${toneClasses}`}
    >
      <Icon size={15} className="shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}
