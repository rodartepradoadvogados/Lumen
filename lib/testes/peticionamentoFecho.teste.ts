import { teste, igual, verdade, resumo } from "./executar";
import { FECHO_PETICAO, terminaComFechoCorreto, garantirFecho } from "@/lib/peticionamentoFecho";

// HARD GATE — decisão literal do dono: "Termos em que pede deferimento." sem vírgula depois de
// "que". Metade+ destes testes mira este hard gate diretamente.

teste("a constante é exatamente o texto literal, sem vírgula", () => {
  igual(FECHO_PETICAO, "Termos em que pede deferimento.");
});

teste("HARD GATE: texto já correto não é alterado", () => {
  const texto = "Ante o exposto, requer-se X.\n\nTermos em que pede deferimento.";
  igual(garantirFecho(texto), texto);
  igual(terminaComFechoCorreto(texto), true);
});

teste("HARD GATE: corrige a vírgula — o erro mais comum citado pelo dono", () => {
  const errado = "Ante o exposto, requer-se X.\n\nTermos em que, pede deferimento.";
  const corrigido = garantirFecho(errado);
  verdade(corrigido.endsWith(FECHO_PETICAO), "deveria terminar com o fecho literal");
  igual(corrigido.includes(", pede"), false, "vírgula deveria ter sido removida: ");
});

teste("HARD GATE: acrescenta o fecho quando ele simplesmente não existe", () => {
  const semFecho = "Ante o exposto, requer-se a procedência dos pedidos.";
  const corrigido = garantirFecho(semFecho);
  verdade(corrigido.endsWith(FECHO_PETICAO), "deveria terminar com o fecho literal");
  verdade(corrigido.includes(semFecho.trim()), "não deveria apagar o corpo original");
});

teste("HARD GATE: corrige maiúscula/minúscula e pontuação da variação conhecida", () => {
  igual(garantirFecho("X.\n\ntermos em que pede deferimento").endsWith(FECHO_PETICAO), true);
  igual(garantirFecho("X.\n\nTERMOS EM QUE PEDE DEFERIMENTO.").endsWith(FECHO_PETICAO), true);
});

teste("terminaComFechoCorreto é sensível a espaço/pontuação extra no fim", () => {
  igual(terminaComFechoCorreto("Termos em que pede deferimento"), false);
  igual(terminaComFechoCorreto("Termos em que pede deferimento.."), false);
});

teste("garantirFecho é idempotente — aplicar duas vezes dá o mesmo resultado", () => {
  const texto = "Corpo qualquer.\n\nTermos em que, pede deferimento.";
  const uma = garantirFecho(texto);
  const duas = garantirFecho(uma);
  igual(uma, duas);
});

teste("garantirFecho nunca duplica o fecho", () => {
  const texto = "Corpo.\n\nTermos em que pede deferimento.";
  const corrigido = garantirFecho(texto);
  const ocorrencias = corrigido.split(FECHO_PETICAO).length - 1;
  igual(ocorrencias, 1);
});

resumo("Peticionamento — fecho da peça");
