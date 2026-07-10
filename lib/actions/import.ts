"use server";

import { revalidatePath } from "next/cache";
import { parseSpreadsheet } from "@/lib/importers/parse";
import { importCasesCore, importAgendaCore, type ImportResult } from "@/lib/importers/importCore";
import { importFinanceCore } from "@/lib/importers/importFinance";
import { requireFinanceAccess } from "@/lib/permissions";

export type { ImportResult };

export async function importCases(_prevState: ImportResult, formData: FormData): Promise<ImportResult> {
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { created: 0, skipped: 0, errors: ["Nenhum arquivo enviado."] };

  const rows = await parseSpreadsheet(file);
  const result = await importCasesCore(rows);

  revalidatePath("/processos");
  revalidatePath("/contatos/clientes");
  revalidatePath("/contatos/parte-adversa");
  return result;
}

export async function importFinance(_prevState: ImportResult, formData: FormData): Promise<ImportResult> {
  await requireFinanceAccess();
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { created: 0, skipped: 0, errors: ["Nenhum arquivo enviado."] };

  const rows = await parseSpreadsheet(file);
  const result = await importFinanceCore(rows);

  revalidatePath("/financeiro");
  revalidatePath("/financeiro/contas-a-pagar");
  revalidatePath("/financeiro/contas-a-receber");
  revalidatePath("/financeiro/dre");
  revalidatePath("/financeiro/fluxo-de-caixa");
  revalidatePath("/financeiro/livro-caixa");
  return result;
}

export async function importAgenda(_prevState: ImportResult, formData: FormData): Promise<ImportResult> {
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { created: 0, skipped: 0, errors: ["Nenhum arquivo enviado."] };

  const rows = await parseSpreadsheet(file);
  const result = await importAgendaCore(rows);

  revalidatePath("/agenda");
  revalidatePath("/kanban");
  revalidatePath("/");
  return result;
}
