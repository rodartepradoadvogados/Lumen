import { prisma } from "@/lib/prisma";
import { composePhoneWithDdi } from "@/lib/documentoEnvios";
import { casarContato, type ContatoConhecido } from "@/lib/quemEEsteNumero";

// ============================================================================
// O LADO DE IO DE "QUEM É ESTE NÚMERO".
//
// lib/quemEEsteNumero.ts decide; este arquivo só vai buscar o que ele precisa decidir. A divisão
// existe para que a regra de precedência (advogado antes de cliente) seja testável sem banco.
//
// UMA VARREDURA, NÃO QUATRO CONSULTAS POR NÚMERO. A comparação não pode ser feita no WHERE do
// Prisma: o número do WhatsApp chega como "556299998888" e o cadastro guarda "62 99999-8888" com
// o DDI em outra coluna — nenhum LIKE casa isso. Então as quatro agendas do escritório vêm
// inteiras e a comparação acontece em memória (ver mesmoNumero, que trata o nono dígito).
//
// Isso é aceitável porque as agendas de um escritório são pequenas — centenas, não milhões — e
// porque a alternativa (guardar uma coluna normalizada) exige migração e reescrita de todos os
// formulários de telefone. Quando as agendas crescerem, o lugar de arrumar é aqui, numa coluna
// `telefoneDigitos` indexada, e nada acima deste arquivo muda.
// ============================================================================

/** As quatro agendas do escritório, achatadas na forma que `casarContato` entende. */
export async function agendaDoEscritorio(officeId: string): Promise<ContatoConhecido[]> {
  const [clients, lawyers, suppliers, users] = await Promise.all([
    prisma.client.findMany({
      where: { officeId, phone: { not: null } },
      select: { id: true, name: true, phone: true, phoneDdi: true, type: true },
    }),
    prisma.lawyer.findMany({
      where: { officeId, phone: { not: null } },
      select: { id: true, name: true, phone: true, phoneDdi: true, side: true, firm: true },
    }),
    prisma.supplier.findMany({
      where: { officeId, phone: { not: null } },
      select: { id: true, name: true, phone: true, phoneDdi: true },
    }),
    // Só quem está ativo: o número de quem saiu do escritório não deve mais "reconhecer" ninguém.
    prisma.user.findMany({
      where: { officeId, active: true, phone: { not: null } },
      select: { id: true, name: true, phone: true, phoneDdi: true, role: true },
    }),
  ]);

  const junto = (p: { phone: string | null; phoneDdi: string | null }) => composePhoneWithDdi(p.phoneDdi, p.phone || "");

  return [
    ...clients.map((c) => ({
      tipo: "cliente" as const,
      id: c.id,
      nome: c.name,
      telefone: junto(c),
      detalhe: c.type === "PJ" ? "Cliente · pessoa jurídica" : "Cliente",
    })),
    ...lawyers.map((l) => ({
      tipo: "advogado" as const,
      id: l.id,
      nome: l.name,
      telefone: junto(l),
      // O lado vem primeiro na frase de propósito: é a informação que muda o que se pode escrever.
      detalhe: [l.side === "ADVERSO" ? "Advogado adverso" : "Advogado parceiro", l.firm].filter(Boolean).join(" · "),
    })),
    ...suppliers.map((s) => ({
      tipo: "fornecedor" as const,
      id: s.id,
      nome: s.name,
      telefone: junto(s),
      detalhe: "Fornecedor",
    })),
    ...users.map((u) => ({
      tipo: "equipe" as const,
      id: u.id,
      nome: u.name,
      telefone: junto(u),
      detalhe: u.role || "Equipe do escritório",
    })),
  ];
}

/**
 * O telefone que este atendimento tem, na ordem em que se deve confiar nele.
 *
 * `waPhone` vem do próprio WhatsApp e é sempre o número verdadeiro de quem escreveu. O
 * `contactPhone` foi digitado por alguém — pode ter erro de digitação, pode ser o telefone do
 * escritório do cliente e não o dele. Por isso o do WhatsApp ganha quando os dois existem.
 */
export function telefoneDoAtendimento(a: {
  waPhone?: string | null;
  contactPhone?: string | null;
  contactPhoneDdi?: string | null;
}): string | null {
  const wa = (a.waPhone || "").trim();
  if (wa) return wa;
  const digitado = (a.contactPhone || "").trim();
  if (digitado) return composePhoneWithDdi(a.contactPhoneDdi, digitado);
  return null;
}

/**
 * Quem é o número deste atendimento — ou nulo, quando não é ninguém que o escritório conheça.
 *
 * Nulo tem DOIS motivos que a tela precisa distinguir, e é por isso que ela recebe também o
 * telefone: sem telefone não há o que oferecer; com telefone e sem casamento, oferece o cadastro.
 */
export async function identificarNumero(
  officeId: string,
  a: { waPhone?: string | null; contactPhone?: string | null; contactPhoneDdi?: string | null }
): Promise<{ telefone: string | null; contato: ContatoConhecido | null }> {
  const telefone = telefoneDoAtendimento(a);
  if (!telefone) return { telefone: null, contato: null };
  const contato = casarContato(await agendaDoEscritorio(officeId), telefone);
  return { telefone, contato };
}
