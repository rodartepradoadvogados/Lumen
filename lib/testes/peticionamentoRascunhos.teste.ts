import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, verdade, resumo, corpoDaFuncao, codigoDe } from "./executar";

// A LISTA DE RASCUNHOS (especificação §3, "FAÇA ESTE PRIMEIRO") sustenta a promessa do pop-up de
// saída ("fica na lista de rascunhos") — se ela vazar sessão de outro escritório, ou continuar
// mostrando uma sessão já exportada como se fosse rascunho, a promessa vira risco de sigilo E
// mentira de produto ao mesmo tempo. lib/testes/peticionamentoIsolamento.teste.ts já cobre o
// corte por officeId nas tabelas de Case/Attendance/Assessoria/Attachment — este arquivo cobre a
// PRÓPRIA tabela de sessões, que aquele não varre (PeticionamentoSessao não está na lista
// MODELOS_DE_ESCRITORIO de lá, porque a maioria das ações já entra por sessaoId conferido).
// `listarRascunhos`/`contarRascunhos` são a exceção: entram direto por officeId, sem sessaoId.

const RAIZ = process.cwd();
const FONTE = readFileSync(join(RAIZ, "lib", "actions", "peticionamento.ts"), "utf8");

teste("TRAVA: listarRascunhos nunca lista sessão de outro escritório", () => {
  const corpo = codigoDe(corpoDaFuncao(FONTE, "listarRascunhos"));
  verdade(corpo.length > 200, `corpoDaFuncao("listarRascunhos") devolveu ${corpo.length} caracteres — varredura cega`);
  verdade(corpo.includes("officeId: user.officeId"), "listarRascunhos perdeu o corte por officeId — vazaria rascunho de outro escritório");
});

teste("TRAVA: listarRascunhos nunca lista sessão já EXPORTADA — senão o pop-up de saída mentiria", () => {
  const corpo = codigoDe(corpoDaFuncao(FONTE, "listarRascunhos"));
  verdade(/status:\s*\{\s*not:\s*"EXPORTADA"\s*\}/.test(corpo), 'listarRascunhos deixou de excluir status "EXPORTADA" — uma peça já exportada apareceria como rascunho');
});

teste("TRAVA: contarRascunhos usa o MESMO corte de officeId que listarRascunhos", () => {
  const corpo = codigoDe(corpoDaFuncao(FONTE, "contarRascunhos"));
  verdade(corpo.length > 60, 'corpoDaFuncao("contarRascunhos") varredura cega');
  verdade(corpo.includes("officeId: user.officeId"), "contarRascunhos perdeu o corte por officeId");
});

teste("TRAVA: contarRascunhos usa o MESMO status que listarRascunhos — o número do Menu não pode divergir da lista de verdade", () => {
  const corpo = codigoDe(corpoDaFuncao(FONTE, "contarRascunhos"));
  verdade(/status:\s*\{\s*not:\s*"EXPORTADA"\s*\}/.test(corpo), 'contarRascunhos deixou de excluir status "EXPORTADA" — o contador do Menu (\"Ver rascunhos (n)\") ficaria maior que a lista de verdade');
});

teste("listarRascunhos usa passoDaSessao/hrefDoPasso — nunca reinventa a conta do passo por fora do módulo único", () => {
  const corpo = codigoDe(corpoDaFuncao(FONTE, "listarRascunhos"));
  verdade(corpo.includes("passoDaSessao("), "listarRascunhos deixou de usar passoDaSessao — o passo mostrado pode divergir da regra única (lib/peticionamentoPasso.ts)");
  verdade(corpo.includes("hrefDoPasso("), "listarRascunhos deixou de usar hrefDoPasso — \"Retomar\" pode não levar ao passo certo");
});

resumo("Peticionamento — lista de rascunhos: corte por escritório e exclusão do já exportado");
