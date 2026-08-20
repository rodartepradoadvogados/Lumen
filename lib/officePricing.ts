// Cálculo da mensalidade modular (Painel Mestre → Cobrança e acesso) — soma o preço de cada
// módulo LIGADO cujo preço está preenchido. Módulo ligado sem preço nunca vira R$0 silencioso:
// é excluído da soma e sinalizado (ver `modulosSemPreco`) para a UI avisar antes de deixar
// gerar fatura com esse valor incompleto.
export type OfficePricingInput = {
  moduloFinanceiro: boolean;
  moduloWhatsapp: boolean;
  moduloAtendimento: boolean;
  moduloAssessoria: boolean;
  precoFinanceiro: number | null;
  precoWhatsapp: number | null;
  precoAtendimento: number | null;
  precoAssessoria: number | null;
};

export type ModuloPrecoLinha = { key: "FINANCEIRO" | "WHATSAPP" | "ATENDIMENTO" | "ASSESSORIA"; label: string };

export const MODULOS: ModuloPrecoLinha[] = [
  { key: "FINANCEIRO", label: "Financeiro" },
  { key: "ASSESSORIA", label: "Assessoria Jurídica" },
  { key: "WHATSAPP", label: "WhatsApp" },
  { key: "ATENDIMENTO", label: "Atendimento" },
];

export type MensalidadeCalculada = {
  total: number;
  modulosSemPreco: ModuloPrecoLinha["key"][];
};

// Mesmo cálculo acima, mas para um PLANO do catálogo (não um escritório) — usado pela capa
// pública (app/page.tsx) para mostrar o preço de tabela de Standard/Silver/Gold/Diamond a
// partir do preço-catálogo global de cada módulo (ModulePrice), nunca um valor hardcoded.
export type PlanPricingInput = {
  moduloFinanceiro: boolean;
  moduloWhatsapp: boolean;
  moduloAtendimento: boolean;
  moduloAssessoria: boolean;
};

export function calcularPrecoDoPlano(
  plan: PlanPricingInput,
  modulePrices: { moduleKey: string; price: number | null }[]
): MensalidadeCalculada {
  const porChave = Object.fromEntries(modulePrices.map((m) => [m.moduleKey, m.price]));
  return calcularMensalidadeModular({
    moduloFinanceiro: plan.moduloFinanceiro,
    moduloWhatsapp: plan.moduloWhatsapp,
    moduloAtendimento: plan.moduloAtendimento,
    moduloAssessoria: plan.moduloAssessoria,
    precoFinanceiro: porChave.FINANCEIRO ?? null,
    precoWhatsapp: porChave.WHATSAPP ?? null,
    precoAtendimento: porChave.ATENDIMENTO ?? null,
    precoAssessoria: porChave.ASSESSORIA ?? null,
  });
}

export function calcularMensalidadeModular(office: OfficePricingInput): MensalidadeCalculada {
  const linhas: [boolean, number | null, ModuloPrecoLinha["key"]][] = [
    [office.moduloFinanceiro, office.precoFinanceiro, "FINANCEIRO"],
    [office.moduloAssessoria, office.precoAssessoria, "ASSESSORIA"],
    [office.moduloWhatsapp, office.precoWhatsapp, "WHATSAPP"],
    [office.moduloAtendimento, office.precoAtendimento, "ATENDIMENTO"],
  ];

  let total = 0;
  const modulosSemPreco: ModuloPrecoLinha["key"][] = [];
  for (const [ligado, preco, key] of linhas) {
    if (!ligado) continue;
    if (preco == null) {
      modulosSemPreco.push(key);
      continue;
    }
    total += preco;
  }
  return { total: Math.round(total * 100) / 100, modulosSemPreco };
}
