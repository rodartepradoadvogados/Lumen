import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { getActiveSupportSession } from "@/lib/supportAccess";
import type { User } from "@prisma/client";

// Nome do cookie usado por lib/officeActing.ts (definido aqui, não lá, pra
// lib/officeActing.ts poder importar getCurrentUser sem criar import circular).
export const ACTING_OFFICE_COOKIE = "rp_acting_office";

export type CurrentUser = User & {
  // Preenchido só quando um platform owner está "atuando como" outro escritório (ver
  // lib/officeActing.ts) — o resto do app usa viewer.officeId normalmente (já veio trocado);
  // este campo existe só pra UI mostrar o aviso "você está atuando como X".
  actingAsOffice: { id: string; name: string } | null;
};

// options.ignoreActing pula a troca de escritório mesmo que o cookie esteja presente — usado
// por startActingAsOffice() pra checar isPlatformOwner contra a identidade REAL da sessão,
// nunca contra um objeto que já pode estar com o officeId trocado.
export async function getCurrentUser(options?: { ignoreActing?: boolean }): Promise<CurrentUser | null> {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await verifySession(token);
  if (!session) return null;

  const realUser = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!realUser) return null;

  if (!options?.ignoreActing && realUser.isPlatformOwner) {
    const cookieValue = cookies().get(ACTING_OFFICE_COOKIE)?.value;
    // Cookie guarda "<officeId>:<sessionId>" (ver lib/officeActing.ts) — o cookie sozinho não
    // concede nada, ele só aponta pra qual AccessSession checar no banco.
    const [actingOfficeId, actingSessionId] = cookieValue?.split(":") ?? [];
    if (actingOfficeId && actingOfficeId !== realUser.officeId) {
      // Quem decide é a AccessSession no banco, validada a CADA request — não o cookie. Sem
      // sessão ativa daquele escritório, ou com um id que não bate com o do cookie (sessão
      // trocada, encerrada pelo escritório, expirada), o override simplesmente não acontece e
      // segue devolvendo o usuário real, como se não houvesse cookie nenhum.
      const activeSession = await getActiveSupportSession(actingOfficeId);
      if (activeSession && activeSession.id === actingSessionId) {
        const office = await prisma.office.findUnique({ where: { id: actingOfficeId } });
        if (office) {
          // officeId trocado pro escritório-alvo: todo o resto do app já filtra por
          // viewer.officeId, então isso sozinho faz as telas mostrarem os dados de lá. isAdmin
          // forçado pra true (precisa de acesso completo pra configurar Drive/DJEN/e-mail).
          // Limitação conhecida: ações que gravam viewer.id como responsável/autor gravam o ID
          // REAL do platform owner (que continua pertencendo ao escritório de origem) — não é
          // problema pro caso de uso (configurar integrações), mas não use "atuar como" pra
          // operar o dia a dia do escritório-cliente (tarefas, processos etc.) em nome dele.
          return { ...realUser, officeId: office.id, isAdmin: true, actingAsOffice: { id: office.id, name: office.name } };
        }
      }
    }
  }

  return { ...realUser, actingAsOffice: null };
}
