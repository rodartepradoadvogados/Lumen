import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { PageHeader, Card } from "@/components/ui";
import { Users, Scale as ScaleIcon, ArrowRight, Truck, UserCog } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ContatosPage() {
  const viewer = await getCurrentUser();
  if (!viewer) notFound();

  const [clients, lawyers, suppliers, team] = await Promise.all([
    prisma.client.count({ where: { officeId: viewer.officeId } }),
    prisma.lawyer.count({ where: { officeId: viewer.officeId } }),
    prisma.supplier.count({ where: { officeId: viewer.officeId } }),
    prisma.user.count({ where: { officeId: viewer.officeId } }),
  ]);

  // Os 4 cards do hub usam o mesmo chip neutro — a paleta nova reserva cor com significado
  // (marca, ação, severidade); uma cor de destaque por card era só variedade decorativa, que a
  // migração remove (ver DESIGN-SYSTEM.md §0/§2).
  const iconClass = "bg-sf-apoio text-tx-2";
  const modules = [
    {
      href: "/contatos/clientes",
      label: "Clientes",
      icon: Users,
      count: clients,
      desc: "Base de clientes do escritório",
      iconClass,
    },
    {
      href: "/contatos/advogados",
      label: "Advogados",
      icon: ScaleIcon,
      count: lawyers,
      desc: "Parceiros e adversos",
      iconClass,
    },
    {
      href: "/contatos/fornecedores",
      label: "Fornecedores",
      icon: Truck,
      count: suppliers,
      desc: "Fornecedores usados no Financeiro",
      iconClass,
    },
    {
      href: "/contatos/equipe",
      label: "Equipe",
      icon: UserCog,
      count: team,
      desc: "Membros do escritório",
      iconClass,
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
                <ArrowRight size={16} className="text-tx-3" />
              </div>
              <h3 className="font-bold text-tx mt-3">{m.label}</h3>
              <p className="text-xs text-tx-3 mt-1 mb-2">{m.desc}</p>
              <p className="text-2xl font-bold text-acao tabular-nums">{m.count}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
