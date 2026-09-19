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

/**
 * Os dias de expediente, a partir do texto gravado ("1,2,3,4,5" — 0 é domingo).
 *
 * O PEDAÇO VAZIO É DESCARTADO ANTES DE VIRAR NÚMERO. `Number("")` é zero, não NaN — então um campo
 * de dias em branco virava a lista `[0]`, e o escritório passava a ter o domingo como seu único
 * dia de expediente. O sintoma seria "o relógio dos leads só funciona no domingo", que não aponta
 * para uma conversão de string de jeito nenhum. Achado pelo teste do relógio.
 */
function diasDeExpediente(bruto: string): number[] {
  return (bruto || "")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean)
    .map(Number)
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
}

export function dentroDoExpediente(expediente: Expediente, agora: Date): boolean {
  const { diaDaSemana, minutos } = agoraNoEscritorio(agora, expediente.fuso);
  const dias = diasDeExpediente(expediente.dias);
  if (!dias.includes(diaDaSemana)) return false;
  const inicio = emMinutos(expediente.inicio);
  const fim = emMinutos(expediente.fim);
  return minutos >= inicio && minutos < fim;
}

// ── O RELÓGIO DE QUINZE MINUTOS ──────────────────────────────────────────────────────────────
//
// Lead transferido e não atendido volta para a fila. Quinze minutos DE EXPEDIENTE, e não de
// relógio de parede: transferido às 18h55 de uma sexta, o prazo não vence às 19h10 de sexta —
// vence quinze minutos depois de a porta abrir na segunda. O contrário faria o rodízio inteiro
// girar durante a madrugada e o lead chegar na segunda já esgotado, tendo passado por todos sem
// ninguém ter tido chance de ver.
//
// O PRAZO É GRAVADO, NÃO CALCULADO A CADA LEITURA. Guardar o instante do vencimento em vez de
// recontar "quantos minutos de expediente passaram desde a transferência" tem duas vantagens:
// a conta é uma caminhada para a FRENTE (muito mais simples de escrever e de testar do que medir
// um intervalo entre duas datas quaisquer), e mudar o expediente amanhã não reescreve o prazo dos
// leads de hoje.

/** Quantos minutos o dono da vez tem para dar o primeiro sinal de vida. */
export const MINUTOS_PARA_RESPONDER = 15;

const UM_MINUTO = 60_000;

function somarMinutos(quando: Date, minutos: number): Date {
  return new Date(quando.getTime() + minutos * UM_MINUTO);
}

/** Expediente impossível de cumprir — dias vazios, ou fim antes do início. */
function expedienteInvalido(expediente: Expediente): boolean {
  return diasDeExpediente(expediente.dias).length === 0 || emMinutos(expediente.inicio) >= emMinutos(expediente.fim);
}

/**
 * O primeiro instante de expediente a partir de `de` — ele mesmo, se já estiver aberto.
 *
 * Anda em passos de uma hora enquanto estiver fechado e depois VOLTA de minuto em minuto até o
 * primeiro minuto aberto. Duas fases porque uma só não serve: passo de uma hora sozinho pararia
 * até 59 minutos depois da abertura (e num prazo de quinze minutos isso é o dobro do prazo);
 * passo de um minuto sozinho daria quase três mil voltas para atravessar um fim de semana. E cada
 * passo relê o relógio no fuso do escritório, em vez de fazer contas com 24h — é o que mantém a
 * conta certa no dia em que o horário de verão muda.
 */
export function proximaAbertura(expediente: Expediente, de: Date): Date {
  if (expedienteInvalido(expediente)) return de;

  // JÁ ABERTO, DEVOLVE NA HORA — e esta linha não é um atalho de desempenho, é a correção de um
  // defeito. Sem ela, a caminhada de volta parte de dentro do expediente e continua para trás
  // enquanto o minuto anterior estiver aberto: começando às dez da manhã, ela volta até as oito e
  // devolve um prazo NO PASSADO, que venceria no mesmo instante em que foi gravado. Foi o que o
  // teste pegou, e é por isso que ele confere que o prazo sempre ANDA PARA A FRENTE, e não apenas
  // que ele cai dentro do expediente.
  if (dentroDoExpediente(expediente, de)) return de;

  let t = de;
  // 400 horas: mais de duas semanas. Expediente de um dia por semana atravessa em 144.
  for (let i = 0; i < 400 && !dentroDoExpediente(expediente, t); i++) t = somarMinutos(t, 60);
  if (!dentroDoExpediente(expediente, t)) return de; // não achou: devolve o que veio, sem travar

  // Recua até o primeiro minuto aberto, desfazendo o excesso do passo de uma hora. Com `de` já
  // fechado (garantido acima), esse minuto é sempre a abertura do dia — nunca antes de `de`.
  for (let i = 0; i < 70 && dentroDoExpediente(expediente, somarMinutos(t, -1)); i++) t = somarMinutos(t, -1);
  return t;
}

/**
 * `de` mais `minutos` CONTADOS DENTRO DO EXPEDIENTE.
 *
 * Expediente mal preenchido (nenhum dia marcado, fim antes do início) cai no relógio de parede em
 * vez de lançar ou devolver "nunca". É a escolha certa: um campo torto na configuração não pode
 * fazer os leads de um escritório dormirem para sempre sem ninguém ser chamado.
 */
export function somarMinutosDeExpediente(expediente: Expediente, de: Date, minutos: number): Date {
  if (minutos <= 0) return de;
  if (expedienteInvalido(expediente)) return somarMinutos(de, minutos);

  const fim = emMinutos(expediente.fim);
  let t = proximaAbertura(expediente, de);
  let restante = minutos;

  // 400 voltas: cada uma consome um dia inteiro de expediente. Mais que um ano de prazo.
  for (let i = 0; i < 400; i++) {
    const agora = agoraNoEscritorio(t, expediente.fuso);
    const disponivel = fim - agora.minutos;
    if (disponivel <= 0) {
      // Só acontece se `proximaAbertura` não achou abertura nenhuma; não insiste.
      return somarMinutos(t, restante);
    }
    if (disponivel >= restante) return somarMinutos(t, restante);
    restante -= disponivel;
    // Vai até o fechamento e salta para a abertura seguinte.
    t = proximaAbertura(expediente, somarMinutos(t, disponivel));
  }
  return somarMinutos(t, restante);
}

/**
 * O próximo da fila que AINDA NÃO TEVE A VEZ neste lead.
 *
 * Guardar quem já tentou (e não um contador de voltas) é o que garante que o lead não volta para
 * a mesma pessoa duas vezes quando alguém entra ou sai da fila no meio do caminho — e é aí que um
 * contador erra, porque o tamanho da fila mudou embaixo dele.
 *
 * `ultimoId` é quem acabou de deixar o prazo vencer: a busca começa no seguinte.
 *
 * Nulo significa que a volta fechou: todo mundo apto já teve a vez.
 */
export function proximoDoRepasse(fila: PessoaDaFila[], jaTentaram: string[], ultimoId: string | null): PessoaDaFila | null {
  if (fila.length === 0) return null;
  const tentados = new Set(jaTentaram.filter(Boolean));
  // Começa DEPOIS de quem recebeu por último, e não no início da fila. Começar no início faria a
  // primeira pessoa cadastrada receber todo repasse de todo lead do escritório — e o rodízio,
  // que existe para dividir, passaria a concentrar justamente nos casos que ninguém atendeu.
  const i = ultimoId ? fila.findIndex((p) => p.id === ultimoId) : -1;
  for (let k = 1; k <= fila.length; k++) {
    const pessoa = fila[(i + k) % fila.length];
    if (!tentados.has(pessoa.id)) return pessoa;
  }
  return null;
}

/** Lê a lista de quem já teve a vez, gravada como texto separado por vírgula. */
export function lerJaTentaram(bruto: string | null | undefined): string[] {
  return (bruto || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Acrescenta uma pessoa à lista de quem já teve a vez, sem repetir. */
export function anotarTentativa(bruto: string | null | undefined, id: string): string {
  const atual = lerJaTentaram(bruto);
  return atual.includes(id) ? atual.join(",") : [...atual, id].join(",");
}
