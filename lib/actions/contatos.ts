"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createClient(data: { name: string; type: string; document?: string; email?: string; phone?: string; address?: string; notes?: string }) {
  await prisma.client.create({
    data: {
      name: data.name,
      type: data.type,
      document: data.document || null,
      email: data.email || null,
      phone: data.phone || null,
      address: data.address || null,
      notes: data.notes || null,
    },
  });
  revalidatePath("/contatos/clientes");
  revalidatePath("/contatos");
}

export async function createOpposingParty(data: { name: string; type: string; document?: string; email?: string; phone?: string; notes?: string }) {
  await prisma.opposingParty.create({
    data: {
      name: data.name,
      type: data.type,
      document: data.document || null,
      email: data.email || null,
      phone: data.phone || null,
      notes: data.notes || null,
    },
  });
  revalidatePath("/contatos/parte-adversa");
  revalidatePath("/contatos");
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
