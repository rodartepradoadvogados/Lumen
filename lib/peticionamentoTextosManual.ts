// OS DOIS TEXTOS DE MANUAL da aba de Peticionamento — "Orientações gerais" (espec. §5) e "Como
// usar o módulo" (espec. §6), adequação de 21/09/2026. Conteúdo literal do mockup aprovado pelo
// dono (canvas-peticionamento/project/Orientacoes.dc.html e Como-usar.dc.html).
//
// MÓDULO DE DADOS PURO DE PROPÓSITO: os dois pop-ups (components/peticionamento/OrientacoesModal
// e ComoUsarModal) só RENDERIZAM o que está aqui — nunca escrevem o próprio texto inline no JSX.
// Razão: a especificação proíbe, com dureza, que estes dois textos citem nome de skill, nome do
// agente, nome ou fabricante do modelo de IA, ou o nome "Hermes" — diz-se "inteligência
// artificial" e nada além disso. Concentrar o texto num módulo de dados dá a
// lib/testes/peticionamentoManuaisSemNomes.teste.ts um alvo único e completo para varrer; se o
// texto virasse string solta espalhada em componentes, um refactor distraído poderia reintroduzir
// um nome aqui e um nome ali sem que a varredura tivesse como cobrir os dois de uma vez.

export const ORIENTACOES_GERAIS = {
  categoria: "Orientações gerais",
  titulo: "Como uma peça nasce aqui",
  abertura:
    "Este módulo redige minuta em rascunho, por inteligência artificial, a partir do contexto que você escolher. O que sai daqui é ponto de partida para o seu trabalho — nunca o produto final.",
  oQueFaz:
    "Lê o contexto que você vinculou — processo, atendimento, caso, assessoria — e os documentos que você selecionar ou anexar, e devolve uma peça estruturada na forma da matéria, com os fatos organizados, a fundamentação encadeada e os pedidos numerados. Ao final, aponta os riscos que identificou no próprio texto.",
  oQueNuncaFaz: [
    "Não protocola. Por nenhum caminho, em nenhum tribunal, em nenhuma hipótese. Protocolar é ato humano, sempre.",
    "Não inventa fato. O que não estiver no contexto vira lacuna assinalada, nunca preenchimento plausível.",
    "Não decide a estratégia. Ele aponta caminhos e riscos; a escolha é do advogado que assina.",
    "Não corta contexto em silêncio. Se o material não couber, ele resume e avisa o que resumiu — ou bloqueia e explica.",
    "Não mistura clientes. Uma peça, um cliente. O vínculo trava no primeiro que você escolher.",
  ],
  conduta:
    "Aponta, não decide. Quando algo enfraquece a peça — prazo apertado, documento faltando, tese que depende de prova que ninguém juntou —, ele escreve isso na nota de riscos em vez de contornar o problema com redação bonita. E toda citação de jurisprudência sai marcada para conferência: confira cada uma no tribunal antes de assinar.",
  oQueContinuaSendoSeu:
    "A revisão integral do texto, a conferência de cada citação e de cada número de processo, a decisão sobre o que pedir, e o protocolo. A exportação sai sempre em Word, no timbrado cadastrado do escritório, e só depois que você marcar, por escrito, que está ciente de que revisou.",
  rodape: 'Toda peça fecha com "Termos em que pede deferimento." — sem vírgula depois do "que".',
} as const;

export const COMO_USAR_O_MODULO = {
  categoria: "Como usar",
  titulo: "Do zero à minuta, em seis passos",
  passos: [
    { numero: "01", titulo: "Tipo da peça", descricao: "Petição, contrato, parecer ou notificação" },
    { numero: "02", titulo: "Contexto", descricao: "Matéria e o que vincular" },
    { numero: "03", titulo: "Questionário", descricao: "Fatos, pedidos, urgência" },
    { numero: "04", titulo: "Documentos", descricao: "Do Lúmen ou anexados agora" },
    { numero: "05", titulo: "Confirmação", descricao: "O resumo, antes de gerar" },
    { numero: "06", titulo: "Minuta e Word", descricao: "Editar, revisar, exportar" },
  ],
  oQueVoceForncece:
    "O mínimo é fatos e pedidos. Com isso já dá para gerar. Tudo além disso — processo vinculado, documentos, urgência, teses que você quer ver defendidas — melhora a peça, não destrava nada.",
  trava: [
    "Sem fatos ou sem pedidos, não gera.",
    "Dois clientes na mesma peça, não vincula.",
    "Sem OAB cadastrada, não exporta — nem sócio, nem administrador.",
    "Sem marcar a ciência de revisão, não exporta.",
    "Estagiário redige e edita, mas não exporta.",
  ],
  arriscado: [
    "Contexto grande demais: é resumido, e o aviso diz o que ficou de fora.",
    "Fatos em uma frase só: a peça fica genérica.",
    "Nenhum documento anexado: a fundamentação fica sem lastro.",
    "Matéria fora das cadastradas: a estrutura vira genérica.",
  ],
  ideal:
    "Um cliente, um processo vinculado, fatos em ordem cronológica, pedidos numerados, e os documentos que sustentam cada fato anexados — de preferência em .md, que o agente lê melhor. Nesse cenário a minuta sai pronta para revisão, não para reescrita.",
} as const;
