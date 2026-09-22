import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";

// EXCLUIR RASCUNHO (pedido do dono, 22/09/2026: "não tem opção de excluir rascunho").
//
// Três garantias, e nenhuma delas cabe num teste de mesa — todas moram na camada de IO, que é
// justamente onde esta casa costuma não ter teste nenhum (o módulo puro fica verde e a ação que
// apaga o que não devia é a que ninguém olhou). Varredura de código, pelo mesmo motivo e com as
// mesmas duas ferramentas de lib/testes/peticionamentoIsolamento.teste.ts:
//
//   1. o apagar de verdade carrega officeId NO `where` — id de outro escritório não apaga nada;
//   2. sessão com registro de EXPORTAÇÃO nunca é apagada — PeticionamentoExportacao é auditoria
//      (espec. §5: quem marcou a ciência e quando), e o Cascade do schema levaria a prova junto;
//   3. a confirmação é exigida NO SERVIDOR, não só na tela.

const RAIZ = process.cwd();
const FONTE = readFileSync(join(RAIZ, "lib", "actions", "peticionamento.ts"), "utf8");
const CORPO = codigoDe(corpoDaFuncao(FONTE, "excluirRascunho"));

teste("a varredura enxerga excluirRascunho — corpo vazio passaria verde sem provar nada", () => {
  verdade(CORPO.length > 600, `corpoDaFuncao("excluirRascunho") devolveu ${CORPO.length} caracteres — varredura cega`);
});

teste("TRAVA: o apagar carrega officeId no próprio `where` — nunca apaga por id sozinho", () => {
  verdade(/deleteMany\(\{\s*\n?\s*where:\s*\{[^}]*officeId/.test(CORPO) || /where:\s*\{\s*id:\s*sessaoId,\s*officeId/.test(CORPO),
    "o delete perdeu o corte por escritório — uma sessão de outro escritório sumiria para quem tivesse o id");
  verdade(!/prisma\.peticionamentoSessao\.delete\(/.test(CORPO),
    "`delete` simples não aceita where composto: só o id entraria no corte, e o officeId viraria enfeite conferido antes");
});

teste("TRAVA: sessão já EXPORTADA nunca é apagada — o registro de exportação é a auditoria da peça que saiu", () => {
  verdade(CORPO.includes("peticionamentoExportacao.count"), "a ação deixou de conferir se existe registro de exportação apontando para a sessão");
  verdade(/EXPORTADA/.test(CORPO), 'o status "EXPORTADA" sumiu da recusa');
  const posConferencia = CORPO.indexOf("peticionamentoExportacao.count");
  const posDelete = CORPO.indexOf("deleteMany");
  verdade(posConferencia >= 0 && posDelete >= 0 && posConferencia < posDelete, "a conferência precisa vir ANTES de apagar, não depois");
  // Cinto e suspensório: mesmo que a conferência acima seja contornada, o `where` do delete
  // continua recusando uma sessão exportada.
  verdade(/status:\s*\{\s*not:\s*"EXPORTADA"\s*\}/.test(CORPO),
    'o `where` do delete deixou de excluir status "EXPORTADA" — uma sessão exportada entre a leitura e a escrita seria apagada com a auditoria dela');
});

teste("TRAVA: a confirmação é exigida no SERVIDOR, antes de qualquer escrita", () => {
  verdade(/if\s*\(!confirmado\)/.test(CORPO), "a ação deixou de exigir a confirmação — um clique acidental apagaria trabalho");
  const posConfirmacao = CORPO.indexOf("confirmado");
  const posDelete = CORPO.indexOf("deleteMany");
  verdade(posConfirmacao >= 0 && posConfirmacao < posDelete, "a confirmação precisa ser checada antes do delete");
});

teste("TRAVA: a recusa EXPLICA o motivo — mensagem genérica esconde que existe auditoria por trás", () => {
  verdade(/auditoria|exporta/i.test(CORPO), "a mensagem de recusa não diz por que a sessão exportada não pode sumir");
  verdade(CORPO.includes("error"), "a recusa precisa voltar como erro tratável, nunca como exceção sem texto");
});

// ── O QUE A TELA PRECISA SABER ───────────────────────────────────────────────────────────────

const LISTAR = codigoDe(corpoDaFuncao(FONTE, "listarRascunhos"));

teste("TRAVA: a lista diz quem PODE ser excluído — a tela nunca decide isso sozinha", () => {
  verdade(LISTAR.length > 400, `corpoDaFuncao("listarRascunhos") devolveu ${LISTAR.length} caracteres — varredura cega`);
  verdade(LISTAR.includes("podeExcluir"), "listarRascunhos parou de informar se o rascunho pode ser excluído");
  verdade(LISTAR.includes("exportacoes"), "a contagem de exportações sumiu do select — não haveria como saber quem pode ser excluído");
});

teste("TRAVA: a lista carrega o que SE PERDE ao excluir — confirmar no escuro não é confirmar", () => {
  for (const campo of ["anexosCount", "documentosCount", "temMinuta"]) {
    verdade(LISTAR.includes(campo), `listarRascunhos parou de devolver "${campo}" — a confirmação não teria o que dizer`);
  }
});

teste("TRAVA: a tela pede confirmação antes de chamar a ação, e diz o que se perde", () => {
  const tela = codigoDe(readFileSync(join(RAIZ, "components", "peticionamento", "RascunhosClient.tsx"), "utf8"));
  verdade(tela.length > 400, "varredura cega em RascunhosClient");
  verdade(tela.includes("excluirRascunho"), "a tela de rascunhos não oferece exclusão nenhuma — o pedido do dono era exatamente este");
  verdade(tela.includes("confirmando"), "a tela chama a exclusão sem passo de confirmação");
  verdade(tela.includes("oQueSePerde"), "a confirmação não lista o que será perdido");
  verdade(tela.includes("podeExcluir"), "a tela oferece excluir mesmo para sessão que o servidor recusa — botão que só serve para dar erro");
  const posConfirma = tela.indexOf("setConfirmando");
  const posChamada = tela.indexOf("await excluirRascunho");
  verdade(posConfirma >= 0 && posChamada >= 0 && posConfirma < posChamada, "a ordem da tela deveria ser confirmar e só então excluir");
});

teste("a exclusão é definitiva de propósito — e a tela avisa que os arquivos do Drive continuam lá", () => {
  const tela = readFileSync(join(RAIZ, "components", "peticionamento", "RascunhosClient.tsx"), "utf8");
  verdade(/Drive/.test(tela), "a tela não diz o que acontece com os arquivos já enviados ao Drive — apagar o registro sem dizer isso engana");
  igual(/desfazer|definitiv/i.test(tela), true);
});

resumo("Peticionamento — exclusão de rascunho (item 1 do pedido do dono)");
