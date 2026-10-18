// SEM "use server": este módulo só é chamado por `atendenteResponde` (servidor), nunca de um Client Component.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { mensagemDeErro } from "@/lib/mensagemDeErro";
import { dataEHoraDeBrasilia, diaDeBrasilia } from "@/lib/horaDeBrasilia";
import { donosDaPlataforma } from "@/lib/platformMember";
import { sendAlertaAnaSemRespostaEmail } from "@/lib/email";
import { caminhoDaConversaDoAtendimento, deveAlertarOsDonosAgora, type CausaDaFalhaDaAna } from "@/lib/alertaDaAnaSemResposta";

// ============================================================================
// ALERTA "A ANA NÃO CONSEGUIU RESPONDER UM CLIENTE" (incidente de 15 a 17/10/2026). A régua é PURA em
// lib/alertaDaAnaSemResposta.ts; aqui só o banco (o "já alertei hoje"), a trava de corrida e o e-mail — o
// mesmo desenho de lib/actions/alertaMemoriaHermes.ts.
//
// NUNCA LANÇA E NUNCA SEGURA O WEBHOOK: é chamado de dentro de `atendenteResponde`, que roda numa rota que a
// Meta/Evolution reenvia se demorar ou falhar. Por isso (1) tudo está num try/catch, (2) o envio dos e-mails
// tem um teto de tempo (`TETO_DO_ALERTA_MS`) e (3) o caso comum — já alertado hoje — custa UMA leitura de uma
// linha e nada mais.
//
// UM POR DIA, NÃO UM POR CLIENTE, e a trava é gravar o dia ANTES de enviar (como o alerta de memória): duas
// falhas simultâneas (a Ana caída falha em todas as mensagens ao mesmo tempo) disputam a gravação e só uma
// ganha. Se NENHUM e-mail saiu (SMTP fora, sem donos), a marca é DESFEITA para a próxima falha tentar de novo:
// gastar o único e-mail do dia sem avisar ninguém repetiria o incidente (dois dias de silêncio).
//
// A COSTURA (`DependenciasDoAlerta`): o teste passa um repositório e um "e-mail" em memória; produção usa o
// Prisma e o SMTP. É o mesmo recurso de `registrarAvisoDaAna` (lib/notaDaConversaDb.ts).
// ============================================================================

const CHAVE = "ANA_SEM_RESPOSTA";

/**
 * Quanto o webhook aceita esperar pelo e-mail. A gravação do dia já foi feita; se o SMTP demorar mais que isto,
 * seguimos sem esperar. 5 s porque o pior caso do incidente é o Hermes gastar os 105 s inteiros: sobram ~15 s
 * dos 120 s do webhook (orcamentoDoPedido.ts), e o aviso no chat + este e-mail têm de caber neles.
 */
export const TETO_DO_ALERTA_MS = 5_000;

export type ResultadoDoAlertaDaAna = { alertou: boolean; motivo: string };

export type FalhaDaAna = {
  officeId: string;
  attendanceId: string;
  causa: CausaDaFalhaDaAna;
  /** A frase do motivo, JÁ sem segredo e sem dado de cliente (lib/motivoDoAtendente.ts). */
  motivo: string;
};

export type DadosDoEmail = { officeName: string; quando: string; motivo: string; caminhoDaConversa: string };

export type DependenciasDoAlerta = {
  /** `existe: false` = a linha ainda não foi criada. */
  lerUltimo(): Promise<{ existe: boolean; ultimo: string | null }>;
  /** Grava "hoje" só se ninguém gravou antes de nós (compara com `ultimoLido`). `true` = a vez é nossa. */
  reivindicar(existe: boolean, ultimoLido: string | null, hoje: string): Promise<boolean>;
  /** Desfaz a marca de `hoje` (volta para `anterior`) quando nenhum e-mail saiu. */
  devolver(hoje: string, anterior: string | null): Promise<void>;
  nomeDoEscritorio(officeId: string): Promise<string | null>;
  emailsDosDonos(): Promise<string[]>;
  enviar(para: string, dados: DadosDoEmail): Promise<{ sent: boolean; reason?: string }>;
};

const dependenciasDeProducao: DependenciasDoAlerta = {
  async lerUltimo() {
    const linha = await prisma.alertaDaAnaEstado.findUnique({ where: { chave: CHAVE } });
    return { existe: linha !== null, ultimo: linha?.ultimoAlertaDiarioEm ?? null };
  },
  async reivindicar(existe, ultimoLido, hoje) {
    if (!existe) {
      try {
        await prisma.alertaDaAnaEstado.create({ data: { chave: CHAVE, ultimoAlertaDiarioEm: hoje } });
        return true;
      } catch (erro) {
        // P2002: outra falha criou a linha entre a leitura e agora — ela é quem alerta.
        if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") return false;
        throw erro;
      }
    }
    // O `where` repete o valor lido: mesmo padrão de lib/actions/alertaMemoriaHermes.ts.
    const marcou = await prisma.alertaDaAnaEstado.updateMany({ where: { chave: CHAVE, ultimoAlertaDiarioEm: ultimoLido }, data: { ultimoAlertaDiarioEm: hoje } });
    return marcou.count > 0;
  },
  async devolver(hoje, anterior) {
    await prisma.alertaDaAnaEstado.updateMany({ where: { chave: CHAVE, ultimoAlertaDiarioEm: hoje }, data: { ultimoAlertaDiarioEm: anterior } });
  },
  async nomeDoEscritorio(officeId) {
    return (await prisma.office.findUnique({ where: { id: officeId }, select: { name: true } }))?.name ?? null;
  },
  async emailsDosDonos() {
    return (await donosDaPlataforma()).map((d) => d.email);
  },
  enviar: (para, dados) => sendAlertaAnaSemRespostaEmail(para, dados),
};

export async function alertarDonosQueAAnaFalhou(
  falha: FalhaDaAna,
  agora: Date = new Date(),
  deps: DependenciasDoAlerta = dependenciasDeProducao,
): Promise<ResultadoDoAlertaDaAna> {
  try {
    // Sem a causa certa (ex.: resposta vazia) nem lê o banco.
    if (!deveAlertarOsDonosAgora(falha.causa, null, agora)) return { alertou: false, motivo: "esta causa não manda e-mail" };

    const { existe, ultimo } = await deps.lerUltimo();
    if (!deveAlertarOsDonosAgora(falha.causa, ultimo, agora)) return { alertou: false, motivo: "já alertado hoje — um e-mail por dia, não um por cliente" };

    const hoje = diaDeBrasilia(agora);
    if (!(await deps.reivindicar(existe, ultimo, hoje))) return { alertou: false, motivo: "outra execução já alertou hoje" };

    let relogio: ReturnType<typeof setTimeout> | undefined;
    const enviado = await Promise.race([
      enviarAosDonos(falha, agora, deps),
      new Promise<boolean>((resolve) => {
        relogio = setTimeout(() => resolve(true), TETO_DO_ALERTA_MS);
      }),
    ]).finally(() => clearTimeout(relogio));
    if (!enviado) {
      // Nenhum dono recebeu: devolve o dia, para a próxima falha tentar de novo (ver a nota no topo).
      await deps.devolver(hoje, ultimo);
      return { alertou: false, motivo: "nenhum e-mail pôde ser enviado" };
    }
    return { alertou: true, motivo: "donos da plataforma avisados" };
  } catch (erro) {
    console.error("[alertaDaAna] falha ao alertar os donos:", mensagemDeErro(erro));
    return { alertou: false, motivo: "falha ao alertar" };
  }
}

/** `true` se ao menos um dono recebeu. Não lança. */
async function enviarAosDonos(falha: FalhaDaAna, agora: Date, deps: DependenciasDoAlerta): Promise<boolean> {
  try {
    const [emails, nome] = await Promise.all([deps.emailsDosDonos(), deps.nomeDoEscritorio(falha.officeId)]);
    if (emails.length === 0) {
      console.error("[alertaDaAna] nenhum dono da plataforma com e-mail para avisar");
      return false;
    }
    const dados: DadosDoEmail = {
      officeName: nome ?? "escritório não identificado",
      quando: dataEHoraDeBrasilia(agora),
      motivo: falha.motivo,
      caminhoDaConversa: caminhoDaConversaDoAtendimento(falha.attendanceId),
    };
    const resultados = await Promise.all(
      emails.map(async (para) => {
        const envio = await deps.enviar(para, dados);
        if (!envio.sent) console.error(`[alertaDaAna] e-mail não enviado para ${para}: ${envio.reason}`);
        return envio.sent;
      }),
    );
    return resultados.some(Boolean);
  } catch (erro) {
    console.error("[alertaDaAna] falha ao enviar o alerta:", mensagemDeErro(erro));
    return false;
  }
}
