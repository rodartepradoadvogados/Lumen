// O MÍNIMO PARA GERAR — decisão do dono, posterior à especificação, já registrada nos mockups
// (wizard.html, documentos.html, confirmar-geracao.html): "o mínimo para gerar é fatos +
// pedidos". Os demais campos do questionário (tipo de peça, teses, documentos) são
// ENRIQUECIMENTO — a ausência deles nunca bloqueia o botão "Gerar minuta".
//
// Módulo PURO de propósito (sem @/lib/prisma, sem rede): tanto a Server Action que decide se
// aceita "gerar minuta" quanto qualquer componente de cliente que precise mostrar a barra de
// prontidão ao vivo importam este mesmo arquivo — é a fonte única da regra, sem duplicar em
// JS de servidor e JS de cliente (a mesma armadilha que already mordeu esta casa, ver
// lib/driveNaming.ts).
//
// DECISÃO REGISTRADA em decisions.md §9, item 2: o mínimo trava só a PRESENÇA de texto/seleção,
// nunca a QUALIDADE — um fato de uma palavra já libera o botão. É fiel à frase literal do dono
// ("se houver o mínimo"); quem cobre o que a presença sozinha não cobre é a nota de riscos
// (ver lib/peticionamentoNotaObrigatoria.ts), nunca este módulo.

export type CamposMinimos = {
  fatos: string | null | undefined;
  /** Pedidos marcados/digitados — itens vazios ("", "   ") não contam como pedido real. */
  pedidos: (string | null | undefined)[] | null | undefined;
};

export type ResultadoProntidao = {
  pronto: boolean;
  /** Nomes dos campos que faltam, na ordem "fatos" depois "pedidos" — nunca vazio quando !pronto. */
  faltando: ("fatos" | "pedidos")[];
};

function temFatos(fatos: string | null | undefined): boolean {
  return typeof fatos === "string" && fatos.trim().length > 0;
}

function temPedidos(pedidos: (string | null | undefined)[] | null | undefined): boolean {
  if (!Array.isArray(pedidos)) return false;
  return pedidos.some((p) => typeof p === "string" && p.trim().length > 0);
}

/**
 * A ÚNICA função que decide se uma sessão já pode gerar minuta. Nunca inline esta conta em
 * outro lugar (Server Action, página, teste) — se a regra mudar um dia, muda aqui, uma vez.
 */
export function avaliarProntidao(campos: CamposMinimos): ResultadoProntidao {
  const okFatos = temFatos(campos.fatos);
  const okPedidos = temPedidos(campos.pedidos);
  const faltando: ("fatos" | "pedidos")[] = [];
  if (!okFatos) faltando.push("fatos");
  if (!okPedidos) faltando.push("pedidos");
  return { pronto: okFatos && okPedidos, faltando };
}

/** Frase pronta para a barra de prontidão ("Falta: fatos e pedidos.") — sem alarme, como o mockup pede. */
export function fraseDoQueFalta(faltando: ("fatos" | "pedidos")[]): string {
  if (faltando.length === 0) return "";
  return `Falta preencher o mínimo desta sessão: ${faltando.join(" e ")}.`;
}
