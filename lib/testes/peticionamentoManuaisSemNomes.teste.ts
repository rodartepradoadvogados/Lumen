import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, verdade, resumo, codigoDe } from "./executar";
import { ORIENTACOES_GERAIS, COMO_USAR_O_MODULO } from "../peticionamentoTextosManual";

// A PROIBIÇÃO DURA da especificação §5/§6 (adequação de 21/09/2026): os dois pop-ups de manual
// NUNCA podem citar nome de skill, nome do agente, nome ou fabricante do modelo de IA, nem o nome
// "Hermes" — diz-se "inteligência artificial" e nada além disso.
//
// Duas frentes de varredura, de propósito:
//   1. O TEXTO RENDERIZADO (os objetos de dados) — o que a tela realmente mostra.
//   2. O ARQUIVO-FONTE dos dois módulos de dados — pega um nome escrito numa string que a suíte
//      de teste não itera (ex.: um campo novo esquecido na lista de campos varridos abaixo).
// Se só a (1) existisse, um campo novo no objeto que a varredura não soubesse ler passaria
// verde com um nome proibido dentro. Se só a (2) existisse, um nome dividido em concatenação de
// string ("Her" + "mes") escaparia da busca textual — mas passaria a não ser exibido de qualquer
// forma, então a varredura por objeto (1) é quem prova o que a TELA mostra.

const RAIZ = process.cwd();
const FONTE_TEXTOS = readFileSync(join(RAIZ, "lib", "peticionamentoTextosManual.ts"), "utf8");

// A lista é O CONTRATO da proibição — cada item aqui é um jeito de citar skill/agente/modelo/
// fabricante que a especificação proíbe. Case-insensitive na varredura (abaixo).
const NOMES_PROIBIDOS = [
  "hermes",
  "peticionamento-lumen",
  "atendimento-lumen",
  "claude",
  "anthropic",
  "chatgpt",
  "openai",
  "gpt-",
  " gpt",
  "gemini",
  "bard",
  "llama",
  "mistral",
  "copilot",
  "grok",
  "deepseek",
  "cohere",
  "sonnet",
  " opus",
  "haiku",
  "bedrock",
];

function tudoDeTexto(obj: unknown): string {
  return JSON.stringify(obj);
}

function achaNomeProibido(texto: string): string | null {
  const minusculo = texto.toLowerCase();
  for (const proibido of NOMES_PROIBIDOS) {
    if (minusculo.includes(proibido)) return proibido;
  }
  return null;
}

teste("TRAVA: 'Orientações gerais' não cita skill, agente, modelo de IA nem Hermes — só 'inteligência artificial'", () => {
  const texto = tudoDeTexto(ORIENTACOES_GERAIS);
  verdade(texto.length > 200, `objeto ORIENTACOES_GERAIS suspeitosamente pequeno (${texto.length} caracteres) — varredura cega`);
  const achado = achaNomeProibido(texto);
  verdade(achado === null, `"Orientações gerais" cita um nome proibido: "${achado}"`);
  verdade(texto.toLowerCase().includes("intelig") && texto.toLowerCase().includes("artificial"), "o texto de abertura precisa dizer 'inteligência artificial' — é a única forma permitida de nomear a tecnologia");
});

teste("TRAVA: 'Como usar o módulo' não cita skill, agente, modelo de IA nem Hermes", () => {
  const texto = tudoDeTexto(COMO_USAR_O_MODULO);
  verdade(texto.length > 200, `objeto COMO_USAR_O_MODULO suspeitosamente pequeno (${texto.length} caracteres) — varredura cega`);
  const achado = achaNomeProibido(texto);
  verdade(achado === null, `"Como usar o módulo" cita um nome proibido: "${achado}"`);
});

teste("TRAVA: o arquivo-fonte dos dois manuais, por inteiro, não tem nenhum dos nomes proibidos", () => {
  const semComentarios = codigoDe(FONTE_TEXTOS);
  verdade(semComentarios.length > 500, `lib/peticionamentoTextosManual.ts suspeitosamente pequeno sem comentários (${semComentarios.length} caracteres) — varredura cega`);
  const achado = achaNomeProibido(semComentarios);
  verdade(achado === null, `o arquivo-fonte dos manuais cita um nome proibido: "${achado}"`);
});

teste("a varredura de fato falha na presença de um nome proibido — prova negativa, não só positiva", () => {
  // Sem este caso, uma NOMES_PROIBIDOS vazia por engano faria as três TRAVAS acima passarem verdes
  // sempre, provando zero coisa.
  verdade(achaNomeProibido("o Hermes responde em segundos") === "hermes", "a função de varredura deveria acusar 'hermes' e não acusou");
  verdade(achaNomeProibido("gerado com Claude") === "claude", "a função de varredura deveria acusar 'claude' e não acusou");
  verdade(achaNomeProibido("este texto está limpo, fala só de inteligência artificial") === null, "falso positivo: texto limpo acusado como proibido");
});

resumo("Peticionamento — manuais sem nome de skill/agente/modelo/Hermes");
