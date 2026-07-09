import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card } from "@/components/ui";
import { Users, Scale as ScaleIcon, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ContatosPage() {
  const [clients, lawyers] = await Promise.all([
    prisma.client.count(),
    prisma.lawyer.count(),
  ]);

  const modules = [
    { href: "/contatos/clientes", label: "Clientes", icon: Users, count: clients, desc: "Base de clientes do escritório" },
    { href: "/contatos/advogados", label: "Advogados", icon: ScaleIcon, count: lawyers, desc: "Parceiros e adversos" },
  ];

  return (
    <div className="p-6 max-w-[1200px] mx-auto animate-fade-in">
      <PageHeader title="Contatos" subtitle="Banco de dados de clientes e advogados" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {modules.map((m) => (
          <Link key={m.href} href={m.href}>
            <Card className="p-5 h-full hover:shadow-pop transition-shadow">
              <div className="flex items-start justify-between">
                <div className="p-2.5 rounded-lg bg-navy-900/5 text-navy-800">
                  <m.icon size={20} />
                </div>
                <ArrowRight size={16} className="text-navy-800/30" />
              </div>
              <h3 className="font-serif font-bold text-navy-900 mt-3">{m.label}</h3>
              <p className="text-xs text-navy-800/50 mt-1 mb-2">{m.desc}</p>
              <p className="text-2xl font-serif font-bold text-gold-700">{m.count}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
