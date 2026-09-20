import { readFileSync } from "node:fs";
import { teste, verdade, resumo } from "./executar";
import { montarPergunta, LIMITE_DA_PERGUNTA } from "@/lib/agenteAtendimento";
import { textoDosParametros } from "@/lib/parametrosDaAna";

// ============================================================================
// O PEDIDO AO HERMES TEM DE CABER — e este arquivo existe por causa de uma queda de verdade.
//
// O servidor do Hermes recusa com HTTP 400 qualquer pergunta acima de 8000 caracteres. O pedido
// montado pelo Lúmen tinha 7587 e os parâmetros de recusa acrescentaram 556 em TODA conversa. Em
// produção, a Ana parou de responder no WhatsApp: sem erro de tela, sem página caída, sem alerta —
// o webhook recebia a mensagem, gravava tudo, e a resposta não saía. Descobriu-se pelo log.
//
// O teto não é uma opinião nossa: ele está escrito em servidor-hermes/servidor.py, e o primeiro
// caso abaixo LÊ esse arquivo. Se alguém mudar o limite de um lado só, este teste acusa.
// ============================================================================

const vazio = { valorMinimoDaCausa: null, diasParaODocumento: 15, criterios: [] };

/** O pior caso realista: histórico cheio, treinamento longo, parâmetros ligados. */
function piorCaso(extra: Record<string, unknown> = {}) {
  return montarPergunta({
    nomeDoAtendente: "Ana",
    nomeDoEscritorio: "Escritório com um nome razoavelmente comprido Advogados Associados",
    instrucoesDoEscritorio: "Treinamento do escritório. ".repeat(30),
    parametros: textoDosParametros({
      ...vazio,
      valorMinimoDaCausa: 1_500_000,
      criterios: Array.from({ length: 6 }, (_, i) => ({ id: `m${i}`, eixo: "MATERIA", valor: `matéria número ${i}`, ordem: i })),
    }),
    nomeDoCliente: "Cliente com Nome Comprido da Silva",
    historico: Array.from({ length: 10 }, (_, i) => ({
      de: (i % 2 ? "escritorio" : "cliente") as "cliente" | "escritorio",
      texto: "Mensagem de conversa real, com o tamanho que uma pessoa escreve no WhatsApp. ".repeat(4),
    })),
    mensagem: "A mensagem de agora, que também pode ser comprida. ".repeat(6),
    ...extra,
  });
}

teste("o nosso teto é menor que o teto do servidor do Hermes", () => {
  // Lê o número do OUTRO lado. Mudar um sem o outro é o jeito mais provável de isto voltar.
  const servidor = readFileSync("servidor-hermes/servidor.py", "utf8");
  const achado = servidor.match(/PERGUNTA_MAXIMA\s*=\s*([\d_]+)/);
  verdade(Boolean(achado), "PERGUNTA_MAXIMA sumiu de servidor-hermes/servidor.py");
  const doServidor = Number((achado?.[1] || "0").replace(/_/g, ""));
  verdade(doServidor > 0, "não deu para ler o limite do servidor");
  verdade(LIMITE_DA_PERGUNTA < doServidor,
    `o nosso limite (${LIMITE_DA_PERGUNTA}) não cabe no do servidor (${doServidor})`);
});

teste("o pior caso realista cabe no limite", () => {
  const p = piorCaso();
  verdade(p.length <= LIMITE_DA_PERGUNTA, `o pedido saiu com ${p.length} caracteres, acima de ${LIMITE_DA_PERGUNTA}`);
});

teste("o caso comum, que quebrou a produção, cabe", () => {
  // Escritório SEM critério nenhum configurado: o bloco de parâmetros ainda entra, porque a trava
  // do "fora disso você só propõe" vale mesmo com a lista vazia. Foi este o caso que estourou.
  const p = montarPergunta({
    nomeDoAtendente: "Ana", nomeDoEscritorio: "Rodarte Prado Advogados",
    instrucoesDoEscritorio: null, parametros: textoDosParametros(vazio),
    nomeDoCliente: "Jairo Rodarte",
    historico: Array.from({ length: 9 }, () => ({ de: "cliente" as const, texto: "Mensagem de exemplo de conversa." })),
    mensagem: "[áudio]",
  });
  verdade(p.length <= LIMITE_DA_PERGUNTA, `o caso comum saiu com ${p.length} caracteres`);
});

teste("o que se corta para caber é contexto, nunca segurança", () => {
  // A ordem importa: cortar um limite duro para o pedido caber seria economizar exatamente na
  // parte que impede a Ana de prometer resultado ou fechar contrato.
  const p = piorCaso();
  verdade(p.includes("O QUE VOCÊ NUNCA FAZ"), "os limites duros foram cortados para caber");
  verdade(p.includes("NUNCA promete resultado"), "a proibição de prometer resultado foi cortada");
  verdade(p.includes("[[PROPOR_RECUSA]]"), "a trava do 'fora disso você só propõe' foi cortada");
  verdade(p.includes("QUANDO ESTE ESCRITÓRIO NÃO PEGA O CASO"), "os parâmetros do escritório foram cortados");
  verdade(p.includes("MENSAGEM DE AGORA"), "a mensagem do cliente foi cortada");
  verdade(p.includes("O QUE ESTE ESCRITÓRIO ACRESCENTA"), "o treinamento do escritório foi cortado");
});

teste("corta o histórico mais VELHO primeiro, e guarda o mais novo", () => {
  // Contexto velho é o que menos falta. Perder a última coisa que a pessoa disse seria o contrário
  // do que se quer.
  const historico = Array.from({ length: 10 }, (_, i) => ({
    de: "cliente" as const,
    texto: `MARCA${i} ` + "enchimento para forçar o corte. ".repeat(30),
  }));
  const p = montarPergunta({
    nomeDoAtendente: "Ana", nomeDoEscritorio: "Escritório",
    instrucoesDoEscritorio: null, parametros: textoDosParametros(vazio),
    nomeDoCliente: "Cliente", historico, mensagem: "e agora?",
  });
  verdade(p.length <= LIMITE_DA_PERGUNTA, `não coube: ${p.length}`);
  verdade(p.includes("MARCA9"), "a mensagem mais recente do histórico foi cortada");
  verdade(!p.includes("MARCA0"), "o histórico mais velho não foi cortado — o corte não está acontecendo");
});

teste("sem nada para cortar, o pedido ainda sai (erro visível é melhor que corte silencioso)", () => {
  // Se um escritório escrever um treinamento gigante, o pedido passa do teto e o Hermes recusa —
  // e isso VIRA ERRO NO LOG. É melhor do que cortar em silêncio um limite duro para caber.
  const p = montarPergunta({
    nomeDoAtendente: "Ana", nomeDoEscritorio: "Escritório",
    instrucoesDoEscritorio: "x".repeat(20_000),
    parametros: textoDosParametros(vazio),
    nomeDoCliente: "Cliente", historico: [], mensagem: "oi",
  });
  verdade(p.includes("O QUE VOCÊ NUNCA FAZ"), "os limites duros sumiram no caso extremo");
  verdade(p.includes("MENSAGEM DE AGORA"), "a mensagem do cliente sumiu no caso extremo");
});

resumo("O pedido ao Hermes cabe no limite");
