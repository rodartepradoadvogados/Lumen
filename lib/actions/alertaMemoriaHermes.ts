// SEM "use server": este módulo só é chamado pelo cron (app/api/cron/alerta-memoria-hermes),
// nunca de um Client Component — diferente de lib/actions/campanhasCobranca.ts, cujas funções
// são chamadas de tela.

import { prisma } from "@/lib/prisma";
import { hermesConfigurado, memoriaDaMaquina } from "@/lib/hermesPonte";
import { mensagemDeErro } from "@/lib/mensagemDeErro";
import { diaDeBrasilia } from "@/lib/horaDeBrasilia";
import { situacaoDeMemoria, deveAlertarMemoriaHoje } from "@/lib/alertaMemoriaHermes";
import { donosDaPlataforma } from "@/lib/platformMember";
import { sendAlertaMemoriaHermesEmail } from "@/lib/email";

// ============================================================================
// ALERTA DE MEMÓRIA DA VPS DO HERMES (Frente C, §4). A régua (limiar nulo nunca dispara, um
// alerta por dia) é PURA em lib/alertaMemoriaHermes.ts; aqui só a leitura da máquina, o banco e
// o e-mail — chamado pelo cron app/api/cron/alerta-memoria-hermes.
// ============================================================================

const CHAVE_PARAMETRO = "LIMIAR_MEMORIA_LIVRE_KB";

export type ResultadoDoAlerta = { alertou: boolean; motivo: string };

export async function verificarMemoriaDoHermesEAlertar(agora: Date = new Date()): Promise<ResultadoDoAlerta> {
  // FECHA-SE SOZINHA: sem a ponte configurada não há máquina nenhuma para medir.
  if (!hermesConfigurado()) return { alertou: false, motivo: "ponte do Hermes não configurada" };

  const parametro = await prisma.alertaMemoriaHermesParametro.findUnique({ where: { chave: CHAVE_PARAMETRO } });
  const limiarKB = parametro?.limiarKB ?? null;

  let memoria: { ramDisponivelKB: number; swapLivreKB: number };
  try {
    memoria = await memoriaDaMaquina();
  } catch (e) {
    // Falha ao consultar a máquina não é "memória ok" — é "não sabemos". Não inventamos um
    // alerta a partir disso, mas o erro fica registrado para investigação.
    const motivo = `falha ao consultar a memória do Hermes: ${mensagemDeErro(e)}`;
    console.error(`[alertaMemoriaHermes] ${motivo}`);
    return { alertou: false, motivo };
  }

  const memoriaLivreKB = memoria.ramDisponivelKB + memoria.swapLivreKB;
  const situacao = situacaoDeMemoria(memoriaLivreKB, limiarKB);
  if (!situacao.dispara) return { alertou: false, motivo: situacao.motivo };

  const ultimoAlertaGravado = parametro?.ultimoAlertaDiarioEm ?? null;
  if (!deveAlertarMemoriaHoje(ultimoAlertaGravado, agora)) {
    return { alertou: false, motivo: "já alertado hoje — um alerta por dia, não um por execução do cron" };
  }

  // TRAVA ANTES DE ENVIAR, com o `where` repetindo o valor lido — mesmo padrão de
  // lib/actions/campanhasCobranca.ts:enviarAvisoDiarioDeAssinatura — para duas execuções do cron
  // rodando ao mesmo tempo não mandarem o e-mail em dobro. Se a linha ainda não existe
  // (ninguém configurou o limiar ainda), `situacao.dispara` já teria sido `false` acima — chegar
  // aqui implica que a linha existe (foi ela que forneceu o limiarKB não nulo).
  const hoje = diaDeBrasilia(agora);
  const marcou = await prisma.alertaMemoriaHermesParametro.updateMany({
    where: { chave: CHAVE_PARAMETRO, ultimoAlertaDiarioEm: ultimoAlertaGravado },
    data: { ultimoAlertaDiarioEm: hoje },
  });
  if (marcou.count === 0) return { alertou: false, motivo: "outra execução já alertou hoje" };

  const donos = await donosDaPlataforma();
  for (const dono of donos) {
    const envio = await sendAlertaMemoriaHermesEmail(dono.email, situacao.livreKB, situacao.limiarKB);
    if (!envio.sent) console.error(`[alertaMemoriaHermes] e-mail não enviado para ${dono.email}: ${envio.reason}`);
  }

  return { alertou: true, motivo: `memória livre ${situacao.livreKB} KB no ou abaixo do limiar ${situacao.limiarKB} KB` };
}
