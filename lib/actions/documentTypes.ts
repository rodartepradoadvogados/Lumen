"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";
import {
  DOCUMENT_TYPE_GROUPS,
  LEGACY_DOCUMENT_TYPES,
  deriveDocumentTypeChave,
  type OfficeDocumentTypeEntry,
} from "@/lib/documentTypes";

// ============ TIPOS DE DOCUMENTO CRIADOS PELO ESCRITÓRIO (ver model OfficeDocumentType) ============
//
// O catálogo de lib/documentTypes.ts é fixo no código, agrupado por seção. Aqui é onde cada
// escritório estende esse catálogo com os próprios tipos ("Print de conversa", "Laudo de
// vistoria"...) sem precisar de deploy — chamado pelo botão "+ Novo tipo" de
// components/DocumentTypeSelect.tsx (ver components/NewDocumentTypeDialog.tsx para o formulário).
//
// O rótulo de um tipo é o nome que a pasta correspondente ganha no Drive/OneDrive/Dropbox (ver
// getOrCreateCategoryFolder em lib/storageProvider.ts, chamado com getDocumentTypeLabel(docType) —
// nunca com a chave) — então um tipo novo já cria pasta própria automaticamente no primeiro
// documento daquele tipo, sem nenhuma mudança no lado do armazenamento.

const NATIVE_KEYS = new Set([...DOCUMENT_TYPE_GROUPS.flatMap((g) => g.types.map((t) => t.key)), ...LEGACY_DOCUMENT_TYPES.map((t) => t.key)]);
const SECOES_VALIDAS = new Set(DOCUMENT_TYPE_GROUPS.map((g) => g.group));

// As seções existentes em DOCUMENT_TYPE_GROUPS (primeiro passo do formulário de criação: a pessoa
// escolhe ONDE o tipo novo vai aparecer antes de nomeá-lo) não precisam de uma ação de servidor
// própria — DOCUMENT_TYPE_GROUPS já é dado estático seguro para o client (lib/documentTypes.ts não
// importa Prisma), então components/DocumentTypeSelect.tsx lê a lista direto de lá.

// Tipos ativos deste escritório, para compor o catálogo do seletor junto com os nativos (ver
// composeDocumentTypeGroups em lib/documentTypes.ts). Chamado pelo próprio DocumentTypeSelect ao
// abrir a janela suspensa — não recebe nenhum parâmetro do cliente, então não há o que validar
// além de exigir sessão.
export async function listOfficeDocumentTypes(): Promise<OfficeDocumentTypeEntry[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const rows = await prisma.officeDocumentType.findMany({
    where: { officeId: user.officeId, ativo: true },
    orderBy: { rotulo: "asc" },
    select: { chave: true, rotulo: true, secao: true },
  });
  return rows;
}

// Cria um novo tipo de documento para o escritório do usuário logado. `secao` precisa ser uma das
// seções existentes em DOCUMENT_TYPE_GROUPS (a lista que listDocumentTypeSecoes devolve) — não dá
// para inventar uma seção nova por aqui, só escolher entre as que já existem. `chave` é derivada
// do rótulo (ver deriveDocumentTypeChave) e checada contra os tipos nativos/legados e contra os já
// cadastrados por este escritório (a constraint @@unique([officeId, chave]) do schema é a rede de
// segurança final, mas checar antes dá uma mensagem legível em vez de um erro de banco cru).
export async function createOfficeDocumentType(
  secao: string,
  rotulo: string
): Promise<{ error?: string; type?: OfficeDocumentTypeEntry }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sessão inválida." };

  const rotuloTrim = rotulo.trim();
  if (!rotuloTrim) return { error: "Digite o nome do novo tipo." };
  if (!SECOES_VALIDAS.has(secao)) return { error: "Escolha uma seção da lista." };

  const chave = deriveDocumentTypeChave(rotuloTrim);
  if (!chave) return { error: "Esse nome não gera uma categoria válida — use letras ou números." };
  if (NATIVE_KEYS.has(chave)) {
    return { error: `"${rotuloTrim}" já existe no catálogo padrão. Escolha outro nome.` };
  }

  const existing = await prisma.officeDocumentType.findUnique({
    where: { officeId_chave: { officeId: user.officeId, chave } },
  });
  if (existing && existing.ativo) {
    return { error: `"${existing.rotulo}" já existe neste escritório.` };
  }
  if (existing && !existing.ativo) {
    // Tipo desativado com a mesma chave (não há tela de desativar hoje, mas o campo `ativo`
    // existe no schema para isso) — reativa e atualiza rótulo/seção em vez de tentar criar uma
    // segunda linha com a mesma chave, o que a constraint única recusaria.
    const reactivated = await prisma.officeDocumentType.update({
      where: { id: existing.id },
      data: { ativo: true, rotulo: rotuloTrim, secao, createdById: user.id },
    });
    revalidatePath("/", "layout");
    return { type: { chave: reactivated.chave, rotulo: reactivated.rotulo, secao: reactivated.secao } };
  }

  const created = await prisma.officeDocumentType.create({
    data: { officeId: user.officeId, chave, rotulo: rotuloTrim, secao, createdById: user.id },
  });

  // Não há uma única tela "dona" do catálogo de tipos — ele aparece em Anexos de Processo/Caso/
  // Atendimento e no catálogo de Documentos da Assessoria. revalidatePath("/", "layout") invalida
  // o cache de todo o app pelas mesmas razões que outras ações de catálogo compartilhado (ex.:
  // tribunais) já fazem, em vez de tentar listar cada rota que usa DocumentTypeSelect.
  revalidatePath("/", "layout");

  return { type: { chave: created.chave, rotulo: created.rotulo, secao: created.secao } };
}
