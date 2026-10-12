// SAÚDE DAS FONTES — "a captura está funcionando?" respondido com o que foi MEDIDO, não com o que
// parecia verde. Módulo PURO.
//
// O defeito que isto corrige (12/10/2026): o robô do Railway ficou 19 dias sem capturar DJEN nem
// DataJud (`No module named 'psycopg'`; última execução em 23/09) e a tela seguiu mostrando
// "DJEN 14:00 / DataJud 14:00" e a Central de Conexões seguiu em "OK". O batimento era gravado pelo
// SITE a cada cron (`syncRoboParaSite` escrevia IntegrationRun "OK" para todo escritório, sem olhar
// se o robô tinha rodado). Aqui a avaliação parte de duas coisas que não mentem:
//   - o último ciclo BEM-SUCEDIDO registrado pelo robô (RoboExecucaoLog.sucesso = true) e, para o
//     e-mail, a última varredura sem erro (GoogleCredential.lastSyncAt);
//   - o último item que de fato entrou no escritório (Publication.createdAt).
//
// "Parada" = nenhuma consulta bem-sucedida há mais de 1 DIA ÚTIL (o robô roda de segunda a sexta,
// de 2 em 2 horas; sexta à noite para segunda de manhã não é falha), ou erro registrado.

import { diasUteisEntre } from "@/lib/prazos";
import { saoPauloDayKey } from "@/lib/publicationGrouping";

export type FonteChave = "DJEN" | "DATAJUD" | "EMAIL";

export const ROTULO_DA_FONTE: Record<FonteChave, string> = { DJEN: "DJEN", DATAJUD: "DataJud", EMAIL: "E-mail" };

export type SaudeDaFonte = {
  chave: FonteChave;
  rotulo: string;
  ultimoSucesso: Date | null;
  ultimoItemNovo: Date | null;
  // Dias corridos desde o último sucesso (null = nunca houve).
  diasSemSucesso: number | null;
  parada: boolean;
  erro: string | null;
};

const DIA_MS = 24 * 60 * 60 * 1000;

function diaCivilUtc(d: Date): Date {
  return new Date(`${saoPauloDayKey(d)}T00:00:00.000Z`);
}

export function avaliarFonte(input: {
  chave: FonteChave;
  ultimoSucesso: Date | null;
  ultimoItemNovo: Date | null;
  agora: Date;
  feriados?: { date: string }[];
  // Texto do último erro, só informativo: uma falha isolada de ontem não deixa a fonte vermelha.
  erro?: string | null;
  // Falha que não se resolve sozinha na próxima rodada (token do e-mail revogado, por exemplo):
  // marca a fonte como parada mesmo com um sucesso recente.
  falhaPersistente?: boolean;
}): SaudeDaFonte {
  const { chave, ultimoSucesso, ultimoItemNovo, agora } = input;
  const erro = input.erro?.trim() ? input.erro.trim() : null;
  let diasSemSucesso: number | null = null;
  let parada = true;
  if (ultimoSucesso) {
    diasSemSucesso = Math.max(0, Math.floor((agora.getTime() - ultimoSucesso.getTime()) / DIA_MS));
    const uteis = diasUteisEntre(diaCivilUtc(ultimoSucesso), diaCivilUtc(agora), input.feriados ?? []);
    parada = uteis > 1;
  }
  if (input.falhaPersistente) parada = true;
  return { chave, rotulo: ROTULO_DA_FONTE[chave], ultimoSucesso, ultimoItemNovo, diasSemSucesso, parada, erro };
}

function dm(d: Date): string {
  return saoPauloDayKey(d).split("-").reverse().slice(0, 2).join("/");
}

/** Frase curta e honesta sobre a fonte, para a tela e para IntegrationRun.message. */
export function mensagemDaFonte(s: SaudeDaFonte): string {
  if (s.parada) {
    if (!s.ultimoSucesso) return `${s.rotulo}: nenhuma consulta bem-sucedida registrada${s.erro ? ` (${s.erro})` : ""}.`;
    const dias = s.diasSemSucesso ?? 0;
    return `${s.rotulo}: sem consulta bem-sucedida há ${dias} ${dias === 1 ? "dia" : "dias"} (última em ${dm(s.ultimoSucesso)})${s.erro ? `; ${s.erro}` : ""}.`;
  }
  return `${s.rotulo}: consultou em ${s.ultimoSucesso ? dm(s.ultimoSucesso) : "—"}${s.ultimoItemNovo ? `, último item novo em ${dm(s.ultimoItemNovo)}` : ""}.`;
}

/** Texto da faixa de alerta quando DJEN ou DataJud estão parados; null quando nada a avisar. */
export function avisoDeCapturaParada(fontes: SaudeDaFonte[]): string | null {
  const paradas = fontes.filter((f) => f.chave !== "EMAIL" && f.parada);
  if (paradas.length === 0) return null;
  const nomes = paradas.map((f) => f.rotulo).join(" e ");
  const maisAntigo = paradas.reduce<Date | null>((m, f) => (f.ultimoSucesso && (!m || f.ultimoSucesso < m) ? f.ultimoSucesso : m), null);
  const dias = Math.max(...paradas.map((f) => f.diasSemSucesso ?? 0));
  if (!maisAntigo) return `${nomes}: nenhuma consulta bem-sucedida registrada. Publicações oficiais podem não estar chegando.`;
  return `${nomes} sem captura há ${dias} ${dias === 1 ? "dia" : "dias"}. Intimações publicadas desde ${dm(maisAntigo)} podem não estar aqui: confira o DJEN direto e avise o suporte.`;
}
