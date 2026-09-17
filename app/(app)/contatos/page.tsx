import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { PageHeader } from "@/components/ui";
import { Users, Scale as ScaleIcon, Truck, UserCog } from "lucide-react";

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
    <div className="tela">
      <PageHeader title="Contatos" subtitle="Banco de dados de clientes e advogados" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {modules.map((m) => (
          <Link key={m.href} href={m.href}>
            {/* Elevação no hover saiu: a casa trocou altura por filete de 2px em F3, e não há um
                `box-shadow` sequer nas telas do produto — este cartão era o último a levantar. A
                resposta agora é a régua, igual à dos cartões de preço do site e da faixa de
                /assessoria/[id]. O círculo do ícone virou quadrado de 2px, que é o raio da casa;
                o redondo era a única forma circular do produto inteiro. E a contagem passa para a
                rampa nomeada. */}
            <div className="h-full bg-sf border-2 border-regua-forte rounded-[2px] p-5 transition-[border-color,background-color] duration-100 ease-out hover:border-acao hover:bg-acao-bg">
              <div className={`inline-flex p-3 rounded-[2px] ${m.iconClass}`}>
                <m.icon size={24} strokeWidth={1.5} />
              </div>
              <h3 className="text-destaque font-bold text-tx mt-3">{m.label}</h3>
              <p className="text-etiqueta text-tx-3 mt-1 mb-3">{m.desc}</p>
              <p className="text-guia font-bold text-marca-tx tabular-nums">{m.count}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
