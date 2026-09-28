import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";
import { MATERIAS_DO_LUMEN, ehMateriaDoLumen, validarNovaMateria, lerMateriasDaSessao, materiaPrincipalDaSessao, normalizarSelecaoDeMaterias } from "@/lib/peticionamentoMateria";

// Decisão do dono (decisions.md §9 item 4): matéria nova vale SÓ para aquele escritório, nunca
// vira opção global. Este módulo só valida o NOME — a trava de "só este escritório" mora no
// schema (PeticionamentoMateria.officeId), verificada pela Server Action, não aqui.

teste("matérias do Lúmen incluem Direito Médico e Saúde Suplementar (exemplo dos mockups)", () => {
  igual(ehMateriaDoLumen("Direito Médico e Saúde Suplementar"), true);
  igual(ehMateriaDoLumen("Direito Agrário"), false);
});

teste("nome vazio é recusado", () => {
  igual(validarNovaMateria("   ", []).ok, false);
});

teste("nome longo demais é recusado", () => {
  igual(validarNovaMateria("x".repeat(61), []).ok, false);
});

teste("HARD GATE-adjacente: não permite cadastrar de novo uma matéria que já é do Lúmen", () => {
  const r = validarNovaMateria("Cível", []);
  igual(r.ok, false);
});

teste("não permite duplicar matéria já cadastrada pelo MESMO escritório (case-insensitive)", () => {
  const r = validarNovaMateria("direito agrário", ["Direito Agrário"]);
  igual(r.ok, false);
});

teste("nome novo, válido, dentro do escritório: aceito e normalizado (trim)", () => {
  const r = validarNovaMateria("  Direito Desportivo  ", ["Direito Agrário"]);
  igual(r.ok, true);
  if (r.ok) igual(r.nomeNormalizado, "Direito Desportivo");
});

teste("lista global tem 8 itens fixos (contrato visual dos mockups)", () => {
  igual(MATERIAS_DO_LUMEN.length, 8);
});

// ── MAIS DE UMA MATÉRIA (pedido do dono, 22/09/2026) ─────────────────────────────────────────
// A regra que o schema escreve por extenso (PeticionamentoSessao.materiasNomes): a sessão ANTIGA
// — materiasNomes vazia, materiaNome preenchida — tem de ser lida como "uma matéria só", sem
// passo de migração nenhum. Se esta leitura falhar, toda sessão criada antes desta entrega
// aparece na tela SEM matéria, e o advogado conclui que o rascunho dele foi corrompido.

teste("sessão ANTIGA (materiasNomes vazia, materiaNome preenchida) é lida como uma matéria só — sem migração", () => {
  igual(lerMateriasDaSessao([], "Sucessões"), ["Sucessões"]);
  igual(materiaPrincipalDaSessao([], "Sucessões"), "Sucessões");
});

teste("sessão antiga com materiasNomes NULO (coluna Json nunca escrita) também é lida — nunca estoura", () => {
  igual(lerMateriasDaSessao(null, "Cível"), ["Cível"]);
  igual(lerMateriasDaSessao(undefined, "Cível"), ["Cível"]);
});

teste("sessão NOVA: a lista manda, e a principal é a primeira dela", () => {
  igual(lerMateriasDaSessao(["Sucessões", "Tributário"], "Sucessões"), ["Sucessões", "Tributário"]);
  igual(materiaPrincipalDaSessao(["Sucessões", "Tributário"], "Sucessões"), "Sucessões");
});

teste("sessão sem matéria nenhuma: lista vazia e principal nula — nunca [\"\"] nem [null]", () => {
  igual(lerMateriasDaSessao([], null), []);
  igual(lerMateriasDaSessao(null, "   "), []);
  igual(materiaPrincipalDaSessao(null, null), null);
});

teste("lixo gravado na coluna Json não derruba a leitura — só o que é texto de verdade sobrevive", () => {
  igual(lerMateriasDaSessao(["Cível", 7, null, "  ", "Família"], "Cível"), ["Cível", "Família"]);
  igual(lerMateriasDaSessao("Cível", "Família"), ["Família"]);
});

teste("normalizar seleção: tira vazio, tira repetida (ignorando caixa) e PRESERVA a ordem de marcação", () => {
  const r = normalizarSelecaoDeMaterias([
    { nome: " Sucessões ", ehDoEscritorio: false },
    { nome: "", ehDoEscritorio: false },
    { nome: "sucessões", ehDoEscritorio: true },
    { nome: "Tributário", ehDoEscritorio: false },
  ]);
  igual(r, [
    { nome: "Sucessões", ehDoEscritorio: false },
    { nome: "Tributário", ehDoEscritorio: false },
  ]);
});

teste("a PRIMEIRA marcada é a principal — trocar a ordem troca a principal, e é isso que vai para materiaNome", () => {
  const r = normalizarSelecaoDeMaterias([
    { nome: "Tributário", ehDoEscritorio: false },
    { nome: "Sucessões", ehDoEscritorio: false },
  ]);
  igual(r[0].nome, "Tributário");
});

// ── A GRAVAÇÃO DOS DOIS CAMPOS JUNTOS ────────────────────────────────────────────────────────
// Onde a garantia MORA: o contrato do schema não é sobre a função pura acima, é sobre a ESCRITA.
// "Quem escrever precisa manter os dois em pé ao mesmo tempo, sempre: gravar a lista e gravar a
// primeira em materiaNome, na MESMA transação." Um `update` só é um statement só — dois updates
// em sequência deixariam a sessão, no meio, com a lista nova e a principal velha. Varredura de
// código porque isto é camada de IO (não há prisma falso nesta casa — mesma justificativa de
// lib/testes/peticionamentoIsolamento.teste.ts).

const ACOES = readFileSync(join(process.cwd(), "lib", "actions", "peticionamento.ts"), "utf8");

teste("TRAVA: definirMaterias grava materiasNomes E materiaNome — nunca só um dos dois", () => {
  const corpo = codigoDe(corpoDaFuncao(ACOES, "definirMaterias"));
  verdade(corpo.length > 200, `corpoDaFuncao("definirMaterias") devolveu ${corpo.length} caracteres — varredura cega`);
  verdade(corpo.includes("materiasNomes:"), "definirMaterias parou de gravar a lista completa");
  verdade(corpo.includes("materiaNome:"), "definirMaterias parou de gravar a matéria principal — a lista de rascunhos e o passo 'contexto' leem ESTE campo");
});

teste("TRAVA: os dois campos vão num ÚNICO update — dois updates não são a mesma transação", () => {
  const corpo = codigoDe(corpoDaFuncao(ACOES, "definirMaterias"));
  verdade(corpo.length > 200, "varredura cega em definirMaterias");
  const updates = (corpo.match(/prisma\.peticionamentoSessao\.update/g) ?? []).length;
  igual(updates, 1, "definirMaterias deveria gravar tudo num update só: ");
});

teste("TRAVA: a principal gravada é a PRIMEIRA da lista normalizada, nunca um nome solto vindo da tela", () => {
  const corpo = codigoDe(corpoDaFuncao(ACOES, "definirMaterias"));
  verdade(corpo.includes("normalizarSelecaoDeMaterias"), "definirMaterias deixou de normalizar a seleção — repetida e vazia entrariam no banco");
  verdade(/materias\[0\]/.test(corpo), "a principal deixou de ser a primeira da lista");
});

resumo("Peticionamento — matéria do Lúmen x matéria do escritório");
