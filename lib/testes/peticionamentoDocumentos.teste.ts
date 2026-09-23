import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";
import { agruparDocumentosPorDemanda } from "@/lib/peticionamentoDocumentosDemanda";

// TRÊS CONSERTOS na aba de Peticionamento, relatados pelo dono usando o produto (23/09/2026):
//
//  1. Assessoria: os documentos nunca apareciam. Causa: `listarDocumentosDoVinculo` montava o
//     `OR` com só DOIS ramos (caseId/attendanceId) — `vinculo.assessoriaIds` era lida e nunca
//     usada. Vincular uma assessoria devolvia lista vazia, sempre. O pedido foi além do conserto
//     da consulta: navegar por DEMANDA dentro da assessoria, como já se faz em processo.
//  2. O botão de Markdown foi tirado (decisão do dono) — a ação nunca convertia nada de verdade.
//  3. Arrastar-e-soltar de verdade na área de anexo (só tinha onClick).
//
// Este arquivo cobra as três, no mesmo espírito estrutural de peticionamentoIsolamento.teste.ts e
// peticionamentoDocumentosConsultados.teste.ts: sem prisma falso na casa, a prova da camada de IO
// é ler o código; a regra de agrupamento por demanda é módulo PURO
// (lib/peticionamentoDocumentosDemanda.ts) e por isso é EXERCITADA de verdade, não só varrida.

const RAIZ = process.cwd();
const FONTE_ACTIONS = readFileSync(join(RAIZ, "lib", "actions", "peticionamento.ts"), "utf8");
const FONTE_TELA = readFileSync(join(RAIZ, "components", "peticionamento", "DocumentosClient.tsx"), "utf8");

// ── 1a. A CONSULTA ALCANÇA DOCUMENTO DE ASSESSORIA — reprova se o ramo sumir ──────────────────

const CORPO_LISTAR = corpoDaFuncao(FONTE_ACTIONS, "listarDocumentosDoVinculo");
const CORPO_DAS_ASSESSORIAS = corpoDaFuncao(FONTE_ACTIONS, "documentosDasAssessorias");

teste("a varredura acha listarDocumentosDoVinculo e documentosDasAssessorias com corpo substancial", () => {
  verdade(CORPO_LISTAR.length > 200, `corpoDaFuncao("listarDocumentosDoVinculo") devolveu ${CORPO_LISTAR.length} caracteres`);
  verdade(CORPO_DAS_ASSESSORIAS.length > 400, `corpoDaFuncao("documentosDasAssessorias") devolveu ${CORPO_DAS_ASSESSORIAS.length} caracteres`);
});

teste("TRAVA (o defeito original): listarDocumentosDoVinculo busca documento da assessoria vinculada, não só de case/attendance", () => {
  const c = codigoDe(CORPO_LISTAR);
  // A âncora do defeito relatado: `vinculo.assessoriaIds` tinha de aparecer amarrada a uma
  // chamada de verdade — não só lida (como em lerVinculo) e descartada.
  verdade(/vinculo\.assessoriaIds\.length\s*\?\s*documentosDasAssessorias\(/.test(c),
    "o ramo de assessoria sumiu de listarDocumentosDoVinculo — é exatamente o defeito relatado pelo dono (assessoria vinculada nunca mostra documento)");
  verdade(c.includes("...daAssessoria]") || c.includes("...daAssessoria,"),
    "o resultado da busca por assessoria foi calculado mas não entrou na lista devolvida");
});

teste("TRAVA: documentosDasAssessorias alcança as QUATRO demandas de uma assessoria (Processo, Atendimento, Licitação, Parecer) e os documentos gerais dela", () => {
  const c = codigoDe(CORPO_DAS_ASSESSORIAS);
  for (const modelo of ["prisma.case.findMany", "prisma.attendance.findMany", "prisma.licitacao.findMany", "prisma.parecer.findMany", "prisma.assessoriaDocumento.findMany"]) {
    verdade(c.includes(modelo), `documentosDasAssessorias não consulta ${modelo} — uma demanda ou os documentos gerais da assessoria ficariam de fora`);
  }
  // As TRÊS pernas do OR de Attachment — a mesma forma do defeito original (um OR com ramo
  // faltando), agora dentro desta função: perder qualquer uma esconde documento de uma demanda.
  for (const perna of ["caseId: { in: cases.map", "attendanceId: { in: attendances.map", "licitacaoId: { in: licitacoes.map"]) {
    verdade(c.includes(perna), `falta a perna "${perna}" no OR de documentos por demanda — reproduz o defeito original com outro nome`);
  }
  verdade(c.includes("...deDemandasVinculadas, ...deDocumentosProprios") || c.includes("...deDemandasVinculadas,") && c.includes("...deDocumentosProprios"),
    "documentos de demanda (Attachment) e documentos gerais (AssessoriaDocumento) precisam estar os dois na lista devolvida");
});

// ── 1b. A CONSULTA CONTINUA RECONFERINDO officeId (a regra do isolamento) ─────────────────────

/** Mesma técnica de lib/testes/peticionamentoIsolamento.teste.ts: o trecho da PRÓPRIA chamada. */
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

teste("TRAVA: toda consulta nova de documentosDasAssessorias carrega officeId no PRÓPRIO argumento", () => {
  const c = codigoDe(CORPO_DAS_ASSESSORIAS);
  const re = /prisma\.(case|attendance|licitacao|parecer|assessoriaDocumento|attachment)\.findMany\(/g;
  let conferidas = 0;
  for (const m of [...c.matchAll(re)]) {
    const abre = m.index! + m[0].length - 1;
    const trecho = trechoDaChamada(c, abre);
    verdade(trecho.length > 20, `não deu para delimitar o argumento de prisma.${m[1]}.findMany — varredura cega`);
    verdade(trecho.includes("officeId"), `prisma.${m[1]}.findMany em documentosDasAssessorias sem officeId no corte: ${trecho.slice(0, 140).replace(/\s+/g, " ")}`);
    conferidas++;
  }
  verdade(conferidas >= 6, `só ${conferidas} consulta(s) conferida(s) em documentosDasAssessorias — a varredura não está achando o que deveria`);
});

teste("TRAVA: listarDocumentosDoVinculo chama a guarda de sessão (officeId) antes de qualquer prisma, e repassa officeId reconferido para documentosDasAssessorias", () => {
  const c = codigoDe(CORPO_LISTAR);
  const posGuarda = c.indexOf("carregarSessaoOuFalhar(");
  const posPrisma = c.indexOf("prisma.");
  verdade(posGuarda >= 0, "listarDocumentosDoVinculo não chama carregarSessaoOuFalhar");
  verdade(posPrisma < 0 || posGuarda < posPrisma, "listarDocumentosDoVinculo toca o banco antes de conferir o escritório");
  verdade(c.includes("documentosDasAssessorias(user.officeId,"),
    "documentosDasAssessorias precisa receber o officeId JÁ reconferido pela guarda — nunca um officeId vindo direto do cliente");
});

// ── 3. OS DOCUMENTOS APARECEM AGRUPADOS POR DEMANDA — módulo puro, exercitado de verdade ──────

type Doc = { id: string; demanda: string | null };

teste("agruparDocumentosPorDemanda: documento sem demanda (processo/atendimento direto, ou documento geral da assessoria) fica solto", () => {
  const entrada: Doc[] = [
    { id: "1", demanda: null },
    { id: "2", demanda: null },
  ];
  const { soltos, grupos } = agruparDocumentosPorDemanda(entrada);
  igual(soltos.map((d) => d.id), ["1", "2"]);
  igual(grupos, []);
});

teste("agruparDocumentosPorDemanda: documento de uma demanda da assessoria entra no grupo certo, mantendo a ordem de primeira aparição", () => {
  const entrada: Doc[] = [
    { id: "geral", demanda: null },
    { id: "proc-1", demanda: "Processo: Fulano x Beltrano" },
    { id: "lic-1", demanda: "Licitação: Pregão 12/2026" },
    { id: "proc-2", demanda: "Processo: Fulano x Beltrano" },
  ];
  const { soltos, grupos } = agruparDocumentosPorDemanda(entrada);
  igual(soltos.map((d) => d.id), ["geral"]);
  igual(
    grupos.map(([nome, docs]) => [nome, docs.map((d) => d.id)]),
    [
      ["Processo: Fulano x Beltrano", ["proc-1", "proc-2"]],
      ["Licitação: Pregão 12/2026", ["lic-1"]],
    ],
  );
});

teste("agruparDocumentosPorDemanda: assessoria SEM demanda nenhuma (lista vazia) não quebra — devolve soltos e grupos vazios", () => {
  const { soltos, grupos } = agruparDocumentosPorDemanda([] as Doc[]);
  igual(soltos, []);
  igual(grupos, []);
});

// ── 2. GUARDA CONTRA REINTRODUÇÃO — o botão de Markdown e a ação que não convertia nada ───────

teste("GUARDA: marcarConversaoMarkdown não existe mais em lib/actions/peticionamento.ts", () => {
  const corpo = corpoDaFuncao(FONTE_ACTIONS, "marcarConversaoMarkdown");
  igual(corpo, "", 'marcarConversaoMarkdown voltou a existir — foi removida por decisão do dono, o botão não convertia nada de verdade: ');
  verdade(!codigoDe(FONTE_ACTIONS).includes("marcarConversaoMarkdown"),
    "o nome da ação removida ainda aparece em código executável (fora de comentário) em peticionamento.ts");
});

teste("GUARDA: a tela de Documentos não tem mais botão de converter Markdown nem o selo '✓ Convertido em Markdown'", () => {
  const codigo = codigoDe(FONTE_TELA);
  verdade(!codigo.includes("marcarConversaoMarkdown"), "a tela ainda chama marcarConversaoMarkdown — a ação foi removida do servidor");
  verdade(!FONTE_TELA.includes("Convertido em Markdown"), "o selo que afirmava uma conversão que nunca aconteceu ainda está na tela");
  verdade(!codigo.includes(">Converter<"), "o botão \"Converter\" (para Markdown) ainda está na tela");
  verdade(!codigo.includes("markdownConvertido") && !codigo.includes("markdownRecusado"),
    "a tela ainda lê os campos markdownConvertido/markdownRecusado — eles ficaram órfãos no banco, ninguém deveria mais lê-los");
});

teste("GUARDA: o texto da tela não promete mais conversão — descreve que o agente lê o conteúdo direto", () => {
  verdade(!FONTE_TELA.includes("Converter para Markdown ajuda o agente a ler o conteúdo"),
    "a frase antiga (que prometia uma conversão que não existe) ainda está na tela");
  verdade(FONTE_TELA.includes("O agente lê o conteúdo de cada documento diretamente"),
    "a tela deveria dizer a verdade: o agente lê o conteúdo do documento direto, sem conversão nenhuma");
});

// ── 3b. ARRASTAR-E-SOLTAR, COM A MESMA VALIDAÇÃO DO CLIQUE ────────────────────────────────────
//
// NUNCA janela de N caracteres para recortar um trecho — é o defeito 2 que o comentário de
// lib/testes/executar.ts descreve (a janela escorrega para o handler VIZINHO e a varredura acha
// lá o que a examinada perdeu). `trechoDoAtributoJsx` delimita pelo PRÓPRIO fechamento de chaves,
// igual a `corpoDaFuncao`/`trechoDaChamada`.

/**
 * O valor de um atributo JSX `nome={...}` — do `{` que abre até o `}` que fecha, por profundidade.
 * `apartirDe` escolhe QUAL ocorrência (há mais de um `onChange` na tela: o da checkbox de cada
 * documento e o do input de arquivo — pegar o primeiro `indexOf` sem isto acharia o atributo
 * errado, de um elemento vizinho, e passaria verde examinando outra coisa).
 */
function trechoDoAtributoJsx(fonte: string, nomeDoAtributo: string, apartirDe = 0): string {
  const alvo = `${nomeDoAtributo}={`;
  const i = fonte.indexOf(alvo, apartirDe);
  if (i < 0) return "";
  const abre = i + alvo.length - 1;
  let profundidade = 0;
  for (let j = abre; j < fonte.length; j++) {
    const ch = fonte[j];
    if (ch === "{" || ch === "(" || ch === "[") profundidade++;
    else if (ch === "}" || ch === ")" || ch === "]") {
      profundidade--;
      if (profundidade === 0) return fonte.slice(abre, j + 1);
    }
  }
  return "";
}

teste("GUARDA: a área de anexo tem os manipuladores de arrastar, com preventDefault no dragover (senão o navegador nunca dispara o onDrop)", () => {
  verdade(FONTE_TELA.includes("onDrop={"), "a área de anexo não tem onDrop — arrastar um arquivo não faz nada");
  verdade(FONTE_TELA.includes("onDragOver={"), "a área de anexo não tem onDragOver — sem isso o navegador não deixa soltar o arquivo (abre-o e sai da página)");

  const trechoDragOver = trechoDoAtributoJsx(FONTE_TELA, "onDragOver");
  verdade(trechoDragOver.length > 10, "não deu para delimitar o corpo de onDragOver — varredura cega");
  verdade(trechoDragOver.includes("preventDefault"), "onDragOver precisa chamar preventDefault — é o que permite o onDrop disparar (sem isso o navegador trata o arraste como navegação para o arquivo)");

  const corpoDrop = corpoDaFuncao(FONTE_TELA, "aoSoltarArquivo");
  verdade(corpoDrop.length > 40, `corpoDaFuncao("aoSoltarArquivo") devolveu ${corpoDrop.length} caracteres — varredura cega`);
  verdade(corpoDrop.includes("preventDefault"), "o handler de onDrop (aoSoltarArquivo) precisa chamar preventDefault");
});

teste("GUARDA: o caminho de arrastar usa a MESMA validação do clique — um único portão de envio (anexarNovoDocumento chamado uma vez só no arquivo)", () => {
  const ocorrencias = (FONTE_TELA.match(/anexarNovoDocumento\(/g) ?? []).length;
  igual(ocorrencias, 1, "anexarNovoDocumento deveria ser chamado de um único lugar (enviarArquivo) — duas chamadas separadas abrem espaço para uma delas não ter a mesma validação de tamanho/tipo: ");

  // O clique (onChange do <input type="file">) e o soltar (onDrop) têm de passar pelo MESMO
  // portão — `enviarArquivo`/`enviarArquivos` — e não por um caminho próprio de cada um.
  const posInputArquivo = FONTE_TELA.indexOf('type="file"');
  verdade(posInputArquivo >= 0, "o input de arquivo (type=\"file\") sumiu da tela");
  const trechoInput = trechoDoAtributoJsx(FONTE_TELA, "onChange", posInputArquivo);
  verdade(trechoInput.length > 10, "não deu para delimitar o onChange do input de arquivo — varredura cega");
  verdade(/enviarArquivos?\(/.test(trechoInput), "o onChange do input de arquivo (caminho do clique) não chama enviarArquivo/enviarArquivos");

  const corpoSoltar = codigoDe(corpoDaFuncao(FONTE_TELA, "aoSoltarArquivo"));
  verdade(/enviarArquivos?\(/.test(corpoSoltar), "o handler de onDrop (caminho de arrastar) não chama enviarArquivo/enviarArquivos — teria validação própria, divergente da do clique");
});

teste("GUARDA: arrastar aceita VÁRIOS arquivos, e o clique continua funcionando (input não foi removido)", () => {
  verdade(FONTE_TELA.includes("e.dataTransfer.files"), "onDrop não lê e.dataTransfer.files — não dá para arrastar arquivo nenhum");
  verdade(/for \(const file of Array\.from\(files\)\)/.test(codigoDe(FONTE_TELA)) || FONTE_TELA.includes("Array.from(files)"),
    "não há laço percorrendo vários arquivos soltos — só o primeiro seria aceito");
  verdade(FONTE_TELA.includes('type="file"') && FONTE_TELA.includes("inputRef.current?.click()"),
    "o input de arquivo e o clique na área (para abri-lo) precisam continuar existindo — arrastar é ADIÇÃO, nunca substituição do clique");
});

teste("GUARDA: existe estado visual enquanto o arquivo está sobre a área (classe some/aparece com o estado de arrastar)", () => {
  verdade(/arrastando/.test(FONTE_TELA), "não há estado de 'arrastando' — a área não muda de aparência enquanto o arquivo está sobre ela");
  verdade(FONTE_TELA.includes("dropzone-ativa"), "falta a classe visual que marca a dropzone como ativa durante o arraste");
});

resumo("Peticionamento — documentos por demanda da assessoria, fim do Markdown falso, arrastar-e-soltar de verdade");
