import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card } from "@/components/ui";
import { Users, Scale as ScaleIcon, ArrowRight, Truck, UserCog } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ContatosPage() {
  const [clients, lawyers, suppliers, team] = await Promise.all([
    prisma.client.count(),
    prisma.lawyer.count(),
    prisma.supplier.count(),
    prisma.user.count(),
  ]);

  // Cada módulo tem uma cor de destaque própria (dourado/bordô/navy/magenta), só
  // pra diferenciar visualmente os 4 cards do hub — sem significado funcional.
  const modules = [
    {
      href: "/contatos/clientes",
      label: "Clientes",
      icon: Users,
      count: clients,
      desc: "Base de clientes do escritório",
      iconClass: "bg-gold-500/15 text-gold-700 dark:bg-gold-400/15 dark:text-gold-400",
    },
    {
      href: "/contatos/advogados",
      label: "Advogados",
      icon: ScaleIcon,
      count: lawyers,
      desc: "Parceiros e adversos",
      iconClass: "bg-bordo-500/15 text-bordo-600 dark:bg-bordo-400/15 dark:text-bordo-400",
    },
    {
      href: "/contatos/fornecedores",
      label: "Fornecedores",
      icon: Truck,
      count: suppliers,
      desc: "Fornecedores usados no Financeiro",
      iconClass: "bg-navy-900/10 text-navy-900 dark:bg-white/10 dark:text-cream-50",
    },
    {
      href: "/contatos/equipe",
      label: "Equipe",
      icon: UserCog,
      count: team,
      desc: "Membros do escritório",
      iconClass: "bg-magenta-500/15 text-magenta-700 dark:bg-magenta-400/15 dark:text-magenta-400",
    },
  ];

  return (
    <div className="p-6 max-w-[1200px] mx-auto animate-fade-in">
      <PageHeader title="Contatos" subtitle="Banco de dados de clientes e advogados" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {modules.map((m) => (
          <Link key={m.href} href={m.href}>
            <Card className="p-5 h-full hover:shadow-pop transition-shadow">
              <div className="flex items-start justify-between">
                <div className={`p-3.5 rounded-full ${m.iconClass}`}>
                  <m.icon size={28} />
                </div>
                <ArrowRight size={16} className="text-navy-800/30 dark:text-cream-50/30" />
              </div>
              <h3 className="font-serif font-bold text-navy-900 dark:text-cream-50 mt-3">{m.label}</h3>
              <p className="text-xs text-navy-800/50 dark:text-cream-50/50 mt-1 mb-2">{m.desc}</p>
              <p className="text-2xl font-serif font-bold text-gold-700 dark:text-gold-400">{m.count}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
