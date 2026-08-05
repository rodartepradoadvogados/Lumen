import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { getActiveSupportSession } from "@/lib/supportAccess";
import { ACTING_OFFICE_COOKIE, isMaskedSupportRequest } from "@/lib/supportContext";
import type { User } from "@prisma/client";

// O nome do cookie mudou de casa: nasce em lib/supportContext.ts, porque lib/prisma.ts também
// precisa dele (é o sinal que liga o "Vidro Fosco") e não poderia importar este módulo sem
// fechar o ciclo currentUser -> prisma -> currentUser. Continua reexportado daqui para não
// quebrar quem já importava deste caminho (lib/officeActing.ts).
export { ACTING_OFFICE_COOKIE };

export type CurrentUser = User & {
  // Preenchido só quando um platform owner está "atuando como" outro escritório (ver
  // lib/officeActing.ts) — o resto do app usa viewer.officeId normalmente (já veio trocado);
  // este campo existe só pra UI mostrar o aviso "você está atuando como X".
  actingAsOffice: { id: string; name: string } | null;

  // true quando esta requisição está sob máscara (ver lib/supportContext.ts). Existe para a UI
  // avisar o suporte de que o que ele vê é redigido — sem isso, alguém olharia um nome
  // mascarado achando que o dado do cliente corrompeu e abriria um chamado sobre isso.
  // NÃO é este campo que aplica a máscara: quem aplica é a extensão de lib/prisma.ts, a partir
  // do cookie. Mexer aqui não desmascara nada.
  supportMasked: boolean;

  // Nível de visibilidade da sessão de suporte. Na Fase A o único valor emitido é
  // "VIDRO_FOSCO": não existe autoaprovação nem quebra de protocolo de emergência, nem para o
  // dono da plataforma. "QUEBRA_VIDRO" já aparece no tipo porque é o contrato que a Fase B vai
  // preencher (quebra-vidro POR REGISTRO, com log de LEITURA) — hoje nada o emite.
  supportVisibility: "VIDRO_FOSCO" | "QUEBRA_VIDRO" | null;
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
          // viewer.officeId, então isso sozinho faz as telas mostrarem os dados de lá.
          //
          // isAdmin: FALSE, e não mais `true`. Antes o suporte entrava como administrador do
          // escritório-cliente, o que dava acesso irrestrito. A escolha entre "false fixo" e
          // "herdar o isAdmin real do owner" não é de gosto: `isAdmin` significa "administrador
          // DESTE escritório", e o dono da plataforma não é administrador do escritório do
          // cliente — carregar a flag do escritório de origem seria um erro de categoria (ele é
          // admin lá, não aqui). Como o dono da plataforma é admin no próprio escritório,
          // herdar daria exatamente o acesso irrestrito que se quer remover. Então: false.
          //
          // Limitação conhecida (mantida): ações que gravam viewer.id como responsável/autor
          // gravam o ID REAL do platform owner, que continua pertencendo ao escritório de
          // origem.
          return {
            ...realUser,
            officeId: office.id,
            isAdmin: false,
            actingAsOffice: { id: office.id, name: office.name },
            supportMasked: true,
            supportVisibility: "VIDRO_FOSCO",
          };
        }
      }
    }
  }

  // Caminho normal — e também o caso "cookie de atuar como presente, mas a AccessSession não
  // vale mais" (expirou, foi encerrada pelo escritório, ou o id não bate). Nesse segundo caso a
  // troca de escritório é recusada acima, mas a extensão de lib/prisma.ts CONTINUA mascarando,
  // porque ela decide pela presença do cookie. Então supportMasked é lido da mesma fonte que a
  // extensão usa, em vez de ser fixado em false: se dissesse false aqui, a UI mostraria dados
  // redigidos sem nenhum aviso — que é justamente o cenário que confunde o suporte.
  const masked = isMaskedSupportRequest();
  return {
    ...realUser,
    actingAsOffice: null,
    supportMasked: masked,
    supportVisibility: masked ? "VIDRO_FOSCO" : null,
  };
}
