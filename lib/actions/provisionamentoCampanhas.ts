// SEM "use server": este módulo só é chamado de código de servidor que já é servidor (webhook,
// cron, rota interna) — nunca de um Client Component. A diretiva `"use server"` exigiria que
// TODA exportação daqui fosse uma Server Action assíncrona chamável do cliente, e
// `dispararProvisionamentoAssincrono` é, de propósito, uma função SÍNCRONA que dispara um
// `fetch` sem esperar (ver o comentário dela) — as duas coisas juntas não fecham a conta com
// Next.js. Diferente de lib/actions/campanhasCobranca.ts, cujas funções SÃO chamadas de telas.

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { hermesConfigurado, provisionarNoHermes, perfilDeCampanha, FalhaDoHermes } from "@/lib/hermesPonte";
import { mensagemDeErro } from "@/lib/mensagemDeErro";
import { normalizarEstadoDoPerfil } from "@/lib/moduloCampanhas";
import { LIMITE_DE_TENTATIVAS_DE_PROVISIONAMENTO, tentativaEsgotouOLimite } from "@/lib/provisionamentoCampanhas";
import { donosDaPlataforma } from "@/lib/platformMember";
import { sendProvisionamentoFalhouEmail } from "@/lib/email";
import { getAppUrl } from "@/lib/appUrl";

// ============================================================================
// PROVISIONAMENTO AUTOMÁTICO DO PERFIL DE CAMPANHA (Frente C, §3). O trabalho de verdade — falar
// com o Hermes, gravar o resultado — fica aqui; as regras (limite de tentativas, tradução para
// estado de tela) são PURAS em lib/provisionamentoCampanhas.ts, importadas, não reimplementadas.
//
// TRÊS CAMINHOS CHAMAM `tentarProvisionarPerfil`, todos convergindo na MESMA função (idempotente
// por construção, como processarTranscricaoAssincrona em lib/transcricaoAssincrona.ts):
//   1. O disparo imediato (`dispararProvisionamentoAssincrono`), acionado pelo webhook da Asaas
//      logo depois de confirmar o pagamento — best effort, fora do pedido do webhook.
//   2. A rede de segurança por cron (`executarProvisionamentoPendente`,
//      app/api/cron/campanhas-provisionamento) — pega o que sobrou (disparo perdido, ou que já
//      falhou uma vez e precisa da PRÓXIMA tentativa).
//   3. Um reprocessamento manual futuro (Frente D), se quiser expor um botão "tentar de novo".
// ============================================================================

export type ResultadoDaTentativa = "SUCESSO" | "TENTANDO_DE_NOVO" | "FALHOU_DEFINITIVAMENTE" | "NADA_A_FAZER";

/**
 * UMA tentativa de subir o perfil de campanha no Hermes, com o registro completo do que
 * aconteceu — nunca um silêncio que pareça sucesso.
 *
 * HARD GATE (§3 da especificação): `estado: "PROVISIONADO"` só é escrito DEPOIS que
 * `provisionarNoHermes` retornou sem lançar. Nenhum outro ponto deste arquivo escreve esse
 * estado — ver o teste de mutação desta frente, que existe para não deixar isto divergir.
 */
export async function tentarProvisionarPerfil(perfilId: string): Promise<ResultadoDaTentativa> {
  // FECHA-SE SOZINHA, mesma disciplina de lib/hermesPonte.ts: sem HERMES_URL/HERMES_TOKEN, nem
  // tenta — melhor um perfil pendente visível do que um erro de rede gritando a cada 5 minutos
  // num ambiente onde a ponte nunca foi configurada (ex.: staging).
  if (!hermesConfigurado()) return "NADA_A_FAZER";

  const perfil = await prisma.perfilCampanhaHermes.findUnique({
    where: { id: perfilId },
    include: { assinatura: { include: { office: { select: { id: true, name: true, slug: true } } } } },
  });
  if (!perfil) return "NADA_A_FAZER";

  // IDEMPOTÊNCIA — mesma disciplina de lib/transcricaoAssincrona.ts:processarTranscricaoAssincrona:
  // o disparo imediato e o cron de segurança podem pegar o MESMO perfil; a segunda chamada não
  // deve fazer nada.
  if (!perfil.precisaReprovisionar || perfil.provisionamentoFalhouDefinitivamente) return "NADA_A_FAZER";
  if (normalizarEstadoDoPerfil(perfil.estado) === "PROVISIONADO") {
    // O sinalizador ficou ligado por engano (ex.: corrida entre duas tentativas) — corrige sem
    // chamar o Hermes de novo, que já confirmou este perfil antes.
    await prisma.perfilCampanhaHermes.update({
      where: { id: perfil.id },
      data: { precisaReprovisionar: false, aguardandoProvisionamentoDesde: null },
    });
    return "NADA_A_FAZER";
  }

  const agora = new Date();
  const numeroDestaTentativa = perfil.numeroDeTentativasDeProvisionamento + 1;
  const office = perfil.assinatura.office;
  const slug = perfilDeCampanha(office.slug);

  try {
    // A CHAMADA DE VERDADE. Até aqui nada foi gravado como provisionado — se este `await` lançar,
    // o `catch` abaixo cuida da tentativa e a escrita de sucesso, logo adiante, nunca acontece.
    await provisionarNoHermes({ slug, officeId: office.id, nome: office.name });

    await prisma.$transaction([
      prisma.perfilCampanhaProvisionamentoTentativa.create({
        data: { perfilId: perfil.id, numero: numeroDestaTentativa, resultado: "SUCESSO", ocorridaEm: agora },
      }),
      prisma.perfilCampanhaHermes.update({
        where: { id: perfil.id },
        data: {
          estado: "PROVISIONADO",
          slug,
          provisionadoEm: agora,
          precisaReprovisionar: false,
          aguardandoProvisionamentoDesde: null,
          numeroDeTentativasDeProvisionamento: numeroDestaTentativa,
          ultimaTentativaDeProvisionamentoEm: agora,
          ultimoErroDeProvisionamento: null,
          provisionamentoFalhouDefinitivamente: false,
        },
      }),
    ]);
    revalidatePath("/painel-mestre");
    return "SUCESSO";
  } catch (erro) {
    // DEMORA NÃO É QUEDA (lib/hermesPonte.ts:FalhaDoHermes) — e este catch NÃO discrimina por
    // TEXTO do motivo: toda falha do Hermes, demora ou erro de verdade, conta como UMA tentativa
    // e segue a MESMA régua de repetir até o limite. Um `if (motivo.includes(...))` decidindo
    // "essa aqui não vale tentar de novo" é exatamente o atalho que trataria demora como perfil
    // inexistente — e por isso não existe aqui.
    const motivo = erro instanceof FalhaDoHermes ? erro.motivo : mensagemDeErro(erro);
    const falhouDefinitivamente = tentativaEsgotouOLimite(numeroDestaTentativa);

    await prisma.$transaction([
      prisma.perfilCampanhaProvisionamentoTentativa.create({
        data: { perfilId: perfil.id, numero: numeroDestaTentativa, resultado: "FALHA", motivo, ocorridaEm: agora },
      }),
      prisma.perfilCampanhaHermes.update({
        where: { id: perfil.id },
        data: {
          numeroDeTentativasDeProvisionamento: numeroDestaTentativa,
          ultimaTentativaDeProvisionamentoEm: agora,
          ultimoErroDeProvisionamento: motivo,
          provisionamentoFalhouDefinitivamente: falhouDefinitivamente,
        },
      }),
    ]);

    console.error(
      `[provisionamentoCampanhas] tentativa ${numeroDestaTentativa}/${LIMITE_DE_TENTATIVAS_DE_PROVISIONAMENTO} falhou para o perfil ${perfil.id} (escritório ${office.name}):`,
      motivo,
    );

    if (falhouDefinitivamente) {
      await avisarDonosDeFalhaDeProvisionamento(office.name, numeroDestaTentativa, motivo).catch((e) =>
        console.error(`[provisionamentoCampanhas] falha ao avisar Jairo/Rodrigo (perfil ${perfil.id}):`, e),
      );
      revalidatePath("/painel-mestre");
    }
    return falhouDefinitivamente ? "FALHOU_DEFINITIVAMENTE" : "TENTANDO_DE_NOVO";
  }
}

/** §3, item 4 da nota técnica: passado o limite de tentativas, avisa os MESMOS destinatários do
 * alerta de memória da §4 (lib/platformMember.ts:donosDaPlataforma — Jairo e Rodrigo). */
async function avisarDonosDeFalhaDeProvisionamento(officeName: string, tentativas: number, motivo: string): Promise<void> {
  const donos = await donosDaPlataforma();
  for (const dono of donos) {
    const envio = await sendProvisionamentoFalhouEmail(dono.email, officeName, tentativas, motivo);
    if (!envio.sent) {
      console.error(`[provisionamentoCampanhas] e-mail de falha definitiva não enviado para ${dono.email}: ${envio.reason}`);
    }
  }
}

// ============================================================================
// O DISPARO IMEDIATO, fora do pedido do webhook — mesmo padrão de
// lib/transcricaoAssincrona.ts:dispararTranscricaoAssincrona. NÃO é `await`ado por quem chama: é
// um `fetch` de fogo-e-esquece para uma ROTA SEPARADA (app/api/interno/provisionar-campanha),
// porque uma promessa não aguardada DENTRO da mesma invocação serverless não tem garantia de
// terminar — a plataforma pode congelar a função assim que a resposta do webhook sai. A
// confiabilidade de verdade vem da rede de segurança por cron, não deste disparo.
// ============================================================================
export function dispararProvisionamentoAssincrono(officeId: string): void {
  const segredo = process.env.CAMPANHA_PROVISIONAMENTO_INTERNO_SECRET;
  // FAIL-CLOSED: sem o segredo configurado, nem tenta — a rota interna recusaria de qualquer
  // jeito, e um pedido fadado a 401 não vale o log de erro que geraria. O cron de segurança pega
  // o item de qualquer forma.
  if (!segredo) return;

  fetch(`${getAppUrl()}/api/interno/provisionar-campanha`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${segredo}` },
    body: JSON.stringify({ officeId }),
  }).catch((e) => {
    console.error(
      `[provisionamentoCampanhas] falha ao disparar o provisionamento imediato do escritório ${officeId} (o cron de segurança ainda vai pegar):`,
      mensagemDeErro(e),
    );
  });
}

/** O trabalho que a rota interna delega — resolve o perfil do escritório e tenta provisionar.
 * Chamada TAMBÉM pela rede de segurança por cron (indiretamente, via `executarProvisionamentoPendente`,
 * que já tem a lista de perfis pendentes e não precisa resolver por officeId). */
export async function processarProvisionamentoDoEscritorio(officeId: string): Promise<void> {
  const assinatura = await prisma.assinaturaModuloCampanhas.findUnique({
    where: { officeId },
    include: { perfil: true },
  });
  if (!assinatura?.perfil) return;
  await tentarProvisionarPerfil(assinatura.perfil.id);
}

// ============================================================================
// A REDE DE SEGURANÇA (app/api/cron/campanhas-provisionamento). Varre TODO perfil ainda pendente
// que não desistiu sozinho, um de cada vez — NUNCA em paralelo: a máquina do Hermes tem 3 GB de
// RAM, e provisionar vários perfis ao mesmo tempo multiplicaria a carga bem no momento em que ela
// está mais frágil (o alerta de memória da §4 existe por essa mesma razão).
// ============================================================================

export type ResultadoDaVarredura = {
  processados: number;
  sucesso: number;
  tentandoDeNovo: number;
  falharamDefinitivamente: number;
};

export async function executarProvisionamentoPendente(): Promise<ResultadoDaVarredura> {
  const resultado: ResultadoDaVarredura = { processados: 0, sucesso: 0, tentandoDeNovo: 0, falharamDefinitivamente: 0 };
  if (!hermesConfigurado()) return resultado;

  const pendentes = await prisma.perfilCampanhaHermes.findMany({
    where: { precisaReprovisionar: true, provisionamentoFalhouDefinitivamente: false },
    select: { id: true },
  });

  for (const item of pendentes) {
    try {
      const r = await tentarProvisionarPerfil(item.id);
      if (r === "NADA_A_FAZER") continue;
      resultado.processados++;
      if (r === "SUCESSO") resultado.sucesso++;
      else if (r === "TENTANDO_DE_NOVO") resultado.tentandoDeNovo++;
      else if (r === "FALHOU_DEFINITIVAMENTE") resultado.falharamDefinitivamente++;
    } catch (e) {
      // Dupla proteção, como varrerTranscricoesPendentes: tentarProvisionarPerfil já trata as
      // falhas do Hermes sozinha, mas um erro de infraestrutura (banco fora do ar no meio do
      // laço) não pode engolir os itens seguintes.
      console.error(`[provisionamentoCampanhas] falha inesperada ao processar o perfil ${item.id}:`, mensagemDeErro(e));
    }
  }
  return resultado;
}
