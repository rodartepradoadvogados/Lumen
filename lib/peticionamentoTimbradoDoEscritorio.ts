import { prisma } from "@/lib/prisma";

/**
 * O timbrado DO ESCRITÓRIO DE QUEM PEDIU: o formato cadastrado e, quando ele é .docx, o arquivo
 * baixado do endereço cadastrado. `docx` é null quando não há timbrado, quando ele é PDF (que não é
 * aplicado nem na exportação) ou quando o download falha.
 *
 * Um lugar só para a exportação (lib/actions/peticionamento.ts:confirmarExportacao) e para a prévia
 * da minuta: se cada uma baixasse do seu jeito, a prévia poderia mostrar um timbrado que o Word não
 * aplica. O `officeId` vem sempre de quem está logado, nunca de parâmetro da tela.
 */
export async function timbradoDoEscritorio(officeId: string): Promise<{ formato: string | null; docx: Buffer | null }> {
  const office = await prisma.office.findUnique({ where: { id: officeId }, select: { timbradoUrl: true, timbradoFormato: true } });
  if (!office?.timbradoUrl) return { formato: null, docx: null };
  const formato = office.timbradoFormato ?? null;
  if (formato !== "DOCX") return { formato, docx: null };
  try {
    const resp = await fetch(office.timbradoUrl);
    return { formato, docx: resp.ok ? Buffer.from(await resp.arrayBuffer()) : null };
  } catch {
    return { formato, docx: null };
  }
}
