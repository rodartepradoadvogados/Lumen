"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";
import { mensagemDeErro } from "@/lib/mensagemDeErro";
import { precoAMostrar, quantasCampanhasAtivasAgora, type EstadoDoSlot, type ParametrosDePreco } from "@/lib/moduloCampanhas";
import { assinarModuloDeCampanhas } from "@/lib/actions/campanhasCobranca";

// ============================================================================
// A TELA DO MÓDULO, NO ESCRITÓRIO (Frente D, §1 e §6.1-6.2). Server Actions próprias desta
// frente — nenhuma regra de preço, carência ou numeração é decidida aqui, só chamada
// (lib/moduloCampanhas.ts, lib/actions/campanhasCobranca.ts). O que é novo aqui é só o que
// faltava para o BOTÃO da tela funcionar: gravar a instrução de treinamento do perfil e criar o
// PEDIDO de uma campanha simultânea nova (o painel mestre, Frente D também, é quem libera —
// ver lib/actions/campanhasPainelMestre.ts).
// ============================================================================

async function exigirAdministrador() {
  const user = await getCurrentUser();
  if (!user || !user.active || !user.isAdmin) return null;
  return user;
}

const FORMAS_DE_PAGAMENTO_VALIDAS = ["BOLETO", "PIX_QRCODE", "PIX_AUTOMATICO"] as const;

async function lerParametrosDePreco(): Promise<ParametrosDePreco> {
  const linhas = await prisma.campanhaPrecoParametro.findMany({
    where: { chave: { in: ["MENSALIDADE_MODULO", "SLOT_EXTRA"] } },
  });
  const porChave = new Map(linhas.map((l) => [l.chave, l.preco]));
  return {
    mensalidadeModulo: porChave.get("MENSALIDADE_MODULO") ?? null,
    precoSlotExtra: porChave.get("SLOT_EXTRA") ?? null,
  };
}

// ============================================================================
// 1 · ASSINAR O MÓDULO — o próprio escritório, autoatendimento (mesmo espírito de
// OfficeBillingSummary na aba "Cobrança"). A regra (hard gate de preço, criação da assinatura +
// perfil DESATIVADO) é inteira da Frente B; esta função só resolve QUEM está assinando.
// ============================================================================

export async function assinarModulo(formaDePagamento: string): Promise<{ error?: string }> {
  const user = await exigirAdministrador();
  if (!user) return { error: "Apenas administradores do escritório podem assinar o módulo de campanhas." };
  if (!(FORMAS_DE_PAGAMENTO_VALIDAS as readonly string[]).includes(formaDePagamento)) {
    return { error: "Escolha uma forma de pagamento válida." };
  }

  const r = await assinarModuloDeCampanhas(user.officeId, formaDePagamento);
  if (!r.ok) return { error: r.motivo };
  return {};
}

// ============================================================================
// 2 · TREINAMENTO DO PERFIL DE CAMPANHA (§5) — MESMO CAMPO/TELA de sempre
// (components/atendente/AtendentePainel.tsx), agora gravando PerfilCampanhaHermes.instrucoes em
// vez de WhatsappConfig.agenteInstrucoes. Nunca apaga nada além deste campo — §7 exige que
// desativar a assinatura preserve o treinamento, e esta ação nem toca em `estado`.
// ============================================================================

export async function salvarInstrucoesDoPerfilDeCampanha(instrucoes: string): Promise<{ error?: string }> {
  const user = await exigirAdministrador();
  if (!user) return { error: "Apenas administradores do escritório podem editar o treinamento do perfil de campanha." };

  const assinatura = await prisma.assinaturaModuloCampanhas.findUnique({
    where: { officeId: user.officeId },
    include: { perfil: true },
  });
  if (!assinatura?.perfil) return { error: "Assine o módulo de campanhas antes de treinar o perfil." };

  await prisma.perfilCampanhaHermes.update({
    where: { id: assinatura.perfil.id },
    data: { instrucoes: instrucoes.trim() },
  });

  revalidatePath("/configuracoes");
  return {};
}

// ============================================================================
// 3 · SOLICITAR UMA NOVA CAMPANHA SIMULTÂNEA (§6.1-6.2) — o clique em "solicitar campanha" no
// pop-up. Cria a campanha (o escritório preenche o roteiro depois, pelo mesmo assistente que já
// existe — CampanhaWizard) e o PEDIDO de slot pago, em SOLICITADO: quem aprova é o painel mestre
// (lib/actions/campanhasPainelMestre.ts:liberarCampanhaSlot, que chama
// lib/actions/campanhasCobranca.ts:aprovarCampanhaSlotPago — a cobrança em si nasce só na
// aprovação, nunca aqui).
//
// HARD GATE DE PREÇO, repetido aqui de propósito (mesma trava de
// lib/campanhasCobranca.ts:prepararCobrancaDoSlotExtra): o pop-up já desliga o botão quando o
// preço não está configurado, mas a ação do lado do servidor não pode confiar só nisso — quem
// chamar a Server Action direto (console do navegador) tem que bater na mesma parede.
// ============================================================================

export type ResultadoDaSolicitacao = { ok: true } | { ok: false; motivo: string };

export async function solicitarNovaCampanha(dados: { nome: string; formaDePagamento: string }): Promise<ResultadoDaSolicitacao> {
  const user = await exigirAdministrador();
  if (!user) return { ok: false, motivo: "Apenas administradores do escritório podem solicitar uma campanha." };

  const nome = dados.nome.trim();
  if (!nome) return { ok: false, motivo: "Dê um nome a esta campanha." };
  if (!(FORMAS_DE_PAGAMENTO_VALIDAS as readonly string[]).includes(dados.formaDePagamento)) {
    return { ok: false, motivo: "Escolha uma forma de pagamento válida." };
  }

  const assinatura = await prisma.assinaturaModuloCampanhas.findUnique({
    where: { officeId: user.officeId },
    include: { slots: true },
  });
  if (!assinatura) return { ok: false, motivo: "Assine o módulo de campanhas antes de solicitar uma campanha simultânea." };

  const parametros = await lerParametrosDePreco();
  // A mesma omissão falante de sempre: preço ausente (mensalidade OU slot extra) recusa de
  // ponta a ponta — nunca um pedido "pela metade" esperando um preço que ainda não existe.
  const quantasAtivasAgora = quantasCampanhasAtivasAgora({
    campanhaBaseAtiva: true, // irrelevante para o HARD GATE de preço — só o slot extra é cobrado aqui
    estadosDosSlots: assinatura.slots.map((s) => s.estado as EstadoDoSlot),
  });
  const preco = precoAMostrar(parametros, quantasAtivasAgora);
  if (!preco.configurado) return { ok: false, motivo: preco.motivo };

  try {
    await prisma.$transaction(async (tx) => {
      const campanha = await tx.campanha.create({
        data: {
          officeId: user.officeId,
          nome,
          ativa: false, // nasce desligada — o roteiro (perguntas, mensagens) ainda falta preencher
          area: "",
          sobre: nome,
          primeiraMensagem: "",
          mensagemDeTransferencia: "",
        },
        select: { id: true },
      });
      await tx.campanhaSlotPago.create({
        data: {
          officeId: user.officeId,
          assinaturaId: assinatura.id,
          campanhaId: campanha.id,
          estado: "SOLICITADO",
          formaDePagamento: dados.formaDePagamento,
        },
      });
    });
  } catch (e) {
    console.error("[campanhasTela] falha ao solicitar campanha:", mensagemDeErro(e));
    return { ok: false, motivo: "Não foi possível registrar o pedido agora. Tente novamente." };
  }

  revalidatePath("/configuracoes");
  revalidatePath("/painel-mestre/campanhas");
  return { ok: true };
}
