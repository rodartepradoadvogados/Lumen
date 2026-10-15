import { teste, igual, verdade, resumo } from "./executar";
import {
  ETAPAS_ELEGIVEIS,
  MESES_DE_RETENCAO,
  STATUS_ELEGIVEIS,
  arquivoJaNaoExiste,
  dataDeCorte,
  motivoParaNaoEliminar,
  prazoDeRetencaoValido,
  type CandidatoARetencao,
} from "@/lib/retencaoRegras";
import { eliminarComSeguranca, type PortasDaEliminacao } from "@/lib/retencaoEliminar";

// ============================================================================
// A RETENÇÃO ELIMINA DADO DE CLIENTE E NÃO TEM DESFAZER. O que se prova aqui é o lado seguro da
// regra: o que NÃO pode ser apagado continua protegido, inclusive o que ainda não existe.
// ============================================================================

const AGORA = new Date("2027-10-14T12:00:00.000Z");
const ANTIGO = new Date("2026-09-19T12:00:00.000Z"); // 13 meses antes de AGORA

function base(parcial: Partial<CandidatoARetencao> = {}): CandidatoARetencao {
  return {
    status: "NOVO",
    stage: "NOVO",
    convertedCaseId: null,
    clientId: null,
    createdAt: ANTIGO,
    ultimaAtividadeEm: ANTIGO,
    nextContactAt: null,
    documentoAte: null,
    tarefas: 0,
    anotacoes: 0,
    pendenciasAbertas: 0,
    anexosEmUso: 0,
    ...parcial,
  };
}

// ── O que pode ser eliminado ─────────────────────────────────────────────────────

teste("lead novo, sem desfecho e parado há 13 meses é elegível aos 12", () => {
  igual(motivoParaNaoEliminar(base(), AGORA, 12), null);
});

teste("lead perdido e arquivado, parados há mais do prazo, são elegíveis", () => {
  igual(motivoParaNaoEliminar(base({ stage: "PERDIDO" }), AGORA, 12), null);
  igual(motivoParaNaoEliminar(base({ status: "ARQUIVADO", stage: "PERDIDO" }), AGORA, 12), null);
});

// ── O prazo ──────────────────────────────────────────────────────────────────────

teste("dentro do prazo não é eliminado, e o mesmo lead passa a ser quando o prazo é menor", () => {
  const recente = base({ ultimaAtividadeEm: new Date("2027-02-01T00:00:00.000Z") }); // ~8 meses
  igual(motivoParaNaoEliminar(recente, AGORA, 12), "DENTRO_DO_PRAZO");
  igual(motivoParaNaoEliminar(base({ ultimaAtividadeEm: new Date("2027-02-01T00:00:00.000Z") }), AGORA, 24), "DENTRO_DO_PRAZO");
});

teste("uma mensagem recente protege, mesmo que o lead tenha nascido há anos", () => {
  igual(motivoParaNaoEliminar(base({ ultimaAtividadeEm: new Date("2027-10-13T00:00:00.000Z") }), AGORA, 12), "DENTRO_DO_PRAZO");
});

teste("o instante exato do corte ainda está dentro do prazo (só passa quem ficou ANTES)", () => {
  const corte = dataDeCorte(AGORA, 12);
  igual(motivoParaNaoEliminar(base({ ultimaAtividadeEm: corte, createdAt: corte }), AGORA, 12), "DENTRO_DO_PRAZO");
  igual(motivoParaNaoEliminar(base({ ultimaAtividadeEm: new Date(corte.getTime() - 1), createdAt: new Date(corte.getTime() - 1) }), AGORA, 12), null);
});

teste("dataDeCorte não estoura o fim do mês", () => {
  igual(dataDeCorte(new Date("2027-03-31T10:00:00.000Z"), 1).toISOString(), "2027-02-28T10:00:00.000Z");
  igual(dataDeCorte(new Date("2028-02-29T10:00:00.000Z"), 12).toISOString(), "2027-02-28T10:00:00.000Z");
  igual(dataDeCorte(new Date("2027-10-14T12:00:00.000Z"), 12).toISOString(), "2026-10-14T12:00:00.000Z");
  igual(dataDeCorte(new Date("2027-01-15T12:00:00.000Z"), 18).toISOString(), "2025-07-15T12:00:00.000Z");
});

// ── O que NUNCA é eliminado ──────────────────────────────────────────────────────

teste("o que virou processo ou cliente nunca entra", () => {
  igual(motivoParaNaoEliminar(base({ convertedCaseId: "c1" }), AGORA, 12), "VIROU_PROCESSO");
  igual(motivoParaNaoEliminar(base({ clientId: "cl1" }), AGORA, 12), "VIROU_CLIENTE");
});

teste("status CONVERTIDO e RASCUNHO, e etapa FECHADO, nunca entram", () => {
  igual(motivoParaNaoEliminar(base({ status: "CONVERTIDO" }), AGORA, 12), "STATUS_PROTEGIDO");
  igual(motivoParaNaoEliminar(base({ status: "RASCUNHO" }), AGORA, 12), "STATUS_PROTEGIDO");
  igual(motivoParaNaoEliminar(base({ stage: "FECHADO" }), AGORA, 12), "ETAPA_PROTEGIDA");
});

teste("status ou etapa que a regra não conhece ficam protegidos (a regra é lista do que PODE)", () => {
  igual(motivoParaNaoEliminar(base({ status: "STATUS_NOVO_DE_AMANHA" }), AGORA, 12), "STATUS_PROTEGIDO");
  igual(motivoParaNaoEliminar(base({ stage: "ETAPA_NOVA_DE_AMANHA" }), AGORA, 12), "ETAPA_PROTEGIDA");
  igual(motivoParaNaoEliminar(base({ status: "" }), AGORA, 12), "STATUS_PROTEGIDO");
});

teste("alguém trabalhando no lead protege: tarefa, anotação, pendência aberta, anexo em uso", () => {
  igual(motivoParaNaoEliminar(base({ tarefas: 1 }), AGORA, 12), "COM_TAREFA");
  igual(motivoParaNaoEliminar(base({ anotacoes: 1 }), AGORA, 12), "COM_ANOTACAO");
  igual(motivoParaNaoEliminar(base({ pendenciasAbertas: 1 }), AGORA, 12), "COM_PENDENCIA_ABERTA");
  igual(motivoParaNaoEliminar(base({ anexosEmUso: 1 }), AGORA, 12), "ANEXO_EM_USO");
});

teste("retorno agendado ou documento em espera, no futuro, protegem; no passado, não", () => {
  igual(motivoParaNaoEliminar(base({ nextContactAt: new Date("2027-11-01T00:00:00.000Z") }), AGORA, 12), "RETORNO_AGENDADO");
  igual(motivoParaNaoEliminar(base({ documentoAte: new Date("2027-10-20T00:00:00.000Z") }), AGORA, 12), "DOCUMENTO_EM_ESPERA");
  igual(motivoParaNaoEliminar(base({ nextContactAt: new Date("2027-01-01T00:00:00.000Z"), documentoAte: new Date("2027-01-01T00:00:00.000Z") }), AGORA, 12), null);
});

// ── As listas e os prazos ────────────────────────────────────────────────────────

teste("as listas do que pode ser eliminado não incluem nada de contrato fechado ou convertido", () => {
  verdade(!(STATUS_ELEGIVEIS as readonly string[]).includes("CONVERTIDO"), "CONVERTIDO entrou na lista");
  verdade(!(STATUS_ELEGIVEIS as readonly string[]).includes("RASCUNHO"), "RASCUNHO entrou na lista");
  verdade(!(ETAPAS_ELEGIVEIS as readonly string[]).includes("FECHADO"), "FECHADO entrou na lista");
});

teste("só os prazos da lista são aceitos", () => {
  for (const m of MESES_DE_RETENCAO) verdade(prazoDeRetencaoValido(m), `${m} deveria valer`);
  for (const invalido of [0, 1, 6, 11, 13, 120, -12, 12.5, NaN, "12", null, undefined]) {
    verdade(!prazoDeRetencaoValido(invalido), `${String(invalido)} não deveria valer`);
  }
});

// ── Arquivo que já não existe ────────────────────────────────────────────────────

teste("404 do provedor conta como já apagado; qualquer outro erro, não", () => {
  verdade(arquivoJaNaoExiste({ code: 404 }), "code 404 (Google)");
  verdade(arquivoJaNaoExiste({ response: { status: 404 } }), "response.status 404");
  verdade(arquivoJaNaoExiste(new Error("Falha ao excluir arquivo do OneDrive (404): itemNotFound")), "OneDrive 404");
  verdade(arquivoJaNaoExiste(new Error('Falha ao excluir arquivo do Dropbox (409): {"error":{".tag":"path_lookup","path_lookup":{".tag":"not_found"}}}')), "Dropbox not_found");
  verdade(!arquivoJaNaoExiste({ code: 401 }), "token vencido não é 'já apagado'");
  verdade(!arquivoJaNaoExiste(new Error("Falha ao excluir arquivo do OneDrive (503): serviço indisponível")), "503 não é 'já apagado'");
  verdade(!arquivoJaNaoExiste(new Error("Sem credencial do Google Drive")), "sem credencial não é 'já apagado'");
  verdade(!arquivoJaNaoExiste(null) && !arquivoJaNaoExiste(undefined) && !arquivoJaNaoExiste("erro"), "valores soltos");
});

// ── A ORDEM: arquivo primeiro, registro depois, e nunca o registro se o arquivo ficou ──────

function portasDeMentira(opcoes: { falhaEm?: string; releitura?: boolean; banco?: boolean } = {}) {
  const chamadas: string[] = [];
  const portas: PortasDaEliminacao = {
    async atividadeAindaAntiga() {
      chamadas.push("releitura");
      return opcoes.releitura ?? true;
    },
    async apagarNoProvedor(_o, alvo) {
      chamadas.push(`apagar:${alvo.id}`);
      return opcoes.falhaEm === alvo.id ? "GOOGLE_DRIVE: token vencido" : null;
    },
    async provedorDoEscritorio() {
      chamadas.push("provedor");
      return "GOOGLE_DRIVE";
    },
    async apagarNoBanco() {
      chamadas.push("banco");
      return opcoes.banco ?? true;
    },
  };
  return { portas, chamadas };
}

const ALVO = {
  id: "a1",
  driveFolderId: "pasta1",
  arquivos: [
    { provider: "GOOGLE_DRIVE" as const, id: "f1" },
    { provider: "GOOGLE_DRIVE" as const, id: "f2" },
  ],
};

teste("elimina na ordem: releitura, arquivos, pasta, e só então o banco", async () => {
  const { portas, chamadas } = portasDeMentira();
  const r = await eliminarComSeguranca(portas, "o1", ALVO, 12, AGORA);
  igual(r, { eliminado: true });
  igual(chamadas, ["releitura", "apagar:f1", "apagar:f2", "provedor", "apagar:pasta1", "banco"]);
});

teste("falha ao apagar um arquivo: adia, e o banco NÃO é tocado", async () => {
  const { portas, chamadas } = portasDeMentira({ falhaEm: "f2" });
  const r = await eliminarComSeguranca(portas, "o1", ALVO, 12, AGORA);
  igual(r, { eliminado: false, motivo: "ADIADO" });
  verdade(!chamadas.includes("banco"), "o registro foi apagado com arquivo ainda no Drive");
  verdade(!chamadas.includes("apagar:pasta1"), "a pasta foi apagada depois de uma falha");
});

teste("falha ao apagar a pasta: adia, e o banco NÃO é tocado", async () => {
  const { portas, chamadas } = portasDeMentira({ falhaEm: "pasta1" });
  const r = await eliminarComSeguranca(portas, "o1", ALVO, 12, AGORA);
  igual(r, { eliminado: false, motivo: "ADIADO" });
  verdade(!chamadas.includes("banco"), "o registro foi apagado com a pasta ainda no Drive");
});

teste("atividade nova depois da listagem: nada é apagado, nem no Drive", async () => {
  const { portas, chamadas } = portasDeMentira({ releitura: false });
  const r = await eliminarComSeguranca(portas, "o1", ALVO, 12, AGORA);
  igual(r, { eliminado: false, motivo: "MUDOU" });
  igual(chamadas, ["releitura"]);
});

teste("o banco recusa (a atividade mudou no meio): não conta como eliminado", async () => {
  const { portas } = portasDeMentira({ banco: false });
  const r = await eliminarComSeguranca(portas, "o1", ALVO, 12, AGORA);
  igual(r, { eliminado: false, motivo: "MUDOU" });
});

teste("sem arquivo e sem pasta: só releitura e banco", async () => {
  const { portas, chamadas } = portasDeMentira();
  const r = await eliminarComSeguranca(portas, "o1", { id: "a2", driveFolderId: null, arquivos: [] }, 12, AGORA);
  igual(r, { eliminado: true });
  igual(chamadas, ["releitura", "banco"]);
});

void resumo("Retenção de atendimentos sem desfecho");
