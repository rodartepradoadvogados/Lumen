import { teste, verdade, resumo } from "./executar";
import { montarPerguntaInterna, comoSeApresenta, NOME_DA_ANTONELLA } from "@/lib/antonella";
import { montarPergunta, LIMITES_DUROS } from "@/lib/agenteAtendimento";
import { COMO_SE_APRESENTA, REGRA_DOS_HONORARIOS, MAXIMO_DE_LINHAS } from "@/lib/atendimentoPadrao";

// ============================================================================
// AS DUAS PERSONALIDADES, E A ORDEM DAS CAMADAS.
//
// Antonella fala com advogado; Ana, com cliente. O que as separa não é tom — é o que cada uma
// tem PROIBIDO fazer, e essas proibições são a única coisa do produto que não pode ser afrouxada
// por um campo de texto que alguém preenche numa tela.
//
// A ordem das camadas é testada porque ela é regra, não estilo: um texto de escritório
// entusiasmado ("prometa que a gente resolve!") não pode concorrer em pé de igualdade com um
// limite duro. Ele vem depois, e há uma frase dizendo quem vence.
// ============================================================================

// ── Antonella ────────────────────────────────────────────────────────────────────────────────

const INTERNA = { nomeDoUsuario: "Jairo", nomeDoEscritorio: "Rodarte Prado Advogados", mensagem: "cabe agravo disso?" };

teste("a Antonella é proibida de opinar, e está escrito", () => {
  const p = montarPerguntaInterna(INTERNA);
  verdade(p.includes("NUNCA DÁ OPINIÃO JURÍDICA"), "a proibição tem que estar em letra maiúscula e explícita");
  verdade(p.includes("mesmo falando com advogado"), "tem que fechar a saída óbvia: 'mas é advogado perguntando'");
});

teste("a Antonella se apresenta como sendo do ESCRITÓRIO, não do Lúmen", () => {
  const frase = comoSeApresenta("Rodarte Prado Advogados");
  verdade(frase.includes("assistente virtual do escritório Rodarte Prado Advogados"), frase);
  const p = montarPerguntaInterna(INTERNA);
  verdade(p.includes(frase), "a frase exata tem que ir no pedido");
  verdade(p.includes("Nunca se apresente como sendo do Lúmen"), "tem que estar dito ao contrário também");
});

teste("a Antonella sabe que lista truncada não prova ausência", () => {
  // A regra que nasceu do "setembro não existe".
  const p = montarPerguntaInterna(INTERNA);
  verdade(p.includes("NUNCA conclua que algo não existe"), "faltou a regra da amostra");
});

teste("a pergunta do usuário entra por último, separada das regras", () => {
  const p = montarPerguntaInterna(INTERNA);
  verdade(p.trimEnd().endsWith("cabe agravo disso?"), "a pergunta tem que ser a última coisa");
  verdade(p.includes(NOME_DA_ANTONELLA), "o nome dela tem que estar lá");
});

// ── Ana: as três camadas ─────────────────────────────────────────────────────────────────────

const BASE = {
  nomeDoAtendente: "Ana",
  nomeDoEscritorio: "Rodarte Prado Advogados",
  instrucoesDoEscritorio: null,
  nomeDoCliente: "Maria",
  historico: [],
  mensagem: "meu plano negou a cirurgia",
};

teste("sem campanha, a Ana recebe o conhecimento geral das áreas", () => {
  const p = montarPergunta(BASE);
  verdade(p.includes("ÁREAS QUE ESTE ESCRITÓRIO PODE AVALIAR"), "faltaram as áreas");
  verdade(p.includes("Previdenciário"), "o padrão cobre todas as áreas, não só as sete do escritório");
  verdade(p.includes("negativa do plano POR ESCRITO"), "faltou o que pedir em direito médico");
});

teste("com campanha, o conhecimento geral SAI de cena", () => {
  // Despejar as doze áreas numa conversa de anúncio convida a Ana a falar do que a campanha não
  // quer — que é exatamente o que o filtro de campanha existe para evitar.
  const p = montarPergunta({ ...BASE, campanha: "Negativa de cobertura de plano de saúde." });
  verdade(p.includes("VEIO DE UM ANÚNCIO"), "tem que dizer que veio de anúncio");
  verdade(p.includes("Negativa de cobertura"), "o texto da campanha tem que entrar");
  verdade(!p.includes("ÁREAS QUE ESTE ESCRITÓRIO PODE AVALIAR"), "as áreas NÃO podem entrar junto");
});

teste("os limites duros vêm antes da campanha E antes do texto do escritório", () => {
  const p = montarPergunta({
    ...BASE,
    campanha: "Negativa de cobertura.",
    instrucoesDoEscritorio: "Somos agressivos e resolvemos tudo.",
  });
  const limites = p.indexOf("O QUE VOCÊ NUNCA FAZ");
  verdade(limites >= 0, "os limites têm que estar lá");
  verdade(limites < p.indexOf("Negativa de cobertura."), "limites antes da campanha");
  verdade(limites < p.indexOf("Somos agressivos"), "limites antes do texto do escritório");
  verdade(p.includes("vale o 'NUNCA'"), "tem que dizer quem vence o conflito");
});

teste("os limites duros entram mesmo com campanha e escritório vazios", () => {
  const p = montarPergunta(BASE);
  for (const l of LIMITES_DUROS) verdade(p.includes(l), `faltou: ${l.slice(0, 40)}…`);
});

// ── Ana: as regras que o dono ditou palavra por palavra ──────────────────────────────────────

teste("a regra dos honorários é REATIVA, e está dito que é", () => {
  const p = montarPergunta(BASE);
  verdade(p.includes(REGRA_DOS_HONORARIOS), "a frase inteira tem que estar lá");
  verdade(p.includes("repita isso quantas vezes perguntarem"), "tem que dizer que repete");
  verdade(
    p.includes("NÃO toque no assunto de valores por conta própria"),
    "tem que proibir falar de dinheiro sem ser perguntada",
  );
  verdade(p.includes("nem ao se apresentar, nem ao encerrar"), "os dois momentos proibidos têm que estar nomeados");
});

teste("a Ana nunca nega ser IA, e não anuncia", () => {
  const p = montarPergunta(BASE);
  verdade(p.includes(COMO_SE_APRESENTA), "a frase exata tem que ir no pedido");
  verdade(p.includes("Nunca negue ser uma inteligência artificial"), "faltou a proibição de negar");
  verdade(p.includes("não anuncie isso sem ser perguntada"), "faltou a proibição de anunciar");
});

teste("o teto de linhas do WhatsApp está no pedido", () => {
  verdade(montarPergunta(BASE).includes(`no máximo ${MAXIMO_DE_LINHAS} linhas`), "faltou o teto de linhas");
});

// ── F5: "já mandei" e o limite da conversa registrada ────────────────────────────────────────

teste("a Ana sabe que só tem o que veio NESTA conversa, e não questiona o cliente", () => {
  const p = montarPergunta(BASE);
  verdade(p.includes("já mandou um documento"), "faltou a instrução do 'já mandei'");
  verdade(p.includes("não questione"), "ela não pode acusar o cliente de estar enganado");
  verdade(p.includes("registro desta conversa começa a partir do cumprimento inicial"), "faltou a explicação do limite");
});

teste("o nome do nosso produto não vaza para o cliente", () => {
  const p = montarPergunta({ ...BASE, campanha: "Negativa de cobertura." });
  verdade(!p.includes("Lúmen"), "a palavra Lúmen não pode aparecer no pedido do atendente");
});

void resumo("personalidades");
