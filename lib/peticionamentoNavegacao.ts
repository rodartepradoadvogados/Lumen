// A ORDEM DAS ETAPAS de uma sessão de peticionamento — usada tanto pelo rail (Shell.tsx, os
// quatro itens sempre visíveis) quanto pelo botão "Voltar" de cada tela (pedido do dono,
// 24/09/2026, item 2: "botão de voltar em todas as páginas do peticionamento […] hoje, o botão de
// voltar só existe no questionário" — lá, o "Voltar" é um passo INTERNO do wizard, não uma volta
// de PÁGINA; nas demais telas não existia nenhum). Um único lugar para as duas coisas: se a ordem
// da sessão mudar um dia, rail e "Voltar" mudam juntos, nunca um sem o outro.
export type EtapaPeticionamento = "tipo" | "contexto" | "wizard" | "documentos" | "confirmar" | "minuta";

/**
 * A ROTA DA ETAPA ANTERIOR — função pura, sem `useRouter`, só para poder ser chamada direto de um
 * teste de mesa (lib/testes/peticionamentoNavegacao.teste.ts) sem precisar montar um componente
 * React. "tipo" é a PRIMEIRA etapa de uma sessão; antes dela só existe a tela de entrada
 * (`/peticionamento`, fora de qualquer sessão, sem `sessaoId`).
 *
 * "excedido" (app/peticionamento/[id]/excedido/page.tsx) não tem etapa própria aqui de propósito:
 * ela é sempre alcançada a partir de "confirmar" (ver ConfirmarClient.tsx), e por isso passa
 * `ativo="confirmar"` para o Shell — o "Voltar" dela cai nesta mesma função, sem precisar de um
 * caso a mais.
 */
export function hrefEtapaAnterior(etapa: EtapaPeticionamento, sessaoId: string): string {
  switch (etapa) {
    case "tipo":
      return "/peticionamento";
    case "contexto":
      return `/peticionamento/${sessaoId}/tipo`;
    case "wizard":
      return `/peticionamento/${sessaoId}/contexto`;
    case "documentos":
      return `/peticionamento/${sessaoId}/wizard`;
    case "confirmar":
      return `/peticionamento/${sessaoId}/documentos`;
    case "minuta":
      return `/peticionamento/${sessaoId}/confirmar`;
  }
}
