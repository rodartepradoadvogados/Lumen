import { readFileSync } from "node:fs";
import { teste, verdade, resumo, codigoDe } from "./executar";

// ══════════════════════════════════════════════════════════════════════════════════════════
// O POP-UP DE SAÍDA — as portas por onde se sai.
//
// ACHADO DA SUPERVISÃO: a especificação nomeou quatro saídas (o item do menu, o botão de voltar
// do navegador, fechar a aba, navegar para fora), e a entrega implementou as quatro. Mas apagar
// os DOIS ouvintes de janela — `beforeunload` e `popstate` — não deixava nenhum teste vermelho.
// Justamente as duas saídas que não passam por um clique nosso: as que o usuário de verdade usa
// quando fecha a aba no X ou aperta voltar por reflexo.
//
// Varredura de código, e não execução, porque a interceptação é de navegador e esta casa não tem
// DOM de mentira nos testes. O que dá para provar aqui é que os ouvintes ESTÃO registrados, que
// eles chamam o tratador certo, e que são removidos na limpeza — o bastante para um refactor
// distraído não levá-los embora sem aviso.
// ══════════════════════════════════════════════════════════════════════════════════════════

const FONTE = readFileSync("components/peticionamento/SaidaContext.tsx", "utf8");
const CODIGO = codigoDe(FONTE);

teste("a varredura está olhando para o arquivo certo", () => {
  verdade(CODIGO.length > 600, `SaidaContext.tsx tem só ${CODIGO.length} caracteres de código — varredura cega`);
});

teste("SAÍDA 1 — fechar a aba: o ouvinte de beforeunload existe e é ligado ao tratador", () => {
  verdade(/addEventListener\("beforeunload", \w+\)/.test(CODIGO),
    "sumiu o ouvinte de beforeunload — fechar a aba no X deixa de avisar, e a promessa de 'nada se perde' nunca é mostrada");
  verdade(/removeEventListener\("beforeunload", \w+\)/.test(CODIGO),
    "o ouvinte de beforeunload não é removido na limpeza — vaza ouvinte a cada remontagem");
});

teste("SAÍDA 2 — voltar do navegador: o ouvinte de popstate existe e é ligado ao tratador", () => {
  verdade(/addEventListener\("popstate", \w+\)/.test(CODIGO),
    "sumiu o ouvinte de popstate — o botão voltar escapa do pop-up sem nenhum aviso");
  verdade(/removeEventListener\("popstate", \w+\)/.test(CODIGO),
    "o ouvinte de popstate não é removido na limpeza — vaza ouvinte a cada remontagem");
});

teste("o voltar só é interceptável porque existe uma sentinela empilhada no histórico", () => {
  // Sem empilhar um estado próprio, o primeiro "voltar" sai da aba ANTES de qualquer popstate
  // chegar até nós — o ouvinte existiria e mesmo assim não pegaria nada.
  verdade(/history\.pushState\(/.test(CODIGO),
    "sumiu a sentinela no histórico — sem ela o popstate não chega a tempo e o voltar escapa mesmo com o ouvinte registrado");
});

teste("os dois ouvintes só valem quando HÁ trabalho em andamento — sessão vazia sai direto", () => {
  // O outro lado da moeda: um pop-up que aparece sempre é um pop-up que se aprende a fechar sem
  // ler, e aí ele deixa de proteger no dia em que importa.
  verdade(/temTrabalho/.test(CODIGO), "o contexto de saída não consulta mais se há trabalho em andamento");
});

teste("a promessa do pop-up está escrita, e é a promessa certa", () => {
  const texto = readFileSync("components/peticionamento/SaidaContext.tsx", "utf8");
  // Se esta frase sair do código, o pop-up perde a única coisa que ele precisa dizer.
  verdade(/[Nn]ada será perdido/.test(texto),
    "sumiu a frase 'nada será perdido' — é ela que transforma o aviso em tranquilidade, e é ela que a lista de rascunhos sustenta");
  verdade(/rascunho/i.test(texto), "o pop-up deixou de dizer para onde o trabalho vai");
});

resumo("Peticionamento — as portas por onde se sai");
