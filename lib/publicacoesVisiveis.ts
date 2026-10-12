// O UNIVERSO DA FILA DE PUBLICAÇÕES — a única definição de "o que conta como publicação a tratar".
//
// Por que existe (medido no banco em 12/10/2026): a tela carregava as 3.000 publicações mais
// recentes do escritório, sendo 97% andamentos do DataJud (14.978 de 15.515 itens). O que passava do
// corte sumia, e a fila de uma advogada chegava a 6.934 itens (1.552 dentro da janela) dos quais
// só ~440 eram intimações. A tela, o selo do menu, o selo do PWA, o início do celular e a Central de
// Alertas precisam concordar sobre o universo; por isso este módulo é o ponto único, em vez de cada
// um escrever o próprio `where`.
//
// REGRAS
//   1. Só `estado: "ATIVA"`: quarentena e descartadas ficam de fora de todo contador e de todo selo.
//   2. Andamento do DataJud NÃO entra na fila: é movimentação informativa do processo e continua
//      visível na aba Publicações do próprio processo. Só entra se for RECENTE e se o texto parecer
//      uma intimação, decisão ou audiência — o DataJud pode registrar o ato antes de o DJEN publicá-lo,
//      e perder isso seria pior do que mostrar uma movimentação a mais.
//   3. Itens de DJEN, e-mail, Projudi etc. entram sempre.
//
// `JANELA_DATAJUD_DIAS` é por data de CAPTURA, não de movimento: o DataJud devolve o histórico inteiro
// do processo na primeira consulta, e o que importa é o que chegou agora, não o que aconteceu em 1996.

import type { Prisma } from "@prisma/client";

export const JANELA_DATAJUD_DIAS = 45;

// Termos (sem acento e com acento) que fazem um andamento do DataJud merecer olhar humano.
export const TERMOS_DE_INTIMACAO_NO_ANDAMENTO = [
  "intima",
  "citaç",
  "citac",
  "notifica",
  "audiência",
  "audiencia",
  "sentença",
  "sentenca",
  "despacho",
  "decisão",
  "decisao",
];

export function publicacoesDaFilaWhere(officeId: string, agora: Date = new Date()): Prisma.PublicationWhereInput {
  const corte = new Date(agora.getTime() - JANELA_DATAJUD_DIAS * 24 * 60 * 60 * 1000);
  return {
    officeId,
    estado: "ATIVA",
    OR: [
      { source: { not: "DATAJUD" } },
      {
        source: "DATAJUD",
        createdAt: { gte: corte },
        OR: TERMOS_DE_INTIMACAO_NO_ANDAMENTO.map((termo) => ({ content: { contains: termo, mode: "insensitive" as const } })),
      },
    ],
  };
}
