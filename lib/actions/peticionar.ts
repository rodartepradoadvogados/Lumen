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

  // Cada escritório pode cadastrar o próprio timbrado em Configurações → Geral
  // (categoria "Timbrado (Peticionar)"). Sem um cadastrado, cai no timbrado global antigo
  // (só existe de verdade para o Rodarte Prado, o único escritório que ainda não recadastrou).
  const officeTimbrado = await prisma.documentTemplate.findFirst({
    where: { officeId: user.officeId, category: "TIMBRADO" },
    orderBy: { createdAt: "desc" },
  });
  const timbradoUrl = officeTimbrado?.driveUrl ?? PETICIONAR_URL;

  const fileId = extractDriveFileId(timbradoUrl);
  if (!fileId) {
    return {
      error: officeTimbrado
        ? "Não foi possível identificar o timbrado cadastrado (link do Drive inválido)."
        : "Não foi possível identificar o timbrado no Google Drive.",
    };
  }

  const today = new Date().toLocaleDateString("pt-BR");
  let subject = user.name;
  if (caseId) {
    const c = await prisma.case.findFirst({ where: { id: caseId, officeId: user.officeId }, include: { client: true } });
    if (c) subject = c.client?.name || c.title;
  }

  try {
    const { webViewLink } = await copyAndFillTemplate(fileId, `Petição - ${subject} - ${today}`, {}, user.officeId);
    return { driveUrl: webViewLink };
  } catch (e) {
    const raw = e instanceof Error ? e.message : "";
    const message = /invalid_request|invalid_grant|File not found|404/i.test(raw)
      ? `Não foi possível acessar o timbrado no Google Drive. Verifique ${
          officeTimbrado ? "o modelo cadastrado em Configurações → Geral (categoria Timbrado)" : "se o Google Drive está conectado em Conexões"
        }.`
      : raw || "Erro ao gerar a petição.";
    return { error: message };
  }
}
