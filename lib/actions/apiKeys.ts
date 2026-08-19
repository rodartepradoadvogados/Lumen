"use server";

import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { canConfigureIntegrations } from "@/lib/supportCapabilities";
import { revalidatePath } from "next/cache";

// Gestão de credenciais para integrações externas chamarem a API do Lúmen em nome do escritório
// (documento 04 do handoff do redesenho Modernist — catálogo "Chaves e automação" em /conexoes).
// IMPORTANTE, repetido aqui do comentário do model ApiKey (prisma/schema.prisma): esta PR só cria
// GESTÃO da credencial (criar/listar/revogar) — nenhum endpoint do projeto valida essas chaves
// ainda, porque não existe hoje uma API pública do Lúmen (só rotas internas, autenticadas por
// sessão do portal). A tela avisa isso explicitamente (ver ApiKeysManager.tsx), pra não passar a
// falsa impressão de que criar uma chave aqui já autentica alguma coisa.

export type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  scope: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdByName: string | null;
};

// "lumen_live_" + 32 caracteres aleatórios (base64url, sem caracteres ambíguos de URL) — o valor
// inteiro só existe em memória neste request e no retorno de createApiKey; nunca é persistido (só
// o hash, ver hashSecret). O prefixo mostrado na tabela é só a parte "lumen_live_" + 8 caracteres
// do aleatório, o bastante pra reconhecer qual chave é qual sem expor nada reutilizável.
function generateSecret(): { secret: string; prefix: string } {
  const random = crypto.randomBytes(24).toString("base64url");
  const secret = `lumen_live_${random}`;
  const prefix = `${secret.slice(0, 19)}…`;
  return { secret, prefix };
}

// SHA-256 simples (não bcrypt): diferente de senha de usuário, o segredo já nasce com entropia
// alta (32 bytes aleatórios) — não precisa de custo computacional extra nem salt por linha pra se
// defender de força bruta/rainbow table, o mesmo raciocínio de token de API do resto do mercado
// (Stripe, GitHub etc.). Comparação na autenticação (quando ela existir) deve usar
// crypto.timingSafeEqual sobre o hash, não string.equals — mesmo cuidado de
// lib/asaas.ts:verifyAsaasWebhookToken.
function hashSecret(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

export async function listApiKeys(): Promise<ApiKeyRow[] | { error: string }> {
  const viewer = await getCurrentUser();
  if (!canConfigureIntegrations(viewer)) return { error: "Apenas administradores podem ver as chaves de API." };

  const keys = await prisma.apiKey.findMany({
    where: { officeId: viewer.officeId },
    include: { createdBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return keys.map((k) => ({
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    scope: k.scope,
    createdAt: k.createdAt.toISOString(),
    lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
    revokedAt: k.revokedAt?.toISOString() ?? null,
    createdByName: k.createdBy?.name ?? null,
  }));
}

export async function createApiKey(data: { name: string; scope: string }): Promise<{ error?: string; key?: string }> {
  const viewer = await getCurrentUser();
  if (!canConfigureIntegrations(viewer)) return { error: "Apenas administradores podem criar chaves de API." };

  const name = data.name.trim();
  if (!name) return { error: "Dê um nome pra chave, pra identificar depois quem ou o que usa ela." };
  const scope = data.scope === "ESCRITA" ? "ESCRITA" : "LEITURA";

  const { secret, prefix } = generateSecret();
  await prisma.apiKey.create({
    data: { name, prefix, keyHash: hashSecret(secret), scope, officeId: viewer.officeId, createdById: viewer.id },
  });
  revalidatePath("/conexoes");
  // O valor completo só existe aqui, neste retorno — quem chama mostra UMA vez (ver
  // ApiKeysManager.tsx) e nunca mais tem como recuperá-lo (nem o banco guarda).
  return { key: secret };
}

export async function revokeApiKey(id: string): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!canConfigureIntegrations(viewer)) return { error: "Apenas administradores podem revogar chaves de API." };

  const key = await prisma.apiKey.findFirst({ where: { id, officeId: viewer.officeId } });
  if (!key) return { error: "Chave não encontrada." };

  await prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
  revalidatePath("/conexoes");
  return {};
}
