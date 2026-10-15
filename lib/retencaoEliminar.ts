import { dataDeCorte } from "@/lib/retencaoRegras";

// ============================================================================
// A ORDEM DA ELIMINAÇÃO, SEPARADA DE QUEM FAZ O QUÊ.
//
// A parte que não pode errar não é apagar — é a ORDEM e o que fazer quando algo falha no meio:
// arquivo primeiro, registro depois, e nunca o registro se o arquivo ficou. Está aqui, sem banco
// nem Drive, recebendo as operações por parâmetro, para o teste poder provar a ordem com operações
// de mentira. lib/retencaoAtendimentos.ts entrega as de verdade.
// ============================================================================

export type ArquivoRemoto = { provider: "GOOGLE_DRIVE" | "ONEDRIVE" | "DROPBOX"; id: string };

export type AlvoDaEliminacao = {
  id: string;
  driveFolderId: string | null;
  arquivos: ArquivoRemoto[];
};

export type PortasDaEliminacao = {
  /** O atendimento continua parado desde antes do corte? (releitura logo antes de apagar) */
  atividadeAindaAntiga(officeId: string, id: string, corte: Date): Promise<boolean>;
  /** Apaga um arquivo ou pasta no provedor. `null` = apagado (ou já não existia); texto = falhou. */
  apagarNoProvedor(officeId: string, alvo: ArquivoRemoto): Promise<string | null>;
  /** O provedor de arquivos configurado para o escritório (onde fica a pasta do atendimento). */
  provedorDoEscritorio(officeId: string): Promise<ArquivoRemoto["provider"]>;
  /** Apaga o registro e tudo que depende dele, só se a atividade ainda for anterior ao corte. `true` = apagou. */
  apagarNoBanco(officeId: string, id: string, corte: Date): Promise<boolean>;
};

export type ResultadoDaEliminacao = { eliminado: true } | { eliminado: false; motivo: "ADIADO" | "MUDOU" };

/**
 * `ADIADO` = algo no provedor não pôde ser apagado: NADA foi eliminado no banco e o atendimento
 * volta na rodada seguinte. `MUDOU` = chegou atividade nova desde a listagem: está dentro do prazo
 * de novo e fica como está.
 */
export async function eliminarComSeguranca(
  portas: PortasDaEliminacao,
  officeId: string,
  alvo: AlvoDaEliminacao,
  meses: number,
  agora: Date,
): Promise<ResultadoDaEliminacao> {
  const corte = dataDeCorte(agora, meses);

  if (!(await portas.atividadeAindaAntiga(officeId, alvo.id, corte))) return { eliminado: false, motivo: "MUDOU" };

  for (const arquivo of alvo.arquivos) {
    if (await portas.apagarNoProvedor(officeId, arquivo)) return { eliminado: false, motivo: "ADIADO" };
  }
  if (alvo.driveFolderId) {
    const provider = await portas.provedorDoEscritorio(officeId);
    if (await portas.apagarNoProvedor(officeId, { provider, id: alvo.driveFolderId })) {
      return { eliminado: false, motivo: "ADIADO" };
    }
  }

  return (await portas.apagarNoBanco(officeId, alvo.id, corte)) ? { eliminado: true } : { eliminado: false, motivo: "MUDOU" };
}
