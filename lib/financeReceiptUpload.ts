"use client";

// Client-side helper para enviar o comprovante de pagamento/recebimento (ver
// app/api/financeiro/comprovante/upload/route.ts) — usado pelos quatro modais de Contas a
// Pagar/Receber (Novo/Editar, ver components/financeiro/ComprovanteField.tsx) e pelos
// formulários mobile equivalentes, sempre depois que a conta já existe (createPayable/
// createReceivable/updatePayable/updateReceivable já rodaram e devolveram um id real).
export async function uploadFinanceReceipt(
  kind: "PAYABLE" | "RECEIVABLE",
  entityId: string,
  file: File
): Promise<{ error?: string }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("kind", kind);
  formData.append("entityId", entityId);
  const res = await fetch("/api/financeiro/comprovante/upload", { method: "POST", body: formData });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) return { error: data.error || "Erro ao enviar comprovante." };
  return {};
}
