"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";
import { podeVerAtendimentos, filtroDoAtendimento, SEM_ACESSO_AO_ATENDIMENTO } from "@/lib/acessoAtendimento";
import { podeCadastrarComo, separarDdi, type TipoDeContato } from "@/lib/quemEEsteNumero";
import { identificarNumero, telefoneDoAtendimento } from "@/lib/identificarNumero";
import { assuntoPadraoWhatsapp, nomeEhTemporario } from "@/lib/nomeTemporarioDoLead";
import { renomearPastaSeExistir } from "@/lib/renomeacaoDoAtendimento";

// ============================================================================
// CADASTRAR O CONTATO SEM SAIR DO ATENDIMENTO.
//
// O número chegou, não é ninguém conhecido, e a tela oferece três botões: cliente, advogado,
// fornecedor. Um clique cria o cadastro com o nome e o telefone que o atendimento já tem — porque
// o atrito de abrir outra tela, achar o botão de novo cadastro e redigitar o telefone é
// exatamente o motivo pelo qual as agendas de escritório ficam vazias.
//
// O CADASTRO NASCE MAGRO, e isso é a decisão certa: nome e telefone. Documento, endereço e o resto
// se completam na ficha, quando houver motivo. Exigir o CPF aqui transformaria um clique numa
// tarefa, e a tarefa não seria feita.
// ============================================================================

export async function cadastrarContatoDoAtendimento(
  attendanceId: string,
  tipo: string,
  // F5.5 — o nome que a pessoa DIGITOU no pop-up "Quem é este número" (DefinirNomeDoLead.tsx),
  // quando o atendimento ainda carrega o nome temporário (ver lib/nomeTemporarioDoLead.ts). Sem
  // isto, o cadastro nascia com `a.clientName` — e quando ele ainda é "Novo contato (telefone)",
  // o escritório ganhava um cliente cadastrado com esse texto como nome de verdade. Opcional e
  // ignorado quando vazio: o botão de sempre (nome já identificado) continua funcionando igual.
  nomeOverride?: string
): Promise<{ error?: string; id?: string; tipo?: TipoDeContato }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada. Faça login novamente." };
  if (!podeVerAtendimentos(viewer)) return { error: SEM_ACESSO_AO_ATENDIMENTO };
  // "equipe" não entra: quem é da casa é cadastrado em Configurações, com papel e senha — não por
  // um botão numa conversa. A checagem é pelo tipo, e não por uma lista repetida aqui.
  if (!podeCadastrarComo(tipo)) return { error: "Tipo de contato inválido." };

  const a = await prisma.attendance.findFirst({
    where: { id: attendanceId, officeId: viewer.officeId, ...filtroDoAtendimento(viewer, viewer.id) },
    select: { id: true, clientName: true, subject: true, driveFolderId: true, waPhone: true, contactPhone: true, contactPhoneDdi: true, clientId: true },
  });
  if (!a) return { error: "Atendimento não encontrado." };

  const telefone = telefoneDoAtendimento(a);
  if (!telefone) return { error: "Este atendimento não tem telefone para cadastrar." };

  // CONFERE DE NOVO ANTES DE CRIAR. A tela decidiu "não é ninguém" quando foi renderizada; entre
  // aquele instante e este clique alguém pode ter cadastrado o mesmo número por outro caminho, e
  // duas fichas do mesmo cliente é o tipo de sujeira que ninguém limpa depois.
  const { contato } = await identificarNumero(viewer.officeId, a);
  if (contato) return { error: `Este número já está cadastrado como ${contato.nome}.` };

  const nome = nomeOverride?.trim() || a.clientName.trim() || "Sem nome";
  // O DDI do formulário, quando existe, vale mais do que qualquer dedução: alguém o escolheu num
  // seletor de país. Só quando ele não existe é que o número é partido.
  const partes = a.contactPhoneDdi?.trim() && a.contactPhone?.trim()
    ? { ddi: a.contactPhoneDdi.replace(/\D/g, ""), numero: a.contactPhone.trim() }
    : separarDdi(telefone);
  const dados = { name: nome, phone: partes.numero, phoneDdi: partes.ddi || null, officeId: viewer.officeId };

  let id: string;
  if (tipo === "cliente") {
    const criado = await prisma.client.create({ data: { ...dados, type: "PF" } });
    id = criado.id;
    // Vincula o atendimento ao cadastro novo — sem isso o cliente existiria na agenda e o
    // atendimento continuaria solto, e a conversão em processo pediria o cliente outra vez.
    if (!a.clientId) await prisma.attendance.update({ where: { id: a.id }, data: { clientId: id } });
    revalidatePath("/contatos/clientes");
  } else if (tipo === "advogado") {
    // PARCEIRO é o padrão do schema e continua sendo o padrão aqui: marcar alguém como adverso é
    // uma afirmação sobre um processo, e ela se faz na ficha, olhando o processo.
    const criado = await prisma.lawyer.create({ data: { ...dados, side: "PARCEIRO" } });
    id = criado.id;
    revalidatePath("/contatos/advogados");
  } else {
    const criado = await prisma.supplier.create({ data: dados });
    id = criado.id;
    revalidatePath("/contatos/fornecedores");
  }

  // O NOME DE VERDADE VAI PARA O ATENDIMENTO TAMBÉM — não só para o cadastro novo. Sem isto, o
  // atendimento continuava com "Novo contato (telefone)" no cabeçalho e na pasta do Drive mesmo
  // depois de a pessoa acabar de identificá-lo (F5.5). Só troca quando o nome ainda é o temporário:
  // um atendimento que já tinha nome próprio (alguém digitou "João" na abertura, por exemplo) não
  // deve virar o nome do cadastro por causa de um clique num botão que só cria contato.
  if (nomeOverride?.trim() && nomeEhTemporario(a.clientName)) {
    const novoAssunto = assuntoPadraoWhatsapp(nome);
    await prisma.attendance.update({ where: { id: a.id }, data: { clientName: nome, subject: novoAssunto } });
    await renomearPastaSeExistir(a.driveFolderId, novoAssunto, a.subject, viewer.officeId);
  }

  revalidatePath("/contatos");
  revalidatePath(`/atendimento/${a.id}`);
  revalidatePath(`/m/atendimento/${a.id}`);
  return { id, tipo };
}

function revalidarConversa(attendanceId: string): void {
  revalidatePath(`/atendimento/${attendanceId}`);
  revalidatePath(`/m/atendimento/${attendanceId}`);
  revalidatePath("/atendimento-central");
  revalidatePath("/atendimento");
}

/**
 * "Definir nome do cliente manualmente" — o primeiro dos três caminhos do pop-up (F5.5, pedido do
 * dono): quem está na conversa com um humano só digita o nome, sem criar cadastro nenhum. Serve
 * para quem não vale a pena virar contato formal (uma dúvida pontual, por exemplo) mas cuja pasta
 * do Drive não deveria continuar com o nome temporário.
 */
export async function definirNomeDoLead(attendanceId: string, nome: string): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada. Faça login novamente." };
  if (!podeVerAtendimentos(viewer)) return { error: SEM_ACESSO_AO_ATENDIMENTO };

  const trimmed = nome.trim();
  if (!trimmed) return { error: "Digite um nome." };
  if (trimmed.length > 120) return { error: "Nome longo demais." };

  const a = await prisma.attendance.findFirst({
    where: { id: attendanceId, officeId: viewer.officeId, ...filtroDoAtendimento(viewer, viewer.id) },
    select: { id: true, subject: true, driveFolderId: true },
  });
  if (!a) return { error: "Atendimento não encontrado." };

  const novoAssunto = assuntoPadraoWhatsapp(trimmed);
  await prisma.attendance.update({ where: { id: a.id }, data: { clientName: trimmed, subject: novoAssunto } });
  await renomearPastaSeExistir(a.driveFolderId, novoAssunto, a.subject, viewer.officeId);

  revalidarConversa(a.id);
  return {};
}

/**
 * "Selecionar um contato" — o segundo caminho do pop-up: a pessoa já está cadastrada como cliente
 * (achada pela busca, ver `searchClients` em lib/actions/attendance.ts), só faltava vincular. Vai
 * junto o nome do cadastro para o atendimento — mesma razão de `cadastrarContatoDoAtendimento`
 * acima: sem isso a pasta do Drive continuaria com o nome temporário mesmo depois do vínculo.
 */
export async function vincularAtendimentoAoCliente(attendanceId: string, clientId: string): Promise<{ error?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada. Faça login novamente." };
  if (!podeVerAtendimentos(viewer)) return { error: SEM_ACESSO_AO_ATENDIMENTO };

  const [a, cliente] = await Promise.all([
    prisma.attendance.findFirst({
      where: { id: attendanceId, officeId: viewer.officeId, ...filtroDoAtendimento(viewer, viewer.id) },
      select: { id: true, subject: true, driveFolderId: true },
    }),
    prisma.client.findFirst({ where: { id: clientId, officeId: viewer.officeId }, select: { id: true, name: true } }),
  ]);
  if (!a) return { error: "Atendimento não encontrado." };
  if (!cliente) return { error: "Cliente não encontrado." };

  const novoAssunto = assuntoPadraoWhatsapp(cliente.name);
  await prisma.attendance.update({
    where: { id: a.id },
    data: { clientId: cliente.id, clientName: cliente.name, subject: novoAssunto },
  });
  await renomearPastaSeExistir(a.driveFolderId, novoAssunto, a.subject, viewer.officeId);

  revalidarConversa(a.id);
  return {};
}
