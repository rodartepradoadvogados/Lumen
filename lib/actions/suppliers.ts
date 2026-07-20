"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireFinanceAccess } from "@/lib/permissions";

export async function listSuppliers(): Promise<{ id: string; name: string }[]> {
  const suppliers = await prisma.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  return suppliers;
}

export async function createSupplierQuick(name: string): Promise<{ id: string; name: string }> {
  await requireFinanceAccess();
  const supplier = await prisma.supplier.create({ data: { name } });
  revalidatePath("/contatos/fornecedores");
  revalidatePath("/financeiro/contas-a-pagar");
  return { id: supplier.id, name: supplier.name };
}

export async function createSupplier(data: { name: string; document?: string; email?: string; phone?: string; notes?: string }) {
  await requireFinanceAccess();
  await prisma.supplier.create({
    data: {
      name: data.name,
      document: data.document || null,
      email: data.email || null,
      phone: data.phone || null,
      notes: data.notes || null,
    },
  });
  revalidatePath("/contatos/fornecedores");
}

export async function updateSupplier(
  id: string,
  data: { name: string; document?: string; email?: string; phone?: string; notes?: string }
) {
  await requireFinanceAccess();
  await prisma.supplier.update({
    where: { id },
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
  const linked = await prisma.payable.count({ where: { supplierId: id } });
  if (linked > 0) {
    return { error: `Não é possível excluir: há ${linked} lançamento(s) vinculado(s) a este fornecedor.` };
  }
  await prisma.supplier.delete({ where: { id } });
  revalidatePath("/contatos/fornecedores");
  return {};
}
