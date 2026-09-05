import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Backfill pontual de User/Client/Lawyer/Supplier.phoneDdi e Attendance.contactPhoneDdi (campos
// novos, ver prisma/schema.prisma) — mesma lógica de scripts/backfill-phone-ddi.ts, só que
// disparável pelo navegador (GET), porque este ambiente de deploy não dá acesso a terminal com a
// DATABASE_URL de produção. Assume Brasil ("55") para todo telefone já cadastrado sem DDI — é a
// base real de todo escritório antes da correção do bug de WhatsApp não reconhecer número sem
// código de país (ver lib/documentoEnvios.ts:composePhoneWithDdi). Roda contra a plataforma
// inteira, sem gate de officeId de propósito (mesmo raciocínio de backfill-licitacao-nome).
// Idempotente: rodar de novo não afeta quem já tem DDI preenchido.
//
// Uso: GET /api/admin/backfill-phone-ddi (autenticado como dono da plataforma).
export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer?.isPlatformOwner) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const [users, clients, lawyers, suppliers, attendances] = await Promise.all([
      prisma.user.updateMany({ where: { phone: { not: null }, phoneDdi: null }, data: { phoneDdi: "55" } }),
      prisma.client.updateMany({ where: { phone: { not: null }, phoneDdi: null }, data: { phoneDdi: "55" } }),
      prisma.lawyer.updateMany({ where: { phone: { not: null }, phoneDdi: null }, data: { phoneDdi: "55" } }),
      prisma.supplier.updateMany({ where: { phone: { not: null }, phoneDdi: null }, data: { phoneDdi: "55" } }),
      prisma.attendance.updateMany({ where: { contactPhone: { not: null }, contactPhoneDdi: null }, data: { contactPhoneDdi: "55" } }),
    ]);
    return NextResponse.json(
      {
        usuarios: users.count,
        clientes: clients.count,
        advogados: lawyers.count,
        fornecedores: suppliers.count,
        atendimentos: attendances.count,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[backfill-phone-ddi] falha durante o backfill:", error);
    return NextResponse.json(
      { error: "Erro durante o backfill. Veja os logs do servidor para detalhes." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
