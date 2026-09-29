import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";
import {
  normalizarIdsSelecionados,
  idsForaDoEscritorio,
  unirDocumentosDaSessao,
  LIMITE_DE_DOCUMENTOS_SELECIONADOS,
} from "@/lib/peticionamentoDocumentosDaSessao";

// PR P0 (29/09/2026) — dois defeitos de DADO na tela de Documentos do Peticionamento:
//  1. AssessoriaDocumento marcado na tela nunca chegava à minuta (a geração só lia Attachment).
//  2. definirDocumentosSelecionados gravava qualquer id, inclusive de outro escritório.
// Regras puras: exercitadas. Camada de IO: varredura (sem prisma falso na casa), no estilo de
// peticionamentoIsolamento.teste.ts.

const FONTE = readFileSync(join(process.cwd(), "lib", "actions", "peticionamento.ts"), "utf8");

// ── 1. documento de AssessoriaDocumento chega ao que a geração baixa e lê ──────────────────────

teste("um id de AssessoriaDocumento marcado entra na lista que a geração lê (o defeito: sumia)", () => {
  const lista = unirDocumentosDaSessao(
    [{ id: "att1", name: "Sentença.pdf", driveUrl: "https://drive.google.com/file/d/AAA/view" }],
    [{ id: "asd1", name: "Parecer societário.docx", driveUrl: "https://drive.google.com/file/d/BBB/view" }],
    [{ id: "anx1", nome: "Print.png", driveUrl: "https://drive.google.com/file/d/CCC/view" }],
  );
  igual(lista.map((d) => d.id), ["att1", "asd1", "anx1"]);
  igual(lista[1], { id: "asd1", nome: "Parecer societário.docx", driveUrl: "https://drive.google.com/file/d/BBB/view" });
});

teste("só AssessoriaDocumento marcado (nenhum Attachment) também chega — o caso exato do defeito", () => {
  const lista = unirDocumentosDaSessao([], [{ id: "asd9", name: "Contrato.pdf", driveUrl: "u" }], []);
  igual(lista.map((d) => d.nome), ["Contrato.pdf"]);
});

teste("o mesmo id nunca entra duas vezes (texto duplicado no prompt gastaria a janela de contexto)", () => {
  const lista = unirDocumentosDaSessao(
    [{ id: "x", name: "A", driveUrl: "u" }],
    [{ id: "x", name: "A", driveUrl: "u" }],
    [],
  );
  igual(lista.length, 1);
});

teste("TRAVA: carregarDocumentosDaSessaoComTexto lê AssessoriaDocumento, com officeId no where, e usa a união", () => {
  const corpo = codigoDe(corpoDaFuncao(FONTE, "carregarDocumentosDaSessaoComTexto"));
  verdade(corpo.length > 400, "varredura cega: corpo da função muito curto");
  verdade(/prisma\.assessoriaDocumento\.findMany\(\{\s*where:\s*\{\s*id:\s*\{\s*in:\s*documentosExistentesIds\s*\},\s*officeId\s*\}/.test(corpo),
    "a geração deixou de ler AssessoriaDocumento por id + officeId — documento próprio da assessoria volta a sumir da minuta");
  verdade(/unirDocumentosDaSessao\(\s*documentosExistentes,\s*documentosDaAssessoria,\s*anexosNovos\s*\)/.test(corpo),
    "a lista final não une Attachment + AssessoriaDocumento + anexos novos");
  // Mesmo caminho de texto/limites de Attachment: tudo passa pelo mesmo download + extração.
  verdade(corpo.includes("downloadFileFromDrive(fileId, officeId)") && corpo.includes("extrairTextoDeDocumento("),
    "o documento da assessoria precisa passar pelo mesmo download e extração que o Attachment");
});

teste("TRAVA: o resumo da tela de confirmação também conta os documentos da assessoria", () => {
  const corpo = codigoDe(corpoDaFuncao(FONTE, "obterResumoTriagem"));
  verdade(/prisma\.assessoriaDocumento\.findMany\(\{\s*where:\s*\{\s*id:\s*\{\s*in:\s*documentosExistentesIds\s*\},\s*officeId:\s*user\.officeId\s*\}/.test(corpo),
    "obterResumoTriagem não lista o AssessoriaDocumento marcado — a confirmação mostraria menos documentos do que vão ao agente");
});

// ── 2. isolamento: id de outro escritório é recusado ───────────────────────────────────────────

teste("normalizarIdsSelecionados: únicos, só string não vazia, ordem preservada, lixo descartado", () => {
  igual(normalizarIdsSelecionados(["a", "b", "a", "", 3, null, "c"]), ["a", "b", "c"]);
  igual(normalizarIdsSelecionados("nao-e-array"), []);
  igual(normalizarIdsSelecionados(undefined), []);
});

teste("idsForaDoEscritorio: id que o escritório não devolveu é apontado (isolamento)", () => {
  igual(idsForaDoEscritorio(["meu1", "alheio", "meu2"], ["meu1", "meu2"]), ["alheio"]);
  igual(idsForaDoEscritorio(["meu1", "meu2"], ["meu2", "meu1"]), []);
  igual(idsForaDoEscritorio(["x"], []), ["x"]);
});

teste("TRAVA: definirDocumentosSelecionados confere as DUAS tabelas por officeId ANTES de gravar, e grava uma vez", () => {
  const bruto = corpoDaFuncao(FONTE, "definirDocumentosSelecionados");
  const corpo = codigoDe(bruto);
  verdade(corpo.length > 500, `varredura cega: ${corpo.length} caracteres`);
  const iAtt = corpo.indexOf("prisma.attachment.findMany");
  const iAss = corpo.indexOf("prisma.assessoriaDocumento.findMany");
  const iGrava = corpo.indexOf("prisma.peticionamentoSessao.update");
  verdade(iAtt >= 0 && iAss >= 0 && iGrava > iAtt && iGrava > iAss, "a conferência de escritório precisa vir antes da gravação, nas duas tabelas");
  verdade(/attachment\.findMany\(\{\s*where:\s*\{\s*id:\s*\{\s*in:\s*pedidos\s*\},\s*officeId:\s*user\.officeId/.test(corpo), "Attachment sem officeId no where");
  verdade(/assessoriaDocumento\.findMany\(\{\s*where:\s*\{\s*id:\s*\{\s*in:\s*pedidos\s*\},\s*officeId:\s*user\.officeId/.test(corpo), "AssessoriaDocumento sem officeId no where");
  verdade(corpo.includes("idsForaDoEscritorio(") && corpo.includes("throw"), "id de fora do escritório precisa ESTOURAR, não ser ignorado");
  igual(corpo.split("peticionamentoSessao.update").length - 1, 1, "a seleção inteira é gravada em UMA escrita (lote)");
  verdade(corpo.includes("documentosExistentesIds: pedidos"), "deve gravar os ids normalizados, não o array cru do cliente");
});

teste("o teto de ids é finito", () => {
  verdade(LIMITE_DE_DOCUMENTOS_SELECIONADOS >= 100 && LIMITE_DE_DOCUMENTOS_SELECIONADOS <= 5000, "teto fora do razoável");
});

resumo("peticionamentoDocumentosDaSessao");
