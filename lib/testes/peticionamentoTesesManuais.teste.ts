import { readFileSync } from "node:fs";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";
import { acrescentarTese, editarTese, removerTese, normalizarTese, LIMITE_CARACTERES_TESE } from "@/lib/peticionamentoTeses";
import { obterConfiguracaoQuestionario } from "@/lib/peticionamentoQuestionario";
import { CATEGORIAS_DE_PECA } from "@/lib/peticionamentoCategoriaPeca";

// ══════════════════════════════════════════════════════════════════════════════════════════
// TESES A CONSIDERAR — pedido do dono (22/09/2026): "apenas para escrita manual, sem seleção de
// rol fechado, com caixa de escrita e botão de salvar e de cancelar, com acréscimo de nova caixa
// abaixo a cada tese acrescentada".
//
// Antes desta entrega a etapa era um rol fechado de três sugestões prontas para marcar — a tese
// do MODELO indo para dentro da peça do advogado. A régua do que entra e do que não entra é
// código puro (lib/peticionamentoTeses.ts) porque tela não é trava: a mesma função que o botão
// "Salvar" chama é a que estes casos exercitam.
// ══════════════════════════════════════════════════════════════════════════════════════════

const ok = (r: ReturnType<typeof acrescentarTese>): string[] => {
  verdade(r.ok, `esperava aceitação, veio recusa: ${r.ok ? "" : r.motivo}`);
  return r.ok ? r.teses : [];
};

// ── O que NÃO entra ───────────────────────────────────────────────────────────────────────────

teste("tese vazia (ou só com espaço, tabulação, quebra de linha) nunca entra", () => {
  for (const vazia of ["", "   ", "\n", "\t  \n ", "    ".replace(/ /g, " ")]) {
    const r = acrescentarTese(["Tese existente"], vazia);
    verdade(!r.ok, `"${vazia.replace(/\n/g, "\\n")}" deveria ser recusada`);
    verdade(!r.ok && /vazia/i.test(r.motivo), "a recusa deveria dizer que a caixa está vazia");
  }
});

teste("tese repetida não entra duas vezes — a comparação é NORMALIZADA, não literal", () => {
  const lista = ["Rol da ANS é exemplificativo (Tema 990/1069 STJ)"];
  for (const repetida of [
    "Rol da ANS é exemplificativo (Tema 990/1069 STJ)",
    "  rol da ans é exemplificativo (tema 990/1069 stj)  ",
    "ROL DA ANS E EXEMPLIFICATIVO (TEMA 990/1069 STJ).",
    "Rol  da   ANS é exemplificativo (Tema 990/1069 STJ)",
  ]) {
    const r = acrescentarTese(lista, repetida);
    verdade(!r.ok, `"${repetida}" deveria ser recusada como repetida`);
    verdade(!r.ok && /já está na lista/i.test(r.motivo), "a recusa deveria dizer que a tese já está na lista");
  }
  igual(lista.length, 1, "a lista não pode ter sido alterada por uma recusa: ");
});

teste("tese diferente de verdade entra, mesmo parecida com uma que já existe", () => {
  const teses = ok(acrescentarTese(["Rol da ANS é exemplificativo"], "Rol da ANS é taxativo mitigado"));
  igual(teses, ["Rol da ANS é exemplificativo", "Rol da ANS é taxativo mitigado"]);
});

// ── O limite: dito, e nunca cortado em silêncio ───────────────────────────────────────────────

teste("HARD GATE: tese acima do limite é RECUSADA com o motivo — nunca truncada em silêncio", () => {
  const gigante = "a".repeat(LIMITE_CARACTERES_TESE + 1);
  const r = acrescentarTese([], gigante);
  verdade(!r.ok, "tese acima do limite deveria ser recusada");
  verdade(!r.ok && r.motivo.includes(String(LIMITE_CARACTERES_TESE)), "a recusa precisa DIZER qual é o limite");
  verdade(!r.ok && r.motivo.includes(String(LIMITE_CARACTERES_TESE + 1)), "a recusa precisa dizer quanto a tese tem hoje, para o advogado saber quanto tirar");
  // A prova de que não houve truncagem: nada entrou na lista, nem uma versão cortada.
  const lista = ok(acrescentarTese([], "a".repeat(LIMITE_CARACTERES_TESE)));
  igual(lista[0].length, LIMITE_CARACTERES_TESE, "uma tese exatamente no limite deveria entrar inteira: ");
});

teste("o texto guardado é o do advogado, só sem os espaços das pontas — nunca reescrito", () => {
  const teses = ok(acrescentarTese([], "   Abusividade de cláusula (CDC, art. 51)   "));
  igual(teses, ["Abusividade de cláusula (CDC, art. 51)"], "acento, caixa e pontuação do advogado precisam sobreviver: ");
});

// ── Ordem preservada ──────────────────────────────────────────────────────────────────────────

teste("a ordem é a da escrita — acrescentar põe no FIM, sempre", () => {
  let teses: string[] = [];
  for (const t of ["Primeira", "Segunda", "Terceira"]) teses = ok(acrescentarTese(teses, t));
  igual(teses, ["Primeira", "Segunda", "Terceira"]);
});

teste("remover preserva a ordem das demais, e índice fora da lista não mexe em nada", () => {
  const teses = ["Primeira", "Segunda", "Terceira"];
  igual(removerTese(teses, 1), ["Primeira", "Terceira"]);
  igual(removerTese(teses, 99), teses, "índice inexistente deveria devolver a lista igual: ");
  igual(removerTese(teses, -1), teses, "índice negativo deveria devolver a lista igual: ");
  igual(teses, ["Primeira", "Segunda", "Terceira"], "a lista original não pode ser mutada: ");
});

teste("editar reescreve NO LUGAR — editar não reordena a lista", () => {
  const teses = ["Primeira", "Segunda", "Terceira"];
  igual(ok(editarTese(teses, 1, "Segunda, corrigida")), ["Primeira", "Segunda, corrigida", "Terceira"]);
  igual(teses, ["Primeira", "Segunda", "Terceira"], "a lista original não pode ser mutada: ");
});

teste("editar a própria tese sem mudar nada é aceito — ela não é duplicata de si mesma", () => {
  igual(ok(editarTese(["Primeira", "Segunda"], 0, "  Primeira  ")), ["Primeira", "Segunda"]);
});

teste("editar uma tese para o texto de OUTRA é recusado — a duplicata entraria pela porta da edição", () => {
  const r = editarTese(["Primeira", "Segunda"], 1, "primeira");
  verdade(!r.ok, "deveria recusar");
  verdade(!r.ok && /já está na lista/i.test(r.motivo), "a recusa deveria dizer que a tese já está na lista");
});

teste("editar tese que não existe mais recusa em vez de criar uma do nada", () => {
  const r = editarTese(["Primeira"], 7, "Qualquer coisa");
  verdade(!r.ok, "deveria recusar índice fora da lista");
});

teste("editar para vazio ou para texto acima do limite cai nas MESMAS regras do acréscimo", () => {
  const vazia = editarTese(["Primeira"], 0, "   ");
  verdade(!vazia.ok && /vazia/i.test(vazia.motivo), "editar para vazio deveria recusar com o mesmo motivo");
  const gigante = editarTese(["Primeira"], 0, "a".repeat(LIMITE_CARACTERES_TESE + 5));
  verdade(!gigante.ok && gigante.motivo.includes(String(LIMITE_CARACTERES_TESE)), "editar acima do limite deveria recusar dizendo o limite");
});

teste("normalizarTese ignora caixa, acento, espaço repetido e pontuação de borda — e nada mais", () => {
  igual(normalizarTese("  Rol da ANS É   exemplificativo. "), "rol da ans e exemplificativo");
  verdade(normalizarTese("Tese A") !== normalizarTese("Tese B"), "teses diferentes não podem colidir na normalização");
});

// ── O rol fechado saiu do caminho do usuário ──────────────────────────────────────────────────

const FONTE_WIZARD = readFileSync("components/peticionamento/WizardClient.tsx", "utf8");
const FONTE_QUESTIONARIO = readFileSync("lib/peticionamentoQuestionario.ts", "utf8");

teste("HARD GATE: NÃO existe mais rol fechado de teses em lugar nenhum — nem na tela, nem na configuração", () => {
  // `tesesSugeridas` era o rol: três teses de plano de saúde prontas para marcar. Foi removido do
  // tipo e das cinco configurações, e não sobrou uso — a varredura cobre os dois arquivos porque
  // remover só a exibição deixaria a lista viva, esperando alguém religá-la.
  verdade(!codigoDe(FONTE_QUESTIONARIO).includes("tesesSugeridas"), "o rol fechado de teses voltou à configuração do questionário");
  verdade(!codigoDe(FONTE_WIZARD).includes("tesesSugeridas"), "o rol fechado de teses voltou à tela");
  for (const categoria of CATEGORIAS_DE_PECA) {
    const cfg = obterConfiguracaoQuestionario(categoria) as unknown as Record<string, unknown>;
    verdade(!("tesesSugeridas" in cfg), `${categoria} ainda carrega um rol fechado de teses`);
  }
});

teste("as categorias que mostram teses dizem, no próprio texto da tela, que a escrita é manual", () => {
  for (const categoria of CATEGORIAS_DE_PECA) {
    const cfg = obterConfiguracaoQuestionario(categoria);
    if (!cfg.mostrarTeses) continue;
    verdade(/escreva/i.test(cfg.subTeses), `${categoria}: o texto da etapa de teses ainda não diz que é para ESCREVER`);
    verdade(!/marque/i.test(cfg.subTeses), `${categoria}: o texto da etapa de teses ainda manda MARCAR — sobrou instrução do rol fechado`);
  }
});

// ── A tela: caixa, salvar, cancelar, nova caixa abaixo ────────────────────────────────────────

teste("VARREDURA: a caixa de tese tem caixa de escrita, botão de salvar e botão de cancelar", () => {
  const corpo = corpoDaFuncao(FONTE_WIZARD, "CaixaDeTese");
  verdade(corpo.length > 400, `corpoDaFuncao("CaixaDeTese") devolveu ${corpo.length} caracteres — varredura cega`);
  verdade(/<textarea/.test(corpo), "a caixa de escrita da tese sumiu");
  verdade(/Cancelar/.test(corpo), "o botão de cancelar sumiu da caixa de tese");
  verdade(/\{rotuloSalvar\}/.test(corpo), "o botão de salvar sumiu da caixa de tese");
  verdade(corpo.includes("LIMITE_CARACTERES_TESE"), "o limite por tese precisa ser DITO na tela (contador) — limite não dito vira truncagem surpresa");
});

teste("VARREDURA: a tela usa a régua do módulo puro — nunca uma segunda versão escrita dentro do componente", () => {
  const codigo = codigoDe(FONTE_WIZARD);
  for (const funcao of ["acrescentarTese(", "editarTese(", "removerTese("]) {
    verdade(codigo.includes(funcao), `a tela deixou de usar ${funcao} — a régua estaria reescrita à mão, livre para divergir do módulo testado`);
  }
});

teste("VARREDURA: salvar uma tese faz nascer uma caixa NOVA abaixo — é o que o dono pediu", () => {
  const corpo = codigoDe(corpoDaFuncao(FONTE_WIZARD, "salvarTeseNova"));
  verdade(corpo.length > 100, `corpoDaFuncao("salvarTeseNova") devolveu ${corpo.length} caracteres — varredura cega`);
  verdade(/setVersaoDaCaixa\(\(v\) => v \+ 1\)/.test(corpo), "salvar deixou de renovar a caixa vazia do fim da lista");
  // E a recusa precisa VOLTAR para a tela: engolir o motivo faria o botão "Salvar" não fazer nada.
  verdade(/return veredito\.motivo;/.test(corpo), "a recusa precisa ser devolvida à caixa para aparecer embaixo dela");
});

teste("VARREDURA: a recusa aparece na tela sem apagar o que o advogado escreveu", () => {
  const corpo = corpoDaFuncao(FONTE_WIZARD, "CaixaDeTese");
  verdade(corpo.length > 400, "corpoDaFuncao não encontrou CaixaDeTese");
  verdade(/setRecusa\(aoSalvar\(texto\)\)/.test(corpo), "o motivo da recusa deixou de ser mostrado");
  verdade(/\{recusa && /.test(corpo), "faltou a área que exibe o motivo da recusa embaixo da caixa");
  verdade(!/setTexto\(""\)/.test(corpo), "a caixa está limpando o texto por conta própria — uma recusa apagaria o trabalho do advogado");
});

resumo("Peticionamento — teses escritas à mão, sem rol fechado (pedido do dono, 22/09/2026)");
