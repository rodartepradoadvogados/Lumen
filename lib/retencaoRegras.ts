// ============================================================================
// RETENÇÃO DE ATENDIMENTOS SEM DESFECHO — AS REGRAS, SEM BANCO E SEM DRIVE.
//
// POR QUE ISTO EXISTE. A política de privacidade de um escritório pode prometer que "contatos que
// não se tornaram atendimento (inclusive as conversas com a atendente de IA e os arquivos enviados
// nelas) são eliminados até 12 meses após o último contato". Sem código, a promessa não se cumpre
// sozinha. Este arquivo diz QUAIS atendimentos entram nessa regra; quem apaga é
// lib/retencaoAtendimentos.ts.
//
// O QUE VALE AQUI É O QUE NÃO SE APAGA. Eliminar é irreversível (a mensagem, o áudio e a pasta no
// Drive somem), e o dono já tirou a lixeira da tela de atendimento justamente porque "excluir
// apagava a única cópia da conversa com o lead" (ver lib/actions/deletion.ts). Por isso a regra é
// uma LISTA DO QUE PODE, e não uma lista do que não pode: status ou etapa que este arquivo não
// conhece NÃO é eliminado. Um status novo, criado amanhã, nasce protegido.
//
// DESLIGADA POR PADRÃO, E POR ESCRITÓRIO. O Lúmen atende vários escritórios; um prazo de guarda é
// decisão de cada um (WhatsappConfig.retencaoAtendimentosMeses, nulo = nunca eliminar).
// ============================================================================

/** Prazos que a tela oferece. Qualquer outro número é recusado: um erro de digitação não apaga um ano a mais. */
export const MESES_DE_RETENCAO = [12, 18, 24, 36] as const;

/** O prazo mostrado na prévia quando o escritório ainda não escolheu nenhum. */
export const MESES_PADRAO_DA_PREVIA = 12;

/** Quantos atendimentos uma rodada elimina por escritório. O resto fica para o dia seguinte. */
export const LIMITE_POR_RODADA = 50;

/** Quantos candidatos a rodada examina por escritório antes de aplicar as regras (os mais antigos primeiro). */
export const LIMITE_DE_CANDIDATOS = 500;

/** Status de Attendance que podem ser eliminados. CONVERTIDO e RASCUNHO ficam de fora de propósito. */
export const STATUS_ELEGIVEIS = ["NOVO", "EM_TRIAGEM", "ARQUIVADO"] as const;

/** Etapas do funil que podem ser eliminadas. FECHADO (contrato fechado) fica de fora de propósito. */
export const ETAPAS_ELEGIVEIS = ["NOVO", "AGUARDANDO", "QUALIFICACAO", "PROPOSTA", "PERDIDO"] as const;

export function prazoDeRetencaoValido(meses: unknown): meses is (typeof MESES_DE_RETENCAO)[number] {
  return typeof meses === "number" && (MESES_DE_RETENCAO as readonly number[]).includes(meses);
}

/**
 * `agora` menos `meses` meses, em UTC, sem estourar o fim do mês (31/03 menos 1 mês é 28/02, e não
 * 03/03). Quem tem atividade ANTES deste instante passou do prazo.
 */
export function dataDeCorte(agora: Date, meses: number): Date {
  const alvoPrimeiroDia = Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - meses, 1);
  const alvo = new Date(alvoPrimeiroDia);
  const ultimoDiaDoMes = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      alvo.getUTCFullYear(),
      alvo.getUTCMonth(),
      Math.min(agora.getUTCDate(), ultimoDiaDoMes),
      agora.getUTCHours(),
      agora.getUTCMinutes(),
      agora.getUTCSeconds(),
      agora.getUTCMilliseconds(),
    ),
  );
}

/** O que a regra precisa saber de um atendimento. Nada de nome, telefone ou texto: não é preciso e não deve passar por aqui. */
export type CandidatoARetencao = {
  status: string;
  stage: string;
  convertedCaseId: string | null;
  clientId: string | null;
  createdAt: Date;
  ultimaAtividadeEm: Date;
  nextContactAt: Date | null;
  documentoAte: Date | null;
  /** Tarefas ligadas a este atendimento (alguém está trabalhando nele). */
  tarefas: number;
  /** Anotações pessoais ligadas a este atendimento (a exclusão as deixaria soltas, com o texto). */
  anotacoes: number;
  /** Pendências (SOLICITAR/ENVIAR) ainda abertas. */
  pendenciasAbertas: number;
  /** Anexos que um protocolo ou um envio de documentos referencia. */
  anexosEmUso: number;
};

export type MotivoParaNaoEliminar =
  | "STATUS_PROTEGIDO"
  | "ETAPA_PROTEGIDA"
  | "VIROU_PROCESSO"
  | "VIROU_CLIENTE"
  | "DENTRO_DO_PRAZO"
  | "RETORNO_AGENDADO"
  | "DOCUMENTO_EM_ESPERA"
  | "COM_TAREFA"
  | "COM_ANOTACAO"
  | "COM_PENDENCIA_ABERTA"
  | "ANEXO_EM_USO";

/**
 * `null` = pode ser eliminado. Texto = o PRIMEIRO motivo para deixar como está.
 *
 * A ordem das checagens é a de quanto o motivo diz sobre o atendimento (o que virou processo ou
 * cliente vem antes do que só está recente) — não muda o resultado, muda o que a contagem por
 * motivo conta.
 */
export function motivoParaNaoEliminar(a: CandidatoARetencao, agora: Date, meses: number): MotivoParaNaoEliminar | null {
  if (!(STATUS_ELEGIVEIS as readonly string[]).includes(a.status)) return "STATUS_PROTEGIDO";
  if (!(ETAPAS_ELEGIVEIS as readonly string[]).includes(a.stage)) return "ETAPA_PROTEGIDA";
  if (a.convertedCaseId) return "VIROU_PROCESSO";
  if (a.clientId) return "VIROU_CLIENTE";

  const corte = dataDeCorte(agora, meses);
  if (a.ultimaAtividadeEm >= corte || a.createdAt >= corte) return "DENTRO_DO_PRAZO";
  if (a.nextContactAt && a.nextContactAt >= agora) return "RETORNO_AGENDADO";
  if (a.documentoAte && a.documentoAte >= agora) return "DOCUMENTO_EM_ESPERA";

  if (a.tarefas > 0) return "COM_TAREFA";
  if (a.anotacoes > 0) return "COM_ANOTACAO";
  if (a.pendenciasAbertas > 0) return "COM_PENDENCIA_ABERTA";
  if (a.anexosEmUso > 0) return "ANEXO_EM_USO";
  return null;
}

/**
 * O arquivo já não está no provedor (apagado à mão, por exemplo)? Aí "apagar" já está feito e a
 * rodada segue. Qualquer OUTRO erro (token vencido, rede, permissão) NÃO é "já apagado": o
 * atendimento fica para a rodada seguinte, porque eliminar o registro com o arquivo ainda no Drive
 * deixaria o dado pessoal no ar sem ninguém saber onde.
 */
export function arquivoJaNaoExiste(erro: unknown): boolean {
  if (!erro || typeof erro !== "object") return false;
  const e = erro as { code?: unknown; status?: unknown; message?: unknown; response?: { status?: unknown } };
  if (e.code === 404 || e.status === 404 || e.response?.status === 404) return true;
  const msg = typeof e.message === "string" ? e.message : "";
  return /\(404\)|not[ _]?found|itemNotFound|path_lookup\/not_found|File not found/i.test(msg);
}
