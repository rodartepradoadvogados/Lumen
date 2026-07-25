"use server";

import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, ACTING_OFFICE_COOKIE } from "@/lib/currentUser";

// "Atuar como": permite que um platform owner (Jairo/Rodrigo — ver User.isPlatformOwner)
// entre num escritório-cliente pra ajudar a configurar algo (Drive, DJEN, e-mail...) sem
// precisar de um segundo login — o e-mail já é único por usuário na plataforma inteira
// (User.email @unique), não dá pra ter uma conta por escritório com o mesmo e-mail.
//
// Mecanismo: um cookie guarda só o ID do escritório-alvo; getCurrentUser() (lib/currentUser.ts)
// decide se aplica o override, e só aplica depois de confirmar (no banco, a cada request) que
// o USUÁRIO REAL da sessão é platform owner — o valor do cookie sozinho nunca é suficiente
// pra virar acesso a dados de outro escritório.

export async function startActingAsOffice(officeId: string): Promise<{ error?: string }> {
  const realUser = await getCurrentUser({ ignoreActing: true });
  if (!realUser?.isPlatformOwner) return { error: "Só administradores da plataforma podem fazer isso." };

  const office = await prisma.office.findUnique({ where: { id: officeId }, select: { id: true } });
  if (!office) return { error: "Escritório não encontrado." };

  cookies().set(ACTING_OFFICE_COOKIE, officeId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 4, // 4h — sessão de trabalho pontual, não fica logado no outro escritório indefinidamente
  });
  return {};
}

export async function stopActingAsOffice(): Promise<void> {
  cookies().delete(ACTING_OFFICE_COOKIE);
}
