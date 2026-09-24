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

const CITACOES_CLIENTE = ler("components", "peticionamento", "CitacoesClient.tsx");

// ── 0. QUEM PODE APROVAR ────────────────────────────────────────────────────────────────────
//
// Achado da revisão de 24/09/2026, depois que a etapa C entrou. `aprovarMinutaGerarPeca` conferia
// só `exigirAcessoAba()`, e `podeAcessarAba` admite ESTAGIÁRIO. A especificação §4, escrita no topo
// de lib/peticionamentoAcesso.ts, diz o contrário: "Aprovar/exportar (TRAVA REAL): só advogado com
// OAB". Consequências, em cadeia: o estagiário aprovava; `minutaAprovadaPorId` gravava o nome dele
// como quem assumiu uma peça que vai ao juízo; e a aprovação DESTRAVAVA a saída — que desde
// 24/09 não exige mais OAB para imprimir. Aprovar era a última porta, e estava destrancada.

teste("HARD GATE: aprovar a minuta exige advogado com OAB, e a recusa DESVIA antes de gravar", () => {
  const corpo = codigoDe(corpoDaFuncao(ACOES, "aprovarMinutaGerarPeca"));
  verdade(corpo.length > 200, "aprovarMinutaGerarPeca não existe");
  const iRegua = corpo.search(/avaliarExportacao\(\s*user\s*\)/);
  verdade(iRegua >= 0, "aprovar não consulta avaliarExportacao — estagiário volta a aprovar peça");
  const iRecusa = corpo.search(/if\s*\(\s*!\w+\.pode\s*\)\s*return\s*\{\s*error/);
  verdade(iRecusa > iRegua, "o veredito de papel não DESVIA a execução — calcular não é obedecer");
  const iGrava = corpo.indexOf("minutaAprovadaEm:");
  verdade(iGrava > iRecusa, "a aprovação é gravada antes da trava de papel");
});

teste("a tela diz o motivo ANTES do clique, em vez de ensinar o limite por rejeição", () => {
  verdade(/papelPodeAprovar/.test(CITACOES_CLIENTE), "o quadro de citações não recebe a avaliação de papel");
  // ÂNCORA DENTRO DO BOTÃO, e não o rótulo: "Aprovar minuta / gerar peça" aparece ANTES, num
  // comentário no topo do arquivo, e recortar por ali mede o comentário em vez do botão — a
  // armadilha de sempre. `aprovando ? "Aprovando…"` só existe dentro do próprio <button>.
  const iRotulo = CITACOES_CLIENTE.indexOf('aprovando ? "Aprovando…"');
  verdade(iRotulo > 0, "não achei o rótulo dentro do botão de aprovar");
  const iAbre = CITACOES_CLIENTE.lastIndexOf("<button", iRotulo);
  verdade(iAbre > 0 && iRotulo - iAbre < 400, "o <button> de aprovar não foi delimitado");
  const btn = CITACOES_CLIENTE.slice(iAbre, iRotulo);
  verdade(/disabled=\{[^}]*papelPodeAprovar/.test(btn), "o botão de aprovar não desabilita para quem não tem OAB");
  verdade(/papelPodeAprovar\.motivo/.test(CITACOES_CLIENTE), "o motivo da recusa por papel não aparece na tela");
});

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

teste("imprimir confere aprovação e citação no servidor, e NÃO exige OAB", () => {
  const corpo = codigoDe(corpoDaFuncao(ACOES, "conferirSaidaDaPeca"));
  verdade(corpo.length > 200, "conferirSaidaDaPeca não existe");
  verdade(corpo.includes("exigirAcessoAba()"), "sem a trava de acesso à aba");
  verdade(/carregarSessaoOuFalhar\(\s*sessaoId\s*,\s*user\.officeId\s*\)/.test(corpo), "não reconfere a sessão contra o escritório de quem pediu");
  // DECISÃO DO DONO: estagiário PODE imprimir uma peça que o advogado já aprovou. Imprimir não
  // produz arquivo nem registro de auditoria — é o diálogo do navegador sobre algo já decidido.
  // Esta asserção é o que impede a exigência de voltar sem querer, junto com alguma outra mudança.
  verdade(!/avaliarExportacao\(/.test(corpo), "imprimir voltou a exigir advogado com OAB — o dono decidiu que estagiário imprime peça já aprovada");
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

// O BOTÃO "IMPRIMIR" SAIU (decisão do dono, 24/09/2026): "pode tirar o botão de imprimir, pois o
// exportar pdf já resolve". O PDF é a impressão da prévia, então eram dois nomes para um mecanismo
// só. Restam TRÊS saídas presas à régua, e um caso abaixo impede o quarto de voltar sem decisão.
teste("as três saídas (Word, PDF, Visualizar impressão) obedecem a régua", () => {
  verdade(/const saida = avaliarSaidaDaPeca\(\s*\{\s*aprovada,\s*citacoesPendentes\s*\}\s*\)/.test(CLIENTE), "a tela não calcula a saída pela régua única");
  for (const rotulo of ["Exportar para Word", "Exportar para PDF", "Visualizar impressão"]) {
    const tag = botaoDoRotulo(CLIENTE, rotulo);
    verdade(tag.length > 0 && tag.length < 900, `não achei (ou transbordou) o botão "${rotulo}" (${tag.length})`);
    verdade(/disabled=\{\s*!saida\.liberada\s*\}/.test(tag), `o botão "${rotulo}" não fica bloqueado antes da aprovação`);
  }
});

teste("o botão \"Imprimir\" continua fora da barra — o PDF é o caminho único para o papel", () => {
  const tag = botaoDoRotulo(CLIENTE, "Imprimir");
  verdade(tag.length === 0, "o botão Imprimir voltou para a barra da minuta — o dono tirou porque o PDF já cobre");
  verdade(/Para imprimir no papel, use o PDF/.test(CLIENTE), "a faixa de formatos não diz mais por onde se imprime");
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

// ── AS CAIXAS DO TOPO SOMEM DA PRÉVIA QUANDO O ADVOGADO APROVA ────────────────────────────────
//
// Decisão do dono (24/09/2026): "a aprovação passa a remover o carimbo apenas do pdf". Como o PDF
// É a impressão da prévia, e a paginação é MEDIDA a partir do mesmo fluxo, tirar as caixas só na
// impressão moveria o texto e a quebra de página deixaria de ser a que está na tela. Por isso some
// da prévia inteira depois de aprovada. O .docx NÃO muda.
//
// A caixa de RISCOS é a mais séria das duas: ela lista as fraquezas do próprio caso, e protocolar
// isso entrega à parte contrária o mapa das fragilidades da tese.

teste("aprovada, a prévia deixa de desenhar as duas caixas do topo", () => {
  const p = codigoDe(readFileSync(join(process.cwd(), "components/peticionamento/PreviaDaFolha.tsx"), "utf8"));
  verdade(/aprovada\s*\?\s*""\s*:\s*cabecalhoDaPeca\(/.test(p), "a prévia desenha o cabeçalho mesmo depois de aprovada — o PDF sai carimbado");
  const iMemo = p.indexOf("const fluxo = useMemo(");
  verdade(iMemo >= 0 && /\[\s*aprovada\s*,/.test(p.slice(iMemo, iMemo + 400)), "`aprovada` ficou fora das dependências do fluxo — a prévia não reagiria à aprovação");
  verdade(/aprovada=\{\s*aprovada\s*\}/.test(CLIENTE), "a tela não passa a aprovação para a prévia");
});

teste("o Word CONTINUA com as duas caixas — só o PDF perde", () => {
  const docx = codigoDe(readFileSync(join(process.cwd(), "lib/peticionamentoDocx.ts"), "utf8"));
  verdade(/GERADA POR IA/.test(docx), "o gerador do Word perdeu o aviso de IA");
  verdade(!/aprovad/i.test(docx), "o gerador do Word passou a consultar a aprovação — a decisão foi tirar o carimbo só do PDF");
});

// ── A PRÉVIA EM TAMANHO REAL NÃO DEPENDE DE APROVAÇÃO ─────────────────────────────────────────
//
// MEDIDO: em 1440px a coluna da prévia resolve para ~240px e a folha era desenhada a 24% — página
// de 50px, texto de 3,4px. E a única visão em tamanho real era a de impressão, que exige aprovar:
// o advogado assinava para só então conseguir ler. VER NÃO É EXPORTAR.

teste("ver em tamanho real não passa pela régua de saída", () => {
  const iBotao = CLIENTE.indexOf("Ver em tamanho real");
  verdade(iBotao > 0, "sumiu o caminho para ver a peça em tamanho real");
  const tag = CLIENTE.slice(CLIENTE.lastIndexOf("<button", iBotao), iBotao);
  verdade(!/saida\.liberada/.test(tag), "ver em tamanho real passou a exigir aprovação — assinar para poder ler é o defeito que isto conserta");
  verdade(/colunaEstreita/.test(CLIENTE) && /COLUNA_MINIMA_PX/.test(CLIENTE), "sumiu a regra que decide quando a coluna não comporta a prévia");
});

teste("a sobreposição tem saída, e some junto com a prévia", () => {
  const i = CLIENTE.indexOf('className="previa-sobreposta"');
  verdade(i > 0, "a prévia sobreposta não existe");
  const bloco = CLIENTE.slice(i, i + 1400);
  verdade(/Voltar a editar/.test(bloco), "a sobreposição não tem como ser fechada");
  verdade(/Esconder prévia/.test(bloco), "a sobreposição não oferece esconder a prévia");
  verdade(/aria-modal="true"/.test(bloco), "a sobreposição não se declara modal — leitor de tela continuaria lendo o editor atrás");
});


// ── A GRAVAÇÃO QUE FALHA PRECISA GRITAR ───────────────────────────────────────────────────────
//
// `atualizarCorpoDaMinuta` devolve sempre { ok: true } e LANÇA quando falha. Sem try/catch,
// `setSalvo(true)` nunca rodava numa queda de rede: a tela ficava em "salvando…" para SEMPRE, sem
// erro, e o advogado seguia digitando acreditando que estava guardado. Numa tela de peça com prazo
// preclusivo, perder trabalho em silêncio é a falha mais cara que existe aqui.

teste("a gravação da minuta trata a falha, e a tela para de dizer que está salvando", () => {
  const i = CLIENTE.indexOf("atualizarCorpoDaMinuta(sessaoId, corpo)");
  verdade(i > 0, "sumiu a chamada de gravação do corpo");
  const janela = CLIENTE.slice(Math.max(0, i - 400), i + 700);
  verdade(/try\s*\{/.test(janela) && /\}\s*catch/.test(janela), "a gravação voltou a rodar sem try/catch — a falha some em silêncio");
  verdade(/setErroDeGravacao\(/.test(janela), "o catch não registra a falha em lugar nenhum");
  verdade(/erroDeGravacao\s*\?\s*"NÃO SALVO"/.test(CLIENTE), 'a tela não troca "salvando…" por "NÃO SALVO" quando a gravação falha');
  verdade(/role="alert"/.test(CLIENTE), "o aviso de falha de gravação não interrompe — quem digita precisa saber na hora");
});


resumo("Peticionamento — etapa C: a aprovação libera Word, PDF e impressão");
