import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/currentUser";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AtendimentoAppShell from "./AtendimentoAppShell";

export const dynamic = "force-dynamic";

// Manifesto próprio do PWA de Atendimento (ver app/atendimento-app/manifest.webmanifest/route.ts)
// — sem isso, estas rotas herdavam o manifesto padrão do app mobile (app/manifest.ts) e instalar
// pelo link do Atendimento instalava o mesmo app mobile geral. `appleWebApp.title` cobre o nome
// mostrado ao "Adicionar à Tela de Início" no Safari (que não lê o manifesto). `icons` aponta
// direto para os PNGs em public/icons-atendimento/ (já públicos, ver middleware.ts) em vez de usar
// a convenção icon.png/apple-icon.png aninhada — testado e confirmado que o Next 14 não reconhece
// esse arquivo estático dentro de /atendimento-app (cai na rota dinâmica [id] e exige login) quando
// existe um segmento [id] irmão; só o gerador dinâmico (icon.tsx/ImageResponse) funcionaria
// aninhado, e não vale a complexidade aqui já havendo um PNG pronto.
export const metadata: Metadata = {
  title: "Atendimento | Lúmen",
  manifest: "/atendimento-app/manifest.webmanifest",
  icons: {
    icon: "/icons-atendimento/icon-192.png",
    apple: "/icons-atendimento/icon-192.png",
  },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Atendimento" },
};

export default async function AtendimentoAppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || !user.active) redirect("/");

  const office = await prisma.office.findUnique({ where: { id: user.officeId }, select: { status: true, name: true } });
  if (office && office.status !== "ATIVA" && !user.isPlatformOwner) {
    return <div className="p-8 text-center text-tx-2">Escritório suspenso. Contate o administrador.</div>;
  }

  return <AtendimentoAppShell officeName={office?.name}>{children}</AtendimentoAppShell>;
}