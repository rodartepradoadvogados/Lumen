// ============================================================================================
// QUANTO TEMPO A GERAÇÃO LEVA — MEDIDO, NUNCA ESTIMADO.
//
// O PEDIDO DO DONO, textual: "um pop up dizendo algo como: não é necessário esperar a minuta ficar
// pronta. O tempo médio de produção é de x a 15 minutos."
//
// O "x" NÃO PODE SER INVENTADO, e é por isso que este módulo existe. Ninguém nunca mediu quanto
// uma geração leva nesta casa: escrever "de 4 a 15 minutos" na tela seria escolher um número
// bonito e apresentá-lo ao advogado como fato. É o MESMO defeito que a tela de geração já recusa
// quando não mostra porcentagem (components/peticionamento/GerandoClient.tsx) — e ali a recusa
// custou uma barra de progresso; aqui custa uma frase a menos até haver dado.
//
// ENTÃO O SISTEMA MEDE. Cada geração concluída grava quanto levou
// (PeticionamentoSessao.geracaoDuracaoMs, escrito na mesma reivindicação atômica que grava a
// minuta). Com medições suficientes, a tela mostra a faixa REAL DESTE escritório; enquanto não
// houver, ela fala só do teto ("pode levar até 15 minutos") e NÃO inventa piso nenhum.
//
// ── O CRITÉRIO ESTATÍSTICO, E POR QUE ESTE E NÃO OUTRO ─────────────────────────────────────
//
// O PISO É A MEDIANA das últimas gerações bem-sucedidas do escritório. Três razões, em ordem de
// peso:
//
//   1. A MÉDIA MENTE COM POUCO DADO, e aqui o dado é pouco por natureza — um escritório gera
//      algumas peças por semana, não mil por hora. Uma única geração de catorze minutos (o
//      processo de dezenas de páginas que o dono quer que o agente leia inteiro) puxa a média de
//      cinco medições para cima e passa a descrever um caso que não é o típico. A mediana não se
//      move com o extremo: ela responde "metade ficou pronta em até tanto", que é exatamente a
//      pergunta que o advogado faz ao olhar a tela.
//   2. A MEDIANA É UM VALOR OBSERVADO (ou a média de dois observados), não um número sintetizado a
//      partir de todos. Isso importa para a frase poder dizer "medido" sem ressalva.
//   3. NÃO PRECISA DE HIPÓTESE NENHUMA sobre a forma da distribuição — e a distribuição de tempo
//      de geração é visivelmente torta à direita (há um teto duro de 15 min e um piso natural de
//      alguns segundos), o caso em que média e mediana mais divergem.
//
// O TETO NÃO É MEDIDO, E ISSO ESTÁ DITO NA FRASE. Ele é o teto do sistema (TETO_DA_GERACAO_MS, o
// espelho de HERMES_TIMEOUT_S), não um percentil alto das medições: apresentar um p90 medido como
// "teto" prometeria algo que o sistema não garante, e o sistema JÁ garante 15 minutos porque é
// nesse ponto que a ponte encerra o processo.
//
// POR QUE UM MÍNIMO DE MEDIÇÕES. Com uma ou duas gerações medidas, "a mediana do escritório" é o
// tempo de uma peça qualquer usado como se fosse regra. Cinco é o menor número em que a mediana
// já não é um caso isolado, e ainda é alcançável na primeira semana de uso.
//
// MÓDULO PURO, E A PUREZA AQUI É REQUISITO DE BUILD. A tela de geração é componente de CLIENTE e
// monta a frase com estas funções: tudo o que ela importa entra no pacote do navegador. Um único
// `import { prisma }` neste arquivo arrasta `next/headers` para dentro desse pacote e o build
// QUEBRA — foi exatamente o que o build contra o staging apontou na primeira versão desta entrega,
// e é uma quebra útil: ela diz que a fronteira cliente/servidor foi atravessada sem se querer.
//
// Por isso as duas coisas de SERVIDOR moram em lib/peticionamentoGeracaoAssincrona.ts:
//
//   · `duracaoDaGeracaoMs` — o relógio de UMA geração, ao lado do prazo máximo que ele usa como
//     régua de sanidade e do `updateMany` que grava a medição;
//   · `faixaDeGeracaoDoEscritorio` — a leitura do banco, que precisa de `prisma`.
//
// A dependência é de MÃO ÚNICA (aquele módulo lê este; este não lê ninguém): dois módulos que se
// importam um ao outro passam a depender da ordem de carregamento, e isso quebra em silêncio.
//
// E o que sobra aqui é EXERCITADO de verdade em lib/testes/peticionamentoAvisoDeGeracao.teste.ts —
// chamado com entradas escolhidas, não varrido: varredura prova que o código existe, nunca que
// funciona.
// ============================================================================================

/**
 * O TETO DO TRABALHO — quanto uma geração pode legitimamente levar.
 *
 * QUINZE MINUTOS, pedido do dono ("tem muita coisa que é complexa"). É o ESPELHO de
 * `HERMES_TIMEOUT_S` (`ESPERA_S`) em servidor-hermes/servidor.py, que é onde o teto é de fato
 * imposto: lá um `subprocess` encerra o Hermes ao fim dele.
 *
 * ESPELHO, e não a fonte: a ponte roda noutra máquina, com as próprias variáveis de ambiente, e o
 * Lúmen não tem como perguntar a ela quanto é o teto. O mesmo arranjo de `PERGUNTA_MAXIMA` ↔
 * `PERGUNTA_MAXIMA_DA_PONTE` (lib/peticionamentoJanelaDeContexto.ts), e com a mesma trava: as
 * suítes LEEM o servidor.py e falham se os dois números divergirem — mudar um lado só foi
 * exatamente como um defeito chegou à produção.
 *
 * É O ÚNICO NÚMERO QUE A TELA PROMETE ("pode levar até 15 minutos"). Por isso é constante, e não um
 * "15" escrito no meio de um parágrafo de JSX: promessa de tela que não acompanha o relógio do
 * servidor é mentira com data marcada.
 *
 * MORA NESTE MÓDULO, e o motivo é o BUILD, não a arrumação. A tela de geração é componente de
 * CLIENTE: tudo o que ela importa vai para o pacote do navegador. Este arquivo é puro de propósito
 * — sem `prisma`, sem `next/headers`, sem nada de servidor —, e foi o build contra o staging que
 * cobrou isso: com o teto vindo de lib/peticionamentoGeracaoAssincrona.ts (que importa `prisma`), o
 * webpack seguiu a corrente até `next/headers` e o pacote do cliente não compilou.
 */
export const TETO_DA_GERACAO_MS = 15 * 60_000;

/**
 * O MESMO TETO, EM SEGUNDOS — a unidade em que a ponte o escreve (`ESPERA_S` /
 * `HERMES_TIMEOUT_S`, em `servidor-hermes/servidor.py`).
 *
 * DERIVADO, e não um segundo literal, e isto é o ponto. Quem precisa do teto em segundos é a
 * validade da credencial de ferramentas do peticionamento (lib/agenteCredencial.ts), que tem de
 * valer MAIS do que o trabalho inteiro. Ela nasceu com um `900` escrito à mão noutro módulo — e
 * um segundo literal do mesmo número é exatamente a forma do defeito que esta entrega veio
 * consertar: dois lugares dizendo a mesma coisa até o dia em que um muda e o outro não.
 *
 * Aqui não há esse risco. `TETO_DA_GERACAO_MS` já é travado contra o `servidor.py` pelas suítes
 * (ver o comentário acima); esta linha só troca a unidade, então a trava vale para as duas.
 *
 * E MORA NESTE MÓDULO pelo mesmo motivo que o de cima: ele é puro — sem `prisma`, sem
 * `next/headers` —, e é o único lugar de onde a credencial pode importar o teto sem arrastar o
 * módulo da ponte atrás de si.
 */
export const TETO_DA_PONTE_S = TETO_DA_GERACAO_MS / 1000;


/**
 * Quantas medições são necessárias antes de a tela dizer um piso.
 *
 * Abaixo disto a frase fala só do teto. Não é conservadorismo decorativo: com duas medições, o
 * "tempo típico do escritório" seria o tempo de uma peça qualquer promovido a regra.
 */
export const MINIMO_DE_MEDICOES = 5;

/** Quantas gerações recentes entram na conta — as mais novas, que é o que descreve a máquina de hoje. */
export const MEDICOES_CONSIDERADAS = 20;

/** A mediana de uma lista NÃO vazia, em milissegundos. Par: a média dos dois do meio. */
export function medianaMs(valores: number[]): number {
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  if (ordenados.length % 2 === 1) return ordenados[meio];
  return Math.round((ordenados[meio - 1] + ordenados[meio]) / 2);
}

export type FaixaDeGeracao = {
  /** Quantas medições válidas entraram na conta. Zero significa "o escritório ainda não tem dado". */
  medicoes: number;
  /** A mediana medida, em minutos inteiros — ou `null` quando não há piso a dizer. */
  pisoMin: number | null;
  /** O teto do sistema, em minutos inteiros. Nunca é medido, e a frase diz isso. */
  tetoMin: number;
};

/**
 * A faixa que a tela mostra, a partir das durações medidas.
 *
 * AS TRÊS REGRAS QUE ELA NUNCA QUEBRA, e cada uma existe porque a alternativa seria um número
 * inventado na tela do advogado:
 *
 *   · menos de `MINIMO_DE_MEDICOES` medições válidas → `pisoMin` é `null`. A tela fala só do teto;
 *   · o piso é a MEDIANA das medições, arredondada para o minuto mais próximo, com piso de 1 min
 *     (uma geração de 40 segundos existe, e "0 min" não é informação para ninguém);
 *   · piso que alcance o teto NÃO é faixa — vira `null`. Uma tela dizendo "de 15 a 15 minutos"
 *     estaria certa e seria inútil; e se a mediana do escritório de fato bater no teto, quem
 *     precisa saber disso é quem cuida do servidor, não o advogado no meio de uma peça.
 */
export function faixaDeGeracao(duracoes: (number | null | undefined)[], tetoMs: number = TETO_DA_GERACAO_MS): FaixaDeGeracao {
  const tetoMin = Math.max(1, Math.round(tetoMs / 60_000));
  const validas = duracoes.filter((d): d is number => typeof d === "number" && Number.isFinite(d) && d > 0);
  if (validas.length < MINIMO_DE_MEDICOES) return { medicoes: validas.length, pisoMin: null, tetoMin };
  const pisoMin = Math.max(1, Math.round(medianaMs(validas) / 60_000));
  if (pisoMin >= tetoMin) return { medicoes: validas.length, pisoMin: null, tetoMin };
  return { medicoes: validas.length, pisoMin, tetoMin };
}

/**
 * A FRASE DA TELA — e ela é a razão de este módulo ser puro.
 *
 * DOIS TEXTOS, e a diferença entre eles é a diferença entre medir e chutar:
 *
 *   · COM medição: diz o número, diz QUANTAS gerações o produziram e diz que é mediana. O advogado
 *     que quiser desconfiar do número tem como: ele sabe de onde ele saiu;
 *   · SEM medição: fala do teto e ADMITE que ainda não há dado. Não inventa piso, não diz "costuma
 *     levar poucos minutos", não arredonda um chute para parecer medida.
 *
 * O TETO VEM DA FAIXA, que o tira de `TETO_DA_GERACAO_MS` — nunca um "15" escrito aqui dentro. Foi
 * exatamente um número escrito à mão ao lado de outro que originou a entrega anterior.
 */
export function fraseDoTempoDeGeracao(faixa: FaixaDeGeracao): string {
  if (faixa.pisoMin === null) {
    return (
      `Uma geração pode levar até ${faixa.tetoMin} minutos. Este escritório ainda não tem gerações medidas ` +
      "o suficiente para dizer o tempo típico — quando tiver, esta frase passa a mostrar o número medido."
    );
  }
  return (
    `Medido neste escritório: nas últimas ${faixa.medicoes} gerações, metade ficou pronta em até ` +
    `${faixa.pisoMin} min. O teto é ${faixa.tetoMin} minutos.`
  );
}
