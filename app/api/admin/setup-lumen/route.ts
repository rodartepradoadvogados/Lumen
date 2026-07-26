import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";

export const dynamic = "force-dynamic";

// Preenchimento inicial da fundação de dados da Lúmen (Passo 1): cria os papéis de
// plataforma, espelha quem já é isPlatformOwner como PlatformMember (papel SOCIO), espelha
// cada Office numa Subscription e cria o plano de contas inicial. Só LÊ Office e User —
// nenhuma tabela pré-existente é escrita. Idempotente: rodar de novo não duplica nem
// sobrescreve o que já foi criado (só preenche o que ainda falta).
//
// Uso: GET /api/admin/setup-lumen (logado como platform owner)
export async function GET() {
  const viewer = await getCurrentUser({ ignoreActing: true });
  if (!viewer?.isPlatformOwner) {
    return NextResponse.json(
      { error: "Apenas donos da plataforma podem rodar isso." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  // 1) Papéis de plataforma — teto de acesso e permissões seguem a escada de visibilidade
  // descrita em prisma/schema.prisma (PlatformRole.maxVisibility). Ninguém aqui alcança COFRE.
  const roleSeeds: Array<{
    key: string;
    name: string;
    maxVisibility: string;
    canManageBilling: boolean;
    canManageMembers: boolean;
    canApproveAccess: boolean;
  }> = [
    { key: "SOCIO", name: "Sócio", maxVisibility: "QUEBRA_VIDRO", canManageBilling: true, canManageMembers: true, canApproveAccess: true },
    { key: "FINANCEIRO", name: "Financeiro", maxVisibility: "ABERTO", canManageBilling: false, canManageMembers: false, canApproveAccess: false },
    { key: "SUPORTE_N1", name: "Suporte N1", maxVisibility: "VIDRO_FOSCO", canManageBilling: false, canManageMembers: false, canApproveAccess: false },
    { key: "ENGENHARIA", name: "Engenharia", maxVisibility: "ABERTO", canManageBilling: false, canManageMembers: false, canApproveAccess: false },
    { key: "COMERCIAL", name: "Comercial", maxVisibility: "ABERTO", canManageBilling: false, canManageMembers: false, canApproveAccess: false },
    { key: "MARKETING", name: "Marketing", maxVisibility: "ABERTO", canManageBilling: false, canManageMembers: false, canApproveAccess: false },
  ];

  let rolesCreated = 0;
  const roleIdByKey = new Map<string, string>();
  for (const seed of roleSeeds) {
    const existing = await prisma.platformRole.findUnique({ where: { key: seed.key } });
    if (existing) {
      roleIdByKey.set(seed.key, existing.id);
      continue;
    }
    const created = await prisma.platformRole.create({ data: seed });
    roleIdByKey.set(seed.key, created.id);
    rolesCreated++;
  }
  const rolesJaExistentes = roleSeeds.length - rolesCreated;

  // 2) Um PlatformMember (papel SOCIO) para cada User que já é isPlatformOwner — é como Jairo
  // e Rodrigo passam a existir do lado da Lúmen, sem precisar de credencial nova.
  const socioRoleId = roleIdByKey.get("SOCIO")!;
  const owners = await prisma.user.findMany({ where: { isPlatformOwner: true } });
  let membersCreated = 0;
  let membersJaExistentes = 0;
  for (const owner of owners) {
    const existing = await prisma.platformMember.findUnique({ where: { userId: owner.id } });
    if (existing) {
      membersJaExistentes++;
      continue;
    }
    await prisma.platformMember.create({ data: { userId: owner.id, roleId: socioRoleId } });
    membersCreated++;
  }

  // 3) Uma Subscription espelhando cada Office que ainda não tem uma — mesmos valores que já
  // estão em Office hoje, sem migrar leitura nenhuma (isso é passo futuro).
  const offices = await prisma.office.findMany();
  let subscriptionsCreated = 0;
  let subscriptionsJaExistentes = 0;
  for (const office of offices) {
    const existing = await prisma.subscription.findUnique({ where: { officeId: office.id } });
    if (existing) {
      subscriptionsJaExistentes++;
      continue;
    }
    await prisma.subscription.create({
      data: {
        officeId: office.id,
        monthlyFee: office.monthlyFee ?? 0,
        dueDay: office.billingDueDay ?? 10,
        billingEmail: office.billingEmail,
        internal: office.isInternal,
        status: office.status === "ATIVA" ? "ATIVA" : office.status,
      },
    });
    subscriptionsCreated++;
  }

  // 4) Plano de contas inicial da Lúmen — só roda se ainda não existir nenhuma conta.
  const accountsCount = await prisma.platformAccount.count();
  let accountsCreated = 0;
  if (accountsCount === 0) {
    const accountSeeds = [
      { code: "REC_ASSINATURA", name: "Assinaturas de escritórios", kind: "RECEITA", group: "Assinaturas" },
      { code: "DESP_INFRA", name: "Infraestrutura (hosting, banco de dados, storage)", kind: "DESPESA", group: "Infraestrutura" },
      { code: "DESP_IA", name: "IA (tokens, modelos)", kind: "DESPESA", group: "IA" },
      { code: "DESP_PESSOAL", name: "Pessoal", kind: "DESPESA", group: "Pessoal" },
      { code: "DESP_MARKETING", name: "Marketing", kind: "DESPESA", group: "Marketing" },
      { code: "DESP_CONTABILIDADE", name: "Contabilidade", kind: "DESPESA", group: "Contabilidade" },
      { code: "DESP_IMPOSTOS", name: "Impostos", kind: "DESPESA", group: "Impostos" },
    ];
    await prisma.platformAccount.createMany({ data: accountSeeds });
    accountsCreated = accountSeeds.length;
  }

  return NextResponse.json(
    {
      roles: { criados: rolesCreated, jaExistentes: rolesJaExistentes },
      platformMembers: { criados: membersCreated, jaExistentes: membersJaExistentes },
      subscriptions: { criadas: subscriptionsCreated, jaExistentes: subscriptionsJaExistentes },
      platformAccounts: { criadas: accountsCreated, jaExistentes: accountsCount },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
