import { requirePlatformAccess } from "@/lib/platformMember";
import { prisma } from "@/lib/prisma";
import { LumenPanel, LumenPanelHeader } from "@/components/painelMestre/LumenUi";
import { ModulePricesEditor, PlansEditor } from "@/components/painelMestre/PlanCatalogEditor";

export const dynamic = "force-dynamic";

// Tabela de preço configurável (pedido do dono do produto: "coloque campo configurável no
// painel mestre, que tem que comunicar com os planos disponibilizados"): os 4 preços de módulo
// e os limites/composição dos 4 planos fixos (Standard/Silver/Gold/Diamond) — a capa pública
// (app/page.tsx) lê exatamente estes dois catálogos ao vivo, sem número hardcoded. Sob Medida
// não aparece aqui: não tem preço nem composição fixa, é escolhido escritório a escritório em
// /painel-mestre/[officeId].
export default async function PrecosPage() {
  await requirePlatformAccess();

  const [plans, modulePrices] = await Promise.all([
    prisma.plan.findMany({ where: { isCustom: false }, orderBy: { sortOrder: "asc" } }),
    prisma.modulePrice.findMany({ orderBy: { moduleKey: "asc" } }),
  ]);

  return (
    <div className="p-6 max-w-[1000px] mx-auto animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Preços</h1>
        <p className="text-sm text-white/55 mt-1">
          Preço de cada módulo e composição de cada plano — lido ao vivo pela capa pública e pré-preenche o plano ao escolher em cada escritório
        </p>
      </div>

      <LumenPanel>
        <LumenPanelHeader
          title="Preço por módulo"
          subtitle="Sugestão usada ao ligar o módulo pela primeira vez num escritório — o valor de fato cobrado sempre mora no próprio escritório, editável lá"
        />
        <ModulePricesEditor modulePrices={modulePrices} />
      </LumenPanel>

      <LumenPanel>
        <LumenPanelHeader title="Planos" subtitle="Limites e módulos inclusos de cada plano fixo — Sob Medida é escolhido por escritório, não aparece aqui" />
        <PlansEditor plans={plans} />
      </LumenPanel>
    </div>
  );
}
