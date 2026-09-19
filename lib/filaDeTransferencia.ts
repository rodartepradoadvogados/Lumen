// ============================================================================
// A FILA — para quem vai o lead quando a atendente termina.
//
// Tudo aqui é função pura, e isso não é preciosismo: errar a fila manda a conversa de um cliente
// para a pessoa errada, ou para ninguém. É o tipo de defeito que não aparece em teste manual —
// funciona nas três primeiras vezes e some na quarta, quando a volta fecha.
//
// AS REGRAS, como o dono as definiu:
//
//   - RODÍZIO por ordem de cadastro. Quem entra depois vai para o fim, sem renumerar nada.
//   - Caso TRIADO vai para advogado; GENÉRICO vai para a recepção.
//   - Sem ninguém na recepção, o genérico vai para os advogados. Nunca para ninguém.
//   - Só entra quem está marcado. A marca nasce desligada.
//   - Advogado EXTERNO (a tabela `Lawyer`, que é parceiro ou parte adversa) nunca recebe nada.
//     Não há código para isso aqui porque a fila nem olha aquela tabela — e é assim que se
//     impede de verdade, e não com um `if`.
// ============================================================================

/** Os papéis que atendem lead triado. "Sócio" entra: sócio é advogado do escritório. */
const PAPEIS_ADVOGADO = ["advogado", "sócio", "socio"];

/**
 * Os papéis de recepção.
 *
 * "Recepcionista" e "Recepcionista/Secretária" convivem de propósito: o rótulo mudou, e quem já
 * estava cadastrado continua com o valor antigo no banco. Aceitar os dois evita uma migração de
 * dados para um ganho de zero — e evita o dia em que a migração falha e a recepção some da fila.
 */
const PAPEIS_RECEPCAO = ["recepcionista", "recepcionista/secretária", "recepcionista/secretaria", "secretária", "secretaria"];

export type PessoaDaFila = {
  id: string;
  nome: string;
  papel: string;
  ativo: boolean;
  recebeTransferencia: boolean;
  /** Ordem de cadastro: é a posição na fila. */
  criadoEm: Date;
};

export type TipoDeFila = "ADVOGADOS" | "RECEPCAO";

/** Triado vai para advogado; genérico para a recepção. Decidido pelo GATILHO, não pelo agente. */
export type GatilhoDaTransferencia =
  | "RISCO" // o lead insistiu em prazo, valor ou resultado
  | "PEDIDO" // pediu para falar com advogado
  | "ROTEIRO" // a triagem terminou
  | "FORA_DO_ESCOPO" // trouxe assunto que não é da campanha
  | "TETO"; // passou do limite de mensagens sem concluir

/**
 * O tipo de fila que cada gatilho merece.
 *
 * É o sistema que decide, e não o agente se autoavaliando: agente que se classifica erra para o
 * lado confortável, e o lado confortável é "genérico" — o que encheria a recepção de caso pronto
 * para advogado.
 */
export function filaDoGatilho(gatilho: GatilhoDaTransferencia): TipoDeFila {
  return gatilho === "RISCO" || gatilho === "PEDIDO" || gatilho === "ROTEIRO" ? "ADVOGADOS" : "RECEPCAO";
}

function papelNaLista(papel: string, lista: string[]): boolean {
  const p = (papel || "").trim().toLowerCase();
  return lista.some((x) => p === x);
}

/** Quem está apto, na ordem de cadastro. Inativo e não-marcado ficam de fora. */
export function montarFila(pessoas: PessoaDaFila[], tipo: TipoDeFila): PessoaDaFila[] {
  const papeis = tipo === "ADVOGADOS" ? PAPEIS_ADVOGADO : PAPEIS_RECEPCAO;
  return pessoas
    .filter((p) => p.ativo && p.recebeTransferencia && papelNaLista(p.papel, papeis))
    .sort((a, b) => a.criadoEm.getTime() - b.criadoEm.getTime() || a.id.localeCompare(b.id));
}

/**
 * O próximo do rodízio.
 *
 * `ultimoId` é quem recebeu da última vez. Volta o seguinte; passando do fim, volta ao começo.
 *
 * Quem recebeu por último pode ter SAÍDO da fila desde então — desmarcado, desativado, ou com o
 * papel trocado. Nesse caso não dá para achar a posição dele, e a resposta certa é começar do
 * princípio em vez de não entregar a ninguém.
 */
export function proximoDaFila(fila: PessoaDaFila[], ultimoId: string | null): PessoaDaFila | null {
  if (fila.length === 0) return null;
  const i = ultimoId ? fila.findIndex((p) => p.id === ultimoId) : -1;
  return fila[(i + 1) % fila.length];
}

export type Destino = { pessoa: PessoaDaFila; fila: TipoDeFila } | { pessoa: null; motivo: string };

/**
 * Para quem vai, considerando o desvio da campanha e a regra de reserva.
 *
 * `preferida` vem da campanha ("sempre para os advogados", "sempre para a recepção") e vence o
 * gatilho quando informada — é o escritório dizendo que naquela campanha ele sabe melhor.
 *
 * A RESERVA SÓ EXISTE NUM SENTIDO: genérico sem recepção cai nos advogados, porque alguém tem que
 * atender. Triado sem advogado NÃO cai na recepção — entregar um caso já triado a quem não pode
 * dar andamento é pior do que segurá-lo e avisar que ninguém está marcado.
 */
export function paraQuemVai(
  pessoas: PessoaDaFila[],
  gatilho: GatilhoDaTransferencia,
  cursores: { ultimoAdvogadoId: string | null; ultimaRecepcaoId: string | null },
  preferida?: TipoDeFila | null,
): Destino {
  const tipo = preferida ?? filaDoGatilho(gatilho);

  const tentar = (t: TipoDeFila): Destino | null => {
    const fila = montarFila(pessoas, t);
    const pessoa = proximoDaFila(fila, t === "ADVOGADOS" ? cursores.ultimoAdvogadoId : cursores.ultimaRecepcaoId);
    return pessoa ? { pessoa, fila: t } : null;
  };

  const primeiro = tentar(tipo);
  if (primeiro) return primeiro;

  if (tipo === "RECEPCAO") {
    const reserva = tentar("ADVOGADOS");
    if (reserva) return reserva;
  }

  return {
    pessoa: null,
    motivo:
      tipo === "ADVOGADOS"
        ? "nenhum advogado está marcado para receber transferências"
        : "ninguém está marcado para receber transferências",
  };
}

// ── O expediente ─────────────────────────────────────────────────────────────────────────────

export type Expediente = {
  dias: string; // "1,2,3,4,5" — 0 é domingo
  inicio: string; // "08:00"
  fim: string; // "18:00"
  fuso: string; // "America/Sao_Paulo"
};

/**
 * Que dia e que hora são, NO FUSO DO ESCRITÓRIO.
 *
 * O servidor roda em UTC. Comparar "08:00" com a hora UTC faria o expediente de Goiânia começar
 * às cinco da manhã e terminar às três da tarde — e o sintoma seria "o lead da manhã não foi
 * repassado", que não aponta para cá de jeito nenhum.
 *
 * `Intl` faz a conversão com o banco de fusos do sistema, o que inclui horário de verão onde
 * ainda existe. Fuso inválido (alguém digitou errado) cai no de Brasília em vez de lançar: o
 * relógio da transferência não pode parar porque um campo de texto veio torto.
 */
export function agoraNoEscritorio(agora: Date, fuso: string): { diaDaSemana: number; minutos: number } {
  let partes: Intl.DateTimeFormatPart[];
  try {
    partes = new Intl.DateTimeFormat("en-US", {
      timeZone: fuso || "America/Sao_Paulo",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(agora);
  } catch {
    partes = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(agora);
  }

  const pegar = (t: string) => partes.find((p) => p.type === t)?.value ?? "";
  const semana: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  // "24" aparece à meia-noite em alguns ambientes com hour12:false. Vira 0, que é o que ela é.
  const hora = Number(pegar("hour")) % 24;
  return { diaDaSemana: semana[pegar("weekday")] ?? 0, minutos: hora * 60 + Number(pegar("minute")) };
}

function emMinutos(hhmm: string): number {
  const [h, m] = (hhmm || "").split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 0;
}

export function dentroDoExpediente(expediente: Expediente, agora: Date): boolean {
  const { diaDaSemana, minutos } = agoraNoEscritorio(agora, expediente.fuso);
  const dias = (expediente.dias || "")
    .split(",")
    .map((d) => Number(d.trim()))
    .filter((d) => Number.isInteger(d));
  if (!dias.includes(diaDaSemana)) return false;
  const inicio = emMinutos(expediente.inicio);
  const fim = emMinutos(expediente.fim);
  return minutos >= inicio && minutos < fim;
}
