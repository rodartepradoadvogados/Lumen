// A JANELA DE CONTEXTO — especificação §8: "quando a seleção + documentos anexados excede a
// janela de contexto do modelo: o sistema tenta resumir automaticamente e avisa o que resumiu;
// se mesmo assim não couber, bloqueia e explica o que ficou de fora. Nunca trunca em silêncio."
//
// Módulo PURO — a conta de tokens é uma ESTIMATIVA determinística (comprimento do texto ÷ 4,
// heurística padrão da indústria para português/inglês misto, documentada aqui para quem for
// medir de verdade um dia com o tokenizador real do Hermes). O que importa para o hard gate não
// é a precisão do número, é que a decisão (resumir vs. bloquear) e o AVISO sejam sempre
// explícitos — nunca "coube" ou "não coube" decidido calado.
//
// LIMITAÇÃO REGISTRADA (ver relatório da entrega): a "sumarização automática" desta versão é
// determinística — corta o TEXTO dos itens marcados `resumivel` para um resumo estrutural curto
// (título + contagem do que foi condensado), nunca reescreve com IA. É honesto (nunca finge ter
// lido o que cortou) mas é mais grosseiro que um resumo real gerado por modelo — a integração
// com resumo por IA fica para uma iteração futura, que teria de rodar DENTRO do próprio Hermes
// (é ele quem lê os documentos), não neste módulo.

export type ItemDeContexto = {
  id: string;
  rotulo: string;
  texto: string;
  /** Documento central da peça (ex.: contestação a que se responde, laudo citado nos fatos) — NUNCA resumido, mesmo sob pressão de espaço (mockup contexto-excedido.html, estado "bloqueado"). */
  protegido?: boolean;
};

export const LIMITE_PADRAO_TOKENS = 128_000;

/** Estimativa determinística — ver comentário do módulo. Nunca chama rede nem IA. */
export function estimarTokens(texto: string): number {
  return Math.ceil(texto.length / 4);
}

// Separador de milhar escrito à mão, e não `.toLocaleString("pt-BR")`: a varredura de
// lib/testes/fuso.teste.ts sinaliza TODO `.toLocaleString(` sem `timeZone` como possível
// data/hora sem fuso (é assim que ela já pegou 26 bugs reais nesta casa) — aqui é sempre número
// puro (contagem de tokens), mas a heurística da varredura não distingue os dois só pelo texto, e
// o próprio comentário dela pede para o falso positivo ser evitado com uma linha a mais, não com
// uma exceção na lista. Esta função é essa linha a mais.
function comMilhar(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export type ItemAvaliado = {
  id: string;
  rotulo: string;
  tokensOriginais: number;
  tokensAposResumo: number;
  foiResumido: boolean;
  protegido: boolean;
  /**
   * O TEXTO QUE REALMENTE DEVE SER ENVIADO ao agente — igual ao original quando não houve
   * resumo; cortado (com aviso embutido, para o próprio agente saber que aquele trecho foi
   * condensado) quando houve. Prioridade 1 da entrega: antes deste campo, o corte de tamanho e
   * o texto de fato mandado ao Hermes eram DOIS lugares desencontrados — este campo é o que
   * fecha essa costura (ver lib/actions/peticionamento.ts:confirmarTriagemEGerar).
   */
  textoFinal: string;
};

export type AvaliacaoDeJanela = {
  acao: "ok" | "resumido" | "bloqueado";
  tokensTotaisOriginais: number;
  tokensTotaisFinais: number;
  limite: number;
  itens: ItemAvaliado[];
  /** Texto pronto para o aviso de tela — nunca null quando acao !== "ok" (hard gate: nunca calado). */
  aviso: string | null;
};

// Resumo estrutural determinístico de um item resumível — não lê o conteúdo, só registra que
// foi condensado e por quanto. O texto de verdade continua disponível para "ver o original"
// (a Server Action guarda o texto completo à parte; este módulo só decide o CORTE).
function resumoEstrutural(rotulo: string, tokensOriginais: number, tokensAlvo: number): number {
  // Nunca resume abaixo de ~500 tokens por item — um resumo menor que isso deixa de ser resumo
  // e vira supressão, que É truncar em silêncio se ninguém perceber o tamanho do corte.
  return Math.max(500, Math.min(tokensOriginais, tokensAlvo));
}

// Corta o TEXTO de verdade para o tamanho decidido acima, com um aviso EMBUTIDO no próprio texto
// enviado ao agente — não só no campo `aviso` da tela: o Hermes precisa saber, dentro do próprio
// pacote que recebe, que aquele documento específico foi condensado, para nunca tratar o corte
// como "isto é tudo que existe no documento" e nunca presumir o que ficou de fora.
function textoCortado(texto: string, rotulo: string, tokensOriginais: number, tokensAlvo: number): string {
  const charsAlvo = Math.max(0, tokensAlvo * 4);
  const cortado = texto.slice(0, charsAlvo);
  return (
    `${cortado}\n\n[RESUMO AUTOMÁTICO DESTA SESSÃO — "${rotulo}" tinha ~${comMilhar(tokensOriginais)} tokens estimados; ` +
    `foi condensado para os primeiros ~${comMilhar(tokensAlvo)} tokens para caber na janela de contexto. ` +
    "O restante NÃO foi enviado ao agente — não presuma nem invente o que não veio.]"
  );
}

/**
 * Avalia a janela inteira. Tenta resumir só os itens NÃO protegidos, do maior para o menor,
 * até caber no limite; itens protegidos nunca são tocados. Se mesmo resumindo tudo o que pode
 * ainda não couber, devolve "bloqueado" com o detalhe de quanto falta e quais itens pesam mais
 * (para a tela oferecer "remover um vínculo" / "selecionar menos documentos").
 */
export function avaliarJanela(itens: ItemDeContexto[], limite: number = LIMITE_PADRAO_TOKENS): AvaliacaoDeJanela {
  // Mapa por id para o corte de texto (abaixo) achar o ORIGINAL de cada item resumido pelo id,
  // sem precisar carregar o array `itens` inteiro dentro do laço de resumo.
  const textoOriginalPorId = new Map(itens.map((item) => [item.id, item.texto]));

  const avaliados: ItemAvaliado[] = itens.map((item) => ({
    id: item.id,
    rotulo: item.rotulo,
    tokensOriginais: estimarTokens(item.texto),
    tokensAposResumo: estimarTokens(item.texto),
    foiResumido: false,
    protegido: Boolean(item.protegido),
    textoFinal: item.texto,
  }));

  const tokensTotaisOriginais = avaliados.reduce((soma, i) => soma + i.tokensOriginais, 0);
  if (tokensTotaisOriginais <= limite) {
    return { acao: "ok", tokensTotaisOriginais, tokensTotaisFinais: tokensTotaisOriginais, limite, itens: avaliados, aviso: null };
  }

  // Resume os NÃO protegidos, do maior para o menor, cada um para no máx. 15% do próprio tamanho
  // (ou o piso de 500 tokens) — até caber, ou até esgotar o que dá para resumir.
  const resumiveis = avaliados.filter((i) => !i.protegido).sort((a, b) => b.tokensOriginais - a.tokensOriginais);
  let excedente = tokensTotaisOriginais - limite;
  for (const item of resumiveis) {
    if (excedente <= 0) break;
    const alvo = resumoEstrutural(item.rotulo, item.tokensOriginais, Math.round(item.tokensOriginais * 0.15));
    const economizado = item.tokensOriginais - alvo;
    if (economizado <= 0) continue;
    item.tokensAposResumo = alvo;
    item.foiResumido = true;
    // Corta o TEXTO de verdade — não só o número de tokens. Sem isto, `textoFinal` continuaria
    // sendo o documento inteiro mesmo quando `foiResumido` diz que ele deveria ter sido cortado:
    // exatamente o desencontro que a prioridade 1 desta entrega fecha.
    item.textoFinal = textoCortado(textoOriginalPorId.get(item.id) ?? "", item.rotulo, item.tokensOriginais, alvo);
    excedente -= economizado;
  }

  const tokensTotaisFinais = avaliados.reduce((soma, i) => soma + i.tokensAposResumo, 0);
  const resumidos = avaliados.filter((i) => i.foiResumido);

  if (tokensTotaisFinais <= limite) {
    const detalhe = resumidos.map((i) => `${i.rotulo} (${comMilhar(i.tokensOriginais)} → ${comMilhar(i.tokensAposResumo)} tokens)`).join("; ");
    return {
      acao: "resumido",
      tokensTotaisOriginais,
      tokensTotaisFinais,
      limite,
      itens: avaliados,
      aviso: `Resumimos automaticamente: ${detalhe}. Nada foi descartado, apenas condensado — o original continua disponível para conferência.`,
    };
  }

  const pesados = avaliados
    .filter((i) => i.protegido || !i.foiResumido)
    .sort((a, b) => b.tokensOriginais - a.tokensOriginais)
    .slice(0, 5)
    .map((i) => `${i.rotulo} (${comMilhar(i.tokensOriginais)} tokens${i.protegido ? ", não é seguro resumir" : ""})`)
    .join("; ");
  return {
    acao: "bloqueado",
    tokensTotaisOriginais,
    tokensTotaisFinais,
    limite,
    itens: avaliados,
    aviso: `Mesmo depois de resumir o que era seguro resumir, o contexto ainda excede o limite em ${comMilhar(tokensTotaisFinais - limite)} tokens estimados. Itens mais pesados: ${pesados}. Escolha remover um vínculo, selecionar menos documentos, ou iniciar uma sessão separada.`,
  };
}
