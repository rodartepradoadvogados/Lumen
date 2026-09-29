// SAÚDE DAS INTEGRAÇÕES — traduz o que `IntegrationRun` grava (status, httpStatus, message) em
// frase de gente, com a consequência. O log mostrava "503" e "200" soltos e um cabeçalho dizendo
// "0 exigem atenção" ao lado de um 503 de ontem.

export type Execucao = {
  status: "OK" | "ERRO" | "AVISO";
  httpStatus: number | null;
  itemCount: number | null;
  message: string | null;
};

/** O que o código HTTP significa para quem usa o Lúmen. Sem código, cai na mensagem do robô. */
export function traduzirHttp(httpStatus: number | null): string | null {
  if (httpStatus === null) return null;
  if (httpStatus >= 200 && httpStatus < 300) return null;
  if (httpStatus === 401 || httpStatus === 403) return "a fonte recusou o acesso (credencial vencida ou sem permissão)";
  if (httpStatus === 404) return "a fonte não encontrou o que foi pedido";
  if (httpStatus === 408 || httpStatus === 504) return "a fonte demorou demais para responder";
  if (httpStatus === 429) return "a fonte limitou o número de consultas; a próxima tentativa recupera";
  if (httpStatus >= 500) return "o serviço do tribunal não respondeu; a próxima consulta recupera o período";
  return `a fonte respondeu com um erro (código ${httpStatus})`;
}

/** Uma frase por execução: "recuperou 12 itens", "o serviço do tribunal não respondeu…". */
export function descreverExecucao(r: Execucao): string {
  if (r.status === "OK") {
    const n = r.itemCount ?? 0;
    return n === 0 ? "consultou e não havia novidade" : `trouxe ${n} ${n === 1 ? "item novo" : "itens novos"}`;
  }
  const traduzido = traduzirHttp(r.httpStatus);
  const detalhe = r.message && r.message.trim() ? r.message.trim() : null;
  if (r.status === "AVISO") return detalhe ?? traduzido ?? "terminou com aviso";
  return traduzido ?? detalhe ?? "falhou sem detalhe registrado";
}

export type ResumoDeSaude = { falhas: number; avisos: number; total: number; texto: string };

/** "2 falhas nos últimos 7 dias" / "tudo em ordem" — o que o cabeçalho da tela precisa dizer. */
export function resumirSaude(execucoes: { status: "OK" | "ERRO" | "AVISO" }[], janela: string): ResumoDeSaude {
  const falhas = execucoes.filter((e) => e.status === "ERRO").length;
  const avisos = execucoes.filter((e) => e.status === "AVISO").length;
  let texto = "Tudo em ordem";
  if (falhas > 0) texto = `${falhas} ${falhas === 1 ? "falha" : "falhas"} ${janela}`;
  else if (avisos > 0) texto = `${avisos} ${avisos === 1 ? "aviso" : "avisos"} ${janela}`;
  return { falhas, avisos, total: execucoes.length, texto };
}

/** Falhas primeiro, depois avisos, depois o resto — dentro de cada grupo, o mais recente antes. */
export function ordenarFalhasPrimeiro<T extends { status: "OK" | "ERRO" | "AVISO"; startedAt: string }>(runs: T[]): T[] {
  const peso = { ERRO: 0, AVISO: 1, OK: 2 } as const;
  return [...runs].sort((a, b) => peso[a.status] - peso[b.status] || new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}
