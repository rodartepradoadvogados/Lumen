import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";
import { documentosConsultados } from "@/lib/peticionamentoGeracaoAssincrona";

// PRIORIDADE 1 (relatório da entrega "peticionamento lê documentos") — a lista de "documentos
// consultados" só pode conter o que foi REALMENTE lido e enviado ao agente. Esta régua vive em
// lib/actions/peticionamento.ts, que faz I/O de verdade (Drive, Hermes) e por isso não tem teste
// de mesa com Prisma falso (não há um na casa — ver lib/testes/peticionamentoIsolamento.teste.ts
// para a mesma justificativa). A prova aqui é estrutural: lê o CÓDIGO da função e confirma que a
// costura certa está lá — mesmo padrão de peticionamentoIsolamento.teste.ts e
// peticionamentoHardGates.teste.ts.

const RAIZ = process.cwd();
const FONTE = readFileSync(join(RAIZ, "lib", "actions", "peticionamento.ts"), "utf8");
// A GRAVAÇÃO DA MINUTA MUDOU DE ARQUIVO nesta entrega: ela saiu de dentro da requisição web e
// passou a ser compartilhada pela tela, pelo cron e pelo caminho síncrono de compatibilidade.
const FONTE_GERACAO = readFileSync(join(RAIZ, "lib", "peticionamentoGeracaoAssincrona.ts"), "utf8");

const CORPO_GERAR = corpoDaFuncao(FONTE, "confirmarTriagemEGerar");
const CODIGO_GERAR = codigoDe(CORPO_GERAR);

teste("a varredura acha confirmarTriagemEGerar com corpo substancial — varredura não está cega", () => {
  verdade(CORPO_GERAR.length > 800, `corpoDaFuncao("confirmarTriagemEGerar") devolveu ${CORPO_GERAR.length} caracteres`);
});

// ══════════════════════════════════════════════════════════════════════════════════════════
// ADAPTADOS NA ENTREGA DA GERAÇÃO ASSÍNCRONA, e a adaptação melhorou os dois casos.
//
// ANTES: os dois casos abaixo eram VARREDURA, e varredura presa a UMA GRAFIA — um deles exigia,
// literalmente, a string `documentosBaseConsultados: declaradosEValidos.length ? declaradosEValidos
// : nomesLidos`. Quando a gravação da minuta saiu de `confirmarTriagemEGerar` (ela passou a
// acontecer FORA da requisição web, e quem grava agora pode ser a tela OU o cron), os dois
// ficaram vermelhos sem que uma vírgula da regra tivesse mudado.
//
// AGORA: a régua virou função pura (`documentosConsultados`, em
// lib/peticionamentoGeracaoAssincrona.ts) e é EXERCITADA de verdade, com nome alucinado e com
// declaração vazia. Varredura prova que o código EXISTE; exercício prova que ele FUNCIONA — e o
// caso do `??` de socorro, achado numa rodada de mutação anterior desta casa, é a lembrança de
// que a diferença não é acadêmica.
//
// A varredura NÃO SUMIU: ela continua, logo abaixo, garantindo que quem grava a sessão use ESTA
// função em vez de uma segunda conta escrita à mão ao lado.
// ══════════════════════════════════════════════════════════════════════════════════════════

teste('TRAVA (exercitada): "documentos consultados" nunca cai de volta para "todos os selecionados" — o socorro é a lista de LIDOS', () => {
  const lidos = ["Contestação da operadora.pdf", "Relatório médico.pdf"];
  // O agente não declarou nada (resposta sem a seção): o socorro é quem foi LIDO, e só.
  igual(documentosConsultados([], lidos), lidos, "declaração vazia deveria cair para os documentos lidos: ");
  // E "lidos" nunca é "selecionados": um documento marcado na sessão mas ilegível não está aqui,
  // porque quem chama só passa os que leu — o teste prova que a função não inventa nenhum outro.
  igual(documentosConsultados([], []), [], "sem documento lido, a lista é vazia — nunca uma lista inventada: ");
});

teste("TRAVA (exercitada): a declaração do agente é FILTRADA contra quem foi realmente lido — nome alucinado nunca entra", () => {
  const lidos = ["Contestação da operadora.pdf", "Relatório médico.pdf"];
  igual(
    documentosConsultados(["Relatório médico.pdf", "Laudo que nunca existiu.pdf"], lidos),
    ["Relatório médico.pdf"],
    "o nome alucinado deveria ter sido descartado: ",
  );
  // TODA a declaração alucinada: cai para os lidos, e NÃO devolve a lista alucinada por ser "a
  // que o agente mandou".
  igual(
    documentosConsultados(["Laudo que nunca existiu.pdf"], lidos),
    lidos,
    "declaração inteiramente alucinada deveria cair para os lidos: ",
  );
  // Ordem e repetição vêm da declaração do agente quando ela é válida — nunca uma segunda lista.
  igual(
    documentosConsultados(["Relatório médico.pdf", "Contestação da operadora.pdf"], lidos),
    ["Relatório médico.pdf", "Contestação da operadora.pdf"],
    "a declaração válida deveria passar inteira: ",
  );
});

teste("TRAVA: quem grava a sessão usa ESTA função — nunca uma segunda conta escrita ao lado", () => {
  const corpo = codigoDe(corpoDaFuncao(FONTE_GERACAO, "gravarMinutaGerada"));
  verdade(corpo.length > 400, `corpoDaFuncao("gravarMinutaGerada") devolveu ${corpo.length} caracteres — varredura cega`);
  verdade(
    /documentosBaseConsultados:\s*documentosConsultados\(/.test(corpo),
    "a gravação da minuta precisa decidir os documentos consultados pela função que os testes exercitam — uma conta escrita à mão aqui divergiria dela em silêncio",
  );
  // E o texto do agente nunca vira a lista direto, sem passar pelo filtro.
  verdade(
    !/documentosBaseConsultados:\s*estruturada\.documentosUsados/.test(corpo),
    "a declaração crua do agente virou a lista de consultados — é a primeira das duas mentiras que esta régua existe para impedir",
  );
});

teste("TRAVA: documentosNaoLidos é montado a partir de quem NÃO foi lido (resultado.ok === false) e é persistido na sessão", () => {
  verdade(/for \(const d of documentos\) if \(!d\.resultado\.ok\)/.test(CODIGO_GERAR) || /documentos\.filter\(\(d\)\s*=>\s*!d\.resultado\.ok\)/.test(CODIGO_GERAR),
    "a lista de documentos não lidos deveria vir de quem tem resultado.ok === false");
  verdade(CODIGO_GERAR.includes("documentosNaoLidos,") || CODIGO_GERAR.includes("documentosNaoLidos:"),
    "documentosNaoLidos precisa ser gravado junto com o resto dos dados da geração — senão a nota obrigatória nunca saberia quem não foi lido");
});

// ADAPTADO na entrega do limite real: o marcador saiu de dentro de confirmarTriagemEGerar para
// a função `textoDoDocumentoParaPrompt`, porque DOIS lugares passaram a precisar exatamente do
// mesmo texto — a montagem da mensagem e a MEDIÇÃO do custo fixo do pedido (a trava de tamanho
// agora mede a mensagem inteira, ver lib/testes/peticionamentoLimiteDaPonte.teste.ts). Medir um
// marcador com um tamanho e enviar outro reabriria, por outra porta, o desencontro entre o que se
// mede e o que se manda. A trava não foi enfraquecida: ela agora cobra as DUAS pontas — que o
// marcador existe onde passou a morar, e que a montagem o usa.
const CORPO_MARCADOR = corpoDaFuncao(FONTE, "textoDoDocumentoParaPrompt");

teste('TRAVA: documento não lido vira um MARCADOR explícito no texto mandado ao Hermes — nunca string vazia, nunca o texto real de outro documento', () => {
  verdade(CORPO_MARCADOR.length > 200, `corpoDaFuncao("textoDoDocumentoParaPrompt") devolveu ${CORPO_MARCADOR.length} caracteres — a varredura está cega`);
  verdade(CORPO_MARCADOR.includes("NÃO FOI POSSÍVEL LER ESTE DOCUMENTO"),
    "o marcador de documento não lido sumiu — o defeito original (string vazia silenciosa) pode ter voltado");
  verdade(CODIGO_GERAR.includes("textoDoDocumentoParaPrompt(doc)"),
    "a montagem da mensagem precisa usar o marcador para o documento não lido, e não improvisar outro texto");
  verdade(!/texto:\s*""/.test(CODIGO_GERAR), 'confirmarTriagemEGerar não pode voltar a montar `texto: ""` para documento nenhum — é exatamente o defeito relatado pelo dono');
});

teste("TRAVA: confirmarTriagemEGerar usa o texto FINAL de cada item (avaliacao.itens/textoFinal) para montar a mensagem — não o texto original sem passar pela janela de contexto", () => {
  verdade(CODIGO_GERAR.includes("itensPorId.get(doc.id)?.textoFinal") || CODIGO_GERAR.includes(".textoFinal"),
    "a montagem da mensagem ao Hermes deveria usar textoFinal (já cortado pela janela de contexto quando resumido) — nunca o texto bruto direto do resultado da extração");
});

teste("TRAVA: confirmarTriagemEGerar chama calcularAvaliacaoDeContexto (texto de verdade) — NUNCA a ação pública avaliarContextoDaSessao (que devolve a versão sem texto)", () => {
  verdade(CODIGO_GERAR.includes("calcularAvaliacaoDeContexto(sessaoId"), "confirmarTriagemEGerar deveria chamar calcularAvaliacaoDeContexto diretamente");
  verdade(!CODIGO_GERAR.includes("avaliarContextoDaSessao(sessaoId)"),
    "confirmarTriagemEGerar não pode chamar a ação pública avaliarContextoDaSessao — ela devolve os itens SEM textoFinal, e a mensagem ao Hermes ficaria sem o conteúdo dos documentos de novo");
});

// ── A AÇÃO PÚBLICA NUNCA VAZA O TEXTO DO DOCUMENTO ─────────────────────────────────────────────
const CORPO_AVALIAR = corpoDaFuncao(FONTE, "avaliarContextoDaSessao");
const CODIGO_AVALIAR = codigoDe(CORPO_AVALIAR);

teste("a varredura acha avaliarContextoDaSessao com corpo substancial — varredura não está cega", () => {
  verdade(CORPO_AVALIAR.length > 300, `corpoDaFuncao("avaliarContextoDaSessao") devolveu ${CORPO_AVALIAR.length} caracteres`);
});

teste('HARD GATE: avaliarContextoDaSessao (ação EXPORTADA, chamável em tese pelo cliente) nunca devolve "textoFinal" — nunca vaza conteúdo de documento por uma ação pública que hoje ninguém lê, mas algum dia pode', () => {
  verdade(!CODIGO_AVALIAR.includes("textoFinal"), 'avaliarContextoDaSessao não pode incluir "textoFinal" no valor devolvido — isso vazaria o texto do documento para fora do servidor');
});

resumo("Peticionamento — verdade dos documentos consultados (prioridade 1)");
