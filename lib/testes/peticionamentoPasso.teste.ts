import { teste, igual, verdade, resumo } from "./executar";
import { passoDaSessao, passoParaRetomar, ehPassoValido, sessaoTemTrabalhoEmAndamento, hrefDoPasso, PASSOS_DA_SESSAO, ROTULO_DO_PASSO } from "../peticionamentoPasso";

const BASE = {
  status: "CONTEXTO",
  categoriaPeca: null as string | null,
  materiaNome: null as string | null,
  contextoDecidido: false,
  fatos: null as string | null,
  pedidos: [] as string[],
  temDocumento: false,
};

teste("sessão recém-criada, nada preenchido → passo 'tipo-de-peca'", () => {
  igual(passoDaSessao(BASE), "tipo-de-peca");
});

teste("escolheu categoria, nada mais → passo 'contexto'", () => {
  igual(passoDaSessao({ ...BASE, categoriaPeca: "Petição" }), "contexto");
});

teste("decidiu o contexto (vinculou ou foi avulsa), sem fatos/pedidos → passo 'questionario'", () => {
  igual(passoDaSessao({ ...BASE, categoriaPeca: "Petição", contextoDecidido: true }), "questionario");
});

teste("anexou documento antes de escrever fatos/pedidos → passo 'documentos', não 'questionario'", () => {
  igual(passoDaSessao({ ...BASE, categoriaPeca: "Petição", contextoDecidido: true, temDocumento: true }), "documentos");
});

teste("assim que fatos aparece (mesmo incompleto), documento anexado não sobrepõe mais — volta a 'questionario'", () => {
  igual(passoDaSessao({ ...BASE, categoriaPeca: "Petição", contextoDecidido: true, temDocumento: true, fatos: "fato" }), "questionario");
});

teste("fatos E pedidos preenchidos (mínimo pronto) → passo 'confirmacao', mesmo sem documento nenhum", () => {
  igual(passoDaSessao({ ...BASE, categoriaPeca: "Petição", contextoDecidido: true, fatos: "fato", pedidos: ["pedido"] }), "confirmacao");
});

teste("mínimo pronto vence tudo — mesmo sem categoria e sem contexto decidido", () => {
  igual(passoDaSessao({ ...BASE, fatos: "fato", pedidos: ["pedido"] }), "confirmacao");
});

for (const status of ["GERANDO", "GERADA", "FALHA_GERACAO"]) {
  teste(`status ${status} → passo 'minuta', mesmo sem mínimo preenchido`, () => {
    igual(passoDaSessao({ ...BASE, status }), "minuta");
  });
}

teste("pedidos só com strings em branco não conta como 'tem pedido' — mínimo continua incompleto", () => {
  igual(passoDaSessao({ ...BASE, categoriaPeca: "Petição", contextoDecidido: true, fatos: "fato", pedidos: ["   ", ""] }), "questionario");
});

teste("hrefDoPasso: um caminho por passo, todos sob /peticionamento/<id>/", () => {
  for (const p of PASSOS_DA_SESSAO) {
    const href = hrefDoPasso("abc123", p);
    verdade(href.startsWith("/peticionamento/abc123/"), `href de "${p}" não começa com /peticionamento/abc123/: ${href}`);
  }
  // Nenhum passo pode compartilhar o caminho de outro — Retomar precisa ser inequívoco.
  const todos = PASSOS_DA_SESSAO.map((p) => hrefDoPasso("abc123", p));
  igual(new Set(todos).size, todos.length);
});

teste("todo passo tem rótulo em português, não vazio", () => {
  for (const p of PASSOS_DA_SESSAO) {
    verdade(typeof ROTULO_DO_PASSO[p] === "string" && ROTULO_DO_PASSO[p].length > 0, `passo "${p}" sem rótulo`);
  }
});

// ── "numa sessão vazia, sair é sair" (espec. §4) ────────────────────────────────────────────────

const VAZIA = {
  categoriaPeca: null as string | null,
  materiaNome: null as string | null,
  contextoDecidido: false,
  fatos: null as string | null,
  pedidos: [] as string[],
  temDocumento: false,
  minutaTexto: null as string | null,
};

teste("sessão totalmente vazia não tem trabalho em andamento", () => {
  igual(sessaoTemTrabalhoEmAndamento(VAZIA), false);
});

teste("qualquer um dos sete sinais, sozinho, já conta como trabalho em andamento", () => {
  verdade(sessaoTemTrabalhoEmAndamento({ ...VAZIA, categoriaPeca: "Petição" }), "categoria escolhida deveria contar");
  verdade(sessaoTemTrabalhoEmAndamento({ ...VAZIA, materiaNome: "Cível" }), "matéria escolhida deveria contar");
  verdade(sessaoTemTrabalhoEmAndamento({ ...VAZIA, contextoDecidido: true }), "contexto decidido (inclusive avulsa explícita) deveria contar");
  verdade(sessaoTemTrabalhoEmAndamento({ ...VAZIA, fatos: "x" }), "fatos digitados deveriam contar");
  verdade(sessaoTemTrabalhoEmAndamento({ ...VAZIA, pedidos: ["x"] }), "pedido marcado deveria contar");
  verdade(sessaoTemTrabalhoEmAndamento({ ...VAZIA, temDocumento: true }), "documento anexado deveria contar");
  verdade(sessaoTemTrabalhoEmAndamento({ ...VAZIA, minutaTexto: "texto" }), "minuta já gerada deveria contar");
});

teste("pedidos só com strings em branco NÃO conta como trabalho em andamento", () => {
  igual(sessaoTemTrabalhoEmAndamento({ ...VAZIA, pedidos: ["   ", ""] }), false);
});

teste("fatos só com espaços em branco NÃO conta como trabalho em andamento", () => {
  igual(sessaoTemTrabalhoEmAndamento({ ...VAZIA, fatos: "   " }), false);
});

// ── ehPassoValido ────────────────────────────────────────────────────────────────────────────

teste("ehPassoValido: os seis passos de hoje são válidos", () => {
  for (const p of PASSOS_DA_SESSAO) verdade(ehPassoValido(p), `"${p}" deveria ser válido`);
});

teste("ehPassoValido: texto torto, passo que não existe mais e null/undefined são inválidos", () => {
  igual(ehPassoValido("revisao-final"), false); // passo de uma versão antiga que a lista de hoje não conhece mais
  igual(ehPassoValido(""), false);
  igual(ehPassoValido(null), false);
  igual(ehPassoValido(undefined), false);
});

// ── passoParaRetomar: os três caminhos da adequação "retomar volta ao passo certo" ──────────────
//
// Cenário fixo para os três testes: dados preenchidos até "documentos" (dedução mandaria para lá),
// para deixar nítido quando o valor GRAVADO vence a dedução e quando a dedução é o plano B.
const DADOS_ATE_DOCUMENTOS = { ...BASE, categoriaPeca: "Petição", contextoDecidido: true, temDocumento: true };

teste("passo gravado válido vence a dedução — o caso do enunciado: avançou até documentos, voltou para revisar a matéria", () => {
  // A dedução, sozinha, mandaria para "documentos" (mesma conta do teste de passoDaSessao acima).
  igual(passoDaSessao(DADOS_ATE_DOCUMENTOS), "documentos");
  // Mas a pessoa voltou para o contexto e fechou a aba ali — é isso que passoAtual gravou.
  igual(passoParaRetomar(DADOS_ATE_DOCUMENTOS, "contexto"), "contexto");
});

teste("passo gravado inválido (texto torto, ou passo que a lista de hoje não conhece mais) cai na dedução — fail-closed", () => {
  igual(passoParaRetomar(DADOS_ATE_DOCUMENTOS, "revisao-final"), "documentos");
  igual(passoParaRetomar(DADOS_ATE_DOCUMENTOS, ""), "documentos");
  igual(passoParaRetomar(DADOS_ATE_DOCUMENTOS, "  contexto  "), "documentos"); // espaços não normalizam — ou é exatamente um dos seis, ou é inválido
});

teste("sessão antiga sem passoAtual nenhum (null, ou undefined) usa a dedução, do jeito que sempre usou", () => {
  igual(passoParaRetomar(DADOS_ATE_DOCUMENTOS, null), "documentos");
  igual(passoParaRetomar(DADOS_ATE_DOCUMENTOS, undefined), "documentos");
});

resumo("Peticionamento — passo da sessão e detector de trabalho em andamento");
