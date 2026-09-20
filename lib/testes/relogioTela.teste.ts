import { teste, igual, verdade, resumo } from "./executar";
import {
  estadoDoRelogio,
  tituloDoRelogio,
  detalheDoRelogio,
  rotuloDoDia,
  agruparPorDia,
  fraseDaTransferencia,
} from "@/lib/relogioDoAtendimento";

// ============================================================================
// O CHIP DO RELÓGIO E OS SEPARADORES DE DIA.
//
// As duas coisas da tela do atendimento que erram calado. Um relógio que conta ao contrário fora do
// expediente continua parecendo um relógio; uma conversa com dois "Hoje" continua parecendo uma
// conversa. Só um teste pega.
//
// Todas as datas aqui são escritas em UTC com o deslocamento de Brasília embutido (-03:00 em
// setembro) para que o teste diga a hora que a TELA vai mostrar, e não a hora do servidor.
// ============================================================================

const emBrasilia = (texto: string) => new Date(`${texto}-03:00`);

// ── O RELÓGIO ───────────────────────────────────────────────────────────────

teste("sem prazo gravado não há relógio", () => {
  igual(estadoDoRelogio(null, emBrasilia("2026-09-20T10:00:00")), { tipo: "sem-relogio" });
  igual(estadoDoRelogio(undefined, emBrasilia("2026-09-20T10:00:00")), { tipo: "sem-relogio" });
});

teste("correndo: conta os decorridos a partir do que falta", () => {
  const e = estadoDoRelogio(emBrasilia("2026-09-20T10:04:00"), emBrasilia("2026-09-20T09:53:00"));
  igual(e, { tipo: "correndo", decorridos: 4, faltam: 11 });
  igual(tituloDoRelogio(e), "4 min sem resposta");
  igual(detalheDoRelogio(e), "volta para a fila em 11");
});

teste("correndo: os decorridos e o que falta sempre somam quinze", () => {
  // A conta é derivada, e não guardada em dois lugares — então esta soma é a prova de que ela não
  // pode divergir de si mesma.
  for (let m = 1; m <= 15; m++) {
    const e = estadoDoRelogio(emBrasilia("2026-09-20T10:00:00"), new Date(emBrasilia("2026-09-20T10:00:00").getTime() - m * 60_000));
    verdade(e.tipo === "correndo", `${m} min antes do prazo deveria estar correndo`);
    if (e.tipo === "correndo") igual(e.decorridos + e.faltam, 15, `com ${m} min para o prazo: `);
  }
});

teste("estourado: o prazo passou e o cron ainda não rodou", () => {
  const e = estadoDoRelogio(emBrasilia("2026-09-20T10:00:00"), emBrasilia("2026-09-20T10:03:00"));
  igual(e, { tipo: "estourado", atrasado: 3 });
  igual(tituloDoRelogio(e), "Prazo estourado");
  igual(detalheDoRelogio(e), "há 3 min — vai ser repassado");
});

teste("estourado no segundo exato do prazo nunca diz zero minuto", () => {
  // "há 0 min" é a frase que faz a pessoa achar que o chip travou.
  const e = estadoDoRelogio(emBrasilia("2026-09-20T10:00:00"), emBrasilia("2026-09-20T10:00:00"));
  igual(e, { tipo: "estourado", atrasado: 1 });
});

teste("parado: o prazo pulou para o expediente seguinte", () => {
  // O caso que fazia a tela mentir: o lead chegou às 17h58, o expediente fecha às 18h, e o prazo
  // foi gravado para as 8h13 do dia seguinte. A distância é de 854 minutos — e mostrar "faltam 854"
  // ou, pior, "decorridos -839" seria absurdo nos dois sentidos. O relógio está PARADO.
  const e = estadoDoRelogio(emBrasilia("2026-09-21T08:13:00"), emBrasilia("2026-09-20T17:59:00"));
  igual(e, { tipo: "parado" });
  igual(tituloDoRelogio(e), "Relógio parado");
  igual(detalheDoRelogio(e), "volta a contar na abertura do expediente");
});

teste("exatamente quinze minutos ainda é correndo, não parado", () => {
  // A fronteira. Um `>=` no lugar do `>` faria o instante em que o relógio começa aparecer como
  // parado — justamente o instante em que ele mais precisa aparecer correndo.
  const e = estadoDoRelogio(emBrasilia("2026-09-20T10:15:00"), emBrasilia("2026-09-20T10:00:00"));
  igual(e, { tipo: "correndo", decorridos: 0, faltam: 15 });
});

// ── A FRASE DA TRANSFERÊNCIA ────────────────────────────────────────────────

teste("a frase da transferência usa o mesmo motivo do aviso do WhatsApp", () => {
  igual(
    fraseDaTransferencia("ROTEIRO", emBrasilia("2026-09-20T21:58:00")),
    "A triagem terminou e o atendente passou esta conversa às 21:58."
  );
  igual(
    fraseDaTransferencia("PEDIDO", emBrasilia("2026-09-20T09:05:00")),
    "O cliente pediu para falar com um advogado e o atendente passou esta conversa às 09:05."
  );
});

teste("gatilho desconhecido não vira frase quebrada", () => {
  // Um gatilho novo gravado no banco antes de esta tela conhecê-lo não pode produzir
  // "undefined e o atendente passou…".
  const f = fraseDaTransferencia("GATILHO_QUE_NAO_EXISTE", emBrasilia("2026-09-20T09:05:00"));
  igual(f, "Esta conversa foi passada para o escritório às 09:05.");
});

teste("sem data de transferência não há frase", () => {
  igual(fraseDaTransferencia("ROTEIRO", null), null);
});

// ── OS SEPARADORES DE DIA ───────────────────────────────────────────────────

teste("hoje, ontem e a data", () => {
  const agora = emBrasilia("2026-09-20T09:00:00");
  igual(rotuloDoDia(emBrasilia("2026-09-20T08:00:00"), agora), "Hoje");
  igual(rotuloDoDia(emBrasilia("2026-09-19T23:50:00"), agora), "Ontem");
  igual(rotuloDoDia(emBrasilia("2026-09-14T10:00:00"), agora), "14/09");
  igual(rotuloDoDia(emBrasilia("2025-12-31T10:00:00"), agora), "31/12/2025");
});

teste("às 22h de Brasília o dia ainda é hoje, e não amanhã", () => {
  // ESTE é o caso que o fuso quebra. Às 22h de Brasília o servidor em UTC já está no dia seguinte:
  // uma comparação por instante, ou por getDate(), marcaria a mensagem de 22h05 como de outro dia
  // que a de 21h55 — duas faixas na mesma noite, uma delas dizendo "Hoje" errado.
  const agora = emBrasilia("2026-09-20T22:30:00");
  igual(rotuloDoDia(emBrasilia("2026-09-20T21:55:00"), agora), "Hoje");
  igual(rotuloDoDia(emBrasilia("2026-09-20T22:05:00"), agora), "Hoje");
  igual(rotuloDoDia(emBrasilia("2026-09-19T22:05:00"), agora), "Ontem");
});

teste("a conversa é agrupada em dias, na ordem, sem repetir faixa", () => {
  const agora = emBrasilia("2026-09-20T10:00:00");
  const msgs = [
    { id: "1", createdAt: emBrasilia("2026-09-19T21:41:00") },
    { id: "2", createdAt: emBrasilia("2026-09-19T21:42:00") },
    { id: "3", createdAt: emBrasilia("2026-09-19T21:55:00") },
    { id: "4", createdAt: emBrasilia("2026-09-20T09:14:00") },
  ];
  const grupos = agruparPorDia(msgs, (m) => m.createdAt, agora);
  igual(grupos.map((g) => g.rotulo), ["Ontem", "Hoje"]);
  igual(grupos.map((g) => g.mensagens.map((m) => m.id)), [["1", "2", "3"], ["4"]]);
});

teste("nenhuma mensagem se perde no agrupamento", () => {
  // O contrato: os grupos, na ordem, contêm cada mensagem uma vez só. Um agrupamento que usa mapa
  // em vez de sequência embaralharia a conversa, e uma conversa fora de ordem é ilegível.
  const agora = emBrasilia("2026-09-20T10:00:00");
  const msgs = Array.from({ length: 30 }, (_, i) => ({
    id: String(i),
    createdAt: new Date(emBrasilia("2026-09-14T08:00:00").getTime() + i * 5 * 3_600_000),
  }));
  const grupos = agruparPorDia(msgs, (m) => m.createdAt, agora);
  igual(grupos.flatMap((g) => g.mensagens.map((m) => m.id)), msgs.map((m) => m.id));
});

teste("conversa vazia não produz faixa nenhuma", () => {
  igual(agruparPorDia([], (m: { createdAt: Date }) => m.createdAt, emBrasilia("2026-09-20T10:00:00")), []);
});

resumo("Relógio e dias da conversa");
