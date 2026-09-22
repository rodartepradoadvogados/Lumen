// O QUESTIONÁRIO MUDA por tipo de peça — decisão do dono (22/09/2026): "hoje o questionário é
// igual para todos os tipos" deixa de valer. Cinco caminhos: Petição, Contrato, Parecer,
// Notificação Extrajudicial e Geral (lib/peticionamentoCategoriaPeca.ts).
//
// O schema do banco (PeticionamentoSessao) NÃO ganhou campo novo para isto — "fatos", "pedidos",
// "prazoFatal", "valorCausa", "descumprimentoLiminar", "teses" e "observacoes" continuam sendo os
// únicos campos livres/de enriquecimento que existem (ver prisma/schema.prisma). O que muda por
// categoria é o RÓTULO e o SENTIDO de cada campo, nunca o campo em si:
//   - um contrato não tem "pedidos" no sentido processual, mas "cláusulas essenciais/objeto" cabe
//     perfeitamente no mesmo campo (uma lista de strings) com outro rótulo;
//   - um parecer não tem "fatos que mudaram nos autos", tem "a pergunta a responder" — que é, de
//     novo, a mesma forma (texto livre) com outro propósito;
//   - uma notificação extrajudicial precisa do que se exige (pedidos, relabelado) e em que prazo
//     (prazoFatal, relabelado) — os dois já existiam.
// Módulo PURO: só strings e booleanos, nenhum acesso a Prisma/React. Quem usa isto é o
// WizardClient (tela) e lib/peticionamentoPrompt.ts (o texto que vai para o Hermes).

import type { CategoriaDePeca } from "@/lib/peticionamentoCategoriaPeca";

export type ConfiguracaoQuestionario = {
  tituloFatos: string;
  subFatos: string;
  placeholderFatos: string;

  tituloPedidos: string;
  subPedidos: string;
  labelPedidos: string;
  pedidosSugeridos: string[];
  placeholderOutroPedido: string;

  mostrarPrazoValor: boolean;
  rotuloPrazo: string;
  rotuloValor: string;
  mostrarDescumprimento: boolean;
  rotuloDescumprimento: string;
  opcoesDescumprimento: string[];

  mostrarTeses: boolean;
  tituloTeses: string;
  subTeses: string;
  labelTeses: string;
  tesesSugeridas: string[];
  placeholderObservacoes: string;

  /**
   * SÓ "Geral" liga isto — um passo A MAIS no questionário (não um a menos), porque é a categoria
   * em que o agente tem MENOS pista para trabalhar. Palavras do dono: "o geral deve ter mais
   * orientações para o agente identificar melhor".
   */
  temPassoDePistas: boolean;
  tituloPistas: string;
  subPistas: string;
  pistasSugeridas: string[];
};

const PADRAO_PETICAO: ConfiguracaoQuestionario = {
  tituloFatos: "O que mudou nos autos desde a última manifestação?",
  subFatos: "Vira o ponto de partida da minuta — quanto mais específico, menos revisão depois. Este campo é o mínimo de fatos que o agente precisa para escrever.",
  placeholderFatos: "Descreva os fatos relevantes para esta peça…",
  tituloPedidos: "Pedido e urgência",
  subPedidos: 'O campo mínimo desta etapa é "pedidos" — prazo, valor e descumprimento são enriquecimento.',
  labelPedidos: "Pedidos que a peça deve reiterar/formular",
  pedidosSugeridos: ["Manutenção da tutela deferida", "Multa por descumprimento", "Inversão do ônus da prova (CDC)", "Condenação em honorários"],
  placeholderOutroPedido: "Outro pedido — digite e pressione Enter",
  mostrarPrazoValor: true,
  rotuloPrazo: "Prazo fatal nestes autos",
  rotuloValor: "Valor atualizado da causa",
  mostrarDescumprimento: true,
  rotuloDescumprimento: "Há descumprimento pelo réu?",
  opcoesDescumprimento: ["Sim, parcial", "Sim, total", "Não"],
  mostrarTeses: true,
  tituloTeses: "Teses e observações",
  subTeses: "Marque o que já pesquisou. O agente ainda cita a fonte de cada precedente e avisa sobre validação cruzada.",
  labelTeses: "Teses a considerar",
  tesesSugeridas: ["Rol da ANS é exemplificativo (Tema 990/1069 STJ)", "Urgência/emergência (Lei 9.656/98, art. 12)", "Abusividade de cláusula (CDC, art. 51)"],
  placeholderObservacoes: "Algo mais que o agente precisa saber?",
  temPassoDePistas: false,
  tituloPistas: "",
  subPistas: "",
  pistasSugeridas: [],
};

const PADRAO_CONTRATO: ConfiguracaoQuestionario = {
  ...PADRAO_PETICAO,
  tituloFatos: "Quem são as partes e qual é a relação entre elas?",
  subFatos: "Identifique as partes (nomes/qualificação) e descreva a situação que o contrato precisa regular — é o ponto de partida da minuta.",
  placeholderFatos: "Ex.: Contratante XYZ Ltda. e Contratado João da Silva; prestação de serviços de consultoria por 12 meses…",
  tituloPedidos: "Objeto e cláusulas essenciais",
  subPedidos: 'O campo mínimo desta etapa é o "objeto" — prazo de vigência, valor e as demais cláusulas são enriquecimento.',
  labelPedidos: "Objeto e cláusulas que o contrato precisa ter",
  pedidosSugeridos: ["Objeto e escopo do serviço/produto", "Forma e prazo de pagamento", "Cláusula de rescisão", "Cláusula de confidencialidade", "Multa por descumprimento"],
  placeholderOutroPedido: "Outra cláusula — digite e pressione Enter",
  rotuloPrazo: "Prazo de vigência/assinatura",
  rotuloValor: "Valor do contrato",
  mostrarDescumprimento: false,
  mostrarTeses: false,
};

const PADRAO_PARECER: ConfiguracaoQuestionario = {
  ...PADRAO_PETICAO,
  tituloFatos: "Qual é a situação a analisar?",
  subFatos: "O contexto fático sobre o qual o parecer vai se debruçar — é o ponto de partida da minuta.",
  placeholderFatos: "Descreva a situação e o que já se sabe sobre ela…",
  tituloPedidos: "Pergunta a responder",
  subPedidos: 'O campo mínimo desta etapa é a "pergunta a responder" — é o que um parecer sem endereçamento a juízo precisa ter, no lugar de um pedido processual.',
  labelPedidos: "Pergunta(s) que o parecer precisa responder",
  pedidosSugeridos: ["É juridicamente viável...?", "Quais os riscos de...?", "Qual a melhor estratégia para...?"],
  placeholderOutroPedido: "Outra pergunta — digite e pressione Enter",
  mostrarPrazoValor: true,
  rotuloPrazo: "Prazo para entregar o parecer",
  rotuloValor: "Valor envolvido na questão (se houver)",
  mostrarDescumprimento: false,
  mostrarTeses: true,
  tituloTeses: "Teses e observações",
  subTeses: "Marque as teses/entendimentos já considerados. O agente ainda cita a fonte de cada precedente e avisa sobre validação cruzada.",
};

const PADRAO_NOTIFICACAO: ConfiguracaoQuestionario = {
  ...PADRAO_PETICAO,
  tituloFatos: "O que motivou esta notificação?",
  subFatos: "O fato ou descumprimento que justifica notificar/interpelar a outra parte — é o ponto de partida da minuta.",
  placeholderFatos: "Descreva o que aconteceu e por que a outra parte precisa ser notificada…",
  tituloPedidos: "O que se exige do notificado",
  subPedidos: 'O campo mínimo desta etapa é "o que se exige" — prazo e consequência do não atendimento são enriquecimento.',
  labelPedidos: "O que a notificação exige que o notificado faça",
  pedidosSugeridos: ["Pagamento do valor em aberto", "Cessação da conduta", "Reparação do dano", "Cumprimento da obrigação contratual"],
  placeholderOutroPedido: "Outra exigência — digite e pressione Enter",
  rotuloPrazo: "Prazo para o notificado cumprir",
  rotuloValor: "Valor envolvido (se houver)",
  mostrarDescumprimento: true,
  rotuloDescumprimento: "Já houve alguma resposta/tentativa de solução?",
  opcoesDescumprimento: ["Sim, parcial", "Sim, recusada", "Não houve resposta"],
  mostrarTeses: false,
};

// "GERAL" — o caso PRINCIPAL, não sobra (palavras do dono). Ganha um passo A MAIS de perguntas
// (temPassoDePistas), porque o agente tem menos pista do que nas outras quatro categorias.
const PADRAO_GERAL: ConfiguracaoQuestionario = {
  ...PADRAO_PETICAO,
  tituloFatos: "Descreva a situação e o que você precisa",
  subFatos: "Você ainda não escolheu o tipo do documento — está tudo bem, é para isso que serve esta categoria. Quanto mais detalhe aqui, melhor o agente consegue identificar sozinho do que se trata.",
  placeholderFatos: "Descreva com o máximo de detalhe: o que aconteceu, para quem isto se destina, se existe processo em andamento, se há prazo…",
  tituloPedidos: "O que você quer alcançar com este documento",
  subPedidos: 'O campo mínimo desta etapa é "o que você quer alcançar" — quanto mais claro o objetivo, mais fácil para o agente escolher a estrutura certa.',
  labelPedidos: "O que este documento precisa conseguir",
  pedidosSugeridos: ["Formalizar um acordo", "Cobrar ou exigir algo de alguém", "Responder a uma pergunta/dúvida jurídica", "Manifestar-se em um processo"],
  placeholderOutroPedido: "Outro objetivo — digite e pressione Enter",
  mostrarDescumprimento: false,
  // O passo de "teses" comum às outras categorias NÃO aparece aqui sozinho — em Geral ele é
  // SUBSTITUÍDO pelo passo dedicado de pistas (temPassoDePistas), que pergunta a mesma coisa com
  // o enquadramento certo ("ajude o agente a identificar o tipo", não "teses jurídicas").
  // Mostrar os dois seria perguntar a mesma coisa duas vezes.
  mostrarTeses: false,
  placeholderObservacoes: "Para quem este documento se destina, se há prazo, se é algo formal ou uma orientação interna — qualquer pista ajuda o agente a acertar o tipo.",
  temPassoDePistas: true,
  tituloPistas: "Mais uma coisa: ajude o agente a acertar o tipo",
  subPistas: "Este documento ainda não tem tipo definido. Quanto mais pistas, menor a chance de sair uma peça do tipo errado — o agente vai dizer, na minuta, que tipo concluiu que é.",
  pistasSugeridas: [
    "Vai a um juiz/tribunal (existe processo)",
    "Vai para a outra parte, fora de qualquer processo",
    "É uma análise interna para orientar uma decisão",
    "Regula um acordo/relação entre partes",
    "Ainda não sei — descrevi tudo nos fatos acima",
  ],
};

const CONFIGURACOES: Record<CategoriaDePeca, ConfiguracaoQuestionario> = {
  Petição: PADRAO_PETICAO,
  Contrato: PADRAO_CONTRATO,
  Parecer: PADRAO_PARECER,
  "Notificação Extrajudicial": PADRAO_NOTIFICACAO,
  Geral: PADRAO_GERAL,
};

/** Sem categoria escolhida ainda (não deveria acontecer — a categoria é a primeira pergunta da sessão), cai no padrão de Petição. */
export function obterConfiguracaoQuestionario(categoriaPeca: string | null | undefined): ConfiguracaoQuestionario {
  if (categoriaPeca && categoriaPeca in CONFIGURACOES) return CONFIGURACOES[categoriaPeca as CategoriaDePeca];
  return PADRAO_PETICAO;
}
