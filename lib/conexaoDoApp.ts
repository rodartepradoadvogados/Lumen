// ============================================================================
// "ESTOU SEM CONEXÃO?" do aplicativo de Atendimento, sem React (o React entra em useConexaoDoApp.ts).
//
// Duas fontes, e basta uma para valer:
//   - o navegador diz `navigator.onLine === false` (eventos online/offline);
//   - uma chamada do próprio app FALHOU por rede (fetch lançou) e nenhuma deu certo desde então. Cobre o Wi-Fi sem
//     internet, em que o navegador ainda acha que está online.
// A faixa "Sem conexão" some quando as duas fontes voltam ao normal. Quem manda na fila de envio (ChatDaConversa) usa
// a MESMA leitura: enquanto está sem conexão a mensagem espera ("Aguardando conexão") e sai sozinha ao voltar.
//
// SIGILO: este módulo só guarda dois booleanos em memória. Nenhum dado de conversa passa por aqui.
// ============================================================================

export type FontesDeConexao = { navegadorOnline: boolean; falhaDeRede: boolean };

/** Regra única: sem conexão se o navegador diz que caiu OU a última chamada do app falhou por rede. */
export function semConexao(f: FontesDeConexao): boolean {
  return !f.navegadorOnline || f.falhaDeRede;
}

/** O endereço estático, leve e sem dado que a faixa consulta para descobrir que a rede voltou. */
export const ENDERECO_DA_SONDA = "/icons-atendimento/icon-192.png";
export const INTERVALO_DA_SONDA_MS = 8_000;

type Ouvinte = () => void;
const ouvintes = new Set<Ouvinte>();
let falhaDeRede = false;
let navegadorOnline = true;
let iniciado = false;

function avisar() {
  ouvintes.forEach((o) => o());
}

function iniciar() {
  if (iniciado || typeof window === "undefined") return;
  iniciado = true;
  navegadorOnline = navigator.onLine !== false;
  window.addEventListener("online", () => {
    navegadorOnline = true;
    avisar();
  });
  window.addEventListener("offline", () => {
    navegadorOnline = false;
    avisar();
  });
}

export function assinarConexao(ouvinte: Ouvinte): () => void {
  iniciar();
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

export function estaSemConexao(): boolean {
  iniciar();
  return semConexao({ navegadorOnline, falhaDeRede });
}

/** Uma chamada do app falhou por REDE (não por resposta do servidor): passa a valer "sem conexão". */
export function registrarFalhaDeRede(): void {
  iniciar();
  if (falhaDeRede) return;
  falhaDeRede = true;
  avisar();
}

/** Uma chamada do app chegou ao servidor (qualquer resposta): a rede voltou. */
export function registrarRedeOk(): void {
  iniciar();
  if (!falhaDeRede) return;
  falhaDeRede = false;
  avisar();
}
