import { teste, igual, resumo } from "./executar";
import { avaliarProntidao, fraseDoQueFalta } from "@/lib/peticionamentoMinimo";

// O MÍNIMO PARA GERAR: fatos + pedidos. Tipo de peça e teses NUNCA travam — decisions.md §9.

teste("fatos e pedidos preenchidos: pronto", () => {
  igual(avaliarProntidao({ fatos: "A ré contestou alegando X.", pedidos: ["Manter a tutela"] }), { pronto: true, faltando: [] });
});

teste("um fato de uma palavra já libera — decisão literal do dono (§9 item 2)", () => {
  igual(avaliarProntidao({ fatos: "Urgência.", pedidos: ["Multa"] }), { pronto: true, faltando: [] });
});

teste("sem fatos: falta fatos", () => {
  igual(avaliarProntidao({ fatos: "", pedidos: ["Manter a tutela"] }), { pronto: false, faltando: ["fatos"] });
});

teste("sem pedidos: falta pedidos", () => {
  igual(avaliarProntidao({ fatos: "algo", pedidos: [] }), { pronto: false, faltando: ["pedidos"] });
});

teste("fatos só com espaço não conta como preenchido", () => {
  igual(avaliarProntidao({ fatos: "   ", pedidos: ["x"] }), { pronto: false, faltando: ["fatos"] });
});

teste("pedidos só com itens vazios não conta como preenchido", () => {
  igual(avaliarProntidao({ fatos: "algo", pedidos: ["", "   ", null, undefined] }), { pronto: false, faltando: ["pedidos"] });
});

teste("nulo/undefined nos dois: falta os dois, nesta ordem", () => {
  igual(avaliarProntidao({ fatos: null, pedidos: undefined }), { pronto: false, faltando: ["fatos", "pedidos"] });
});

teste("tipo de peça e teses nunca entram na conta — não existem no tipo CamposMinimos", () => {
  // Prova estrutural: a função só aceita {fatos, pedidos}. Se algum dia alguém acrescentar
  // tipoPeca/teses ao tipo e usá-los aqui, este teste de intenção documenta que NÃO deveria.
  igual(avaliarProntidao({ fatos: "x", pedidos: ["y"] }).pronto, true);
});

teste("frase do que falta", () => {
  igual(fraseDoQueFalta([]), "");
  igual(fraseDoQueFalta(["fatos"]), "Falta preencher o mínimo desta sessão: fatos.");
  igual(fraseDoQueFalta(["fatos", "pedidos"]), "Falta preencher o mínimo desta sessão: fatos e pedidos.");
});

resumo("Peticionamento — mínimo para gerar");
