import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";

// PRIORIDADE 1 (relatório da entrega "peticionamento lê documentos") — a lista de "documentos
// consultados" só pode conter o que foi REALMENTE lido e enviado ao agente. Esta régua vive em
// lib/actions/peticionamento.ts, que faz I/O de verdade (Drive, Hermes) e por isso não tem teste
// de mesa com Prisma falso (não há um na casa — ver lib/testes/peticionamentoIsolamento.teste.ts
// para a mesma justificativa). A prova aqui é estrutural: lê o CÓDIGO da função e confirma que a
// costura certa está lá — mesmo padrão de peticionamentoIsolamento.teste.ts e
// peticionamentoHardGates.teste.ts.

const RAIZ = process.cwd();
const FONTE = readFileSync(join(RAIZ, "lib", "actions", "peticionamento.ts"), "utf8");

const CORPO_GERAR = corpoDaFuncao(FONTE, "confirmarTriagemEGerar");
const CODIGO_GERAR = codigoDe(CORPO_GERAR);

teste("a varredura acha confirmarTriagemEGerar com corpo substancial — varredura não está cega", () => {
  verdade(CORPO_GERAR.length > 800, `corpoDaFuncao("confirmarTriagemEGerar") devolveu ${CORPO_GERAR.length} caracteres`);
});

teste('TRAVA: "documentos consultados" nunca cai de volta para "todos os selecionados" — o fallback é a lista de LIDOS, nunca a lista de anexos/documentos por nome direto', () => {
  verdade(CODIGO_GERAR.includes("documentosBaseConsultados: declaradosEValidos.length ? declaradosEValidos : nomesLidos"),
    'a linha que decide documentosBaseConsultados mudou — precisa cair para "nomesLidos" (quem foi lido), nunca para a lista bruta de documentos selecionados (o comportamento antigo, que é a segunda mentira relatada pelo dono)');
});

teste("TRAVA: a declaração do agente (documentosUsados) é FILTRADA contra quem foi realmente lido — nunca aceita um nome alucinado direto", () => {
  verdade(/declaradosEValidos\s*=\s*estruturada\.documentosUsados\.filter\(\s*\(nome\)\s*=>\s*nomesLidos\.includes\(nome\)\)/.test(CODIGO_GERAR),
    "a declaração do Hermes precisa ser filtrada contra nomesLidos antes de virar documentosBaseConsultados");
});

teste("TRAVA: documentosNaoLidos é montado a partir de quem NÃO foi lido (resultado.ok === false) e é persistido na sessão", () => {
  verdade(/for \(const d of documentos\) if \(!d\.resultado\.ok\)/.test(CODIGO_GERAR) || /documentos\.filter\(\(d\)\s*=>\s*!d\.resultado\.ok\)/.test(CODIGO_GERAR),
    "a lista de documentos não lidos deveria vir de quem tem resultado.ok === false");
  verdade(CODIGO_GERAR.includes("documentosNaoLidos,") || CODIGO_GERAR.includes("documentosNaoLidos:"),
    "documentosNaoLidos precisa ser gravado junto com o resto dos dados da geração — senão a nota obrigatória nunca saberia quem não foi lido");
});

teste('TRAVA: documento não lido vira um MARCADOR explícito no texto mandado ao Hermes — nunca string vazia, nunca o texto real de outro documento', () => {
  verdade(CODIGO_GERAR.includes("NÃO FOI POSSÍVEL LER ESTE DOCUMENTO"),
    "o marcador de documento não lido sumiu da montagem de documentosParaPrompt — o defeito original (string vazia silenciosa) pode ter voltado");
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
