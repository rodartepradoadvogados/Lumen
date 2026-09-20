import { teste, igual, verdade, resumo } from "./executar";
import {
  proximaAbertura,
  somarMinutosDeExpediente,
  proximoDoRepasse,
  lerJaTentaram,
  anotarTentativa,
  dentroDoExpediente,
  MINUTOS_PARA_RESPONDER,
  type Expediente,
  type PessoaDaFila,
} from "@/lib/filaDeTransferencia";

// ============================================================================
// O RELÓGIO DE QUINZE MINUTOS.
//
// Os quinze minutos são DE EXPEDIENTE, não de relógio de parede. Se fossem de parede, o lead
// transferido às 18h55 de uma sexta giraria o rodízio inteiro durante a madrugada e chegaria na
// segunda já esgotado, tendo passado por todos sem ninguém ter tido chance de ver — e o sintoma
// seria "o sistema perde os leads da noite", que não aponta para o relógio.
//
// TUDO É TESTADO COM FUSO DE VERDADE. O servidor roda em UTC; as datas aqui são construídas em
// UTC explícito e conferidas no fuso do escritório, porque é a única forma de o teste provar algo
// sobre o expediente de Goiânia em vez de sobre o do servidor.
// ============================================================================

const COMERCIAL: Expediente = { dias: "1,2,3,4,5", inicio: "08:00", fim: "18:00", fuso: "America/Sao_Paulo" };

/** Data em UTC. São Paulo está em UTC-3 (sem horário de verão desde 2019). */
const utc = (ano: number, mes: number, dia: number, h: number, m = 0) => new Date(Date.UTC(ano, mes - 1, dia, h, m, 0, 0));

/** Como aquele instante é lido no fuso do escritório — é assim que o teste fica legível. */
function noEscritorio(d: Date, fuso = "America/Sao_Paulo"): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

// ── A próxima abertura ───────────────────────────────────────────────────────────────────────

teste("dentro do expediente, a próxima abertura é agora", () => {
  // Quarta, 14/10/2026, 10:00 em São Paulo = 13:00 UTC.
  const agora = utc(2026, 10, 14, 13);
  verdade(dentroDoExpediente(COMERCIAL, agora), "o caso base não está dentro do expediente");
  igual(proximaAbertura(COMERCIAL, agora).getTime(), agora.getTime());
});

teste("de noite, a abertura é às 8h do dia seguinte, no minuto exato", () => {
  // Quarta, 14/10/2026, 22:00 em São Paulo = 01:00 UTC de quinta.
  const abertura = proximaAbertura(COMERCIAL, utc(2026, 10, 15, 1));
  igual(noEscritorio(abertura), "qui., 15/10, 08:00");
});

teste("antes de abrir, a abertura é hoje mesmo às 8h", () => {
  // Quarta, 14/10/2026, 06:30 em São Paulo = 09:30 UTC.
  igual(noEscritorio(proximaAbertura(COMERCIAL, utc(2026, 10, 14, 9, 30))), "qua., 14/10, 08:00");
});

teste("na sexta à noite, a abertura é na segunda — o fim de semana é atravessado", () => {
  // Sexta, 16/10/2026, 19:30 em São Paulo = 22:30 UTC.
  igual(noEscritorio(proximaAbertura(COMERCIAL, utc(2026, 10, 16, 22, 30))), "seg., 19/10, 08:00");
});

teste("escritório de um dia por semana também é atravessado", () => {
  const so_terca: Expediente = { ...COMERCIAL, dias: "2" };
  // Terça, 13/10/2026, 19:00 em São Paulo = 22:00 UTC.
  igual(noEscritorio(proximaAbertura(so_terca, utc(2026, 10, 13, 22))), "ter., 20/10, 08:00");
});

// ── Somar minutos de expediente ──────────────────────────────────────────────────────────────

teste("no meio da manhã, quinze minutos são quinze minutos", () => {
  const prazo = somarMinutosDeExpediente(COMERCIAL, utc(2026, 10, 14, 13), MINUTOS_PARA_RESPONDER);
  igual(noEscritorio(prazo), "qua., 14/10, 10:15");
});

teste("faltando cinco para fechar, o prazo atravessa a noite e sobra do outro lado", () => {
  // Quarta, 17:55 em São Paulo = 20:55 UTC. Cinco minutos hoje, dez amanhã a partir das 8h.
  const prazo = somarMinutosDeExpediente(COMERCIAL, utc(2026, 10, 14, 20, 55), MINUTOS_PARA_RESPONDER);
  igual(noEscritorio(prazo), "qui., 15/10, 08:10");
});

teste("exatamente no fechamento, o prazo inteiro cai no dia seguinte", () => {
  // Quarta, 18:00 em São Paulo = 21:00 UTC.
  const prazo = somarMinutosDeExpediente(COMERCIAL, utc(2026, 10, 14, 21), MINUTOS_PARA_RESPONDER);
  igual(noEscritorio(prazo), "qui., 15/10, 08:15");
});

teste("transferido na sexta à noite, o prazo vence na segunda de manhã", () => {
  // Sexta, 18:55 em São Paulo = 21:55 UTC.
  const prazo = somarMinutosDeExpediente(COMERCIAL, utc(2026, 10, 16, 21, 55), MINUTOS_PARA_RESPONDER);
  igual(noEscritorio(prazo), "seg., 19/10, 08:15");
});

teste("um prazo maior que um dia de expediente consome vários dias", () => {
  // Quarta, 17:00 em São Paulo = 20:00 UTC. 10h de expediente por dia.
  // 1h na quarta + 10h na quinta + 10h na sexta + 3h na segunda = 24h.
  const prazo = somarMinutosDeExpediente(COMERCIAL, utc(2026, 10, 14, 20), 24 * 60);
  igual(noEscritorio(prazo), "seg., 19/10, 11:00");
});

teste("o prazo nunca cai fora do expediente", () => {
  for (const hora of [0, 3, 6, 9, 11, 13, 15, 17, 20, 23]) {
    for (const dia of [12, 13, 14, 15, 16, 17, 18]) {
      const prazo = somarMinutosDeExpediente(COMERCIAL, utc(2026, 10, dia, hora), MINUTOS_PARA_RESPONDER);
      // O último minuto do expediente é 17:59; um prazo que caia às 18:00 em ponto está fora.
      verdade(
        dentroDoExpediente(COMERCIAL, new Date(prazo.getTime() - 1)),
        `prazo fora do expediente partindo de ${noEscritorio(utc(2026, 10, dia, hora))}: ${noEscritorio(prazo)}`,
      );
    }
  }
});

teste("o prazo anda sempre para a frente, nunca para trás", () => {
  for (const hora of [0, 5, 8, 11, 14, 17, 21, 23]) {
    const de = utc(2026, 10, 14, hora);
    verdade(
      somarMinutosDeExpediente(COMERCIAL, de, MINUTOS_PARA_RESPONDER).getTime() > de.getTime(),
      `o prazo não avançou partindo de ${noEscritorio(de)}`,
    );
  }
});

teste("fuso diferente do servidor é respeitado — Manaus abre uma hora depois", () => {
  const manaus: Expediente = { ...COMERCIAL, fuso: "America/Manaus" };
  // 11:00 UTC = 08:00 em São Paulo, mas 07:00 em Manaus — ainda fechado lá.
  const prazo = somarMinutosDeExpediente(manaus, utc(2026, 10, 14, 11), MINUTOS_PARA_RESPONDER);
  igual(noEscritorio(prazo, "America/Manaus"), "qua., 14/10, 08:15");
});

// ── Expediente mal preenchido não pode parar o relógio ───────────────────────────────────────

teste("sem nenhum dia marcado, o prazo cai no relógio de parede em vez de nunca vencer", () => {
  const vazio: Expediente = { ...COMERCIAL, dias: "" };
  const de = utc(2026, 10, 14, 13);
  const prazo = somarMinutosDeExpediente(vazio, de, MINUTOS_PARA_RESPONDER);
  igual(prazo.getTime() - de.getTime(), MINUTOS_PARA_RESPONDER * 60_000);
});

teste("fim antes do início também cai no relógio de parede", () => {
  const torto: Expediente = { ...COMERCIAL, inicio: "18:00", fim: "08:00" };
  const de = utc(2026, 10, 14, 13);
  igual(somarMinutosDeExpediente(torto, de, MINUTOS_PARA_RESPONDER).getTime() - de.getTime(), 15 * 60_000);
});

// ── Quem já teve a vez ───────────────────────────────────────────────────────────────────────

let n = 0;
function pessoa(id?: string): PessoaDaFila {
  n += 1;
  return {
    id: id ?? `p${n}`,
    nome: `Pessoa ${n}`,
    papel: "Advogado",
    ativo: true,
    isAdmin: true,
    recebeTransferencia: true,
    criadoEm: new Date(2026, 0, n),
  };
}

teste("o repasse segue o rodízio, começando depois de quem deixou o prazo vencer", () => {
  const fila = [pessoa("a"), pessoa("b"), pessoa("c")];
  igual(proximoDoRepasse(fila, ["a"], "a")?.id, "b");
  igual(proximoDoRepasse(fila, ["a", "b"], "b")?.id, "c");
  // Sem cursor, começa do início.
  igual(proximoDoRepasse(fila, [], null)?.id, "a");
});

teste("o repasse dá a volta na fila em vez de parar no fim", () => {
  const fila = [pessoa("a"), pessoa("b"), pessoa("c")];
  // "c" foi o último e já tentou; "a" também. Sobra "b", que está ANTES de "c" na fila.
  igual(proximoDoRepasse(fila, ["c", "a"], "c")?.id, "b");
});

teste("o repasse não concentra na primeira pessoa cadastrada", () => {
  const fila = [pessoa("a"), pessoa("b"), pessoa("c")];
  // Sem respeitar o cursor, "a" receberia todo repasse de todo lead.
  igual(proximoDoRepasse(fila, ["b"], "b")?.id, "c");
});

teste("com todos já tentados, a volta fechou", () => {
  const fila = [pessoa("a"), pessoa("b")];
  igual(proximoDoRepasse(fila, ["a", "b"], "b"), null);
});

teste("quem saiu da fila não impede o repasse nem consome a volta", () => {
  // "z" teve a vez e depois foi desativado: não está mais na fila.
  const fila = [pessoa("a"), pessoa("b")];
  igual(proximoDoRepasse(fila, ["z"], "z")?.id, "a");
});

teste("quem entrou na fila no meio do caminho ganha a vez que nunca teve", () => {
  const fila = [pessoa("a"), pessoa("b"), pessoa("novo")];
  igual(proximoDoRepasse(fila, ["a", "b"], "b")?.id, "novo");
});

teste("fila vazia não devolve ninguém", () => {
  igual(proximoDoRepasse([], [], null), null);
});

teste("a lista de tentados não repete e sobrevive a texto sujo", () => {
  igual(lerJaTentaram(" a , b ,, c "), ["a", "b", "c"]);
  igual(lerJaTentaram(null), []);
  igual(anotarTentativa("a,b", "c"), "a,b,c");
  igual(anotarTentativa("a,b", "a"), "a,b");
  igual(anotarTentativa(null, "a"), "a");
  igual(anotarTentativa("", "a"), "a");
});

resumo("Relógio de 15 minutos");
