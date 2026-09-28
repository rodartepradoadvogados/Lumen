import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";

// ISOLAMENTO ENTRE ESCRITÓRIOS na aba de Peticionamento.
//
// Por que este arquivo existe: a primeira entrega do módulo passou com as 45 suítes verdes, e
// mesmo assim uma mutação deliberada — TIRAR o `officeId` do `where` de `carregarSessaoOuFalhar`,
// deixando a busca só por `id` — continuou verde. Nenhum teste cobria o corte por escritório nas
// ações de peticionamento. Num SaaS jurídico esse é o defeito mais caro que existe: uma minuta,
// um anexo e o resumo da triagem de OUTRO escritório ficariam legíveis para quem tivesse o id.
//
// O código estava certo; o teste é que não existia. Aqui ele passa a existir.
//
// A régua é estrutural (varredura de código) porque o módulo é camada de IO: não há prisma
// falso na casa, e inventar um só para este arquivo esconderia mais do que provaria. A varredura
// DERIVA a lista de ações do próprio arquivo — nunca de uma lista escrita à mão aqui — para que
// uma ação NOVA, adicionada amanhã sem a trava, caia em vermelho sozinha.

const RAIZ = process.cwd();
const FONTE = readFileSync(join(RAIZ, "lib", "actions", "peticionamento.ts"), "utf8");
const CODIGO = codigoDe(FONTE);

const GUARDA = "carregarSessaoOuFalhar";

/** Toda função do arquivo cujo PRIMEIRO parâmetro é `sessaoId` — a própria guarda fora. */
function acoesQueRecebemSessaoId(): string[] {
  const nomes = [...CODIGO.matchAll(/(?:export\s+)?async function (\w+)\(\s*sessaoId: string/g)].map((m) => m[1]);
  return nomes.filter((n) => n !== GUARDA);
}

teste("a varredura encontra as ações de sessão — uma lista vazia passaria verde sem provar nada", () => {
  const acoes = acoesQueRecebemSessaoId();
  verdade(acoes.length >= 10, `só ${acoes.length} ação(ões) com sessaoId encontradas: ${acoes.join(", ")}`);
  // Âncoras: se alguma destas desaparecer da varredura, é a varredura que quebrou, não o código.
  // ADAPTADA 22/09/2026: "definirMateria" virou "definirMaterias" quando o dono pediu para poder
  // marcar mais de uma matéria — a âncora existe para provar que a VARREDURA acha as ações, e
  // apontar para um nome que não existe mais a faria acusar quebra da varredura em vez de quebra
  // do código. "excluirRascunho" e "buscarContextoParaVincular" entram como âncoras novas: são as
  // duas ações desta entrega que recebem sessaoId, e é exatamente delas que a trava é cobrada.
  for (const esperada of ["definirMaterias", "excluirRascunho", "buscarContextoParaVincular", "alternarVinculo", "salvarWizard", "confirmarTriagemEGerar", "confirmarExportacao", "atualizarCorpoDaMinuta"]) {
    verdade(acoes.includes(esperada), `a varredura não achou "${esperada}"`);
  }
});

teste("TRAVA: a guarda de sessão filtra por officeId — não só por id", () => {
  const corpo = corpoDaFuncao(FONTE, GUARDA);
  verdade(corpo.length > 80, `corpoDaFuncao("${GUARDA}") devolveu ${corpo.length} caracteres`);
  const semComentario = codigoDe(corpo);
  verdade(/findFirst\(\{\s*where:\s*\{\s*id:\s*sessaoId,\s*officeId\s*\}/.test(semComentario),
    "o where da guarda deixou de exigir { id, officeId } — sessão de outro escritório passa a ser legível");
  verdade(semComentario.includes("throw"), "a guarda precisa ESTOURAR quando não acha — devolver null deixaria o chamador seguir com sessão inexistente");
});

teste("TRAVA: toda ação que recebe sessaoId chama a guarda ANTES de qualquer prisma", () => {
  for (const nome of acoesQueRecebemSessaoId()) {
    const corpo = corpoDaFuncao(FONTE, nome);
    // Sem este piso, um corpoDaFuncao que devolvesse "" (ou só a lista de parâmetros) faria as
    // duas checagens abaixo procurarem em nada e passarem verdes com o defeito instalado.
    verdade(corpo.length > 120, `corpoDaFuncao("${nome}") devolveu ${corpo.length} caracteres — varredura cega`);
    const c = codigoDe(corpo);
    const posGuarda = c.indexOf(`${GUARDA}(`);
    verdade(posGuarda >= 0, `"${nome}" não chama ${GUARDA} — id vindo do cliente sem reconferir escritório`);
    const posPrisma = c.indexOf("prisma.");
    if (posPrisma >= 0) {
      verdade(posGuarda < posPrisma,
        `"${nome}" toca o banco antes de conferir o escritório (guarda em ${posGuarda}, prisma em ${posPrisma})`);
    }
  }
});

teste("TRAVA: toda ação que recebe sessaoId exige acesso à aba antes da guarda", () => {
  for (const nome of acoesQueRecebemSessaoId()) {
    const c = codigoDe(corpoDaFuncao(FONTE, nome));
    if (!c.includes("exigirAcessoAba")) {
      // `descricaoDoContexto` é interna e recebe o officeId já conferido por quem a chamou.
      verdade(c.includes("officeId") && !c.includes("getCurrentUser"),
        `"${nome}" não exige acesso à aba e também não recebe officeId conferido de fora`);
      continue;
    }
    verdade(c.indexOf("exigirAcessoAba") < c.indexOf(`${GUARDA}(`),
      `"${nome}" carrega a sessão antes de checar o papel de quem pediu`);
  }
});

// REMOVIDA 23/09/2026: a ação `marcarConversaoMarkdown` (que entrava por anexoId, não por
// sessaoId, e por isso tinha teste próprio aqui) saiu de código por decisão do dono — o botão de
// converter para Markdown nunca convertia nada de verdade. Ver
// lib/testes/peticionamentoDocumentos.teste.ts, "guarda contra reintrodução", para a prova de que
// ela não voltou ao código nem à tela.

// ── AS TABELAS COMPARTILHADAS ────────────────────────────────────────────────────────────────
// peticionamentoAnexo e peticionamentoExportacao pendem de uma sessão já conferida, então ali o
// corte por sessaoId basta. Estas outras tabelas são do escritório inteiro: uma consulta sem
// officeId nelas vaza processo, atendimento, assessoria, documento e timbrado alheios.
// "licitacao" e "parecer" entraram em 22/09/2026 com a busca por tipo (item 3 do pedido do dono):
// procurar uma licitação ou uma demanda passa por essas duas tabelas, que são do ESCRITÓRIO
// inteiro — uma consulta sem officeId nelas mostraria a licitação e o parecer de outro escritório
// na caixa de busca, com o nome da empresa junto. "assessoriaDocumento" entrou em 23/09/2026 com
// o conserto do item 1 (documentos de assessoria por demanda): listarDocumentosDoVinculo passou a
// consultar essa tabela também, e ela é do escritório inteiro do mesmo jeito que as outras.
const MODELOS_DE_ESCRITORIO = ["case", "attendance", "assessoria", "attachment", "peticionamentoMateria", "office", "licitacao", "parecer", "assessoriaDocumento"];

/**
 * O TRECHO DA PRÓPRIA CHAMADA: do `(` que abre até o `)` que o fecha, contando parênteses e
 * chaves. A primeira versão desta varredura usava "600 caracteres ou até o próximo prisma.", e a
 * mutação que tirava o officeId de `prisma.attachment.findMany` PASSOU VERDE: a janela escorregava
 * para a função vizinha, onde havia um `user.officeId` que não tinha nada a ver com a consulta.
 */
function trechoDaChamada(fonte: string, posDoAbreParenteses: number): string {
  let profundidade = 0;
  for (let i = posDoAbreParenteses; i < fonte.length; i++) {
    const ch = fonte[i];
    if (ch === "(" || ch === "{" || ch === "[") profundidade++;
    else if (ch === ")" || ch === "}" || ch === "]") {
      profundidade--;
      if (profundidade === 0) return fonte.slice(posDoAbreParenteses, i + 1);
    }
  }
  return "";
}

teste("TRAVA: toda consulta a tabela de escritório carrega officeId — no argumento DELA, não do vizinho", () => {
  let conferidas = 0;
  for (const modelo of MODELOS_DE_ESCRITORIO) {
    const re = new RegExp(`prisma\\.${modelo}\\.(findMany|findFirst|findUnique|update|updateMany|create|count)\\(`, "g");
    for (const m of [...CODIGO.matchAll(re)]) {
      const abre = m.index! + m[0].length - 1;
      const trecho = trechoDaChamada(CODIGO, abre);
      verdade(trecho.length > 20, `não deu para delimitar o argumento de prisma.${modelo}.${m[1]} — varredura cega`);
      verdade(trecho.includes("officeId"),
        `prisma.${modelo}.${m[1]} sem officeId no corte: ${trecho.slice(0, 140).replace(/\s+/g, " ")}`);
      conferidas++;
    }
  }
  verdade(conferidas >= 10, `só ${conferidas} consulta(s) conferida(s) — a varredura não está achando o que deveria`);
});

teste("a sessão nasce amarrada ao escritório de quem criou, nunca a um officeId vindo do cliente", () => {
  const c = codigoDe(corpoDaFuncao(FONTE, "criarSessaoPeticionamento"));
  verdade(c.length > 100, "varredura cega em criarSessaoPeticionamento");
  verdade(c.includes("officeId: user.officeId"), "a criação deixou de amarrar a sessão ao escritório do usuário");
  // Contar em vez de usar lookahead: `/officeId:\s*(?!user\.officeId)/` casa no espaço depois dos
  // dois-pontos (o `\s*` recua para zero) e acusa falso positivo em `officeId: user.officeId`.
  const todas = (c.match(/officeId:/g) ?? []).length;
  const doUsuario = (c.match(/officeId: user\.officeId/g) ?? []).length;
  igual(todas, doUsuario);
});

resumo("Peticionamento — isolamento entre escritórios");
