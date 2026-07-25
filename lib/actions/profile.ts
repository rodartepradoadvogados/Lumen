"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";

export type MyProfile = {
  name: string;
  photoUrl: string | null;
  birthDate: string | null; // yyyy-mm-dd, formato de <input type="date">
  gender: string | null;
  maritalStatus: string | null;
  cpf: string | null;
  rg: string | null;
  address: string | null;
  cep: string | null;
  city: string | null;
  state: string | null;
};

export async function getMyProfile(): Promise<MyProfile | null> {
  const viewer = await getCurrentUser();
  if (!viewer) return null;
  const user = await prisma.user.findUnique({ where: { id: viewer.id } });
  if (!user) return null;
  return {
    name: user.name,
    photoUrl: user.photoUrl,
    birthDate: user.birthDate ? user.birthDate.toISOString().slice(0, 10) : null,
    gender: user.gender,
    maritalStatus: user.maritalStatus,
    cpf: user.cpf,
    rg: user.rg,
    address: user.address,
    cep: user.cep,
    city: user.city,
    state: user.state,
  };
}

// Cada pessoa só edita o PRÓPRIO perfil — nada de officeId/isAdmin aqui, é autosserviço puro.
export async function updateMyProfile(data: Omit<MyProfile, "photoUrl">): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão inválida." };

  const name = data.name.trim();
  if (!name) return { error: "O nome não pode ficar em branco." };

  await prisma.user.update({
    where: { id: viewer.id },
    data: {
      name,
      birthDate: data.birthDate ? new Date(`${data.birthDate}T00:00:00`) : null,
      gender: data.gender?.trim() || null,
      maritalStatus: data.maritalStatus?.trim() || null,
      cpf: data.cpf?.trim() || null,
      rg: data.rg?.trim() || null,
      address: data.address?.trim() || null,
      cep: data.cep?.trim() || null,
      city: data.city?.trim() || null,
      state: data.state?.trim() || null,
    },
  });

  revalidatePath("/perfil");
  revalidatePath("/configuracoes");
  return {};
}
