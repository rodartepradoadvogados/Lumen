import Link from "next/link";
import { getCurrentUser } from "@/lib/currentUser";
import { getOfficeModules } from "@/lib/officeModules";
import { Card } from "@/components/ui";
import MobileInstallMenuItem from "@/components/mobile/MobileInstallMenuItem";
import MobileLogoutButton from "@/components/mobile/MobileLogoutButton";
import { Phone, DollarSign, BarChart, Settings, Lock, Briefcase, User, Users } from "lucide-react";
import { podeVerAtendimentos } from "@/lib/acessoAtendimento";

export const dynamic = "force-dynamic";

// UM TOM SÓ para os ícones da grade (F6, 17/09/2026).
//
// Eram três, e a intenção estava escrita no comentário anterior com todas as letras: "accent" era
// "segundo destaque CATEGÓRICO" e "money" usava o verde de concluído para o atalho Financeiro. Ou
// seja: o verde que significa "em dia" no produto inteiro passava a significar "dinheiro" nesta
// tela, e o fundo de ação significava "Atendimento".
//
// É a mesma falha dos chips de Anotações, achada na mesma varredura: a regra da casa
// (tailwind.config.ts) é "cor é risco ou é lugar, NUNCA categoria de conteúdo". Quem diferencia os
// atalhos aqui é o ÍCONE e o rótulo, que já estão lá — a cor não acrescentava informação, só
// gastava dois significados reservados.
const TOM_DO_ICONE = "bg-sf-apoio text-tx-2";

export default async function MobileMais() {
  const viewer = await getCurrentUser();
  const modules = viewer ? await getOfficeModules(viewer.officeId) : { financeiro: false, whatsapp: false, atendimento: false, assessoria: false };
  const showFinance = modules.financeiro && Boolean(viewer?.isAdmin || viewer?.financeAccess);
  const initials = viewer ? viewer.name.split(" ").map((n) => n[0]).slice(0, 2).join("") : "??";

  const items = [
    // Processos já tem aba própria na barra inferior (documento 08, ver
    // components/mobile/MobileBottomNav.tsx) — o atalho aqui continua de propósito: quem já
    // está em Menu não precisa voltar pra Início pra achar Processo de novo.
    { href: "/m/processos", label: "Processos", Icon: Briefcase, show: true },
    { href: "/m/atendimento", label: "Atendimento", Icon: Phone, show: modules.atendimento && podeVerAtendimentos(viewer) },
    { href: "/m/financeiro", label: "Financeiro", Icon: DollarSign, show: showFinance },
    { href: "/m/relatorios", label: "Relatórios", Icon: BarChart, show: true },
    // Busca + ligar/WhatsApp direto — nasceu da auditoria de navegação (2026-08): único gap com
    // uso claro fora do escritório. Cadastro e edição continuam só no site (ver app/m/contatos).
    { href: "/m/contatos", label: "Contatos", Icon: Users, show: true },
    // Nome/foto do perfil saíram do cabeçalho (ver app/m/layout.tsx) — este é o único caminho
    // pra /m/perfil agora, então precisa continuar aqui mesmo o card acima já mostrando nome/foto.
    { href: "/m/perfil", label: "Meu Perfil", Icon: User, show: true },
    { href: "/m/configuracoes", label: "Configurações", Icon: Settings, show: true },
    // Só Jairo e Rodrigo (donos da plataforma) veem este item — mesma condição do cadeado na
    // TopBar do desktop (components/TopBar.tsx). Leva para /painel-mestre, a área da empresa
    // Lúmen, fora do escritório Rodarte Prado Advogados.
    { href: "/painel-mestre", label: "Painel Mestre", Icon: Lock, show: viewer?.isPlatformOwner ?? false },
  ].filter((i) => i.show);

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <h1 className="text-xl font-bold text-tx">Mais</h1>

      {viewer && (
        <div className="flex items-center gap-3 px-1">
          <div className="h-12 w-12 rounded-full bg-grafite-700 text-rail-marca flex items-center justify-center text-sm font-bold shrink-0">
            {initials}
          </div>
          <div>
            <p className="font-bold text-tx leading-tight">{viewer.name}</p>
            {viewer.role && (
              <span className="inline-block mt-1 text-corpo font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-sf-apoio text-tx-2">
                {viewer.role}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {items.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col gap-5 bg-sf border border-regua p-4"
          >
            <span className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${TOM_DO_ICONE}`}>
              <Icon size={18} />
            </span>
            <span className="text-sm font-bold text-tx">{label}</span>
          </Link>
        ))}
      </div>

      <Card>
        <MobileInstallMenuItem />
      </Card>

      <MobileLogoutButton />
    </div>
  );
}
