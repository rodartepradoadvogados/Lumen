import { teste, igual, verdade, resumo } from "./executar";
import { CATEGORIAS_DE_PECA, ehCategoriaConhecida, usaSublistaDeTipoDePeticao } from "../peticionamentoCategoriaPeca";

teste("a lista fechada tem as cinco categorias (espec. §7 + decisão do dono de 22/09/2026, 'Geral'), nesta ordem", () => {
  igual(CATEGORIAS_DE_PECA, ["Petição", "Contrato", "Parecer", "Notificação Extrajudicial", "Geral"]);
});

teste("ehCategoriaConhecida reconhece as cinco e rejeita o resto", () => {
  for (const c of CATEGORIAS_DE_PECA) verdade(ehCategoriaConhecida(c), `"${c}" deveria ser conhecida`);
  verdade(!ehCategoriaConhecida("Recurso"), "categoria fora da lista não deveria ser conhecida");
  verdade(!ehCategoriaConhecida(null), "null não é categoria conhecida");
  verdade(!ehCategoriaConhecida(undefined), "undefined não é categoria conhecida");
  verdade(!ehCategoriaConhecida(""), "string vazia não é categoria conhecida");
});

teste("só 'Petição' (e a ausência de escolha) usa a sublista de tipo de petição", () => {
  verdade(usaSublistaDeTipoDePeticao("Petição"), "Petição deveria usar a sublista");
  verdade(usaSublistaDeTipoDePeticao(null), "sem categoria ainda escolhida, mantém a sublista visível (comportamento anterior à adequação)");
  verdade(usaSublistaDeTipoDePeticao(undefined), "undefined também mantém a sublista visível");
  verdade(!usaSublistaDeTipoDePeticao("Contrato"), "Contrato não deveria usar a sublista de tipo de petição");
  verdade(!usaSublistaDeTipoDePeticao("Parecer"), "Parecer não deveria usar a sublista de tipo de petição");
  verdade(!usaSublistaDeTipoDePeticao("Notificação Extrajudicial"), "Notificação Extrajudicial não deveria usar a sublista de tipo de petição");
  verdade(!usaSublistaDeTipoDePeticao("Geral"), "Geral não deveria usar a sublista de tipo de petição");
});

resumo("Peticionamento — categoria da peça (espec. §7)");
