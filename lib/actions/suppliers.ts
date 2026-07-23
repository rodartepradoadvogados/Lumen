"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireFinanceAccess } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/currentUser";

export async function listSuppliers(): Promise<{ id: string; name: string }[]> {
  const viewer = await getCurrentUser();
  if (!viewer) return [];
  const suppliers = await prisma.supplier.findMany({
    where: { officeId: viewer.officeId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return suppliers;
}

export async function createSupplierQuick(name: string): Promise<{ id: string; name: string }> {
  await requireFinanceAccess();
  const viewer = await getCurrentUser();
  if (!viewer) throw new Error("Sessão expirada. Faça login novamente.");
  const supplier = await prisma.supplier.create({ data: { name, officeId: viewer.officeId } });
  revalidatePath("/contatos/fornecedores");
  revalidatePath("/financeiro/contas-a-pagar");
  return { id: supplier.id, name: supplier.name };
}

export async function createSupplier(data: { name: string; document?: string; email?: string; phone?: string; notes?: string }) {
  await requireFinanceAccess();
  const viewer = await getCurrentUser();
  if (!viewer) throw new Error("Sessão expirada. Faça login novamente.");
  await prisma.supplier.create({
    data: {
      name: data.name,
      document: data.document || null,
      email: data.email || null,
      phone: data.phone || null,
      notes: data.notes || null,
      officeId: viewer.officeId,
    },
  });
  revalidatePath("/contatos/fornecedores");
}

export async function updateSupplier(
  id: string,
  data: { name: string; document?: string; email?: string; phone?: string; notes?: string }
) {
  await requireFinanceAccess();
  const viewer = await getCurrentUser();
  if (!viewer) throw new Error("Sessão expirada. Faça login novamente.");
  await prisma.supplier.updateMany({
    where: { id, officeId: viewer.officeId },
    data: {
      name: data.name,
      document: data.document || null,
      email: data.email || null,
      phone: data.phone || null,
      notes: data.notes || null,
    },
  });
  revalidatePath("/contatos/fornecedores");
  revalidatePath("/financeiro/contas-a-pagar");
}

export async function deleteSupplier(id: string): Promise<{ error?: string }> {
  await requireFinanceAccess();
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada. Faça login novamente." };
  const linked = await prisma.payable.count({ where: { supplierId: id, officeId: viewer.officeId } });
  if (linked > 0) {
    return { error: `Não é possível excluir: há ${linked} lançamento(s) vinculado(s) a este fornecedor.` };
  }
  await prisma.supplier.deleteMany({ where: { id, officeId: viewer.officeId } });
  revalidatePath("/contatos/fornecedores");
  return {};
}
