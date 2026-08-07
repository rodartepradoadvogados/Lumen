import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFinanceOfficeId } from "@/lib/actions/financeiro";
import { getFinanceReceiptsFolderId, uploadFileToDriveFolder, deleteDriveFile } from "@/lib/storageProvider";
import { buildReceiptFileName, extensionFromFileName } from "@/lib/financeReceiptNaming";
import type { StorageProvider } from "@/lib/storageProvider";

const MAX_SIZE = 25 * 1024 * 1024; // 25MB

// Upload do comprovante de pagamento/recebimento (Contas a Pagar/Contas a Receber) — mesmo
// desenho de app/api/assessoria/documentos/upload/route.ts (Route Handler, não Server Action,
// porque precisa de request.formData() com um File real). Diferença central: aqui o NOME do
// arquivo não vem do usuário — é sempre calculado por buildReceiptFileName (ver
// lib/financeReceiptNaming.ts), então o parâmetro "name" do form não existe neste endpoint.
//
// Sem revalidatePath aqui de propósito — mesmo padrão do endpoint da Assessoria: quem chama faz
// router.refresh() depois do fetch dar certo (ver componentes que consomem este endpoint).
export async function POST(request: NextRequest) {
  let officeId: string;
  try {
    officeId = await requireFinanceOfficeId();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Sessão inválida." }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const kind = formData.get("kind");
  const entityId = formData.get("entityId");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
  }
  if (kind !== "PAYABLE" && kind !== "RECEIVABLE") {
    return NextResponse.json({ error: "Tipo de conta inválido." }, { status: 400 });
  }
  if (typeof entityId !== "string" || !entityId) {
    return NextResponse.json({ error: "Conta inválida." }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Arquivo muito grande (máximo 25MB)." }, { status: 400 });
  }

  // officeId SEMPRE do usuário logado (requireFinanceOfficeId acima) — nunca do formData. Um
  // entityId de outro escritório simplesmente não é encontrado abaixo e cai no 404, sem vazar
  // se a conta existe ou não em outro tenant.
  //
  // Achatado em variáveis soltas (não um `entity` de tipo união) logo depois da busca: o
  // TypeScript não consegue estreitar `Payable | Receivable` a partir de `kind === "PAYABLE"`
  // quando os dois lados nascem de uma única declaração — cada branch aqui já resolve o que
  // precisa (contraparte, descrição, datas, comprovante anterior) no seu próprio tipo concreto.
  let description: string;
  let counterpart: string | null;
  let paidDate: Date | null;
  let dueDate: Date;
  let oldReceiptFileId: string | null;
  let oldReceiptProvider: string | null;

  if (kind === "PAYABLE") {
    const p = await prisma.payable.findFirst({
      where: { id: entityId, officeId },
      select: { description: true, supplier: true, paidDate: true, dueDate: true, receiptStorageFileId: true, receiptStorageProvider: true },
    });
    if (!p) return NextResponse.json({ error: "Conta a pagar não encontrada." }, { status: 404 });
    description = p.description;
    counterpart = p.supplier;
    paidDate = p.paidDate;
    dueDate = p.dueDate;
    oldReceiptFileId = p.receiptStorageFileId;
    oldReceiptProvider = p.receiptStorageProvider;
  } else {
    const r = await prisma.receivable.findFirst({
      where: { id: entityId, officeId },
      select: {
        description: true,
        payerName: true,
        paidDate: true,
        dueDate: true,
        receiptStorageFileId: true,
        receiptStorageProvider: true,
        client: { select: { name: true } },
      },
    });
    if (!r) return NextResponse.json({ error: "Conta a receber não encontrada." }, { status: 404 });
    description = r.description;
    counterpart = r.client?.name ?? r.payerName;
    paidDate = r.paidDate;
    dueDate = r.dueDate;
    oldReceiptFileId = r.receiptStorageFileId;
    oldReceiptProvider = r.receiptStorageProvider;
  }

  const fileName = buildReceiptFileName({
    date: paidDate ?? dueDate,
    counterpart,
    description,
    extension: extensionFromFileName(file.name),
  });

  try {
    const folderId = await getFinanceReceiptsFolderId(kind, officeId);
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadFileToDriveFolder(fileName, file.type || "application/octet-stream", buffer, folderId, officeId);

    // Só existe UM comprovante por conta (diferente dos Anexos de Processo, que são lista) — um
    // novo upload SUBSTITUI o anterior. Apaga o arquivo antigo depois do novo já estar salvo no
    // provedor (nunca antes: uma falha no upload novo não pode deixar a conta sem comprovante
    // nenhum). Best-effort: se o antigo já não existir mais lá (apagado por fora, por exemplo),
    // não impede a troca de valer.
    if (oldReceiptFileId && oldReceiptProvider) {
      try {
        await deleteDriveFile(oldReceiptFileId, officeId, oldReceiptProvider as StorageProvider);
      } catch (e) {
        console.error(`[financeiro] falha ao apagar comprovante antigo de ${kind === "PAYABLE" ? "despesa" : "receita"} ${entityId}:`, e);
      }
    }

    const data = {
      receiptDriveUrl: result.webViewLink,
      receiptStorageProvider: result.storageProvider,
      receiptStorageFileId: result.id,
      receiptFileName: fileName,
    };
    if (kind === "PAYABLE") await prisma.payable.update({ where: { id: entityId }, data });
    else await prisma.receivable.update({ where: { id: entityId }, data });

    return NextResponse.json({ url: result.webViewLink, name: fileName });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro ao enviar arquivo.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
