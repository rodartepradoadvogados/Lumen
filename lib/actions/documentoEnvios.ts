"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";
import { isCaseInOffice } from "@/lib/officeScope";
import { isDocumentoEnvioMetodo } from "@/lib/documentoEnvios";

// Server actions do botão "Enviar E-mail/WhatsApp" da aba Protocolos (ver lib/documentoEnvios.ts
// para a rotina de domínio e prisma/schema.prisma para DocumentoEnvio/DocumentoEnvioItem).
//
// Mesma regra dos Protocolos: um envio só REFERENCIA documentos (attachmentId) — nenhuma função
// aqui faz upload, copia arquivo ou manda e-mail/mensagem de verdade (isso fica a cargo do
// mailto:/wa.me montado no cliente, ver lib/documentoEnvios.ts).

// ---------------------------------------------------------------------------
// Contatos sugeridos (Client/Lawyer/Supplier do escritório) para preencher o destinatário
// ---------------------------------------------------------------------------

export type ContatoEnvio = {
  id: string;
  tipo: "CLIENTE" | "ADVOGADO" | "FORNECEDOR";
  name: string;
  contato: string; // e-mail ou telefone, conforme o método pedido
};

// Contatos do escritório (não só deste processo — um documento pode ir para qualquer cliente,
// advogado da parte contrária/parceiro ou fornecedor cadastrado) que têm o campo pedido
// preenchido. Filtragem por nome fica a cargo do cliente (lista pequena o bastante para não
// precisar de busca no servidor a cada tecla — mesmo padrão de EntityPicker).
export async function listarContatosEnvio(caseId: string, metodo: string): Promise<ContatoEnvio[]> {
  const viewer = await getCurrentUser();
  if (!viewer) return [];
  if (!isDocumentoEnvioMetodo(metodo)) return [];
  if (!(await isCaseInOffice(caseId, viewer.officeId))) return [];

  // Prisma não aceita chave de campo dinâmica no tipo de `where` (o nome da coluna precisa ser
  // literal para o TypeScript resolver o tipo certo) — daí o `where` completo variar por `metodo`
  // em vez de montar um objeto com `[campo]` computado.
  const filtro = metodo === "EMAIL" ? { email: { not: null } } : { phone: { not: null } };

  const [clients, lawyers, suppliers] = await Promise.all([
    prisma.client.findMany({
      where: { officeId: viewer.officeId, ...filtro },
      select: { id: true, name: true, email: true, phone: true },
    }),
    prisma.lawyer.findMany({
      where: { officeId: viewer.officeId, ...filtro },
      select: { id: true, name: true, email: true, phone: true },
    }),
    prisma.supplier.findMany({
      where: { officeId: viewer.officeId, ...filtro },
      select: { id: true, name: true, email: true, phone: true },
    }),
  ]);

  const toContato = (v: { email: string | null; phone: string | null }) => (metodo === "EMAIL" ? v.email : v.phone);

  const lista: ContatoEnvio[] = [
    ...clients.map((c) => ({ id: c.id, tipo: "CLIENTE" as const, name: c.name, contato: toContato(c) ?? "" })),
    ...lawyers.map((l) => ({ id: l.id, tipo: "ADVOGADO" as const, name: l.name, contato: toContato(l) ?? "" })),
    ...suppliers.map((s) => ({ id: s.id, tipo: "FORNECEDOR" as const, name: s.name, contato: toContato(s) ?? "" })),
  ].filter((c) => c.contato.trim() !== "");

  return lista.sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Registrar o envio (o ato de "deixar rastro" — o item central desta funcionalidade)
// ---------------------------------------------------------------------------

export async function registrarEnvioDocumentos(data: {
  caseId: string;
  metodo: string;
  destinatarioNome: string;
  destinatarioContato: string;
  attachmentIds: string[];
}): Promise<{ id?: string; error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada. Faça login novamente." };
  if (!isDocumentoEnvioMetodo(data.metodo)) return { error: "Método inválido." };
  if (!data.destinatarioNome.trim()) return { error: "Informe o nome do destinatário." };
  if (!data.destinatarioContato.trim()) {
    return { error: data.metodo === "EMAIL" ? "Informe o e-mail do destinatário." : "Informe o telefone do destinatário." };
  }
  if (data.attachmentIds.length === 0) return { error: "Selecione ao menos um documento." };
  if (!(await isCaseInOffice(data.caseId, viewer.officeId))) return { error: "Processo não encontrado." };

  const attachments = await prisma.attachment.findMany({
    where: { id: { in: data.attachmentIds }, officeId: viewer.officeId, caseId: data.caseId },
    select: { id: true, name: true, docType: true },
  });
  // Mesmo comportamento de createProtocoloLote: id que não resolver é ignorado, não barra o
  // resto; a ordem final segue a ordem em que os ids chegaram.
  const byId = new Map(attachments.map((a) => [a.id, a]));
  const ordered = data.attachmentIds.map((id) => byId.get(id)).filter((a): a is (typeof attachments)[number] => Boolean(a));
  if (ordered.length === 0) return { error: "Nenhum dos documentos selecionados foi encontrado." };

  const envio = await prisma.documentoEnvio.create({
    data: {
      metodo: data.metodo,
      destinatarioNome: data.destinatarioNome.trim(),
      destinatarioContato: data.destinatarioContato.trim(),
      caseId: data.caseId,
      officeId: viewer.officeId,
      enviadoPorId: viewer.id,
      itens: {
        create: ordered.map((a) => ({
          attachmentId: a.id,
          nomeSnapshot: a.name,
          docTypeSnapshot: a.docType,
        })),
      },
    },
  });

  revalidatePath(`/processos/${data.caseId}`);
  return { id: envio.id };
}

// Apaga um registro de envio feito por engano (destinatário errado, documento errado etc.) — não
// existe edição: como é um registro histórico simples (sem ciclo de vida, ao contrário do
// protocolo), refazer do zero é mais simples e menos arriscado que um fluxo de edição parcial.
export async function excluirEnvioDocumentos(envioId: string): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada. Faça login novamente." };

  const envio = await prisma.documentoEnvio.findFirst({ where: { id: envioId, officeId: viewer.officeId } });
  if (!envio) return { error: "Registro não encontrado." };

  await prisma.documentoEnvio.delete({ where: { id: envioId } });
  revalidatePath(`/processos/${envio.caseId}`);
  return {};
}
