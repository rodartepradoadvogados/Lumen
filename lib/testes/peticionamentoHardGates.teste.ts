import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";

// ============================================================================
// VARREDURA — os hard gates da aba de Peticionamento, provados por LEITURA DO CÓDIGO, não por
// confiança em prompt. Segue a mesma disciplina de lib/testes/seteFerramentas.teste.ts: usa
// `codigoDe` (remove comentário, que citaria a trava e passaria verde sozinho) e
// `corpoDaFuncao` (isola só a função, não transborda pra vizinha) — e confere que
// `corpoDaFuncao` de fato achou algo antes de confiar no resultado.
// ============================================================================

const RAIZ = process.cwd();
const FONTE_ACOES = readFileSync(join(RAIZ, "lib", "actions", "peticionamento.ts"), "utf8");
const FONTE_LAYOUT = readFileSync(join(RAIZ, "app", "peticionamento", "layout.tsx"), "utf8");
const FONTE_PROMPT = readFileSync(join(RAIZ, "lib", "peticionamentoPrompt.ts"), "utf8");
const FONTE_DOCX = readFileSync(join(RAIZ, "lib", "peticionamentoDocx.ts"), "utf8");

// ── Nunca protocolar (especificação §3) ─────────────────────────────────────────────────────

teste("HARD GATE: nenhum arquivo da feature menciona protocolar/enviar ao tribunal/PJe automaticamente", () => {
  const arquivos = ["lib/actions/peticionamento.ts", "lib/peticionamentoPrompt.ts", "lib/peticionamentoDocx.ts", "lib/hermesPonte.ts"];
  const proibidos = /protocolarautomaticamente|enviaraotribunal|enviarpje|submeterprocesso/i;
  for (const rel of arquivos) {
    const codigo = codigoDe(readFileSync(join(RAIZ, rel), "utf8")).replace(/\s+/g, "").toLowerCase();
    verdade(!proibidos.test(codigo), `${rel} não deveria conter nenhuma rotina de protocolo automático`);
  }
});

teste("HARD GATE: o prompt ao Hermes reforça, em texto, que protocolar é sempre ato humano", () => {
  verdade(FONTE_PROMPT.includes("protocolada por você"), "o prompt deveria deixar explícito que o agente nunca protocola");
});

// ── Acesso à aba (recepção nunca entra) ──────────────────────────────────────────────────────

teste("HARD GATE: o layout da aba inteira chama podeAcessarAba antes de liberar qualquer página", () => {
  const corpo = corpoDaFuncao(FONTE_LAYOUT, "PeticionamentoLayout");
  verdade(corpo.length > 100, "corpoDaFuncao não encontrou PeticionamentoLayout — a varredura não está lendo certo");
  verdade(corpo.includes("podeAcessarAba("), "layout deveria checar podeAcessarAba antes de renderizar children");
});

teste("HARD GATE: toda Server Action de peticionamento passa por exigirAcessoAba antes de tocar o banco", () => {
  // Cada função exportada precisa citar exigirAcessoAba() dentro do PRÓPRIO corpo — procurado
  // função por função, não a mera presença da string no arquivo inteiro (que um helper
  // interno chamado uma vez satisfaria mesmo se outra ação esquecesse de chamá-lo).
  const nomes = Array.from(FONTE_ACOES.matchAll(/export async function (\w+)\(/g)).map((m) => m[1]);
  verdade(nomes.length >= 15, `só ${nomes.length} ações encontradas — a varredura não está lendo certo`);
  const semTrava: string[] = [];
  for (const nome of nomes) {
    const corpo = corpoDaFuncao(FONTE_ACOES, nome);
    if (corpo.length < 20) {
      semTrava.push(`${nome} (corpoDaFuncao não achou nada)`);
      continue;
    }
    if (!codigoDe(corpo).includes("exigirAcessoAba(")) semTrava.push(nome);
  }
  igual(semTrava, [], "ações SEM a checagem de acesso: ");
});

// ── O mínimo (fatos + pedidos) trava a geração de verdade ────────────────────────────────────

teste("HARD GATE: confirmarTriagemEGerar recusa gerar sem o mínimo, ANTES de chamar o Hermes", () => {
  const corpo = codigoDe(corpoDaFuncao(FONTE_ACOES, "confirmarTriagemEGerar"));
  verdade(corpo.length > 200, "corpoDaFuncao não encontrou confirmarTriagemEGerar");
  const idxProntidao = corpo.indexOf("avaliarProntidao(");
  const idxHermes = corpo.indexOf("perguntarAoHermesComPerfil(");
  verdade(idxProntidao !== -1, "deveria chamar avaliarProntidao");
  verdade(idxHermes !== -1, "deveria chamar perguntarAoHermesComPerfil");
  verdade(idxProntidao < idxHermes, "a checagem de mínimo precisa vir ANTES da chamada ao Hermes, não depois");
});

// ── Fecho garantido em dois pontos (defesa em profundidade) ──────────────────────────────────

teste("HARD GATE: o fecho é garantido tanto na geração quanto na exportação (nunca confiado a um só ponto)", () => {
  const geracao = codigoDe(corpoDaFuncao(FONTE_ACOES, "confirmarTriagemEGerar"));
  const edicao = codigoDe(corpoDaFuncao(FONTE_ACOES, "atualizarCorpoDaMinuta"));
  const exportacao = codigoDe(corpoDaFuncao(FONTE_ACOES, "confirmarExportacao"));
  verdade(geracao.includes("garantirFecho("), "geração deveria garantir o fecho");
  verdade(edicao.includes("garantirFecho("), "edição manual deveria reconferir o fecho");
  verdade(exportacao.includes("garantirFecho("), "exportação deveria reconferir o fecho de novo, por segurança");
});

// ── Nota de riscos nunca entra sem passar pelo filtro "aponta, não decide" ───────────────────

teste("HARD GATE: a nota de riscos é sempre filtrada antes de ser gravada", () => {
  const corpo = codigoDe(corpoDaFuncao(FONTE_ACOES, "confirmarTriagemEGerar"));
  const idxFiltro = corpo.indexOf("filtrarNotaDeRiscos(");
  const idxGravar = corpo.indexOf("notaRiscos: riscosComAviso");
  verdade(idxFiltro !== -1, "deveria chamar filtrarNotaDeRiscos");
  verdade(idxGravar !== -1, "deveria gravar a versão filtrada (riscosComAviso), nunca a bruta");
  verdade(idxFiltro < idxGravar, "o filtro precisa rodar ANTES de gravar");
});

// ── Exportação: OAB + checkbox, sempre os dois, sempre no servidor ───────────────────────────

teste("HARD GATE: confirmarExportacao recusa sem avaliarExportacao().pode, e recusa sem o checkbox", () => {
  const corpo = codigoDe(corpoDaFuncao(FONTE_ACOES, "confirmarExportacao"));
  verdade(corpo.length > 300, "corpoDaFuncao não encontrou confirmarExportacao");
  verdade(corpo.includes("avaliarExportacao("), "deveria checar avaliarExportacao (só advogado com OAB)");
  verdade(corpo.includes("if (!confirmouCheckbox)"), "deveria recusar explicitamente quando o checkbox não foi marcado");
  const idxAvaliacao = corpo.indexOf("avaliarExportacao(");
  const idxDocx = corpo.indexOf("montarPeticaoWord(");
  verdade(idxAvaliacao !== -1 && idxDocx !== -1 && idxAvaliacao < idxDocx, "a checagem de OAB precisa vir ANTES de montar o arquivo");
});

teste("HARD GATE: a nota de destaque obrigatória é sempre montada antes de gerar o .docx exportado — nunca pode sumir", () => {
  const corpo = codigoDe(corpoDaFuncao(FONTE_ACOES, "confirmarExportacao"));
  verdade(corpo.length > 300, "corpoDaFuncao não encontrou confirmarExportacao");
  verdade(corpo.includes("montarNotaObrigatoria("), "deveria montar a nota obrigatória");
  verdade(corpo.includes("notaObrigatoriaTexto: notaObrigatoria"), "deveria passar a nota obrigatória montada para o .docx, nunca uma string vazia/omitida");
});

teste("HARD GATE: toda exportação registra quem confirmou e quando (PeticionamentoExportacao)", () => {
  const corpo = codigoDe(corpoDaFuncao(FONTE_ACOES, "confirmarExportacao"));
  verdade(corpo.includes("peticionamentoExportacao.create("), "deveria criar o registro de auditoria da exportação");
  verdade(corpo.includes("confirmadoPorId: user.id"), "o registro precisa gravar QUEM confirmou");
});

teste("HARD GATE: o metadado de rascunho de IA é sempre passado ao gerar o .docx", () => {
  const corpo = codigoDe(corpoDaFuncao(FONTE_ACOES, "confirmarExportacao"));
  verdade(/montarPeticaoWord\(\s*\{/.test(corpo), "deveria chamar montarPeticaoWord");
  verdade(corpo.includes("confirmadoPorNome: user.name"), "metadado deveria incluir quem confirmou");
  const chamaMetadados = codigoDe(FONTE_DOCX).includes("acrescentarMetadados(zip, meta)");
  verdade(chamaMetadados, "montarPeticaoWord deveria sempre acrescentar os metadados obrigatórios");
});

// ── Clientes diferentes nunca se misturam ────────────────────────────────────────────────────

teste("HARD GATE: alternarVinculo valida o cliente ANTES de gravar qualquer vínculo novo", () => {
  const corpo = codigoDe(corpoDaFuncao(FONTE_ACOES, "alternarVinculo"));
  verdade(corpo.includes("validarNovoVinculo("), "deveria chamar validarNovoVinculo");
  const idxValidacao = corpo.indexOf("validarNovoVinculo(");
  const idxUpdate = corpo.lastIndexOf("prisma.peticionamentoSessao.update(");
  verdade(idxValidacao !== -1 && idxUpdate !== -1 && idxValidacao < idxUpdate, "a validação precisa vir ANTES da gravação do vínculo");
});

resumo("Peticionamento — varredura dos hard gates");
