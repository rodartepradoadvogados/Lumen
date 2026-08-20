import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";

export const dynamic = "force-dynamic";

// Semeia o catálogo de planos (Painel Mestre → Preços) na primeira vez que este recurso sobe em
// produção: 5 linhas de Plan (Standard/Silver/Gold/Diamond/Sob Medida, com os limites e a
// composição de módulo exatamente como o dono do produto descreveu) e as 4 linhas de
// ModulePrice, todas com price null ("deixe tudo sem preço" — o operador preenche depois em
// /painel-mestre/precos). Idempotente via upsert por key/moduleKey: rodar de novo não duplica
// nem sobrescreve preço já preenchido (só cria o que ainda não existe).
//
// Gold nasce com os mesmos limites do Silver (o pedido original só disse "Gold inclui
// Atendimento a mais que o Silver", sem definir um teto próprio de OAB/processo) — ajustável
// depois em /painel-mestre/precos sem precisar de deploy.
//
// Uso: GET /api/admin/setup-plan-catalog (logado como platform owner)
export async function GET() {
  const viewer = await getCurrentUser({ ignoreActing: true });
  if (!viewer?.isPlatformOwner) {
    return NextResponse.json(
      { error: "Apenas donos da plataforma podem rodar isso." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  const PLANOS = [
    { key: "STANDARD", name: "Standard", sortOrder: 1, isCustom: false, maxOabs: 3, maxProcessos: 200, moduloFinanceiro: true, moduloAssessoria: false, moduloAtendimento: false, moduloWhatsapp: false },
    { key: "SILVER", name: "Silver", sortOrder: 2, isCustom: false, maxOabs: 5, maxProcessos: 500, moduloFinanceiro: true, moduloAssessoria: true, moduloAtendimento: false, moduloWhatsapp: false },
    { key: "GOLD", name: "Gold", sortOrder: 3, isCustom: false, maxOabs: 5, maxProcessos: 500, moduloFinanceiro: true, moduloAssessoria: true, moduloAtendimento: true, moduloWhatsapp: false },
    { key: "DIAMOND", name: "Diamond", sortOrder: 4, isCustom: false, maxOabs: 7, maxProcessos: 800, moduloFinanceiro: true, moduloAssessoria: true, moduloAtendimento: true, moduloWhatsapp: true },
    { key: "SOB_MEDIDA", name: "Sob Medida", sortOrder: 5, isCustom: true, maxOabs: null, maxProcessos: null, moduloFinanceiro: false, moduloAssessoria: false, moduloAtendimento: false, moduloWhatsapp: false },
  ] as const;

  let planosProcessados = 0;
  for (const p of PLANOS) {
    await prisma.plan.upsert({ where: { key: p.key }, create: p, update: {} });
    planosProcessados++;
  }

  const MODULOS = [
    { moduleKey: "FINANCEIRO", label: "Financeiro" },
    { moduleKey: "ASSESSORIA", label: "Assessoria Jurídica" },
    { moduleKey: "WHATSAPP", label: "WhatsApp" },
    { moduleKey: "ATENDIMENTO", label: "Atendimento" },
  ] as const;

  let modulosProcessados = 0;
  for (const m of MODULOS) {
    await prisma.modulePrice.upsert({ where: { moduleKey: m.moduleKey }, create: { moduleKey: m.moduleKey, label: m.label, price: null }, update: { label: m.label } });
    modulosProcessados++;
  }

  return NextResponse.json({ planosProcessados, modulosProcessados }, { headers: { "Cache-Control": "no-store" } });
}
