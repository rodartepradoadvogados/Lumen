// ============================================================================
// QUE HORAS SÃO, NO ESCRITÓRIO.
//
// O servidor roda em UTC. Toda data formatada sem dizer o fuso sai com TRÊS HORAS A MAIS do que
// o relógio de quem está lendo — e o pior caso não é o desconforto: uma mensagem recebida às
// 22h30 de terça aparece como 01h30 de quarta, no DIA ERRADO. Quem for reconstruir uma conversa
// meses depois vai contar a história errada.
//
// Estas funções existem para que "hora" nunca mais seja formatada sem fuso neste projeto.
//
// POR QUE NÃO CONSERTAR `formatDate` DE UMA VEZ. Porque ela é usada também com datas-calendário
// (vencimento, prazo), que nascem como meia-noite UTC. Forçar Brasília ali faria toda data de
// vencimento aparecer UM DIA ANTES — trocaria um erro de três horas por um erro de um dia, em
// mais telas. O conserto certo daquele lado é auditar chamada por chamada, e é tarefa própria.
// ============================================================================

export const FUSO_DO_ESCRITORIO = "America/Sao_Paulo";

/** "14:32" no fuso do escritório. */
export function horaDeBrasilia(d: Date | string, fuso: string = FUSO_DO_ESCRITORIO): string {
  return new Date(d).toLocaleTimeString("pt-BR", { timeZone: fuso, hour: "2-digit", minute: "2-digit" });
}

/** "19/09/2026" no fuso do escritório. */
export function dataDeBrasilia(d: Date | string, fuso: string = FUSO_DO_ESCRITORIO): string {
  return new Date(d).toLocaleDateString("pt-BR", { timeZone: fuso });
}

/** "19/09/2026 14:32" — o par, que é como uma mensagem é lida. */
export function dataEHoraDeBrasilia(d: Date | string, fuso: string = FUSO_DO_ESCRITORIO): string {
  return `${dataDeBrasilia(d, fuso)} ${horaDeBrasilia(d, fuso)}`;
}

/** "2026-09-19" no fuso do escritório — a chave de dia, para agrupar mensagens. */
export function diaDeBrasilia(d: Date | string, fuso: string = FUSO_DO_ESCRITORIO): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(d),
  );
}

/**
 * Quantos milissegundos o fuso está à frente do UTC NAQUELE instante.
 *
 * Calculado a cada chamada, e não fixado em −3h, porque horário de verão existe — o Brasil não
 * tem mais, mas um escritório em outro país teria, e um número fixo no código é exatamente o tipo
 * de coisa que ninguém lembra de revisar no dia em que a regra muda.
 */
function deslocamentoMs(instante: Date, fuso: string): number {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(instante);
  const p: Record<string, string> = {};
  for (const x of partes) p[x.type] = x.value;
  const comoSeFosseUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour) % 24,
    Number(p.minute),
    Number(p.second),
  );
  // OS MILISSEGUNDOS SÃO DESCARTADOS DOS DOIS LADOS. `comoSeFosseUtc` é montado a partir de
  // ano/mês/dia/hora/minuto/segundo e portanto tem zero milissegundo; subtrair dele um instante
  // com 573ms produziria um deslocamento de "3h menos 573ms", e esse resto viajaria para dentro
  // do começo do mês — que passaria a ser 00:00:00.573 em vez de 00:00:00.000.
  //
  // O estrago disso é pequeno e silencioso, que é a pior combinação: meio segundo de movimento de
  // caixa fica de fora do período, e o último dia do mês aparece como o primeiro dia do mês
  // seguinte no rótulo. Os testes de mesa não pegaram porque todas as datas deles nascem com
  // milissegundo zero; quem pegou foi a prova de ponta a ponta, com o relógio de verdade.
  //
  // `Math.floor` e não `%`: o resto de módulo com número negativo (instante anterior a 1970) tem
  // sinal trocado em JavaScript, e isso somaria um segundo em vez de tirar.
  return comoSeFosseUtc - Math.floor(instante.getTime() / 1000) * 1000;
}

/**
 * O instante exato em que começou o mês corrente NO ESCRITÓRIO.
 *
 * "Faturamento do mês" perguntado no dia 1º às oito da manhã em Goiânia não pode responder pelo
 * mês anterior só porque, em UTC, ainda era dia 1º às onze — nem pelo mês seguinte no dia 31 às
 * dez da noite. O ajuste é aplicado duas vezes de propósito: o deslocamento pode ser diferente no
 * dia 1º e no dia em que se pergunta, e uma volta só erraria por uma hora na virada do horário de
 * verão.
 */
export function inicioDoMesEmBrasilia(agora: Date, fuso: string = FUSO_DO_ESCRITORIO): Date {
  const dia = diaDeBrasilia(agora, fuso); // "2026-09-19"
  const [ano, mes] = dia.split("-").map(Number);
  const ingenuo = Date.UTC(ano, mes - 1, 1, 0, 0, 0, 0);
  let instante = new Date(ingenuo - deslocamentoMs(agora, fuso));
  instante = new Date(ingenuo - deslocamentoMs(instante, fuso));
  return instante;
}

/** O começo do mês seguinte ao de `quando` — o fim EXCLUSIVO de um período mensal. */
export function inicioDoProximoMesEmBrasilia(quando: Date, fuso: string = FUSO_DO_ESCRITORIO): Date {
  const inicio = inicioDoMesEmBrasilia(quando, fuso);
  // Meio do mês seguinte, com folga para qualquer mês de 28 a 31 dias, e daí volta ao dia 1º.
  return inicioDoMesEmBrasilia(new Date(inicio.getTime() + 45 * 24 * 60 * 60 * 1000), fuso);
}

/** O instante em que começou aquele dia no fuso do escritório. Ano, mês (1-12) e dia de calendário. */
export function inicioDoDiaEmBrasilia(ano: number, mes: number, dia: number, fuso: string = FUSO_DO_ESCRITORIO): Date {
  const ingenuo = Date.UTC(ano, mes - 1, dia, 0, 0, 0, 0);
  // Duas passagens, pela mesma razão de inicioDoMesEmBrasilia: o deslocamento pode mudar entre o
  // palpite e o resultado, e uma volta só erraria por uma hora na virada do horário de verão.
  let instante = new Date(ingenuo - deslocamentoMs(new Date(ingenuo), fuso));
  instante = new Date(ingenuo - deslocamentoMs(instante, fuso));
  return instante;
}

/**
 * Lê "2026-09" ou "2026-09-19" e devolve o intervalo daquele mês ou daquele dia, no fuso do
 * escritório, com FIM EXCLUSIVO.
 *
 * Existe separada de `lerData` (lib/assistantTools.ts) de propósito, e a diferença importa:
 * `lerData` trabalha no fuso do processo — que em produção é UTC — e serve para filtrar
 * `dueDate`, que é uma data de calendário gravada como meia-noite UTC. Aqui o assunto é outro:
 * são instantes de caixa, e o mês tem de ser o mês do escritório. Misturar as duas convenções
 * desloca o período em três horas, o que joga o dia 1º para o mês anterior — foi o que o teste
 * pegou, e é invisível em qualquer mês que não comece ou termine na fronteira.
 *
 * Devolve nulo para texto que não seja um mês ou um dia válido.
 */
export function lerPeriodoEmBrasilia(
  texto: string | undefined,
  fuso: string = FUSO_DO_ESCRITORIO,
): { de: Date; ate: Date } | null {
  const limpo = (texto || "").trim();
  const mes = /^(\d{4})-(\d{2})$/.exec(limpo);
  if (mes) {
    const [ano, m] = [Number(mes[1]), Number(mes[2])];
    if (m < 1 || m > 12) return null;
    const de = inicioDoDiaEmBrasilia(ano, m, 1, fuso);
    const ate = m === 12 ? inicioDoDiaEmBrasilia(ano + 1, 1, 1, fuso) : inicioDoDiaEmBrasilia(ano, m + 1, 1, fuso);
    return { de, ate };
  }

  const dia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(limpo);
  if (dia) {
    const [ano, m, d] = [Number(dia[1]), Number(dia[2]), Number(dia[3])];
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const de = inicioDoDiaEmBrasilia(ano, m, d, fuso);
    // Dia que "rolou" para outro mês (2026-02-30 vira 2 de março em qualquer conta de calendário)
    // é recusado em vez de aceito em silêncio — a mesma trava de lerData, pela mesma razão.
    if (dataDeBrasilia(de, fuso) !== `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${ano}`) return null;
    return { de, ate: inicioDoDiaEmBrasilia(ano, m, d + 1, fuso) };
  }

  return null;
}

/**
 * O instante UTC correspondente a um horário de relógio (ano/mês/dia/hora/minuto) no fuso do
 * escritório — mesma técnica de duas passagens de `inicioDoDiaEmBrasilia`, generalizada para
 * incluir hora e minuto.
 */
export function instanteEmBrasilia(
  ano: number,
  mes: number,
  dia: number,
  hora: number,
  minuto: number,
  fuso: string = FUSO_DO_ESCRITORIO,
): Date {
  const ingenuo = Date.UTC(ano, mes - 1, dia, hora, minuto, 0, 0);
  let instante = new Date(ingenuo - deslocamentoMs(new Date(ingenuo), fuso));
  instante = new Date(ingenuo - deslocamentoMs(instante, fuso));
  return instante;
}

/**
 * Lê o valor bruto de um `<input type="datetime-local">` ("2026-09-19T14:30") como horário do
 * fuso do escritório e devolve o instante UTC correspondente — usado no agendamento de publicação
 * do blog (docs/agentes/robo-news-juridico-firecrawl.md, Parte A4/A5). Devolve nulo para texto
 * fora do formato esperado ou para um dia de calendário que não existe (ex.: 31 de abril).
 */
export function lerDatetimeLocalEmBrasilia(texto: string | undefined | null, fuso: string = FUSO_DO_ESCRITORIO): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec((texto || "").trim());
  if (!m) return null;
  const [, anoS, mesS, diaS, horaS, minutoS] = m;
  const ano = Number(anoS);
  const mes = Number(mesS);
  const dia = Number(diaS);
  const hora = Number(horaS);
  const minuto = Number(minutoS);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || hora > 23 || minuto > 59) return null;
  const instante = instanteEmBrasilia(ano, mes, dia, hora, minuto, fuso);
  // Dia que "rolou" para outro mês (31 de abril vira 1º de maio em qualquer conta de calendário)
  // é recusado em vez de aceito em silêncio — mesma trava de `lerPeriodoEmBrasilia`.
  if (diaDeBrasilia(instante, fuso) !== `${anoS}-${mesS}-${diaS}`) return null;
  return instante;
}

/**
 * "09/2026" — mês e ano, no fuso do escritório.
 *
 * Existe porque a tela da Assessoria mostra "Desde MM/AAAA" e fazia isso com um
 * `toLocaleDateString` sem fuso: um contrato aberto depois das 21h de Brasília aparecia no mês
 * seguinte. É o mesmo defeito das datas completas, só que mais raro e por isso mais difícil de
 * alguém notar — acontece três horas por dia, no último e no primeiro dia do mês.
 */
export function mesEAnoDeBrasilia(d: Date | string, fuso: string = FUSO_DO_ESCRITORIO): string {
  const dia = diaDeBrasilia(d, fuso);
  const [ano, mes] = dia.split("-");
  return `${mes}/${ano}`;
}
