import { diaDeBrasilia, horaDeBrasilia } from "@/lib/horaDeBrasilia";
import { rotuloDoDia } from "@/lib/relogioDoAtendimento";
import type { MensagemDoChat } from "@/lib/mensagensDoChat";
import type { EstadoDoEnvio } from "@/lib/envioDeMensagem";

// ============================================================================
// AS MENSAGENS QUE O APARELHO AINDA NÃO VIU CONFIRMADAS + O RASCUNHO, por conversa (sem React).
//
// A mensagem ENTRA NA TELA AO TOCAR ENVIAR (balão "enviando") e, se falhar, FICA — com o motivo e
// "Tentar de novo". Nunca some. Como o Chat e os Detalhes são telas diferentes (trocar de guia desmonta o
// chat), estas mensagens e o rascunho ficam em `sessionStorage`: sobrevivem a trocar de guia e a
// recarregar a página, e morrem quando o app fecha ou a pessoa SAI (`limparRastrosDoAparelho`).
//
// SIGILO: nada disto vai para o service worker nem para o cache do aparelho (o SW do Atendimento não
// guarda nada). É só o texto que a própria pessoa digitou, na sessão dela, por até 24 h, e é apagado ao
// sair. Nenhuma mensagem RECEBIDA do cliente é guardada aqui.
// ============================================================================

export type Pendente = {
  clientMessageId: string;
  texto: string;
  criadoEm: string; // ISO
  estado: EstadoDoEnvio;
  erro: string | null;
  podeTentarDeNovo: boolean;
  /** true = NOTA INTERNA (só da equipe). Ausente = mensagem ao cliente. Decide o `modo` do POST e o balão. */
  nota?: boolean;
  /**
   * true = "Aguardando conexão": a pessoa tocou em enviar SEM rede, então o pedido NUNCA saiu do aparelho. Só por isso
   * o reenvio automático ao voltar é seguro: nada foi ao servidor, e mesmo que fosse a chave `clientMessageId` é a
   * mesma (o servidor devolve a mesma mensagem, nunca outra cópia). Uma mensagem que SAIU e não voltou (rede caiu no
   * meio: "sem confirmação") NUNCA tem esta marca: essa só se repete por ação humana.
   */
  aguardando?: boolean;
};

const PRAZO_MS = 24 * 3_600_000;
const PREFIXO_DA_FILA = "atd-fila:";
const PREFIXO_DO_RASCUNHO = "atd-rascunho:";
// O rascunho da NOTA é separado do da mensagem (trocar de modo não leva o texto junto). Começa com o mesmo
// prefixo do rascunho, então "Sair" apaga os dois.
const PREFIXO_DO_RASCUNHO_DA_NOTA = PREFIXO_DO_RASCUNHO + "nota:";

export function novoPendente(clientMessageId: string, texto: string, agora: Date, nota = false): Pendente {
  return { clientMessageId, texto, criadoEm: agora.toISOString(), estado: "enviando", erro: null, podeTentarDeNovo: false, ...(nota ? { nota: true } : {}) };
}

/** O pedido não sai agora: espera a conexão. Só vale para o que NUNCA foi enviado. */
export function comoAguardandoConexao(p: Pendente): Pendente {
  return { ...p, estado: "enviando", erro: null, podeTentarDeNovo: false, aguardando: true };
}

/**
 * O que fazer quando a pessoa toca em enviar / tentar de novo:
 *  - `enviar`   há conexão: o pedido sai agora.
 *  - `aguardar` não há conexão e o pedido nunca saiu: fica "Aguardando conexão" e sai sozinho ao voltar.
 *  - `avisar`   não há conexão e o pedido JÁ TINHA SAÍDO sem resposta (sem confirmação): não se reenvia sozinho nem se
 *               marca para reenvio automático; a pessoa é avisada e repete quando a conexão voltar (ação humana).
 */
export function decidirSaida(p: Pendente, semConexao: boolean): "enviar" | "aguardar" | "avisar" {
  if (!semConexao) return "enviar";
  return p.estado === "sem-confirmacao" ? "avisar" : "aguardar";
}

/**
 * O que sai SOZINHO quando a conexão volta: apenas o que está marcado `aguardando` (nunca saiu). Falhou, sem confirmação
 * e o resto ficam como estão, esperando a pessoa. Sem conexão não sai nada.
 */
export function pendentesParaReenviarAoVoltar(pendentes: Pendente[], semConexao: boolean): Pendente[] {
  if (semConexao) return [];
  return pendentes.filter((p) => p.aguardando === true && p.estado === "enviando");
}

/** O balão que a lista desenha para um pendente. */
export function pendenteComoMensagem(p: Pendente, agora: Date): MensagemDoChat {
  const quando = new Date(p.criadoEm);
  return {
    id: `local-${p.clientMessageId}`,
    direction: "OUT",
    porAgente: false,
    texto: p.texto,
    midia: null,
    falhou: p.estado === "falhou",
    enviada: p.estado === "enviada",
    criadoEm: p.criadoEm,
    hora: horaDeBrasilia(quando),
    dia: diaDeBrasilia(quando),
    rotuloDoDia: rotuloDoDia(quando, agora),
    transcricao: null,
    clientMessageId: p.clientMessageId,
    envioLocal: { estado: p.estado, erro: p.erro, podeTentarDeNovo: p.podeTentarDeNovo, ...(p.aguardando ? { aguardando: true } : {}) },
    ...(p.nota ? { tipo: "nota" as const, autor: null } : {}),
  };
}

/** Tira dos pendentes o que o servidor já entregou de volta (mesma chave): sem balão duplicado. */
export function semOsJaConfirmados(pendentes: Pendente[], doServidor: { clientMessageId: string | null }[]): Pendente[] {
  const confirmadas = new Set(doServidor.map((m) => m.clientMessageId).filter((c): c is string => Boolean(c)));
  return pendentes.filter((p) => !confirmadas.has(p.clientMessageId));
}

/**
 * Lê o que estava guardado. É dado de sessão, então nada é confiável: só entra o que tem a forma certa e
 * menos de 24 h. Um "enviando" que sobrou de uma página recarregada no meio do pedido NÃO é "enviando":
 * ninguém sabe se saiu, e vira "sem confirmação".
 */
export function restaurarPendentes(bruto: unknown, agora: Date): Pendente[] {
  if (!Array.isArray(bruto)) return [];
  const saida: Pendente[] = [];
  for (const x of bruto) {
    if (!x || typeof x !== "object") continue;
    const p = x as Record<string, unknown>;
    if (typeof p.clientMessageId !== "string" || typeof p.texto !== "string" || typeof p.criadoEm !== "string") continue;
    const t = new Date(p.criadoEm).getTime();
    if (Number.isNaN(t) || agora.getTime() - t > PRAZO_MS) continue;
    const nota = p.nota === true;
    // Nota: salvar é idempotente (a chave é única), então um "enviando" que sobrou não vira "sem confirmação"
    // (que fala em "pode ter sido enviada"): vira "falhou", com "Tentar de novo" seguro.
    // "Aguardando conexão" que sobrou de uma página recarregada AINDA não saiu (a marca só existe para o que nunca foi
    // enviado): continua aguardando, e sai sozinha quando houver conexão. É a única "enviando" que não vira dúvida.
    const aguardando = p.aguardando === true && p.estado === "enviando";
    const estado: EstadoDoEnvio = aguardando ? "enviando" : p.estado === "falhou" || p.estado === "enviada" ? p.estado : nota ? "falhou" : "sem-confirmacao";
    if (estado === "enviada") continue; // já foi confirmada; o servidor a devolve
    saida.push({
      ...(nota ? { nota: true } : {}),
      ...(aguardando ? { aguardando: true } : {}),
      clientMessageId: p.clientMessageId,
      texto: p.texto,
      criadoEm: p.criadoEm,
      estado,
      erro: aguardando ? null : typeof p.erro === "string" ? p.erro : estado === "sem-confirmacao" ? "Pode ter sido enviada: confira a conversa antes de repetir." : nota ? "Não foi possível confirmar se a nota foi salva. Tente de novo: repetir não duplica." : null,
      podeTentarDeNovo: !aguardando && (p.podeTentarDeNovo === true || estado === "sem-confirmacao" || (nota && estado === "falhou")),
    });
  }
  return saida;
}

// ── sessionStorage (sempre em try/catch: modo privado, cota e política do navegador podem falhar) ──

function armazem(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export function lerPendentesDoAparelho(idDaConversa: string, agora: Date): Pendente[] {
  try {
    const bruto = armazem()?.getItem(PREFIXO_DA_FILA + idDaConversa);
    return bruto ? restaurarPendentes(JSON.parse(bruto), agora) : [];
  } catch {
    return [];
  }
}

export function gravarPendentesNoAparelho(idDaConversa: string, pendentes: Pendente[]): void {
  try {
    const a = armazem();
    if (!a) return;
    if (pendentes.length === 0) a.removeItem(PREFIXO_DA_FILA + idDaConversa);
    else a.setItem(PREFIXO_DA_FILA + idDaConversa, JSON.stringify(pendentes));
  } catch {
    /* sem armazenamento: a tela segue funcionando, só não sobrevive a trocar de guia */
  }
}

export function lerRascunho(idDaConversa: string, nota = false): string {
  try {
    return armazem()?.getItem((nota ? PREFIXO_DO_RASCUNHO_DA_NOTA : PREFIXO_DO_RASCUNHO) + idDaConversa) ?? "";
  } catch {
    return "";
  }
}

export function gravarRascunho(idDaConversa: string, texto: string, nota = false): void {
  try {
    const a = armazem();
    if (!a) return;
    const chave = (nota ? PREFIXO_DO_RASCUNHO_DA_NOTA : PREFIXO_DO_RASCUNHO) + idDaConversa;
    if (texto) a.setItem(chave, texto);
    else a.removeItem(chave);
  } catch {
    /* idem */
  }
}

/** Ao SAIR: apaga do aparelho todo texto de conversa (rascunhos e mensagens ainda não confirmadas). */
export function limparRastrosDoAparelho(): void {
  try {
    const a = armazem();
    if (!a) return;
    const apagar: string[] = [];
    for (let i = 0; i < a.length; i++) {
      const k = a.key(i);
      if (k && (k.startsWith(PREFIXO_DA_FILA) || k.startsWith(PREFIXO_DO_RASCUNHO))) apagar.push(k);
    }
    apagar.forEach((k) => a.removeItem(k));
  } catch {
    /* idem */
  }
}
