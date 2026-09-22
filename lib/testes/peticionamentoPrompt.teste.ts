import { teste, verdade, resumo } from "./executar";
import { montarMensagemParaHermes, type DadosParaPrompt } from "@/lib/peticionamentoPrompt";

// PRIORIDADE 1 (relatório da entrega "peticionamento lê documentos") — este módulo não tinha
// nenhum teste de mesa antes desta entrega. O defeito corrigido vivia bem aqui do lado:
// lib/actions/peticionamento.ts sempre mandou `documentos: [{ nome, texto: "" }]` — SÓ o nome,
// nunca o conteúdo — e nada neste arquivo (nem em lib/testes/) jamais provou o contrário. Estes
// testes fixam o contrato de que o TEXTO de verdade precisa estar na mensagem, e que um documento
// não lido carrega um marcador explícito, nunca uma seção vazia que o agente preenche sozinho.

const base: DadosParaPrompt = {
  materia: "Cível",
  categoriaPeca: "Petição",
  tipoPeca: "Inicial",
  tipoPecaOutro: null,
  contextoDescricao: "Processo nº 5432109-87.2024.8.09.0051",
  fatos: "O autor firmou contrato de prestação de serviços em 10/01/2026.",
  pedidos: ["Rescisão contratual", "Devolução de valores pagos"],
  teses: [],
  observacoes: null,
  documentos: [],
  contextoFoiResumido: false,
  avisoDeResumo: null,
};

teste("sem documento nenhum: a seção 'Documentos disponíveis' nem aparece", () => {
  const msg = montarMensagemParaHermes(base);
  verdade(!msg.includes("Documentos disponíveis nesta sessão"), "não deveria anunciar documentos quando a lista está vazia");
});

teste("HARD GATE: o TEXTO do documento vai na mensagem — nunca só o nome (o defeito original desta entrega)", () => {
  const msg = montarMensagemParaHermes({
    ...base,
    documentos: [{ nome: "2026_08_14_CONTRATO.pdf", texto: "CLÁUSULA PRIMEIRA — DO OBJETO. O presente contrato tem por objeto a prestação de serviços de consultoria." }],
  });
  verdade(msg.includes("2026_08_14_CONTRATO.pdf"), "nome do documento deveria aparecer");
  verdade(msg.includes("CLÁUSULA PRIMEIRA"), "TRAVA: o conteúdo do documento não está na mensagem — só o nome chegaria ao agente, exatamente o defeito relatado");
});

teste("HARD GATE: documento não lido carrega o marcador explícito — nunca uma seção vazia e silenciosa", () => {
  const msg = montarMensagemParaHermes({
    ...base,
    documentos: [{ nome: "laudo_escaneado.pdf", texto: '[NÃO FOI POSSÍVEL LER ESTE DOCUMENTO — PDF sem camada de texto. Não presuma nem invente o conteúdo deste documento; não inclua "laudo_escaneado.pdf" na lista de documentos usados.]' }],
  });
  verdade(msg.includes("laudo_escaneado.pdf"), "nome do documento não lido deveria continuar visível");
  verdade(msg.includes("NÃO FOI POSSÍVEL LER"), "o marcador de documento não lido precisa estar na mensagem, não uma string vazia");
});

teste("HARD GATE: a regra de não presumir documento não lido está sempre na mensagem, mesmo sem documento nenhum", () => {
  const msg = montarMensagemParaHermes(base);
  verdade(/presuma/i.test(msg) && msg.includes("NÃO FOI POSSÍVEL LER"), "a instrução de nunca presumir conteúdo de documento não lido sumiu do bloco de regras");
});

teste("dois documentos: os DOIS textos aparecem, cada um sob o próprio nome", () => {
  const msg = montarMensagemParaHermes({
    ...base,
    documentos: [
      { nome: "a.pdf", texto: "Conteúdo do documento A." },
      { nome: "b.docx", texto: "Conteúdo do documento B." },
    ],
  });
  // O separador ganhou INÍCIO/FIM explícitos quando a cerca de "documento é dado, não instrução"
  // entrou (ver lib/testes/peticionamentoDocumentoEDado.teste.ts). A intenção deste caso não
  // mudou — os dois textos aparecem, cada um sob o próprio nome —, só o formato do separador.
  verdade(msg.includes("--- INÍCIO DO DOCUMENTO: a.pdf ---") && msg.includes("Conteúdo do documento A."), "documento A ausente ou sem separador");
  verdade(msg.includes("--- INÍCIO DO DOCUMENTO: b.docx ---") && msg.includes("Conteúdo do documento B."), "documento B ausente ou sem separador");
  // E cada um fecha o seu — sem o fim, o texto de um documento se funde com o começo do outro.
  verdade(msg.includes("--- FIM DO DOCUMENTO: a.pdf ---") && msg.includes("--- FIM DO DOCUMENTO: b.docx ---"),
    "faltou a marca de fim de um dos documentos");
});

teste("fecho literal continua exigido na mensagem (regra pré-existente, não pode regredir)", () => {
  const msg = montarMensagemParaHermes(base);
  verdade(msg.includes('"Termos em que pede deferimento."'), "regra do fecho literal sumiu");
});

teste("aviso de contexto resumido só aparece quando contextoFoiResumido é true", () => {
  const semResumo = montarMensagemParaHermes(base);
  verdade(!semResumo.includes("ATENÇÃO: parte do contexto"), "não deveria avisar resumo quando não houve resumo");
  const comResumo = montarMensagemParaHermes({ ...base, contextoFoiResumido: true, avisoDeResumo: "Resumimos o Anexo X." });
  verdade(comResumo.includes("ATENÇÃO: parte do contexto") && comResumo.includes("Resumimos o Anexo X."), "aviso de resumo deveria aparecer com o texto informado");
});

resumo("Peticionamento — mensagem ao Hermes (prioridade 1)");
