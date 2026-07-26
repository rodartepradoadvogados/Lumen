"use server";

import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, ACTING_OFFICE_COOKIE } from "@/lib/currentUser";
import { openSupportAccess, closeSupportAccess } from "@/lib/supportAccess";
import { SESSION_MINUTES, type AccessReasonCode } from "@/lib/supportAccessConstants";

// "Atuar como": permite que um platform owner (Jairo/Rodrigo — ver User.isPlatformOwner)
// entre num escritório-cliente pra ajudar a configurar algo (Drive, DJEN, e-mail...) sem
// precisar de um segundo login — o e-mail já é único por usuário na plataforma inteira
// (User.email @unique), não dá pra ter uma conta por escritório com o mesmo e-mail.
//
// Passo 2: deixou de ser só um cookie liberando 4h de acesso irrestrito sem motivo, chamado ou
// registro. Agora todo "atuar como" passa por lib/supportAccess.ts — motivo obrigatório (lista
// fechada), assunto de chamado, prazo curto (SESSION_MINUTES) e uma AccessSession no banco que
// o escritório enxerga em tempo real (components/SupportAccessBanner.tsx) e pode encerrar a
// qualquer momento.
//
// Mecanismo: o cookie guarda "<officeId>:<sessionId>", mas quem decide se o override vale é a
// AccessSession no banco (lib/currentUser.ts valida a cada request) — o cookie sozinho nunca é
// suficiente pra virar acesso a dados de outro escritório, com ou sem sessão válida por trás.

export async function startActingAsOffice(
  officeId: string,
  input: { reasonCode: AccessReasonCode; reasonNote?: string; ticketSubject: string }
): Promise<{ error?: string; pending?: boolean }> {
  const realUser = await getCurrentUser({ ignoreActing: true });
  if (!realUser?.isPlatformOwner) return { error: "Só administradores da plataforma podem fazer isso." };

  const office = await prisma.office.findUnique({ where: { id: officeId }, select: { id: true } });
  if (!office) return { error: "Escritório não encontrado." };

  // openSupportAccess é o único caminho de elevação: grava AccessRequest + AccessSession +
  // AccessAuditLog numa transação e só devolve sessionId se tudo foi gravado com sucesso.
  // Falhou a auditoria, falha o acesso — nunca o contrário. Por isso o cookie só é escrito
  // abaixo, depois de confirmado o sessionId.
  const result = await openSupportAccess({
    officeId,
    reasonCode: input.reasonCode,
    reasonNote: input.reasonNote,
    ticketSubject: input.ticketSubject,
  });
  // Passo 3a: só repassa o booleano `pending` que já vem de openSupportAccess — a mecânica de
  // override (cookie + validação em lib/currentUser.ts) não muda em nada, só o contrato de
  // retorno ganha esse campo pro modal (StartActingModal) não precisar comparar texto de erro.
  if (!result.sessionId) return { error: result.error ?? "Não foi possível abrir o acesso.", pending: result.pending };

  cookies().set(ACTING_OFFICE_COOKIE, `${officeId}:${result.sessionId}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // Acompanha o prazo da AccessSession — não faz sentido o cookie sobreviver mais tempo do
    // que a sessão que ele referencia (mesmo que sobrevivesse, lib/currentUser.ts recusaria o
    // override porque a sessão já estaria expirada no banco).
    maxAge: SESSION_MINUTES * 60,
  });
  return {};
}

export async function stopActingAsOffice(): Promise<void> {
  const cookieValue = cookies().get(ACTING_OFFICE_COOKIE)?.value;
  const sessionId = cookieValue?.split(":")[1];

  if (sessionId) {
    // Encerrar é ação de saída, não de elevação: mesmo se o registro de auditoria falhar aqui,
    // a pessoa real não pode ficar presa "atuando como" outro escritório por causa disso — o
    // princípio "falha fecha" vale pra ABRIR acesso, não pra impedir alguém de sair dele.
    try {
      await closeSupportAccess(sessionId, "MEMBRO");
    } catch (err) {
      console.error("stopActingAsOffice: falha ao encerrar a sessão de suporte", err);
    }
  }

  cookies().delete(ACTING_OFFICE_COOKIE);
}
