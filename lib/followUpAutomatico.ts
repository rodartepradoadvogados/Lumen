// ============================================================================
// O FOLLOW-UP AUTOMÁTICO — F5.5, pedido do dono: "configurar follow up automático e manual, para
// que possamos acompanhar o pipeline do lead".
//
// O MANUAL JÁ EXISTIA por inteiro antes desta entrega: `Attendance.nextContactAt`, editável em
// AttendanceCommercialForm.tsx ("Próximo contato / follow-up"), com o card do funil pintando a
// borda de vermelho e escrevendo "follow-up atrasado" quando a data passa
// (QuadroDoFunil.tsx/app/atendimento-central/page.tsx/app/(app)/atendimento/funil/page.tsx), o
// alerta correspondente na Central de Alertas (lib/alerts.ts) e o widget do Painel do dia
// (app/(app)/painel/page.tsx). Este arquivo não mexe em nada disso — só passou a faltar o
// AUTOMÁTICO: nada garantia que um lead novo NASCESSE com uma data de follow-up, e sem data não há
// "atrasado" para acender. Um lead podia ficar parado para sempre, sem alerta nenhum, só porque
// ninguém tinha ainda parado para preencher aquele campo.
//
// A REGRA CENTRAL DESTE ARQUIVO é simples de propósito: cada estágio comercial aberto tem um prazo
// padrão, contado da referência que o chamador passar. Ela não substitui uma data que já existe —
// em NENHUM dos três lugares que a chamam (`ingestIncomingWhatsapp`, `createAttendance`,
// `setAttendanceStage` — ver os comentários de cada um) uma data GRAVADA por gente ou pelo próprio
// sistema é sobrescrita. Preenche o vazio; nunca corrige o que já foi decidido.
//
// OS NÚMEROS, E POR QUE NÃO SÃO IGUAIS PARA TODO ESTÁGIO:
//   NOVO           1 dia  — lead que acabou de chegar. O risco aqui é o mais caro (ver
//                           lib/repassarLead.ts: "lead sem retorno é lead perdido"), e o prazo
//                           reflete isso.
//   AGUARDANDO     1 dia  — é o estágio para onde o relógio de 15 minutos já empurrou o lead
//                           sozinho (ver lib/funil.ts, ESTAGIO_DE_ESPERA) exatamente porque ninguém
//                           respondeu a tempo. Um follow-up frouxo aqui duplicaria um problema que
//                           o sistema já sinalizou de outro jeito.
//   QUALIFICACAO   3 dias — triagem em curso, ritmo de poucos dias é o que a conversa real pede.
//   PROPOSTA       5 dias — decisão do lado do cliente; cobrar todo dia é pressão, não follow-up.
//   FECHADO/       nunca  — desfecho já decidido (ver lib/funil.ts, ESTAGIOS_DECIDIDOS). Um follow-
//   PERDIDO                 up automático aqui reabriria uma conversa que o funil já encerrou.
//
// NENHUM DESTES NÚMEROS FOI PEDIDO PALAVRA POR PALAVRA PELO DONO — é a parte "decida e justifique"
// desta entrega. Ficaram fáceis de mudar (é um mapa, uma linha por estágio) se o escritório usar a
// régua com outro ritmo.
// ============================================================================

import { ESTAGIOS_DECIDIDOS } from "@/lib/funil";
import { prisma } from "@/lib/prisma";

/** Dias até o follow-up automático, por estágio comercial. Estágio ausente = nunca automático. */
export const DIAS_DE_FOLLOWUP_POR_ESTAGIO: Readonly<Record<string, number>> = {
  NOVO: 1,
  AGUARDANDO: 1,
  QUALIFICACAO: 3,
  PROPOSTA: 5,
};

/**
 * A regra central: a data automática de follow-up para este estágio, contada de `referencia` —
 * ou `null` quando o estágio não tem follow-up automático (FECHADO/PERDIDO, ou um estágio que este
 * mapa não conhece — nunca inventa um prazo para o que não está listado).
 */
export function prazoAutomaticoDeFollowUp(stage: string, referencia: Date): Date | null {
  if (ESTAGIOS_DECIDIDOS.includes(stage)) return null;
  const dias = DIAS_DE_FOLLOWUP_POR_ESTAGIO[stage];
  if (dias === undefined) return null;
  const data = new Date(referencia);
  data.setDate(data.getDate() + dias);
  return data;
}

// ============================================================================
// A REDE DE SEGURANÇA — o cron diário (app/api/cron/pipeline-followup/route.ts).
//
// `ingestIncomingWhatsapp`, `createAttendance` e `setAttendanceStage` já preenchem o follow-up no
// nascimento ou na primeira troca de estágio de cada atendimento (ver os comentários em
// lib/whatsapp.ts e lib/actions/attendance.ts) — isso cobre todo atendimento NOVO a partir desta
// entrega. Esta função cobre o que ficaria de fora só por causa disso:
//
//   - atendimentos que já existiam ANTES desta entrega, e nunca tiveram nextContactAt;
//   - o canal E-mail/Telefone/Presencial (criados fora de `createAttendance`? hoje não existe um
//     caminho assim, mas um dia pode existir, e esta função não presume qual);
//   - qualquer linha que escapou por um caminho que este arquivo não previu — bug em outro lugar,
//     migração, importação em lote.
//
// TODOS os três pontos de entrada e esta função aplicam a MESMA regra central
// (`prazoAutomaticoDeFollowUp`), e todos só PREENCHEM um vazio — a garantia do dono ("acompanhar o
// pipeline do lead") é que nenhum lead ativo fique sem data nenhuma, nunca que o sistema decida por
// cima do que já foi decidido.
// ============================================================================

/** Quantos atendimentos preencher por rodada — teto alto o bastante para o cron diário zerar o
 * atraso mesmo depois de esta entrega ir ao ar (ver a nota acima, sobre a base já existente),
 * baixo o bastante para uma função serverless não estourar tempo nem memória numa base grande. */
const LOTE_MAXIMO = 500;

export type ResultadoDoPreenchimento = { avaliados: number; preenchidos: number };

/**
 * Preenche `nextContactAt` de todo atendimento ABERTO (não arquivado, não rascunho, estágio ainda
 * não decidido) que estiver sem nenhuma data — em TODOS os escritórios, porque é um cron de
 * sistema, não uma ação de tela (a mesma forma de `repassarLeadsSemResposta`, lib/repassarLead.ts).
 * Nunca sobrescreve: o `where` já exclui quem tem `nextContactAt` preenchido.
 */
export async function preencherFollowUpsEmAberto(): Promise<ResultadoDoPreenchimento> {
  const candidatos = await prisma.attendance.findMany({
    where: {
      nextContactAt: null,
      status: { notIn: ["ARQUIVADO", "RASCUNHO"] },
      stage: { notIn: ESTAGIOS_DECIDIDOS },
    },
    select: { id: true, stage: true, stageChangedAt: true, createdAt: true },
    take: LOTE_MAXIMO,
  });

  let preenchidos = 0;
  for (const a of candidatos) {
    // A REFERÊNCIA É stageChangedAt, e createdAt só quando aquele for nulo — mesma escolha de
    // app/(app)/atendimento/funil/page.tsx (daysBetween) para "há quanto tempo está neste estágio":
    // um atendimento antigo que só trocou de estágio ontem tem o prazo contado de ontem, não da
    // criação original.
    const prazo = prazoAutomaticoDeFollowUp(a.stage, a.stageChangedAt ?? a.createdAt);
    if (!prazo) continue;
    // updateMany com `nextContactAt: null` no where de novo: defesa contra a corrida entre o
    // SELECT acima e este UPDATE — se alguém preencheu à mão no meio do caminho, esta linha não
    // pisa em cima.
    const r = await prisma.attendance.updateMany({
      where: { id: a.id, nextContactAt: null },
      data: { nextContactAt: prazo },
    });
    preenchidos += r.count;
  }

  return { avaliados: candidatos.length, preenchidos };
}
