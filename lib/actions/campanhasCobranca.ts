"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import {
  isAsaasConfigured,
  createBoletoCharge,
  createPixQrCodeCharge,
  criarAutorizacaoPixAutomaticaAvulsa,
} from "@/lib/asaas";
import { sendCampanhaCarenciaEmail, sendCampanhaDesativadaEmail } from "@/lib/email";
import { sendWhatsappText } from "@/lib/whatsapp";
import { composePhoneWithDdi } from "@/lib/documentoEnvios";
import { diaDeBrasilia } from "@/lib/horaDeBrasilia";
import { isPlatformStaff } from "@/lib/platformMember";
import {
  quantasCampanhasAtivasAgora,
  normalizarEstadoDaAssinatura,
  normalizarEstadoDoPerfil,
  DIAS_DE_CARENCIA,
  diasCorridosVencidos,
  type ParametrosDePreco,
  type EstadoDoSlot,
} from "@/lib/moduloCampanhas";
import {
  prepararCobrancaDaMensalidade,
  prepararCobrancaDoSlotExtra,
  decidirAcaoDoCiclo,
  slotPrecisaSerInterrompido,
  proximoVencimentoMensal,
} from "@/lib/campanhasCobranca";

// ============================================================================
// MÓDULO PAGO DE CAMPANHAS — cobrança e régua de inadimplência (Frente B). Server Actions e a
// rotina diária que o cron dispara (app/api/cron/campanhas-carencia/route.ts). As regras
// (quando cobrar, quando avisar, quando desativar) são as PURAS de lib/campanhasCobranca.ts e
// lib/moduloCampanhas.ts — este arquivo só busca dado, chama a Asaas/e-mail/WhatsApp e grava o
// resultado. Nenhuma tela nasce aqui (Frente D); nenhum provisionamento no Hermes (Frente C).
// ============================================================================

// ---------------------------------------------------------------------------------------------
// Parâmetros de preço — leitura direta de CampanhaPrecoParametro (Frente A), nunca um valor
// inventado quando a linha ainda não existe (painel mestre nunca abriu a tela de preço = as duas
// linhas nem existem ainda no banco, o que é exatamente o mesmo caso de `preco: null`).
// ---------------------------------------------------------------------------------------------
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

type OfficeParaCobranca = { id: string; name: string; billingEmail: string | null; cnpj: string | null };

// ---------------------------------------------------------------------------------------------
// A ida à Asaas em si — dispatcha para boleto/Pix QR Code/Pix Automático conforme
// `formaDePagamento`, sempre pelo MESMO client de lib/asaas.ts (nunca uma segunda chamada HTTP
// escrita à mão). `dueDate` é sempre o vencimento JÁ GRAVADO do ciclo (AssinaturaModuloCampanhas.
// vencimento ou CampanhaSlotPago.vencimento) — nunca uma data nova calculada aqui, porque a
// Asaas recusa `dueDate` no passado (ver lib/actions/painelMestre.ts:generateAndSendInvoice) e
// reenviar a MESMA cobrança do ciclo (a régua de carência) não pode ficar tentando recriar uma
// cobrança vencida a cada dia.
// ---------------------------------------------------------------------------------------------
async function criarCobrancaNaAsaas(
  office: OfficeParaCobranca,
  formaDePagamento: string,
  valor: number,
  dueDate: Date,
  descricao: string,
  contractId: string,
): Promise<{ asaasId: string; boletoUrl: string | null; pixPayload: string | null }> {
  if (!isAsaasConfigured()) {
    throw new Error("ASAAS_API_KEY não configurada — a integração de cobrança está dormente neste ambiente.");
  }
  const officeParaAsaas = { id: office.id, name: office.name, billingEmail: office.billingEmail ?? "", cnpj: office.cnpj };
  const subscriptionFake = { id: contractId, officeId: office.id, monthlyFee: valor, billingCycle: "MENSAL" as const };

  if (formaDePagamento === "BOLETO") {
    const r = await createBoletoCharge(subscriptionFake, officeParaAsaas, { value: valor, dueDate, description: descricao });
    return { asaasId: r.asaasPaymentId, boletoUrl: r.boletoUrl, pixPayload: null };
  }
  if (formaDePagamento === "PIX_QRCODE") {
    const r = await createPixQrCodeCharge(subscriptionFake, officeParaAsaas, { value: valor, dueDate, description: descricao });
    return { asaasId: r.asaasPaymentId, boletoUrl: null, pixPayload: r.qrCodePayload };
  }
  if (formaDePagamento === "PIX_AUTOMATICO") {
    const r = await criarAutorizacaoPixAutomaticaAvulsa(officeParaAsaas, { value: valor, description: descricao, contractId });
    return { asaasId: r.authorizationId, boletoUrl: null, pixPayload: r.qrCode };
  }
  throw new Error(`Forma de pagamento desconhecida: "${formaDePagamento}".`);
}

// ============================================================================
// 1 · ASSINAR O MÓDULO — cria a assinatura + o perfil (DESATIVADO, sem treinamento ainda) e
// gera a PRIMEIRA cobrança da mensalidade. HARD GATE: recusa de ponta a ponta se o preço não
// estiver configurado — nada é criado no banco, nem a assinatura nem o perfil, porque não
// haveria como cobrar por eles depois.
// ============================================================================

export type ResultadoDeCobranca = { ok: true; assinaturaId: string } | { ok: false; motivo: string };

export async function assinarModuloDeCampanhas(officeId: string, formaDePagamento: string): Promise<ResultadoDeCobranca> {
  const jaExiste = await prisma.assinaturaModuloCampanhas.findUnique({ where: { officeId } });
  if (jaExiste) return { ok: false, motivo: "Este escritório já tem uma assinatura do módulo de campanhas." };

  const office = await prisma.office.findUnique({ where: { id: officeId }, select: { id: true, name: true, billingEmail: true, cnpj: true } });
  if (!office) return { ok: false, motivo: "Escritório não encontrado." };

  const parametros = await lerParametrosDePreco();
  const pedido = prepararCobrancaDaMensalidade(parametros, 0, formaDePagamento, office.name);
  if (pedido.recusado) return { ok: false, motivo: pedido.motivo };

  const agora = new Date();
  const vencimento = proximoVencimentoMensal(agora);

  const assinatura = await prisma.assinaturaModuloCampanhas.create({
    data: {
      officeId,
      estado: "ATIVO",
      iniciadoEm: agora,
      vencimento,
      formaDePagamento,
      perfil: { create: { instrucoes: "", estado: "DESATIVADO" } },
    },
  });

  try {
    const cobranca = await criarCobrancaNaAsaas(office, formaDePagamento, pedido.valor, vencimento, pedido.descricao, assinatura.id);
    await prisma.assinaturaModuloCampanhas.update({
      where: { id: assinatura.id },
      data: { cobrancaAsaasId: cobranca.asaasId, cobrancaBoletoUrl: cobranca.boletoUrl, cobrancaPixPayload: cobranca.pixPayload },
    });
  } catch (e) {
    // A assinatura já existe (o escritório já "assinou"), mas sem cobrança gerada — best effort:
    // não desfaz a assinatura (a Asaas pode estar fora do ar por minutos), fica visível pra
    // quem olhar a tela como "assinatura sem cobrança ainda" e o operador tenta gerar de novo.
    console.error(`[campanhasCobranca] falha ao gerar a primeira cobrança da mensalidade (assinatura ${assinatura.id}):`, e);
  }

  revalidatePath("/painel-mestre");
  return { ok: true, assinaturaId: assinatura.id };
}

// ============================================================================
// 2 · APROVAR UM SLOT PAGO (§6.3-6.5) — qualquer funcionário do Lúmen com login no painel mestre
// (isPlatformStaff, sem papel granular — decisão explícita da especificação). Só aprova de
// verdade (estado ATIVO, cobrança recorrente começando a valer) se a cobrança puder ser gerada;
// preço ausente recusa a aprovação inteira, e o slot continua SOLICITADO.
// ============================================================================

export async function aprovarCampanhaSlotPago(slotId: string, platformMemberId: string): Promise<ResultadoDeCobranca> {
  if (!(await isPlatformStaff())) return { ok: false, motivo: "Sem acesso ao painel mestre." };

  const slot = await prisma.campanhaSlotPago.findUnique({
    where: { id: slotId },
    include: { office: { select: { id: true, name: true, billingEmail: true, cnpj: true } }, assinatura: { include: { slots: true, office: { select: { id: true } } } } },
  });
  if (!slot) return { ok: false, motivo: "Slot não encontrado." };
  if (slot.estado !== "SOLICITADO") return { ok: false, motivo: `Slot já está em estado "${slot.estado}" — não é mais uma solicitação pendente.` };
  if (!slot.formaDePagamento) return { ok: false, motivo: "Escritório ainda não escolheu a forma de pagamento deste slot." };

  const parametros = await lerParametrosDePreco();
  const estadosDosSlots = slot.assinatura.slots.map((s) => s.estado as EstadoDoSlot);
  const quantasAtivas = quantasCampanhasAtivasAgora({ campanhaBaseAtiva: true, estadosDosSlots });
  const pedido = prepararCobrancaDoSlotExtra(parametros, quantasAtivas, slot.formaDePagamento, slot.office.name);
  if (pedido.recusado) return { ok: false, motivo: pedido.motivo };

  const agora = new Date();
  const vencimento = proximoVencimentoMensal(agora);

  try {
    const cobranca = await criarCobrancaNaAsaas(slot.office, slot.formaDePagamento, pedido.valor, vencimento, pedido.descricao, slot.id);
    await prisma.campanhaSlotPago.update({
      where: { id: slot.id },
      data: {
        estado: "ATIVO",
        aprovadoPorId: platformMemberId,
        aprovadoEm: agora,
        ativadoEm: agora,
        vencimento,
        cobrancaAsaasId: cobranca.asaasId,
        cobrancaBoletoUrl: cobranca.boletoUrl,
        cobrancaPixPayload: cobranca.pixPayload,
      },
    });
  } catch (e) {
    const motivo = e instanceof Error ? e.message : "erro desconhecido ao gerar a cobrança na Asaas";
    return { ok: false, motivo: `Não foi possível gerar a cobrança do slot: ${motivo}` };
  }

  revalidatePath("/painel-mestre");
  return { ok: true, assinaturaId: slot.assinaturaId };
}

/** O painel mestre pode negar um pedido de slot sem apagar o registro (comentário do schema). */
export async function recusarCampanhaSlotPago(slotId: string, platformMemberId: string): Promise<{ ok: boolean; motivo?: string }> {
  if (!(await isPlatformStaff())) return { ok: false, motivo: "Sem acesso ao painel mestre." };
  const slot = await prisma.campanhaSlotPago.findUnique({ where: { id: slotId } });
  if (!slot || slot.estado !== "SOLICITADO") return { ok: false, motivo: "Slot não encontrado ou já processado." };
  await prisma.campanhaSlotPago.update({ where: { id: slotId }, data: { estado: "RECUSADO", aprovadoPorId: platformMemberId, aprovadoEm: new Date() } });
  revalidatePath("/painel-mestre");
  return { ok: true };
}

// ============================================================================
// 3 · PAGAMENTO CONFIRMADO — chamado pelo webhook da Asaas (app/api/asaas/webhook/route.ts),
// nunca por um sinal vindo do navegador do cliente (mesmo limite de segurança de
// lib/asaas.ts:markTenantInvoicePaidByAsaasPaymentId). Procura o `asaasPaymentId` primeiro na
// mensalidade, depois nos slots — os dois espaços de nome nunca colidem (são ids da Asaas).
// ============================================================================

export type ConfirmacaoDeCampanha = { encontrado: false } | { encontrado: true; tipo: "MODULO" | "SLOT"; officeId: string };

export async function confirmarPagamentoCampanhaPorAsaasId(asaasPaymentId: string, paidAt: Date): Promise<ConfirmacaoDeCampanha> {
  const assinatura = await prisma.assinaturaModuloCampanhas.findFirst({ where: { cobrancaAsaasId: asaasPaymentId } });
  if (assinatura) {
    await confirmarPagamentoMensalidade(assinatura.id, paidAt);
    return { encontrado: true, tipo: "MODULO", officeId: assinatura.officeId };
  }

  const slot = await prisma.campanhaSlotPago.findFirst({ where: { cobrancaAsaasId: asaasPaymentId } });
  if (slot) {
    await confirmarPagamentoSlot(slot.id, paidAt);
    return { encontrado: true, tipo: "SLOT", officeId: slot.officeId };
  }

  return { encontrado: false };
}

/**
 * Volta ATIVO (durante a carência, "sem perder nada") OU registra que o perfil precisa subir de
 * novo (se já tinha sido desativado) — NUNCA toca em `perfil.instrucoes` nem em `perfil.estado`
 * além do campo `precisaReprovisionar`: reprovisionar de verdade é a Frente C.
 *
 * Idempotente por construção: assim que processado, `cobrancaAsaasId` é limpo (fica pronto para
 * a cobrança do PRÓXIMO ciclo) — um reenvio do mesmo evento de webhook não encontra mais a
 * assinatura por este id e o `findFirst` acima simplesmente não bate de novo.
 */
export async function confirmarPagamentoMensalidade(assinaturaId: string, paidAt: Date): Promise<void> {
  const assinatura = await prisma.assinaturaModuloCampanhas.findUnique({ where: { id: assinaturaId }, include: { perfil: true } });
  if (!assinatura) return;

  await prisma.assinaturaModuloCampanhas.update({
    where: { id: assinaturaId },
    data: {
      estado: "ATIVO",
      entradaEmCarenciaEm: null,
      ultimoAvisoDiarioEm: null,
      vencimento: proximoVencimentoMensal(paidAt),
      cobrancaAsaasId: null,
      cobrancaBoletoUrl: null,
      cobrancaPixPayload: null,
    },
  });

  if (assinatura.perfil && normalizarEstadoDoPerfil(assinatura.perfil.estado) === "DESATIVADO") {
    // `aguardandoProvisionamentoDesde` é a Frente C ligando o que esta função já registra: o
    // MESMO instante do pagamento confirmado, gravado junto com `precisaReprovisionar` (não uma
    // segunda régua) — é a primeira das duas datas que tornam o SLA de provisionamento medível
    // (a segunda é PerfilCampanhaHermes.provisionadoEm, gravada só quando o Hermes confirmar de
    // verdade — ver lib/actions/provisionamentoCampanhas.ts).
    await prisma.perfilCampanhaHermes.update({
      where: { id: assinatura.perfil.id },
      data: { precisaReprovisionar: true, aguardandoProvisionamentoDesde: paidAt },
    });
  }

  revalidatePath("/painel-mestre");
}

/** A mesma reativação acima, para um slot — nunca reabre um slot já FINALIZADO/RECUSADO por
 * conta própria; se o escritório quiser uma campanha nova depois de finalizada, é uma
 * SOLICITAÇÃO nova (numeração relativa, §6.1), não a reabertura desta linha. */
export async function confirmarPagamentoSlot(slotId: string, paidAt: Date): Promise<void> {
  const slot = await prisma.campanhaSlotPago.findUnique({ where: { id: slotId } });
  if (!slot || slot.estado === "FINALIZADO" || slot.estado === "RECUSADO") return;

  await prisma.campanhaSlotPago.update({
    where: { id: slotId },
    data: {
      entradaEmCarenciaEm: null,
      ultimoAvisoDiarioEm: null,
      vencimento: proximoVencimentoMensal(paidAt),
      cobrancaAsaasId: null,
      cobrancaBoletoUrl: null,
      cobrancaPixPayload: null,
    },
  });

  revalidatePath("/painel-mestre");
}

// ============================================================================
// 4 · A RÉGUA DIÁRIA (§7) — chamada só por app/api/cron/campanhas-carencia/route.ts. Processa
// TODA assinatura e TODO slot ainda não finalizado, um de cada vez, sem deixar uma falha isolada
// (Asaas fora do ar, SMTP fora do ar) derrubar o restante da rodada.
// ============================================================================

export type ResultadoDaRegua = {
  avisosDeAssinatura: number;
  avisosDeSlot: number;
  assinaturasDesativadas: number;
  slotsFinalizados: number;
  erros: string[];
};

export async function executarReguaDeCarenciaCampanhas(agora: Date = new Date()): Promise<ResultadoDaRegua> {
  const resultado: ResultadoDaRegua = { avisosDeAssinatura: 0, avisosDeSlot: 0, assinaturasDesativadas: 0, slotsFinalizados: 0, erros: [] };

  const assinaturas = await prisma.assinaturaModuloCampanhas.findMany({
    include: { office: { select: { id: true, name: true, billingEmail: true, cnpj: true } }, perfil: true },
  });

  for (const assinatura of assinaturas) {
    try {
      const estadoGravado = normalizarEstadoDaAssinatura(assinatura.estado);
      const acao = decidirAcaoDoCiclo({
        estadoGravado,
        vencimento: assinatura.vencimento,
        agora,
        ultimoAvisoDiarioEm: assinatura.ultimoAvisoDiarioEm,
      });

      if (acao.estadoNovo !== estadoGravado) {
        await prisma.assinaturaModuloCampanhas.update({
          where: { id: assinatura.id },
          data: {
            estado: acao.estadoNovo,
            // A carência COMEÇA a contar a partir de agora só na transição ATIVO → CARENCIA;
            // se já estava em carência (ou já tinha campo preenchido de uma rodada anterior),
            // não reescreve — senão os 10 dias corridos recomeçariam do zero a cada execução.
            entradaEmCarenciaEm: estadoGravado === "ATIVO" && acao.estadoNovo === "CARENCIA" ? agora : assinatura.entradaEmCarenciaEm,
          },
        });
      }

      if (acao.desativarAgora) {
        await desativarAssinaturaEInterromperCampanhas(assinatura.id, agora);
        resultado.assinaturasDesativadas++;
      } else if (acao.avisarHoje) {
        const enviou = await enviarAvisoDiarioDeAssinatura(assinatura, agora);
        if (enviou) resultado.avisosDeAssinatura++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "erro desconhecido";
      resultado.erros.push(`Assinatura ${assinatura.id}: ${msg}`);
      console.error(`[campanhasCobranca] falha na régua da assinatura ${assinatura.id}:`, e);
    }
  }

  const slots = await prisma.campanhaSlotPago.findMany({
    where: { estado: { in: ["APROVADO", "ATIVO"] }, vencimento: { not: null } },
    include: { office: { select: { id: true, name: true, billingEmail: true, cnpj: true } } },
  });

  for (const slot of slots) {
    try {
      if (!slot.vencimento) continue; // guarda de tipo — o where acima já filtra
      // O relógio do SLOT nunca alimenta EstadoDaAssinatura (ele não tem "CARENCIA" como
      // CampanhaSlotPago.estado — esse campo é o ciclo de vida SOLICITADO/APROVADO/ATIVO/
      // FINALIZADO/RECUSADO, não o estado de pagamento). `estadoGravado` aqui é só um espelho
      // para alimentar decidirAcaoDoCiclo com a MESMA função da assinatura ("dois relógios
      // diferentes") — nunca gravado de volta no slot.
      const estadoGravadoComoAssinatura = slotPrecisaSerInterrompido(slot.estado as EstadoDoSlot) ? "ATIVO" : "DESATIVADO";
      const acao = decidirAcaoDoCiclo({
        estadoGravado: estadoGravadoComoAssinatura,
        vencimento: slot.vencimento,
        agora,
        ultimoAvisoDiarioEm: slot.ultimoAvisoDiarioEm,
      });

      if (acao.desativarAgora) {
        await finalizarSlotEInterromperCampanha(slot.id, agora);
        resultado.slotsFinalizados++;
      } else if (acao.avisarHoje) {
        const enviou = await enviarAvisoDiarioDeSlot(slot, agora);
        if (enviou) resultado.avisosDeSlot++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "erro desconhecido";
      resultado.erros.push(`Slot ${slot.id}: ${msg}`);
      console.error(`[campanhasCobranca] falha na régua do slot ${slot.id}:`, e);
    }
  }

  if (resultado.assinaturasDesativadas > 0 || resultado.slotsFinalizados > 0) {
    revalidatePath("/painel-mestre");
  }

  return resultado;
}

// ---------------------------------------------------------------------------------------------
// Desativação da assinatura (§7/§8): perfil para de responder, TREINAMENTO INTOCADO, e toda
// campanha em andamento do escritório (a de graça e qualquer slot ainda não finalizado) é
// interrompida junto — "não existe fallback para perfil compartilhado".
// ---------------------------------------------------------------------------------------------
async function desativarAssinaturaEInterromperCampanhas(
  assinaturaId: string,
  agora: Date,
): Promise<void> {
  const assinatura = await prisma.assinaturaModuloCampanhas.findUnique({
    where: { id: assinaturaId },
    include: { perfil: true, office: { select: { id: true, name: true, billingEmail: true } }, slots: { include: { campanha: true } } },
  });
  if (!assinatura) return;

  if (assinatura.perfil && normalizarEstadoDoPerfil(assinatura.perfil.estado) !== "DESATIVADO") {
    // SÓ o campo `estado` (e `desativadoEm`) muda — `instrucoes` nunca aparece nesta chamada,
    // de propósito (§7: "não apagar o treinamento").
    await prisma.perfilCampanhaHermes.update({
      where: { id: assinatura.perfil.id },
      data: { estado: "DESATIVADO", desativadoEm: agora },
    });
  }

  // A campanha "de graça" (sem slot pago) do escritório, se estiver ativa.
  await prisma.campanha.updateMany({
    where: { officeId: assinatura.officeId, ativa: true, slotPago: null },
    data: { ativa: false, fimEm: agora },
  });

  for (const slot of assinatura.slots) {
    if (!slotPrecisaSerInterrompido(slot.estado as EstadoDoSlot)) continue;
    await prisma.campanhaSlotPago.update({ where: { id: slot.id }, data: { estado: "FINALIZADO", finalizadoEm: agora } });
    if (slot.campanha.ativa) {
      await prisma.campanha.update({ where: { id: slot.campanhaId }, data: { ativa: false, fimEm: agora } });
    }
  }

  if (assinatura.office.billingEmail) {
    await sendCampanhaDesativadaEmail(assinatura.office.billingEmail, assinatura.office.name).catch((e) =>
      console.error(`[campanhasCobranca] falha ao enviar e-mail de desativação (assinatura ${assinaturaId}):`, e),
    );
  }
  await notificarAdminsPorWhatsapp(
    assinatura.officeId,
    `O perfil de campanhas do Lúmen foi desativado por falta de pagamento. O treinamento configurado continua salvo — ao regularizar, o perfil volta a subir com o mesmo treinamento.`,
  );
  await registrarAvisoInternoNoLumen(assinatura.officeId, "CAMPANHA_DESATIVADA", agora, {
    titulo: "Perfil de campanha desativado",
    corpo: "O perfil de campanha foi desativado por falta de pagamento. O treinamento continua salvo.",
  });
}

async function finalizarSlotEInterromperCampanha(slotId: string, agora: Date): Promise<void> {
  const slot = await prisma.campanhaSlotPago.findUnique({ where: { id: slotId }, include: { campanha: true, office: { select: { id: true, name: true, billingEmail: true } } } });
  if (!slot || !slotPrecisaSerInterrompido(slot.estado as EstadoDoSlot)) return;

  await prisma.campanhaSlotPago.update({ where: { id: slotId }, data: { estado: "FINALIZADO", finalizadoEm: agora } });
  if (slot.campanha.ativa) {
    await prisma.campanha.update({ where: { id: slot.campanhaId }, data: { ativa: false, fimEm: agora } });
  }

  if (slot.office.billingEmail) {
    await sendCampanhaDesativadaEmail(slot.office.billingEmail, slot.office.name).catch((e) =>
      console.error(`[campanhasCobranca] falha ao enviar e-mail de finalização (slot ${slotId}):`, e),
    );
  }
  await notificarAdminsPorWhatsapp(
    slot.officeId,
    `A campanha simultânea adicional foi interrompida por falta de pagamento da cobrança extra.`,
  );
  await registrarAvisoInternoNoLumen(slot.officeId, "CAMPANHA_SLOT_FINALIZADO", agora, {
    titulo: "Campanha adicional interrompida",
    corpo: "A campanha simultânea adicional foi interrompida por falta de pagamento da cobrança extra.",
  });
}

// ---------------------------------------------------------------------------------------------
// O aviso diário em si (§7: e-mail + WhatsApp + notificação interna + reenvio do boleto/Pix, TUDO
// automatizado). A trava de "uma vez por dia" é gravada ANTES do envio, com o `where` repetindo
// o valor lido — mesmo padrão de lib/whatsapp.ts:ehMensagemDaEquipe — para duas execuções do cron
// que corram ao mesmo tempo não mandarem o aviso em dobro.
// ---------------------------------------------------------------------------------------------
async function enviarAvisoDiarioDeAssinatura(
  assinatura: { id: string; vencimento: Date; ultimoAvisoDiarioEm: string | null; cobrancaBoletoUrl: string | null; cobrancaPixPayload: string | null; formaDePagamento: string | null; officeId: string; office: { name: string; billingEmail: string | null } },
  agora: Date,
): Promise<boolean> {
  const hoje = diaDeBrasilia(agora);
  const marcou = await prisma.assinaturaModuloCampanhas.updateMany({
    where: { id: assinatura.id, ultimoAvisoDiarioEm: assinatura.ultimoAvisoDiarioEm },
    data: { ultimoAvisoDiarioEm: hoje },
  });
  if (marcou.count === 0) return false; // outra execução já marcou o dia de hoje primeiro

  const parametros = await lerParametrosDePreco();
  const valor = parametros.mensalidadeModulo ?? 0; // só para exibição no aviso — a cobrança em si já existe (nunca é recriada aqui)
  const diasRestantes = DIAS_DE_CARENCIA - diasCorridosVencidos(assinatura.vencimento, agora);

  if (assinatura.office.billingEmail) {
    await sendCampanhaCarenciaEmail(
      assinatura.office.billingEmail,
      assinatura.office.name,
      "A mensalidade do módulo de campanhas",
      valor,
      diasRestantes,
      { boletoUrl: assinatura.cobrancaBoletoUrl, pixPayload: assinatura.cobrancaPixPayload },
    ).catch((e) => console.error(`[campanhasCobranca] falha ao enviar e-mail de carência (assinatura ${assinatura.id}):`, e));
  }

  const linkDeCobranca = assinatura.cobrancaBoletoUrl || assinatura.cobrancaPixPayload;
  await notificarAdminsPorWhatsapp(
    assinatura.officeId,
    `A mensalidade do módulo de campanhas do Lúmen está em atraso. Faltam ${Math.max(0, diasRestantes)} dia(s) até o perfil ser desativado.${linkDeCobranca ? ` Cobrança: ${linkDeCobranca}` : ""}`,
  );

  await registrarAvisoInternoNoLumen(assinatura.officeId, "CAMPANHA_CARENCIA", agora, {
    titulo: "Mensalidade do módulo de campanhas em atraso",
    corpo: `Faltam ${Math.max(0, diasRestantes)} dia(s) até o perfil de campanha ser desativado por falta de pagamento.`,
  });

  return true;
}

async function enviarAvisoDiarioDeSlot(
  slot: { id: string; vencimento: Date | null; ultimoAvisoDiarioEm: string | null; cobrancaBoletoUrl: string | null; cobrancaPixPayload: string | null; officeId: string; office: { name: string; billingEmail: string | null } },
  agora: Date,
): Promise<boolean> {
  if (!slot.vencimento) return false;
  const hoje = diaDeBrasilia(agora);
  const marcou = await prisma.campanhaSlotPago.updateMany({
    where: { id: slot.id, ultimoAvisoDiarioEm: slot.ultimoAvisoDiarioEm },
    data: { ultimoAvisoDiarioEm: hoje },
  });
  if (marcou.count === 0) return false;

  const parametros = await lerParametrosDePreco();
  const valor = parametros.precoSlotExtra ?? 0;
  const diasRestantes = DIAS_DE_CARENCIA - diasCorridosVencidos(slot.vencimento, agora);

  if (slot.office.billingEmail) {
    await sendCampanhaCarenciaEmail(
      slot.office.billingEmail,
      slot.office.name,
      "A cobrança da campanha simultânea adicional",
      valor,
      diasRestantes,
      { boletoUrl: slot.cobrancaBoletoUrl, pixPayload: slot.cobrancaPixPayload },
    ).catch((e) => console.error(`[campanhasCobranca] falha ao enviar e-mail de carência (slot ${slot.id}):`, e));
  }

  const linkDeCobranca = slot.cobrancaBoletoUrl || slot.cobrancaPixPayload;
  await notificarAdminsPorWhatsapp(
    slot.officeId,
    `A cobrança da campanha simultânea adicional do Lúmen está em atraso. Faltam ${Math.max(0, diasRestantes)} dia(s) até essa campanha ser interrompida.${linkDeCobranca ? ` Cobrança: ${linkDeCobranca}` : ""}`,
  );

  await registrarAvisoInternoNoLumen(slot.officeId, "CAMPANHA_SLOT_CARENCIA", agora, {
    titulo: "Cobrança da campanha adicional em atraso",
    corpo: `Faltam ${Math.max(0, diasRestantes)} dia(s) até essa campanha ser interrompida por falta de pagamento.`,
  });

  return true;
}

// ---------------------------------------------------------------------------------------------
// WhatsApp — reaproveita lib/whatsapp.ts:sendWhatsappText (mesmo número/instância do
// atendimento do próprio escritório, `lumen-<id>`; nenhuma instância nova). Manda para cada
// administrador do escritório com telefone cadastrado — best effort, uma falha de envio não
// interrompe a régua nem os demais canais.
// ---------------------------------------------------------------------------------------------
async function notificarAdminsPorWhatsapp(officeId: string, texto: string): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { officeId, isAdmin: true, active: true, phone: { not: null } },
    select: { phone: true, phoneDdi: true },
  });
  for (const admin of admins) {
    const numero = composePhoneWithDdi(admin.phoneDdi, admin.phone || "");
    if (!numero) continue;
    try {
      const envio = await sendWhatsappText(officeId, numero, texto);
      if (!envio.ok) console.error(`[campanhasCobranca] WhatsApp não enviado para ${numero}: ${envio.error || "erro desconhecido"}`);
    } catch (e) {
      console.error(`[campanhasCobranca] falha ao enviar WhatsApp para ${numero}:`, e);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// "Notificação dentro do Lúmen" — reaproveita o MESMO mecanismo de NotificationOutbox que o
// resto do produto usa para comunicados (lib/comunicadosEventos.ts), com o canal "IN_APP" que já
// existe no vocabulário. IMPORTANTE, e documentado onde a fila é drenada
// (lib/notificationOutboxDrain.ts): "não existe central de notificações in-app no produto hoje"
// — construir essa central é fora do escopo desta frente (é um gap da PLATAFORMA, anterior a
// este módulo, não algo que o módulo de campanhas devesse resolver sozinho). Esta função grava o
// registro pelo canal certo, pronto para quando essa central existir; até lá, o estado gravado
// direto em AssinaturaModuloCampanhas/CampanhaSlotPago (`estado`, `entradaEmCarenciaEm`) já é a
// fonte de verdade que uma tela do módulo (Frente D) pode ler e mostrar como aviso a cada
// abertura — o que, na prática, já cumpre "avisar dentro do Lúmen" enquanto a central não existe.
// ---------------------------------------------------------------------------------------------
async function registrarAvisoInternoNoLumen(
  officeId: string,
  evento: string,
  agora: Date,
  conteudo: { titulo: string; corpo: string },
): Promise<void> {
  const admins = await prisma.user.findMany({ where: { officeId, isAdmin: true, active: true }, select: { id: true } });
  const diaChave = diaDeBrasilia(agora);
  for (const admin of admins) {
    const dedupeKey = `${evento}:${officeId}:${diaChave}:${admin.id}`;
    try {
      await prisma.notificationOutbox.upsert({
        where: { dedupeKey },
        create: {
          event: evento,
          payload: { title: conteudo.titulo, body: conteudo.corpo, url: "/painel-mestre" },
          channel: "IN_APP",
          dueAt: agora,
          dedupeKey,
          officeId,
          userId: admin.id,
        },
        update: {},
      });
    } catch (e) {
      console.error(`[campanhasCobranca] falha ao registrar notificação interna (${dedupeKey}):`, e);
    }
  }
}
