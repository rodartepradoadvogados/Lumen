import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";
import { avaliarSaidaDaPeca } from "@/lib/peticionamentoAprovacao";

// ============================================================================
// ETAPA C DO EDITOR DE MINUTA — A APROVAÇÃO LIBERA A PEÇA.
//
// Exportar para Word, exportar para PDF (opção nova) e imprimir só ficam disponíveis DEPOIS que o
// advogado aprova a minuta. Antes, os três ficam bloqueados dizendo o que falta. A trava de
// citação pendente continua valendo, INDEPENDENTE da aprovação: as duas são exigidas.
//
// O que se prova, na ordem da gravidade:
//   1. a régua pura (avaliarSaidaDaPeca) — as duas travas, cada uma sozinha bloqueando;
//   2. o SERVIDOR obedece a régua antes de qualquer arquivo ou registro — Word e PDF na mesma ação,
//      impressão numa conferência própria;
//   3. a tela: os três botões (e "Visualizar impressão") presos à mesma régua, a aprovação caindo
//      na primeira tecla, e o botão de aprovar existindo mesmo sem citação nenhuma.
// ============================================================================

const RAIZ = process.cwd();
const ler = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf8");
const ACOES = ler("lib", "actions", "peticionamento.ts");

// ── 1. A RÉGUA ──────────────────────────────────────────────────────────────────────────────

teste("MUTAÇÃO PRINCIPAL: sem aprovação a peça NÃO sai, mesmo com todas as citações confirmadas", () => {
  const r = avaliarSaidaDaPeca({ aprovada: false, citacoesPendentes: 0 });
  igual(r.liberada, false, "saída liberada sem aprovação: ");
  verdade(r.motivos.some((m) => /aprova/i.test(m)), `o motivo não diz que falta aprovar (${r.motivos.join(" | ")})`);
});

teste("aprovada e sem citação pendente: liberada, sem motivo nenhum", () => {
  igual(avaliarSaidaDaPeca({ aprovada: true, citacoesPendentes: 0 }), { liberada: true, motivos: [] });
});

teste("a trava de citação é INDEPENDENTE: aprovada com citação pendente continua bloqueada", () => {
  const r = avaliarSaidaDaPeca({ aprovada: true, citacoesPendentes: 2 });
  igual(r.liberada, false, "a aprovação passou por cima da citação pendente: ");
  verdade(r.motivos.some((m) => /2\s+cita/.test(m)), `o motivo não diz quantas citações faltam (${r.motivos.join(" | ")})`);
});

teste("faltando as duas coisas, a tela diz as duas", () => {
  igual(avaliarSaidaDaPeca({ aprovada: false, citacoesPendentes: 1 }).motivos.length, 2);
});

teste("citações ainda não conferidas (null) travam — 'não sei' não é 'zero'", () => {
  igual(avaliarSaidaDaPeca({ aprovada: true, citacoesPendentes: null }).liberada, false);
});

// ── 2. O SERVIDOR ───────────────────────────────────────────────────────────────────────────

const EXPORTAR = codigoDe(corpoDaFuncao(ACOES, "confirmarExportacao"));

teste("a varredura achou confirmarExportacao inteira (e não transbordou para a vizinha)", () => {
  verdade(EXPORTAR.length > 1500, `confirmarExportacao com ${EXPORTAR.length} caracteres — a varredura está cega`);
  verdade(!EXPORTAR.includes("export async function conferirSaidaDaPeca"), "o trecho transbordou para conferirSaidaDaPeca");
});

teste("HARD GATE 4: a exportação confere a APROVAÇÃO no servidor, e a recusa DESVIA antes do Word e do PDF", () => {
  const iRegua = EXPORTAR.search(/avaliarSaidaDaPeca\(\s*\{\s*aprovada:\s*Boolean\(\s*sessao\.minutaAprovadaEm\s*\)/);
  verdade(iRegua >= 0, "confirmarExportacao não passa a aprovação gravada (sessao.minutaAprovadaEm) pela régua de saída");
  const iRecusa = EXPORTAR.search(/if\s*\(\s*!saida\.liberada\s*\)\s*\{?\s*return\s*\{\s*error/);
  verdade(iRecusa > iRegua, "o veredito da régua de saída não DESVIA a execução — calcular não é obedecer");
  const iPdf = EXPORTAR.search(/if\s*\(\s*formato\s*===\s*"pdf"\s*\)/);
  const iWord = EXPORTAR.indexOf("montarPeticaoWord(");
  const iRegistro = EXPORTAR.indexOf("peticionamentoExportacao.create(");
  verdade(iPdf > iRecusa, "o ramo do PDF vem antes da trava de aprovação — PDF sairia sem aprovar");
  verdade(iWord > iRecusa, "o Word é montado antes da trava de aprovação");
  verdade(iRegistro > iRecusa, "há registro de exportação antes da trava de aprovação");
});

teste("a trava de citação pendente continua na exportação, antes da de aprovação e do arquivo", () => {
  const iContagem = EXPORTAR.search(/peticionamentoCitacao\.count\(\s*\{\s*where:\s*\{\s*sessaoId,\s*confirmadaPorId:\s*null,\s*excluidaEm:\s*null/);
  const iRecusaCitacao = EXPORTAR.search(/if\s*\(\s*citacoesPendentes\s*>\s*0\s*\)/);
  const iRegua = EXPORTAR.indexOf("avaliarSaidaDaPeca(");
  verdade(iContagem >= 0 && iRecusaCitacao > iContagem && iRegua > iRecusaCitacao,
    "a trava de citação pendente saiu da exportação ou mudou de lugar — ela é exigida À PARTE da aprovação");
});

teste("o PDF passa pelas MESMAS travas do Word (OAB e ciência vêm antes do ramo) e deixa registro de auditoria", () => {
  const iPdf = EXPORTAR.search(/if\s*\(\s*formato\s*===\s*"pdf"\s*\)/);
  verdade(iPdf > EXPORTAR.indexOf("if (!avaliacao.pode)") && iPdf > EXPORTAR.indexOf("if (!confirmouCheckbox)"),
    "o ramo do PDF pula a trava de OAB ou a de ciência");
  const ramo = EXPORTAR.slice(iPdf, EXPORTAR.indexOf("\n  }", iPdf));
  verdade(/peticionamentoExportacao\.create\(/.test(ramo) && /confirmadoPorId:\s*user\.id/.test(ramo), "exportar em PDF não registra quem confirmou");
  verdade(!ramo.includes("montarPeticaoWord("), "o ramo do PDF monta um .docx — ele deveria só registrar e devolver");
});

teste("imprimir tem conferência própria no servidor, com as mesmas travas", () => {
  const corpo = codigoDe(corpoDaFuncao(ACOES, "conferirSaidaDaPeca"));
  verdade(corpo.length > 200, "conferirSaidaDaPeca não existe");
  verdade(corpo.includes("exigirAcessoAba()"), "sem a trava de acesso à aba");
  verdade(/carregarSessaoOuFalhar\(\s*sessaoId\s*,\s*user\.officeId\s*\)/.test(corpo), "não reconfere a sessão contra o escritório de quem pediu");
  verdade(/if\s*\(\s*!avaliacao\.pode\s*\)\s*return/.test(corpo), "imprimir não exige advogado com OAB, como exportar exige");
  verdade(/aprovada:\s*Boolean\(\s*sessao\.minutaAprovadaEm\s*\)/.test(corpo), "imprimir não confere a aprovação gravada");
  verdade(/citacoesPendentes/.test(corpo) && /peticionamentoCitacao\.count\(/.test(corpo), "imprimir não confere a citação pendente");
  verdade(/if\s*\(\s*!saida\.liberada\s*\)\s*return/.test(corpo), "a conferência de impressão calcula e não obedece");
  verdade(!/\.(create|update|updateMany|upsert|delete)\(/.test(corpo), "conferir a impressão passou a gravar alguma coisa");
});

// ── 3. A TELA ───────────────────────────────────────────────────────────────────────────────

const CLIENTE = codigoDe(ler("components", "peticionamento", "MinutaClient.tsx"));

/** A tag <button ...> que contém o rótulo — lida por contagem de chaves, não por janela fixa. */
function botaoDoRotulo(fonte: string, rotulo: string): string {
  const iRotulo = fonte.indexOf(`${rotulo}\n`) >= 0 ? fonte.indexOf(`${rotulo}\n`) : fonte.indexOf(rotulo);
  const i = fonte.lastIndexOf("<button", iRotulo);
  if (i < 0 || iRotulo < 0) return "";
  let nivel = 0;
  for (let j = i; j < fonte.length; j++) {
    if (fonte[j] === "{") nivel++;
    else if (fonte[j] === "}") nivel--;
    else if (fonte[j] === ">" && nivel === 0) return fonte.slice(i, j + 1);
  }
  return "";
}

teste("os quatro botões de saída (Word, PDF, Imprimir, Visualizar impressão) obedecem a régua", () => {
  verdade(/const saida = avaliarSaidaDaPeca\(\s*\{\s*aprovada,\s*citacoesPendentes\s*\}\s*\)/.test(CLIENTE), "a tela não calcula a saída pela régua única");
  for (const rotulo of ["Exportar para Word", "Exportar para PDF", "Imprimir", "Visualizar impressão"]) {
    const tag = botaoDoRotulo(CLIENTE, rotulo);
    verdade(tag.length > 0 && tag.length < 900, `não achei (ou transbordou) o botão "${rotulo}" (${tag.length})`);
    verdade(/disabled=\{\s*!saida\.liberada\s*\}/.test(tag), `o botão "${rotulo}" não fica bloqueado antes da aprovação`);
  }
});

teste("bloqueado, a tela diz O QUE falta — lista os motivos da régua", () => {
  verdade(/!saida\.liberada\s*&&/.test(CLIENTE) && /saida\.motivos\.map\(/.test(CLIENTE), "a tela bloqueia sem dizer o que falta");
});

teste("imprimir só abre o diálogo depois da conferência do servidor", () => {
  const corpo = CLIENTE.slice(CLIENTE.indexOf("async function imprimirSeLiberada"), CLIENTE.indexOf("async function imprimirSeLiberada") + 600);
  const iConfere = corpo.indexOf("conferirSaidaDaPeca(");
  const iRecusa = corpo.search(/if\s*\(\s*"error" in r\s*\)/);
  const iImprime = corpo.indexOf("setImprimir(true)");
  verdade(iConfere >= 0 && iRecusa > iConfere && iImprime > iRecusa, "o pedido de impressão não espera a conferência do servidor");
});

teste("a PRIMEIRA TECLA derruba a aprovação na tela — não 700 ms depois, quando grava", () => {
  const efeito = CLIENTE.slice(CLIENTE.indexOf("if (corpo === htmlInicial) return;"), CLIENTE.indexOf("atualizarCorpoDaMinuta(sessaoId, corpo)"));
  verdade(efeito.includes("setAprovada(false)"), "editar não derruba a aprovação local antes da gravação — a janela de 700 ms deixaria imprimir texto não aprovado");
  verdade(/onAprovacaoMudou=\{\s*setAprovada\s*\}/.test(CLIENTE), "a aprovação dada no quadro de citações não chega à tela");
});

teste("as folhas de impressão só existem com a peça liberada", () => {
  const previa = codigoDe(ler("components", "peticionamento", "PreviaDaFolha.tsx"));
  verdade(/imprimivel\s*&&\s*\n?\s*createPortal\(/.test(previa), "o portal de impressão existe sem a peça liberada");
  verdade(/if\s*\(\s*!imprimir\s*\|\|\s*!imprimivel/.test(previa), "o diálogo de impressão abre sem a peça liberada");
  verdade(/imprimivel=\{\s*saida\.liberada\s*\}/.test(CLIENTE), "a tela não passa a trava para a prévia");
});

teste("o botão de aprovar existe mesmo quando a minuta não tem citação nenhuma", () => {
  const fonte = codigoDe(ler("components", "peticionamento", "CitacoesClient.tsx"));
  const iVazio = fonte.indexOf("nada para revisar aqui");
  verdade(iVazio > 0, "não achei o estado sem citações");
  const retornoVazio = fonte.slice(iVazio, fonte.indexOf(");", iVazio));
  verdade(retornoVazio.includes("{blocoDeAprovacao}"), "sem citação, a tela não oferece aprovar — e sem aprovar a peça nunca sairia");
  verdade(/Aprovar minuta \/ gerar peça/.test(fonte.slice(fonte.indexOf("const blocoDeAprovacao"))), "o bloco de aprovação perdeu o botão");
});

resumo("Peticionamento — etapa C: a aprovação libera Word, PDF e impressão");
