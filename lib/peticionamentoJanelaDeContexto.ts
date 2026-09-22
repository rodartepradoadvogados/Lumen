// A JANELA DE CONTEXTO — especificação §8: "quando a seleção + documentos anexados excede a
// janela de contexto do modelo: o sistema tenta resumir automaticamente e avisa o que resumiu;
// se mesmo assim não couber, bloqueia e explica o que ficou de fora. Nunca trunca em silêncio."
//
// ────────────────────────────────────────────────────────────────────────────────────────────
// A UNIDADE É CARACTERE, E ISSO É O CONSERTO DESTA ENTREGA.
//
// Até hoje este módulo media TOKENS e travava em 128.000 — ~512.000 caracteres. Quem recusa de
// verdade é a ponte (`servidor-hermes/servidor.py`), que conta CARACTERES e devolve 400
// ("mensagem ausente ou longa demais") acima de PERGUNTA_MAXIMA. A trava daqui era ~32x mais
// frouxa que o limite real: ela NUNCA disparava, e quem recusava era a ponte — com uma mensagem
// que não diz ao advogado o que fazer. Enquanto só o NOME dos documentos ia ao agente, nunca se
// chegava perto do teto; na entrega que passou a mandar o TEXTO, o defeito apareceu no primeiro
// uso real (dois documentos anexados, 400 cru na tela do dono).
//
// Agora o número é um só, vem em caracteres, e espelha o da ponte — com um teste
// (lib/testes/peticionamentoLimiteDaPonte.teste.ts) que LÊ os dois lados e falha se divergirem.
//
// E A CONTA É DA MENSAGEM INTEIRA, não de um pedaço dela. O que a ponte mede é o retorno de
// `montarMensagemParaHermes` — que inclui instruções fixas, matéria, categoria, tipo de peça,
// contexto vinculado, pedidos, teses, observações, as cercas de documento e os avisos. Por isso
// `avaliarJanela` recebe `custoFixo`: os caracteres do pedido que NÃO são texto de item. O
// orçamento distribuído entre os itens é o que sobra depois dele. Medir só os documentos era
// dizer "coube" e ver a mensagem final estourar assim mesmo.
// ────────────────────────────────────────────────────────────────────────────────────────────
//
// Módulo PURO — nunca chama rede, banco nem IA.
//
// LIMITAÇÃO REGISTRADA (ver relatório da entrega): a "sumarização automática" desta versão é
// determinística — corta o TEXTO dos itens marcados `resumivel` para o começo dele, com aviso
// embutido, nunca reescreve com IA. É honesto (nunca finge ter lido o que cortou) mas é mais
// grosseiro que um resumo real gerado por modelo — a integração com resumo por IA fica para uma
// iteração futura, que teria de rodar DENTRO do próprio Hermes (é ele quem lê os documentos),
// não neste módulo.

export type ItemDeContexto = {
  id: string;
  rotulo: string;
  texto: string;
  /**
   * DOCUMENTO ANEXADO À PEÇA (contestação a que se responde, laudo, contrato) — nunca é cortado
   * automaticamente. Quando o conjunto não cabe, a saída é o advogado escolher qual documento
   * fica de fora, e não este módulo decidir por ele lendo metade de um laudo.
   *
   * Ver "POR QUE DOCUMENTO CONTINUA PROTEGIDO" no comentário de `avaliarJanela`.
   */
  protegido?: boolean;
};

/**
 * O TETO REAL, EM CARACTERES — espelho de `PERGUNTA_MAXIMA` em `servidor-hermes/servidor.py`.
 *
 * ESTE NÚMERO NÃO É NOSSO: é o da ponte, copiado para cá para o Lúmen poder recusar ANTES de
 * mandar. Mudar um lado sem o outro é o jeito mais provável de este defeito voltar — por isso
 * lib/testes/peticionamentoLimiteDaPonte.teste.ts lê `servidor.py` e exige IGUALDADE exata.
 */
export const PERGUNTA_MAXIMA_DA_PONTE = 200_000;

/**
 * Folga entre o nosso teto e o da ponte.
 *
 * Medimos exatamente a mesma string que a ponte vai contar, então em tese a folga poderia ser
 * zero. Ela existe porque "em tese" não é garantia: a mensagem passa por `JSON.stringify`, por
 * `.strip()` do outro lado, e um dia pode ganhar um sufixo em algum ponto entre a montagem e o
 * envio. 5% é barato — são ~5 páginas de texto num teto de ~95 — e transforma um 400 cru numa
 * recusa nossa, falada.
 */
export const FOLGA_ATE_A_PONTE = 10_000;

/** O orçamento do pedido inteiro, em caracteres. É este o número que manda. */
export const LIMITE_PADRAO_CARACTERES = PERGUNTA_MAXIMA_DA_PONTE - FOLGA_ATE_A_PONTE;

/**
 * Piso do resumo, em caracteres (~500 tokens). Um resumo menor que isto deixa de ser resumo e
 * vira supressão — que É truncar em silêncio, se ninguém perceber o tamanho do corte.
 */
export const PISO_DO_RESUMO_CARACTERES = 2_000;

/** Quanto texto cabe numa página de processo, por alto — só para falar com o advogado em página,
 *  que é a unidade que ele enxerga, e não em "tokens", que não quer dizer nada para ele. */
const PAGINA_EM_CARACTERES = 2_000;

/** Estimativa determinística de tokens — NUNCA usada para decidir nada (a decisão é em
 *  caracteres, que é o que a ponte conta); fica exportada porque é a régua com que o resto da
 *  casa conversa sobre tamanho de prompt. */
export function estimarTokens(texto: string): number {
  return Math.ceil(texto.length / 4);
}

// Separador de milhar escrito à mão, e não `.toLocaleString("pt-BR")`: a varredura de
// lib/testes/fuso.teste.ts sinaliza TODO `.toLocaleString(` sem `timeZone` como possível
// data/hora sem fuso (é assim que ela já pegou 26 bugs reais nesta casa) — aqui é sempre número
// puro (contagem de caracteres), mas a heurística da varredura não distingue os dois só pelo
// texto, e o próprio comentário dela pede para o falso positivo ser evitado com uma linha a
// mais, não com uma exceção na lista. Esta função é essa linha a mais.
//
// EXPORTADA porque lib/actions/peticionamento.ts precisa do MESMO formato na última trava (a que
// mede a mensagem pronta) — e escrever `.toLocaleString("pt-BR")` lá acenderia a varredura de
// fuso por nada, pela mesma razão explicada acima.
export function comMilhar(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function emPaginas(caracteres: number): string {
  const p = Math.max(1, Math.round(caracteres / PAGINA_EM_CARACTERES));
  return `~${comMilhar(p)} página${p === 1 ? "" : "s"}`;
}

export type ItemAvaliado = {
  id: string;
  rotulo: string;
  caracteresOriginais: number;
  caracteresFinais: number;
  foiResumido: boolean;
  protegido: boolean;
  /**
   * O TEXTO QUE REALMENTE DEVE SER ENVIADO ao agente — igual ao original quando não houve
   * resumo; cortado (com aviso embutido, para o próprio agente saber que aquele trecho foi
   * condensado) quando houve. Antes deste campo, o corte de tamanho e o texto de fato mandado
   * ao Hermes eram DOIS lugares desencontrados (ver lib/actions/peticionamento.ts).
   */
  textoFinal: string;
};

export type AvaliacaoDeJanela = {
  acao: "ok" | "resumido" | "bloqueado";
  /** Caracteres do pedido que NÃO são texto de item (instruções, cercas, matéria, pedidos…). */
  custoFixo: number;
  /** custoFixo + texto ORIGINAL de todos os itens = a mensagem que sairia sem corte nenhum. */
  caracteresTotaisOriginais: number;
  /** custoFixo + `textoFinal` de todos os itens = a mensagem que de fato vai sair. */
  caracteresTotaisFinais: number;
  limite: number;
  itens: ItemAvaliado[];
  /** Texto pronto para a tela — nunca null quando acao !== "ok" (hard gate: nunca calado). */
  aviso: string | null;
};

export type OpcoesDaJanela = {
  /** Teto do PEDIDO INTEIRO, em caracteres. Padrão: `LIMITE_PADRAO_CARACTERES`. */
  limite?: number;
  /** Caracteres do pedido que não são texto de item — ver `custoFixoDaMensagem` em
   *  lib/peticionamentoPrompt.ts, que mede isso montando a mensagem DE VERDADE com os textos
   *  vazios, em vez de reimplementar a conta (uma segunda conta divergiria em silêncio). */
  custoFixo?: number;
};

// Corta o TEXTO de verdade para o tamanho decidido, com um aviso EMBUTIDO no próprio texto
// enviado ao agente — não só no campo `aviso` da tela: o Hermes precisa saber, dentro do próprio
// pacote que recebe, que aquele trecho foi condensado, para nunca tratar o corte como "isto é
// tudo que existe" e nunca presumir o que ficou de fora.
function textoCortado(texto: string, rotulo: string, alvo: number): string {
  const nota =
    `\n\n[RESUMO AUTOMÁTICO DESTA SESSÃO — "${rotulo}" tinha ${comMilhar(texto.length)} caracteres ` +
    `(${emPaginas(texto.length)}); foi condensado para o começo, ${comMilhar(alvo)} caracteres ` +
    `(${emPaginas(alvo)}), para o pedido caber no limite do agente. ` +
    "O restante NÃO foi enviado ao agente — não presuma nem invente o que não veio.]";
  return `${texto.slice(0, Math.max(0, alvo))}${nota}`;
}

/**
 * Avalia o PEDIDO INTEIRO: `custoFixo` (tudo que não é item) + o texto dos itens.
 *
 * Tenta resumir só os itens NÃO protegidos, do maior para o menor, até caber; itens protegidos
 * nunca são tocados. Se mesmo assim não couber, devolve "bloqueado" com uma recusa ACIONÁVEL:
 * quanto passou, quais itens pesam mais, e QUAIS deixar de fora para caber.
 *
 * ── POR QUE DOCUMENTO CONTINUA PROTEGIDO ──────────────────────────────────────────────────
 * Com o limite corrigido para o valor real, `protegido: true` em todo documento passa a ter
 * consequência de verdade: um conjunto grande cai em "bloqueado" em vez de "resumido". Foi uma
 * escolha, e ela se sustenta em duas razões:
 *
 *  1. o "resumo" deste módulo é o COMEÇO do texto, não um resumo. Numa contestação de 80
 *     páginas, os primeiros 15% costumam ser endereçamento, qualificação e preliminares — a
 *     minuta sairia redigida contra uma peça que o agente não leu, e o advogado receberia um
 *     texto de aparência completa construído sobre um buraco que ele não vê. Uma recusa visível
 *     é pior de usar e melhor de confiar;
 *  2. o advogado é quem sabe qual documento é dispensável nesta peça. Este módulo não sabe. O
 *     que ele pode fazer — e agora faz — é dizer exatamente quanto passou e qual escolha faz
 *     caber, em vez de escolher calado.
 *
 * Por isso a mensagem de bloqueio abaixo é longa de propósito: ela é a única coisa entre o
 * advogado e um beco sem saída.
 */
export function avaliarJanela(itens: ItemDeContexto[], opcoes: OpcoesDaJanela = {}): AvaliacaoDeJanela {
  const limite = opcoes.limite ?? LIMITE_PADRAO_CARACTERES;
  const custoFixo = Math.max(0, opcoes.custoFixo ?? 0);
  const orcamentoParaItens = limite - custoFixo;

  const avaliados: ItemAvaliado[] = itens.map((item) => ({
    id: item.id,
    rotulo: item.rotulo,
    caracteresOriginais: item.texto.length,
    caracteresFinais: item.texto.length,
    foiResumido: false,
    protegido: Boolean(item.protegido),
    textoFinal: item.texto,
  }));

  const textoOriginalPorId = new Map(itens.map((item) => [item.id, item.texto]));
  const somaOriginal = avaliados.reduce((s, i) => s + i.caracteresOriginais, 0);

  if (somaOriginal <= orcamentoParaItens) {
    return {
      acao: "ok",
      custoFixo,
      caracteresTotaisOriginais: custoFixo + somaOriginal,
      caracteresTotaisFinais: custoFixo + somaOriginal,
      limite,
      itens: avaliados,
      aviso: null,
    };
  }

  // Resume os NÃO protegidos, do maior para o menor, cada um para no máx. 15% do próprio tamanho
  // (ou o piso) — até caber, ou até esgotar o que dá para resumir.
  const resumiveis = avaliados.filter((i) => !i.protegido).sort((a, b) => b.caracteresOriginais - a.caracteresOriginais);
  let excedente = somaOriginal - orcamentoParaItens;
  for (const item of resumiveis) {
    if (excedente <= 0) break;
    const alvo = Math.max(PISO_DO_RESUMO_CARACTERES, Math.min(item.caracteresOriginais, Math.round(item.caracteresOriginais * 0.15)));
    if (item.caracteresOriginais - alvo <= 0) continue;
    item.textoFinal = textoCortado(textoOriginalPorId.get(item.id) ?? "", item.rotulo, alvo);
    // O comprimento que conta é o do texto QUE VAI SAIR — inclusive a nota do corte, que também
    // ocupa lugar no pedido. Contar só `alvo` subestimaria a mensagem final de novo, que é
    // exatamente o defeito que esta entrega conserta.
    item.caracteresFinais = item.textoFinal.length;
    item.foiResumido = true;
    excedente -= item.caracteresOriginais - item.caracteresFinais;
  }

  const somaFinal = avaliados.reduce((s, i) => s + i.caracteresFinais, 0);
  const resumidos = avaliados.filter((i) => i.foiResumido);

  if (somaFinal <= orcamentoParaItens) {
    const detalhe = resumidos
      .map((i) => `${i.rotulo} (${comMilhar(i.caracteresOriginais)} → ${comMilhar(i.caracteresFinais)} caracteres, ${emPaginas(i.caracteresOriginais)} → ${emPaginas(i.caracteresFinais)})`)
      .join("; ");
    return {
      acao: "resumido",
      custoFixo,
      caracteresTotaisOriginais: custoFixo + somaOriginal,
      caracteresTotaisFinais: custoFixo + somaFinal,
      limite,
      itens: avaliados,
      aviso: `Resumimos automaticamente, para o pedido caber no limite do agente: ${detalhe}. O corte é sempre o COMEÇO do texto, e vai avisado dentro da própria mensagem enviada ao agente — o original continua guardado aqui para conferência.`,
    };
  }

  return {
    acao: "bloqueado",
    custoFixo,
    caracteresTotaisOriginais: custoFixo + somaOriginal,
    caracteresTotaisFinais: custoFixo + somaFinal,
    limite,
    itens: avaliados,
    aviso: mensagemDeBloqueio(avaliados, custoFixo, somaFinal, limite),
  };
}

/**
 * A RECUSA FALADA — o que o advogado lê quando não cabe.
 *
 * Ela é a única coisa que salva o usuário neste caminho (ver "POR QUE DOCUMENTO CONTINUA
 * PROTEGIDO"), então tem três obrigações, nesta ordem: dizer QUANTO passou (em caracteres e em
 * páginas, para ser um número que se entende), dizer QUEM pesa (os itens maiores, nomeados), e
 * dizer O QUE FAZER — nomeando os documentos que, deixados de fora, fazem caber. Sem a terceira
 * parte a tela é um beco: o advogado vê que não cabe e não sabe o que remover.
 */
function mensagemDeBloqueio(itens: ItemAvaliado[], custoFixo: number, somaFinal: number, limite: number): string {
  const totalFinal = custoFixo + somaFinal;
  const excesso = totalFinal - limite;

  const pesados = [...itens]
    .filter((i) => i.caracteresOriginais > 0)
    .sort((a, b) => b.caracteresFinais - a.caracteresFinais)
    .slice(0, 5)
    .map((i) => `${i.rotulo} (${comMilhar(i.caracteresOriginais)} caracteres, ${emPaginas(i.caracteresOriginais)}${i.protegido ? "" : i.foiResumido ? ", já resumido" : ""})`)
    .join("; ");

  // QUAIS DEIXAR DE FORA para caber: os documentos (protegidos) do maior para o menor, até o
  // pedido caber. É uma resposta concreta, e não "selecione menos documentos".
  const documentos = itens.filter((i) => i.protegido && i.caracteresFinais > 0).sort((a, b) => b.caracteresFinais - a.caracteresFinais);
  const paraRemover: ItemAvaliado[] = [];
  let restante = totalFinal;
  for (const doc of documentos) {
    if (restante <= limite) break;
    paraRemover.push(doc);
    restante -= doc.caracteresFinais;
  }

  const saida =
    restante > limite
      ? "Mesmo deixando TODOS os documentos de fora o pedido ainda não caberia — o texto dos fatos e as instruções da peça, sozinhos, já passam do limite. Encurte os fatos ou divida a peça em sessões separadas."
      : paraRemover.length > 0
        ? `Para caber, bastaria deixar de fora ${paraRemover.length === 1 ? "este documento" : `estes ${paraRemover.length} documentos`}: ${paraRemover.map((d) => d.rotulo).join("; ")}.`
        : "Encurte o texto dos fatos ou divida a peça em sessões separadas.";

  return (
    `O pedido ao agente ficaria com ${comMilhar(totalFinal)} caracteres (${emPaginas(totalFinal)}), ` +
    `${comMilhar(excesso)} a mais que o limite de ${comMilhar(limite)} (${emPaginas(limite)}). ` +
    `Nada foi cortado em silêncio: preferimos recusar a mandar ao agente meia leitura de um documento. ` +
    `Itens mais pesados: ${pesados}. ${saida} ` +
    "Você também pode desmarcar um vínculo (processo, atendimento ou assessoria) ou peticionar em etapas, uma sessão por bloco de provas."
  );
}
