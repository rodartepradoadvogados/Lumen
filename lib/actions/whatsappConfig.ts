"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";
import { getOfficeModules } from "@/lib/officeModules";
import { canConfigureIntegrations } from "@/lib/supportCapabilities";

export async function saveWhatsappConfig(data: {
  phoneNumberId: string;
  accessToken: string;
  displayPhone?: string;
}): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!canConfigureIntegrations(viewer)) return { error: "Apenas administradores podem configurar o WhatsApp do escritório." };
  if (!(await getOfficeModules(viewer.officeId)).whatsapp) {
    return { error: "O módulo WhatsApp não está incluído no plano deste escritório." };
  }

  const phoneNumberId = data.phoneNumberId.trim();
  const accessToken = data.accessToken.trim();
  if (!phoneNumberId) return { error: "Informe o Phone Number ID." };
  if (!accessToken) return { error: "Informe o token de acesso." };

  const conflicting = await prisma.whatsappConfig.findUnique({ where: { phoneNumberId } });
  if (conflicting && conflicting.officeId !== viewer.officeId) {
    return { error: "Esse Phone Number ID já está cadastrado em outro escritório." };
  }

  // `provider` É GRAVADO EXPLICITAMENTE, e não deixado por conta do padrão do schema. Desde que
  // os dois caminhos (Meta e QR) dividem a mesma tela, salvar por aqui um escritório que estava no
  // QR deixava `provider` em "EVOLUTION" com credenciais da Meta no lugar — e o envio continuaria
  // procurando uma instância da Evolution que a tela já não está mais configurando.
  //
  // `baseUrl` e `apiKey` vão a nulo junto: chave de API de um servidor que este escritório não usa
  // mais é segredo guardado sem motivo. `webhookSecret` FICA: ele é nosso, a instância lá fora
  // ainda o manda em cabeçalho, e regerá-lo faria a volta ao QR exigir recriar a instância.
  const comum = {
    provider: "META",
    phoneNumberId,
    accessToken,
    baseUrl: null,
    apiKey: null,
    displayPhone: data.displayPhone?.trim() || null,
  };
  await prisma.whatsappConfig.upsert({
    where: { officeId: viewer.officeId },
    create: { officeId: viewer.officeId, ...comum },
    update: comum,
  });
  revalidatePath("/configuracoes");
  return {};
}

export async function deleteWhatsappConfig(): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!canConfigureIntegrations(viewer)) return { error: "Apenas administradores podem desconectar o WhatsApp." };
  await prisma.whatsappConfig.deleteMany({ where: { officeId: viewer.officeId } });
  revalidatePath("/configuracoes");
  return {};
}
