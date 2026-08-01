// Helpers puros (sem Prisma) para "Despesas do Processo" (Fase 10, aba Financeiro do Processo,
// componentes NewPayableModal.tsx / MobileNewPayableForm.tsx) — a contraparte, do lado de Contas
// a Pagar, do que lib/honorarioLancamento.ts já faz para Contas a Receber (Receivable.kind). NÃO
// misture os dois arquivos: um é sobre a natureza de uma DESPESA vinculada a um processo (Payable
// ligado a caseId), o outro é sobre a natureza de uma RECEITA (honorário).
//
// Importante não confundir esta natureza com o plano de contas (FinancialCategory/categoryId) —
// são duas dimensões independentes da mesma despesa: `kind` responde "o que é isso, do ponto de
// vista do processo" (mesmo catálogo fechado em toda tela, independe do escritório); categoryId
// responde "em que grupo do plano de contas isso entra" (customizável por escritório, usado no
// DRE/Fluxo de Caixa). Uma despesa de kind "CUSTAS_PROCESSUAIS_PERICIAIS" normalmente cai na
// categoria "2.9.5 Custas Processuais e Periciais" do plano de contas (ver
// lib/defaultOfficeData.ts), mas nada no código força esse casamento — o usuário escolhe os dois
// campos de forma independente, como já acontece com Receivable.kind/categoryId.
export const PAYABLE_KIND_OPTIONS: { value: string; label: string }[] = [
  { value: "HONORARIOS_ADVOGADO_PARCEIRO", label: "Honorários de Advogado Parceiro" },
  { value: "HONORARIOS_ADVOGADO_ESCRITORIO", label: "Honorários de Advogado do Escritório" },
  { value: "REEMBOLSO_CLIENTE", label: "Reembolso ao Cliente" },
  { value: "INDENIZACAO_RESPONSABILIDADE_CIVIL", label: "Indenização/Responsabilidade Civil" },
  { value: "CUSTAS_PROCESSUAIS_PERICIAIS", label: "Custas Processuais e Periciais" },
  { value: "DILIGENCIAS_DESPESAS_OPERACIONAIS", label: "Diligências e Despesas Operacionais" },
  { value: "OUTROS", label: "Outras" },
];

export const PAYABLE_KIND_LABELS: Record<string, string> = Object.fromEntries(
  PAYABLE_KIND_OPTIONS.map((o) => [o.value, o.label])
);

// "Quem arca com o custo" — ver comentário de Payable.expensePayer no schema. ESCRITORIO é o
// comportamento de sempre (despesa própria); CLIENTE é o adiantamento que pode gerar reembolso
// (ver EXPENSE_PAYER precisa de um Receivable "REEMBOLSO" vinculado, criado por createPayable em
// lib/actions/financeiro.ts quando o usuário marca o checkbox correspondente).
export const EXPENSE_PAYER_LABELS: Record<string, string> = {
  ESCRITORIO: "Escritório (despesa própria)",
  CLIENTE: "Cliente (escritório está adiantando)",
};
