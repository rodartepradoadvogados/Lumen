"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

type ClientInput = {
  name: string;
  type: string;
  document?: string;
  rg?: string;
  nationality?: string;
  maritalStatus?: string;
  profession?: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
};

export async function createClient(data: ClientInput) {
  await prisma.client.create({
    data: {
      name: data.name,
      type: data.type,
      document: data.document || null,
      rg: data.rg || null,
      nationality: data.nationality || null,
      maritalStatus: data.maritalStatus || null,
      profession: data.profession || null,
      email: data.email || null,
      phone: data.phone || null,
      address: data.address || null,
      notes: data.notes || null,
    },
  });
  revalidatePath("/contatos/clientes");
  revalidatePath("/contatos");
}

export async function updateClient(id: string, data: ClientInput) {
  await prisma.client.update({
    where: { id },
    data: {
      name: data.name,
      type: data.type,
      document: data.document || null,
      rg: data.rg || null,
      nationality: data.nationality || null,
      maritalStatus: data.maritalStatus || null,
      profession: data.profession || null,
      email: data.email || null,
      phone: data.phone || null,
      address: data.address || null,
      notes: data.notes || null,
    },
  });
  revalidatePath("/contatos/clientes");
  revalidatePath("/contatos");
}

export async function createClientQuick(name: string): Promise<{ id: string; name: string }> {
  const client = await prisma.client.create({ data: { name, type: "PJ" } });
  revalidatePath("/contatos/clientes");
  revalidatePath("/contatos");
  return { id: client.id, name: client.name };
}

export async function createLawyer(data: { name: string; oab?: string; firm?: string; side: string; email?: string; phone?: string; notes?: string }) {
  await prisma.lawyer.create({
    data: {
      name: data.name,
      oab: data.oab || null,
      firm: data.firm || null,
      side: data.side,
      email: data.email || null,
      phone: data.phone || null,
      notes: data.notes || null,
    },
  });
  revalidatePath("/contatos/advogados");
  revalidatePath("/contatos");
}
