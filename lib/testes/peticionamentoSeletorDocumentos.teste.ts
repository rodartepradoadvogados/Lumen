import { teste, igual, verdade, resumo } from "./executar";
import {
  agruparPorItem, categoriaDoTipo, tipoDoCase, casaBusca, filtrarItens, contarPorTipo, resumoDaSelecao, estadoDoItem,
  definirItemInteiro, definirDocumento, trechosDestacados, sugestoesDeVazio, criarGravadorSerial, temAlgumFiltro, SEM_FILTROS,
  type DocumentoDoSeletor, type ItemDoSeletor, type FiltrosDoSeletor, type CategoriaDoFiltro, type TipoDeDemanda,
} from "@/lib/peticionamentoSeletorDocumentos";

// Seletor do passo Documentos (PR P1–P3): tudo que é regra fica em módulo puro e é exercitado aqui.

let n = 0;
function doc(demandaId: string, tipo: TipoDeDemanda, titulo: string, numero: string | null, partes: string | null, nome = `doc${++n}.pdf`): DocumentoDoSeletor {
  return { id: `d${n}_${nome}`, name: nome, docType: "OUTRO", driveUrl: null, demandaId, demandaTipo: tipo, demandaTitulo: titulo, demandaNumero: numero, demandaPartes: partes };
}
const DOCS: DocumentoDoSeletor[] = [
  doc("c1", "PROCESSO_JUDICIAL", "Alvorada x Município de Aparecida de Goiânia — ação de cobrança", "5012345-67.2024.8.09.0051", "Construtora Alvorada Ltda; Município de Aparecida"),
  doc("c1", "PROCESSO_JUDICIAL", "Alvorada x Município de Aparecida de Goiânia — ação de cobrança", "5012345-67.2024.8.09.0051", "Construtora Alvorada Ltda; Município de Aparecida"),
  doc("c2", "PROCESSO_JUDICIAL", "Cunha Engenharia x Alvorada", "5033210-45.2025.8.09.0175", "Cunha Engenharia Eireli; Construtora Alvorada Ltda"),
  doc("c3", "PROCESSO_EXTRAJUDICIAL", "Recuperação de crédito — Silva & Cunha Materiais", null, "Construtora Alvorada Ltda; Silva & Cunha Materiais Ltda"),
  doc("c3", "PROCESSO_EXTRAJUDICIAL", "Recuperação de crédito — Silva & Cunha Materiais", null, "Construtora Alvorada Ltda; Silva & Cunha Materiais Ltda"),
  doc("l1", "LICITACAO", "Pregão Eletrônico 12/2026 — obra de contenção", "PE 12/2026", "Prefeitura de Goiânia"),
  doc("p1", "DEMANDA", "Parecer — reequilíbrio econômico-financeiro", null, "Construtora Alvorada Ltda"),
  doc("a1", "ATENDIMENTO", "Revisão da minuta de empreitada", null, "Jairo Rodarte"),
  doc("g1", "GERAL", "Documentos gerais da assessoria", null, "Construtora Alvorada Ltda"),
];
const ITENS = agruparPorItem(DOCS);
const SEL = new Set<string>();
const f = (p: Partial<{ tipos: CategoriaDoFiltro[]; busca: string; soSelecionados: boolean }>): FiltrosDoSeletor => ({ tipos: new Set(p.tipos ?? []), busca: p.busca ?? "", soSelecionados: p.soSelecionados ?? false });
const ids = (l: ItemDoSeletor[]) => l.map((i) => i.id);

teste("agruparPorItem: um item por demandaId, ordem da primeira aparição, docs preservados", () => {
  igual(ids(ITENS), ["c1", "c2", "c3", "l1", "p1", "a1", "g1"]);
  igual(ITENS[0].docs.length, 2);
  igual(ITENS[0].categoria, "PJ");
});

teste("tipos: judicial=JUDICIAL; extrajudicial=EXTRAJUDICIAL+ADMINISTRATIVO+legados; licitação; resto em Demandas/Pareceres", () => {
  igual(tipoDoCase("JUDICIAL"), "PROCESSO_JUDICIAL");
  for (const t of ["EXTRAJUDICIAL", "ADMINISTRATIVO", "ATENDIMENTO", "CONSULTIVO", null, undefined]) igual(tipoDoCase(t as string | null), "PROCESSO_EXTRAJUDICIAL", `Case.type=${t}: `);
  igual(categoriaDoTipo("LICITACAO"), "LI");
  for (const t of ["DEMANDA", "ATENDIMENTO", "GERAL"] as const) igual(categoriaDoTipo(t), "DP");
});

// critério 11
teste("sem tipo marcado mostra tudo; Licitação só licitações; Licitação + judicial = união", () => {
  igual(filtrarItens(ITENS, f({}), SEL).length, 7);
  igual(ids(filtrarItens(ITENS, f({ tipos: ["LI"] }), SEL)), ["l1"]);
  igual(ids(filtrarItens(ITENS, f({ tipos: ["LI", "PJ"] }), SEL)), ["c1", "c2", "l1"]);
  igual(ids(filtrarItens(ITENS, f({ tipos: ["DP"] }), SEL)), ["p1", "a1", "g1"]);
});

teste("contagem por caixa reflete busca e demais filtros (faceta) e ignora o próprio filtro de tipo", () => {
  igual(contarPorTipo(ITENS, f({}), SEL), { PJ: 2, PE: 1, LI: 1, DP: 3 });
  // a própria seleção de tipo não zera as outras caixas
  igual(contarPorTipo(ITENS, f({ tipos: ["LI"] }), SEL), { PJ: 2, PE: 1, LI: 1, DP: 3 });
  igual(contarPorTipo(ITENS, f({ busca: "cunha" }), SEL), { PJ: 1, PE: 1, LI: 0, DP: 0 });
});

// critério 12
teste("busca: mesmo item por CNJ com máscara, sem máscara e final '0051'", () => {
  for (const q of ["5012345-67.2024.8.09.0051", "50123456720248090051", "0051"]) igual(ids(filtrarItens(ITENS, f({ busca: q }), SEL)), ["c1"], `busca ${q}: `);
});
teste("busca: acento e caixa não importam", () => {
  for (const q of ["aparecida", "APARECIDA", "Aparecída", "goiania", "Goiânia"]) verdade(ids(filtrarItens(ITENS, f({ busca: q }), SEL)).includes("c1"), `busca ${q}`);
});
teste("busca por 'licitacao' (sem acento) acha o tipo Licitação", () => {
  igual(ids(filtrarItens(ITENS, f({ busca: "licitacao" }), SEL)), ["l1"]);
});
teste("busca com duas palavras exige as duas, em qualquer ordem", () => {
  igual(ids(filtrarItens(ITENS, f({ busca: "silva cunha" }), SEL)), ["c3"]);
  igual(ids(filtrarItens(ITENS, f({ busca: "cunha silva" }), SEL)), ["c3"]);
  igual(ids(filtrarItens(ITENS, f({ busca: "cunha" }), SEL)), ["c2", "c3"]);
});
teste("busca por parte e por rótulo de tipo; termo que não existe zera", () => {
  igual(ids(filtrarItens(ITENS, f({ busca: "prefeitura" }), SEL)), ["l1"]);
  igual(ids(filtrarItens(ITENS, f({ busca: "extrajudicial" }), SEL)), ["c3"]);
  igual(filtrarItens(ITENS, f({ busca: "zzzz" }), SEL).length, 0);
  verdade(casaBusca(ITENS[0], "   "), "busca em branco casa tudo");
});
teste("número curto (<4 dígitos) não vira busca de número: '12' acha pelo texto 'PE 12/2026'", () => {
  verdade(ids(filtrarItens(ITENS, f({ busca: "12" }), SEL)).includes("l1"), "PE 12/2026 deveria casar");
});

// critério 13
teste("monotonicidade: somar tipo + busca + só-selecionados só REDUZ; remover devolve o anterior", () => {
  const sel = new Set([ITENS[0].docs[0].id]);
  const base = ids(filtrarItens(ITENS, f({}), sel));
  const a = ids(filtrarItens(ITENS, f({ tipos: ["PJ", "PE"] }), sel));
  const b = ids(filtrarItens(ITENS, f({ tipos: ["PJ", "PE"], busca: "alvorada" }), sel));
  const c = ids(filtrarItens(ITENS, f({ tipos: ["PJ", "PE"], busca: "alvorada", soSelecionados: true }), sel));
  for (const [menor, maior] of [[a, base], [b, a], [c, b]] as const) verdade(menor.every((x) => maior.includes(x)) && menor.length <= maior.length, `${menor} ⊄ ${maior}`);
  igual(c, ["c1"]);
  igual(ids(filtrarItens(ITENS, f({ tipos: ["PJ", "PE"], busca: "alvorada" }), sel)), b, "remover o chip devolve o resultado anterior: ");
});

teste("propriedade: para dezenas de combinações, acrescentar um filtro nunca aumenta o resultado", () => {
  const sel = new Set([ITENS[1].docs[0].id, ITENS[3].docs[0].id]);
  const tipos: CategoriaDoFiltro[][] = [[], ["PJ"], ["PJ", "LI"], ["DP"], ["PJ", "PE", "LI", "DP"]];
  const buscas = ["", "alvorada", "cunha", "2026", "zz"];
  for (const t of tipos) for (const q of buscas) for (const s of [false, true]) {
    const cheio = filtrarItens(ITENS, f({ tipos: t, busca: q, soSelecionados: s }), sel).length;
    verdade(cheio <= filtrarItens(ITENS, f({ tipos: [], busca: q, soSelecionados: s }), sel).length || t.length === 0, "tipo aumentou");
    verdade(cheio <= filtrarItens(ITENS, f({ tipos: t, busca: "", soSelecionados: s }), sel).length, "busca aumentou");
    verdade(cheio <= filtrarItens(ITENS, f({ tipos: t, busca: q, soSelecionados: false }), sel).length, "só-selecionados aumentou");
  }
});

// critério 16
teste("resumo: N = marcados no TOTAL (independe de filtro), M = itens com marcado; id desconhecido não conta", () => {
  const sel = new Set([ITENS[0].docs[0].id, ITENS[0].docs[1].id, ITENS[3].docs[0].id, "fantasma"]);
  const r = resumoDaSelecao(ITENS, sel);
  igual(r, { documentos: 3, itens: 2, totalItens: 7, totalDocumentos: 9 });
  igual(resumoDaSelecao(ITENS, new Set()), { documentos: 0, itens: 0, totalItens: 7, totalDocumentos: 9 });
});

// critério 15
teste("estado do item e seleção do item inteiro em UMA nova lista (uma gravação)", () => {
  const item = ITENS[0];
  igual(estadoDoItem(item, new Set()), "nenhum");
  igual(estadoDoItem(item, new Set([item.docs[0].id])), "parcial");
  igual(estadoDoItem(item, new Set(item.docs.map((d) => d.id))), "todos");
  const marcado = definirItemInteiro(["outro"], item, true);
  igual(marcado, ["outro", ...item.docs.map((d) => d.id)]);
  igual(definirItemInteiro(marcado, item, false), ["outro"]);
  igual(definirItemInteiro(marcado, item, true), marcado, "marcar de novo não duplica: ");
  igual(definirDocumento(["a"], "b", true), ["a", "b"]);
  igual(definirDocumento(["a", "b"], "a", false), ["b"]);
});

teste("sugestões do estado vazio só oferecem o que devolve resultado", () => {
  const filtros = f({ tipos: ["LI"], busca: "cunha" });
  const s = sugestoesDeVazio(ITENS, filtros, SEL);
  igual(s.map((x) => x.acao).sort(), ["busca", "tipos"]);
  igual(s.find((x) => x.acao === "tipos")!.quantidade, 2);
  igual(s.find((x) => x.acao === "busca")!.quantidade, 1);
  igual(sugestoesDeVazio(ITENS, f({ busca: "zzzz" }), SEL), [{ acao: "busca", rotulo: "Limpar a busca “zzzz”", quantidade: 7 }]);
  // filtros que já não zeram nada por si sós não geram sugestão: só há o que remover onde há filtro
  igual(sugestoesDeVazio(ITENS, f({}), SEL), []);
});

teste("temAlgumFiltro", () => {
  verdade(!temAlgumFiltro(SEM_FILTROS), "sem filtros");
  verdade(temAlgumFiltro(f({ busca: "x" })) && temAlgumFiltro(f({ tipos: ["PJ"] })) && temAlgumFiltro(f({ soSelecionados: true })), "com filtro");
});

teste("trechosDestacados: marca sem acento/caixa e preserva o texto original", () => {
  const t = trechosDestacados("Município de Aparecida", "aparecída municipio");
  igual(t.map((x) => x.texto).join(""), "Município de Aparecida");
  igual(t.filter((x) => x.destaque).map((x) => x.texto), ["Município", "Aparecida"]);
  igual(trechosDestacados("abc", ""), [{ texto: "abc", destaque: false }]);
  igual(trechosDestacados("abc", "zzz"), [{ texto: "abc", destaque: false }]);
});

// critério 15: 9 marcas → UMA gravação com o estado final (e nunca duas em paralelo)
teste("gravador serial: 9 pedidos seguidos viram no máximo 2 gravações, nunca concorrentes, e a última vence", async () => {
  const gravadas: string[][] = [];
  let emVoo = 0, maxVoo = 0;
  const g = criarGravadorSerial(async (x) => { emVoo++; maxVoo = Math.max(maxVoo, emVoo); await new Promise((r) => setTimeout(r, 5)); gravadas.push(x); emVoo--; }, () => { throw new Error("não deveria falhar"); }, []);
  const ps: Promise<void>[] = [];
  const marcados: string[] = [];
  for (let i = 1; i <= 9; i++) { marcados.push(`d${i}`); ps.push(g.pedir([...marcados])); }
  await Promise.all(ps);
  verdade(gravadas.length <= 2, `${gravadas.length} gravações`);
  igual(maxVoo, 1, "gravações em paralelo: ");
  igual(gravadas[gravadas.length - 1], marcados);
});
teste("gravador serial: falha devolve o último estado confirmado e não trava os próximos pedidos", async () => {
  let falhar = false;
  const voltou: string[][] = [];
  const gravadas: string[][] = [];
  const g = criarGravadorSerial(async (x) => { if (falhar) throw new Error("recusado"); gravadas.push(x); }, (c) => voltou.push(c), ["a"]);
  await g.pedir(["a", "b"]);
  falhar = true;
  await g.pedir(["a", "b", "c"]);
  igual(voltou, [["a", "b"]]);
  falhar = false;
  await g.pedir(["z"]);
  igual(gravadas[gravadas.length - 1], ["z"]);
});

resumo("peticionamentoSeletorDocumentos");
