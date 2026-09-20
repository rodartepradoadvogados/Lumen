// ============================================================================
// O ORÇAMENTO DE TEMPO DE UM ITEM DE TRANSCRIÇÃO.
//
// ACHADO NA PRIMEIRA REVISÃO (antes de mergear a F6, transcrição de áudio): a conta simplesmente
// não fechava DENTRO DO WEBHOOK. `app/api/whatsapp/route.ts` e `.../evolution/route.ts` têm
// `maxDuration = 120`; o Hermes (lib/hermesPonte.ts) esperava até 105s sozinho; a transcrição
// (lib/transcricao.ts) esperava até mais 60s — 165s de espera POSSÍVEL, em série, dentro de uma
// função que a plataforma mata aos 120s. No pior caso a função era morta ANTES de o Hermes
// responder — o cliente ficava SEM RESPOSTA NENHUMA, pior que o problema que esta entrega resolve.
//
// A DECISÃO DO DONO, DEPOIS DISSO: a transcrição não tenta mais caber no webhook — ela sai de lá
// por completo (ver lib/transcricaoAssincrona.ts). O webhook manda uma confirmação FIXA (não passa
// pelo Hermes) e dispara o processamento de verdade numa rota PRÓPRIA
// (app/api/transcricao/processar/route.ts), com o SEU PRÓPRIO orçamento de 120s — que é o que este
// arquivo mede agora: baixar o áudio do Drive + transcrever + o Hermes compor a resposta de
// verdade, tudo dentro do teto DAQUELA rota (não mais do webhook original).
//
// O CONSERTO CONTINUA SENDO O MESMO PRINCÍPIO: não é "escolher números que por acaso somam certo"
// — é ter UM relógio só (o da rota que faz o trabalho), e o Hermes recebe o que sobrar dele, nunca
// mais que isso. `orcamentoParaHermes` calcula essa sobra a partir do tempo JÁ GASTO
// (`decorridoMs`), e por construção `decorridoMs + orcamentoParaHermes(decorridoMs) <=
// PRESUPOSTO_TOTAL_DO_PEDIDO_MS - MARGEM_DE_SEGURANCA_MS` sempre — não importa quanto a
// transcrição demore.
//
// Nenhum import de `@/lib/prisma` nem de rede aqui: é aritmética pura, cabe inteira num teste de
// mesa, e é isso que evita a regressão que a revisão pegou (subir um ESPERA_MS sem olhar pro
// resto tinha passado verde antes desta conta existir).
// ============================================================================

/**
 * Espelha `maxDuration` de `app/api/transcricao/processar/route.ts` — a rota que baixa do Drive,
 * transcreve e deixa o Hermes compor a resposta de verdade, fora do webhook original. NÃO DÁ PRA
 * IMPORTAR esta constante lá: o Next.js exige um número literal exportado como `maxDuration` (é
 * lido estaticamente, sem executar código) — por isso ela é espelhada aqui, e
 * `lib/testes/orcamentoDoPedido.teste.ts` lê o literal da rota por regex e confere que os dois
 * valores continuam iguais.
 */
export const PRESUPOSTO_TOTAL_DO_PEDIDO_MS = 120_000;

/**
 * Fatia reservada para o que este orçamento não mede pela rede: gravar linhas no banco,
 * `revalidatePath`, montar a resposta HTTP, e a folga do próprio relógio (o `Date.now()` do
 * início da rota não é exatamente o instante em que a Vercel começa a contar `maxDuration`).
 */
export const MARGEM_DE_SEGURANCA_MS = 10_000;

/**
 * A fatia MÁXIMA que a chamada ao serviço de transcrição pode consumir. `lib/transcricao.ts`
 * IMPORTA este mesmo número como timeout da chamada de rede — não é um valor solto de novo: subir
 * um sem subir o outro é impossível por construção (mesma constante, um import só).
 */
export const ORCAMENTO_TRANSCRICAO_MS = 20_000;

/**
 * O menor orçamento que ainda vale a pena repassar ao Hermes — não é uma trava que IMPEDE a
 * chamada (`esperaParaHermes` devolve o que sobrar, mesmo que seja pouco, e `perguntarAoHermes`
 * tenta com qualquer valor ≥ 0), é o número que o teste de aritmética usa para provar que o
 * desenho deixa uma fatia mínima decente pro Hermes mesmo no PIOR caso da transcrição.
 */
export const ORCAMENTO_MINIMO_PARA_HERMES_MS = 20_000;

/**
 * Quanto tempo sobra pro Hermes depois de `decorridoMs` já gastos desde o início do pedido
 * (criar a mensagem, baixar a mídia, subir pro Drive, transcrever o áudio). Nunca negativo — sem
 * orçamento nenhum sobrando, o Hermes recebe zero (e `perguntarAoHermes` falha rápido com
 * "DEMORA", em vez de a função inteira ser morta pela plataforma no meio da chamada).
 */
export function orcamentoParaHermes(decorridoMs: number): number {
  return Math.max(0, PRESUPOSTO_TOTAL_DO_PEDIDO_MS - MARGEM_DE_SEGURANCA_MS - decorridoMs);
}

/**
 * O tempo de espera de verdade a passar pro Hermes: o que sobrou do orçamento DO PEDIDO, mas
 * nunca mais que o padrão de hoje (`esperaPadraoMs`, de `lib/hermesPonte.ts`) — esse padrão já
 * existe pra deixar folga contra o timeout do PRÓPRIO servidor-ponte (110s — ver o comentário em
 * hermesPonte.ts), uma restrição diferente e independente desta.
 *
 * `undefined` quando não há orçamento de pedido a repassar — o botão manual "Responder à última
 * pergunta" (lib/actions/attendance.ts) não corre contra o relógio de um webhook, e `undefined`
 * faz `perguntarAoHermes` usar o padrão de sempre, sem mudança de comportamento pra ele.
 */
export function esperaParaHermes(orcamentoRestanteMs: number | undefined, esperaPadraoMs: number): number | undefined {
  if (orcamentoRestanteMs === undefined) return undefined;
  return Math.min(Math.max(orcamentoRestanteMs, 0), esperaPadraoMs);
}
