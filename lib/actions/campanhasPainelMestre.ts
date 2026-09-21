"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getPlatformMember, isPlatformStaff } from "@/lib/platformMember";
import { podeAprovarCampanha, MOTIVO_PAPEL_SEM_APROVACAO } from "@/lib/aprovacaoDeCampanha";
import { mensagemDeErro } from "@/lib/mensagemDeErro";
import { aprovarCampanhaSlotPago, recusarCampanhaSlotPago, type ResultadoDeCobranca } from "@/lib/actions/campanhasCobranca";
import { tentarProvisionarPerfil, type ResultadoDaTentativa } from "@/lib/actions/provisionamentoCampanhas";
import { ROTULO_DO_PRECO_POR_CHAVE } from "@/lib/telaCampanhas";

// ============================================================================
// O PAINEL MESTRE DO MÓDULO DE CAMPANHAS (Frente D, §6.3-6.4 e §4). Nenhuma regra nova aqui: a
// aprovação/recusa é inteira da Frente B (lib/actions/campanhasCobranca.ts), o provisionamento é
// inteiro da Frente C (lib/actions/provisionamentoCampanhas.ts) — esta camada só resolve QUEM
// está clicando (o `platformMemberId` que os dois exigem) e grava os DOIS parâmetros que nascem
// nulos por decisão do dono (preço do módulo, limiar de memória da VPS).
// ============================================================================

// ---------------------------------------------------------------------------------------------
// QUEM É "quem clicou", em PlatformMember.id — §6.4 é explícito: "qualquer funcionário do Lúmen
// com acesso ao painel mestre" aprova, sem papel granular. `getPlatformMember()` já resolve os
// DOIS caminhos de sessão (PlatformMember standalone, ou User de escritório com PlatformMember
// vinculado) — se nenhum dos dois achar uma linha, a pessoa tem acesso ao painel (é dono da
// plataforma) mas não tem PlatformMember próprio ainda, e `aprovadoPorId` exige uma linha de
// verdade: NUNCA inventamos um id. O erro devolvido diz exatamente o que falta (ver
// app/painel-mestre/equipe/page.tsx, onde o próprio dono normalmente já aparece espelhado).
// ---------------------------------------------------------------------------------------------
async function platformMemberIdDeQuemClicou(): Promise<{ id: string } | { erro: string }> {
  const membro = await getPlatformMember();
  if (membro) {
    // A TRAVA DE PAPEL VIVE AQUI, e não só na tela: esta é a única porta por onde a aprovação
    // passa, e esconder o botão não impede ninguém de chamar a ação direto. Decisão revisada
    // pelo dono depois da §6.4 — ver lib/aprovacaoDeCampanha.ts.
    if (!podeAprovarCampanha(membro.roleKey)) return { erro: MOTIVO_PAPEL_SEM_APROVACAO };
    return { id: membro.id };
  }
  return {
    erro:
      "Sua conta de acesso ao painel mestre ainda não tem um registro em Equipe da Lúmen — cadastre-se lá " +
      "(app/painel-mestre/equipe) antes de aprovar ou recusar uma campanha.",
  };
}

// ============================================================================
// 1 · LIBERAR CAMPANHA (§6.3-6.4) — a tela que abre ao clicar na solicitação pendente.
// ============================================================================

export async function liberarCampanhaSlot(slotId: string, decisao: "APROVAR" | "RECUSAR"): Promise<{ ok: boolean; motivo?: string }> {
  const quem = await platformMemberIdDeQuemClicou();
  if ("erro" in quem) return { ok: false, motivo: quem.erro };

  let resultado: ResultadoDeCobranca | { ok: boolean; motivo?: string };
  if (decisao === "APROVAR") {
    resultado = await aprovarCampanhaSlotPago(slotId, quem.id);
  } else {
    resultado = await recusarCampanhaSlotPago(slotId, quem.id);
  }

  revalidatePath("/painel-mestre/campanhas");
  revalidatePath("/configuracoes");
  return "motivo" in resultado ? { ok: resultado.ok, motivo: resultado.motivo } : { ok: resultado.ok };
}

// ============================================================================
// 2 · PREÇOS DO MÓDULO (§2, item em aberto) — mesmo padrão de "campo de preço com salvar por
// linha" de components/painelMestre/PlanCatalogEditor.tsx:ModulePricesEditor. As duas linhas
// (MENSALIDADE_MODULO, SLOT_EXTRA) podem nem existir ainda no banco — upsert cria a linha com o
// rótulo certo na primeira gravação, nunca fica esperando um seed que não existe.
// ============================================================================

export async function salvarPrecoDoModuloDeCampanhas(chave: string, preco: number | null): Promise<{ error?: string }> {
  if (!(await isPlatformStaff())) return { error: "Sem acesso ao painel mestre." };
  const label = ROTULO_DO_PRECO_POR_CHAVE[chave];
  if (!label) return { error: "Chave de preço desconhecida." };
  if (preco != null && preco < 0) return { error: "O preço não pode ser negativo." };

  await prisma.campanhaPrecoParametro.upsert({
    where: { chave },
    create: { chave, label, preco },
    update: { preco },
  });

  revalidatePath("/painel-mestre/campanhas");
  revalidatePath("/configuracoes");
  return {};
}

// ============================================================================
// 3 · LIMIAR DE MEMÓRIA DA VPS DO HERMES (§4, item em aberto) — nível único, uma linha singleton
// (chave fixa, mesmo padrão do schema). Nasce nula; a tela deixa isso óbvio antes de preencher.
// ============================================================================

const CHAVE_LIMIAR = "LIMIAR_MEMORIA_LIVRE_KB";

export async function salvarLimiarDeMemoriaHermes(limiarKB: number | null): Promise<{ error?: string }> {
  if (!(await isPlatformStaff())) return { error: "Sem acesso ao painel mestre." };
  if (limiarKB != null && (limiarKB < 0 || !Number.isFinite(limiarKB))) {
    return { error: "O limiar tem que ser um número de KB maior ou igual a zero." };
  }

  await prisma.alertaMemoriaHermesParametro.upsert({
    where: { chave: CHAVE_LIMIAR },
    create: { chave: CHAVE_LIMIAR, limiarKB },
    update: { limiarKB },
  });

  revalidatePath("/painel-mestre/campanhas");
  return {};
}

// ============================================================================
// 4 · TENTAR PROVISIONAR DE NOVO, NA HORA — o botão manual que a nota técnica da Frente C já
// previu ("3. Um reprocessamento manual futuro (Frente D), se quiser expor um botão 'tentar de
// novo'"). Chama a MESMA função que o cron de segurança chama — nunca uma segunda tentativa
// escrita à parte.
// ============================================================================

export async function tentarProvisionarPerfilAgora(perfilId: string): Promise<{ resultado: ResultadoDaTentativa } | { error: string }> {
  if (!(await isPlatformStaff())) return { error: "Sem acesso ao painel mestre." };
  try {
    const resultado = await tentarProvisionarPerfil(perfilId);
    revalidatePath("/painel-mestre/campanhas");
    return { resultado };
  } catch (e) {
    return { error: mensagemDeErro(e) };
  }
}
