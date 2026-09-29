import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import {
  podeVerAtendimentos,
  whereDeUmAtendimento,
  SEM_ACESSO_AO_ATENDIMENTO,
  type ViewerDoAtendimento,
} from "@/lib/acessoAtendimento";

// ============================================================================
// AS PORTAS DO ATENDIMENTO FORA DA CENTRAL: telas do aplicativo (/atendimento-app) e rotas da API
// (/api/atendimento/[id]/*). Só a decisão mora aqui; a regra em si é lib/acessoAtendimento.ts.
//
// Telas: `notFound()` — quem não pode ver não precisa saber que existe (mesmo padrão do site).
// API:   401 sem sessão, 403 sem acesso ao Atendimento, 404 para o lead que não é seu ou que não
//        existe (indistinguíveis de propósito).
// ============================================================================

/** Para páginas: devolve o viewer com acesso, ou responde 404. */
export async function exigirAcessoAoAtendimentoNaTela() {
  const viewer = await getCurrentUser();
  if (!viewer) notFound();
  if (!podeVerAtendimentos(viewer)) notFound();
  return viewer;
}

/** Para rotas da API que mexem num atendimento pelo id. */
export async function atendimentoDaRota(
  id: string,
): Promise<
  | { erro: NextResponse }
  | { erro?: undefined; viewer: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>> & ViewerDoAtendimento; attendance: NonNullable<Awaited<ReturnType<typeof prisma.attendance.findFirst>>> }
> {
  const viewer = await getCurrentUser();
  if (!viewer) return { erro: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  if (!podeVerAtendimentos(viewer)) return { erro: NextResponse.json({ error: SEM_ACESSO_AO_ATENDIMENTO }, { status: 403 }) };
  const attendance = await prisma.attendance.findFirst({ where: whereDeUmAtendimento(viewer, id) });
  if (!attendance) return { erro: NextResponse.json({ error: "Não encontrado" }, { status: 404 }) };
  return { viewer, attendance };
}

/** O que uma ação da aba Detalhes precisa saber do lead para decidir — só isto sai do banco. */
const SELECT_DA_ACAO = {
  id: true,
  status: true,
  clientName: true,
  subject: true,
  responsibleId: true,
  convertedCaseId: true,
  area: true,
  description: true,
  documentoPendente: true,
  propostaDeRecusa: true,
  propostaDeRecusaEm: true,
  metadata: true,
} as const;

/**
 * Para AÇÕES DE SERVIDOR do aplicativo que mexem num atendimento pelo id (a aba Detalhes).
 *
 * Mesma decisão de `atendimentoDaRota`, sem `NextResponse`: devolve a frase que a tela mostra. Sem sessão,
 * sem acesso ao Atendimento e "lead do colega ou de outro escritório" NÃO se distinguem por quem está de
 * fora — o segundo e o terceiro dão a mesma frase, e nada é lido nem gravado antes da resposta.
 */
export async function atendimentoDaAcao(id: string): Promise<
  | { erro: string }
  | { erro?: undefined; viewer: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>> & ViewerDoAtendimento; attendance: Prisma.AttendanceGetPayload<{ select: typeof SELECT_DA_ACAO }> }
> {
  const viewer = await getCurrentUser();
  if (!viewer) return { erro: "Sessão expirada. Faça login novamente." };
  if (!podeVerAtendimentos(viewer)) return { erro: SEM_ACESSO_AO_ATENDIMENTO };
  const attendance = await prisma.attendance.findFirst({ where: whereDeUmAtendimento(viewer, id), select: SELECT_DA_ACAO });
  if (!attendance) return { erro: "Atendimento não encontrado." };
  return { viewer, attendance };
}
