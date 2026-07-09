"use server";

import { revalidatePath } from "next/cache";
import { parseSpreadsheet } from "@/lib/importers/parse";
import { importCasesCore, importAgendaCore, type ImportResult } from "@/lib/importers/importCore";

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
