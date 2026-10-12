// TRILHA DE AUDITORIA DA TRIAGEM DE PUBLICAÇÕES — quem fez o quê com cada publicação.
//
// Pedido do dono (12/10/2026): "precisa registrar cada ação de cada usuário, até porque eu tenho que
// monitorar a equipe, e isso tem que se comunicar com a auditoria de atividades do próprio Lúmen".
// A auditoria de atividades do Lúmen é o AuditEvent (Configurações → Privacidade → Trilha de
// auditoria, ver lib/actions/privacidade.ts). Cada ação sobre uma publicação grava UMA linha ali, com
// `kind: "PUBLICACAO"`, e a trilha ganhou a aba "Publicações" (com filtro por pessoa e exportação).
//
// APPEND-ONLY, como o resto de AuditEvent: nenhuma Server Action deste projeto pode dar update ou
// delete aqui. Este arquivo só chama `create`.
//
// NUNCA QUEBRA A AÇÃO: se a gravação da trilha falhar, o erro vai para o log do servidor e a ação da
// pessoa segue. O contrário (impedir uma baixa de publicação porque a trilha caiu) seria pior para o
// escritório do que uma linha faltando, e a falha aparece nos logs.
//
// O que NÃO entra: texto da publicação, nome de parte, nome de cliente. Só o número do processo (já é
// o identificador usado em todo o produto), o tipo de ação, o motivo e os ids.

import { prisma } from "@/lib/prisma";
import type { AcaoDePublicacao } from "@/lib/rotulosAuditoriaPublicacoes";

export const KIND_AUDITORIA_PUBLICACAO = "PUBLICACAO";


export async function registrarAtividadePublicacao(p: {
  officeId: string;
  actorId: string;
  acao: AcaoDePublicacao;
  publicationIds: string[];
  // Frase curta e humana: o que foi feito e por quê.
  reason?: string;
  // Dados estruturados (motivo, desfecho, números de processo, ids de tarefa...). Sem texto de publicação.
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    const ids = Array.from(new Set(p.publicationIds)).slice(0, 50);
    await prisma.auditEvent.create({
      data: {
        officeId: p.officeId,
        actorId: p.actorId,
        kind: KIND_AUDITORIA_PUBLICACAO,
        entityType: "Publication",
        entityId: ids[0] ?? null,
        field: p.acao,
        reason: p.reason ?? null,
        meta: { publicationIds: ids, total: p.publicationIds.length, ...(p.meta ?? {}) } as object,
      },
    });
  } catch (e) {
    console.error("[auditoria-publicacoes] falha ao gravar a trilha (a ação seguiu):", p.acao, e);
  }
}
