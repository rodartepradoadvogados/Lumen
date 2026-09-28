"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/currentUser";
import {
  EIXOS,
  conferirCriterio,
  conferirValorMinimo,
  conferirDiasDoDocumento,
  criteriosDoEixo,
  DIAS_PARA_O_DOCUMENTO_PADRAO,
  type Eixo,
  type ParametrosDaAna,
} from "@/lib/parametrosDaAna";

// ============================================================================
// OS PARÂMETROS DE RECUSA DA ANA — AS AÇÕES.
//
// Quem mexe aqui é administrador do escritório, e só. Não é uma preferência de tela: o que se
// escreve nesta lista autoriza uma máquina a encerrar o atendimento de uma pessoa de verdade em
// nome do escritório. Quem assume isso é quem responde pelo escritório.
//
// NENHUM PADRÃO DA PLATAFORMA ENTRA AQUI — ao contrário do catálogo de motivos, que tem dois
// andares. É de propósito e é a diferença entre as duas telas: o motivo é a FRASE que vai na carta
// (a Lúmen pode sugerir uma boa frase); o parâmetro é a DECISÃO de não pegar o caso (só o
// escritório sabe o que não atende). Uma matéria "não aceita" vinda de fábrica faria um escritório
// recusar causas que ele aceita, sem ninguém ter escrito nada.
// ============================================================================

async function administrador() {
  const viewer = await getCurrentUser();
  if (!viewer) return { erro: "Sessão expirada. Faça login novamente." as const };
  if (!viewer.isAdmin) {
    return { erro: "Só um administrador do escritório muda os parâmetros de recusa da atendente." as const };
  }
  return { viewer };
}

function recarregar() {
  revalidatePath("/configuracoes");
  revalidatePath("/atendimento");
}

function eixoValido(bruto: string): bruto is Eixo {
  return (EIXOS as readonly string[]).includes(bruto);
}

// ── A LEITURA ────────────────────────────────────────────────────────────────

/**
 * Os parâmetros deste escritório, com os padrões de quem nunca abriu a tela.
 *
 * NÃO CRIA LINHA. Ler não pode gravar — um escritório que só abriu Configurações para olhar não
 * passa a ter configuração própria, e o dia em que a plataforma mudar o padrão de dias de espera
 * ele recebe a mudança em vez de ficar preso a uma cópia que ninguém pediu.
 */
export async function lerParametros(officeId: string): Promise<ParametrosDaAna> {
  const [p, criterios] = await Promise.all([
    prisma.parametrosDeRecusa.findUnique({
      where: { officeId },
      select: { valorMinimoDaCausa: true, diasParaODocumento: true },
    }),
    prisma.criterioDeRecusa.findMany({
      where: { officeId },
      select: { id: true, eixo: true, valor: true, ordem: true },
      orderBy: [{ eixo: "asc" }, { ordem: "asc" }],
    }),
  ]);
  return {
    valorMinimoDaCausa: p?.valorMinimoDaCausa ?? null,
    diasParaODocumento: p?.diasParaODocumento ?? DIAS_PARA_O_DOCUMENTO_PADRAO,
    criterios,
  };
}

// ── A ESCRITA ────────────────────────────────────────────────────────────────

export async function salvarPiso(valorBruto: string, diasBruto: string): Promise<{ error?: string }> {
  const quem = await administrador();
  if ("erro" in quem) return { error: quem.erro };

  const valor = conferirValorMinimo(valorBruto);
  if (!valor.ok) return { error: valor.erro };
  const dias = conferirDiasDoDocumento(diasBruto);
  if (!dias.ok) return { error: dias.erro };

  const officeId = quem.viewer.officeId;
  await prisma.parametrosDeRecusa.upsert({
    where: { officeId },
    create: { officeId, valorMinimoDaCausa: valor.valor, diasParaODocumento: dias.valor },
    update: { valorMinimoDaCausa: valor.valor, diasParaODocumento: dias.valor },
  });
  recarregar();
  return {};
}

export async function acrescentarCriterio(eixoBruto: string, bruto: string): Promise<{ error?: string }> {
  const quem = await administrador();
  if ("erro" in quem) return { error: quem.erro };
  if (!eixoValido(eixoBruto)) return { error: "Eixo desconhecido." };

  const officeId = quem.viewer.officeId;
  const atuais = await prisma.criterioDeRecusa.findMany({
    where: { officeId, eixo: eixoBruto },
    select: { valor: true, ordem: true },
  });

  const conferido = conferirCriterio(bruto, atuais.map((c) => c.valor));
  if (!conferido.ok) return { error: conferido.erro };

  await prisma.criterioDeRecusa.create({
    data: {
      officeId,
      eixo: eixoBruto,
      valor: conferido.valor,
      ordem: atuais.reduce((maior, c) => Math.max(maior, c.ordem), 0) + 1,
    },
  });
  recarregar();
  return {};
}

export async function removerCriterio(id: string): Promise<{ error?: string }> {
  const quem = await administrador();
  if ("erro" in quem) return { error: quem.erro };

  // O `officeId` no `where` não é redundância: sem ele um id chutado apagaria o critério de outro
  // escritório, e a Ana de lá passaria a aceitar o que o escritório recusava sem ninguém saber.
  const apagados = await prisma.criterioDeRecusa.deleteMany({ where: { id, officeId: quem.viewer.officeId } });
  if (apagados.count === 0) return { error: "Este item não existe mais." };
  recarregar();
  return {};
}

/** O que a tela mostra depois de qualquer mudança. */
export async function listarParametros(): Promise<{ error?: string; parametros?: ParametrosDaAna }> {
  const viewer = await getCurrentUser();
  if (!viewer) return { error: "Sessão expirada. Faça login novamente." };
  return { parametros: await lerParametros(viewer.officeId) };
}

/** Quantos contornos o escritório escreveu, por eixo — o resumo que a tela põe no título. */
export async function contarCriterios(officeId: string): Promise<Record<Eixo, number>> {
  const p = await lerParametros(officeId);
  return {
    MATERIA: criteriosDoEixo(p, "MATERIA").length,
    COMARCA: criteriosDoEixo(p, "COMARCA").length,
    DOCUMENTO: criteriosDoEixo(p, "DOCUMENTO").length,
  };
}
