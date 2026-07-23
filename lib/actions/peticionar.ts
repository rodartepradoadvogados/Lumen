"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { copyAndFillTemplate, extractDriveFileId } from "@/lib/googleDrive";
import { PETICIONAR_URL } from "@/lib/constants";

// Cada clique em "Peticionar" gera uma cópia NOVA e independente do timbrado no Drive —
// antes, todo mundo abria o mesmo Google Doc fixo (PETICIONAR_URL), então uma pessoa podia
// sobrescrever o que outra estava escrevendo. Reaproveita a mesma infra de cópia usada em
// lib/actions/generateDocument.ts (Modelos de Documento), só que sem placeholders — o
// timbrado é só a folha em branco com identidade visual do escritório.
export async function criarPeticao(caseId?: string): Promise<{ driveUrl?: string; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };

  const fileId = extractDriveFileId(PETICIONAR_URL);
  if (!fileId) return { error: "Não foi possível identificar o timbrado no Google Drive." };

  const today = new Date().toLocaleDateString("pt-BR");
  let subject = user.name;
  if (caseId) {
    const c = await prisma.case.findFirst({ where: { id: caseId, officeId: user.officeId }, include: { client: true } });
    if (c) subject = c.client?.name || c.title;
  }

  try {
    // PETICIONAR_URL ainda é um único timbrado global fixo em lib/constants.ts — cada
    // escritório precisará do seu próprio (ver Fase 2/4 do plano de multi-tenancy).
    const { webViewLink } = await copyAndFillTemplate(fileId, `Petição - ${subject} - ${today}`, {}, user.officeId);
    return { driveUrl: webViewLink };
  } catch (e) {
    const raw = e instanceof Error ? e.message : "";
    const message = /invalid_request|invalid_grant|File not found|404/i.test(raw)
      ? "Não foi possível acessar o timbrado no Google Drive. Verifique se o link em lib/constants.ts ainda é válido e se o Google Drive está conectado em Configurações."
      : raw || "Erro ao gerar a petição.";
    return { error: message };
  }
}
