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

// Adequação "retomar volta ao passo certo": listarRascunhos passou a usar `passoParaRetomar`, não
// mais `passoDaSessao` sozinha — é ela quem decide entre o passo GRAVADO (s.passoAtual) e a
// dedução (plano B, para sessão antiga ou valor torto). `passoDaSessao` continua existindo dentro
// de `passoParaRetomar`, no MESMO módulo único (lib/peticionamentoPasso.ts) — nunca reinventada
// aqui por fora.
teste("listarRascunhos usa passoParaRetomar/hrefDoPasso — nunca reinventa a conta do passo por fora do módulo único", () => {
  const corpo = codigoDe(corpoDaFuncao(FONTE, "listarRascunhos"));
  verdade(corpo.includes("passoParaRetomar("), "listarRascunhos deixou de usar passoParaRetomar — o passo mostrado pode divergir da regra única (lib/peticionamentoPasso.ts)");
  verdade(corpo.includes("hrefDoPasso("), "listarRascunhos deixou de usar hrefDoPasso — \"Retomar\" pode não levar ao passo certo");
});

teste("listarRascunhos passa s.passoAtual (o valor GRAVADO) para passoParaRetomar — senão a gravação a cada navegação não serve para nada", () => {
  const corpo = codigoDe(corpoDaFuncao(FONTE, "listarRascunhos"));
  verdade(corpo.includes("passoAtual: true"), "listarRascunhos deixou de selecionar passoAtual — não há como usar o valor gravado sem trazê-lo do banco");
  verdade(/passoParaRetomar\(\s*\{[\s\S]*?\},\s*s\.passoAtual\s*,?\s*\)/.test(corpo), "listarRascunhos deixou de passar s.passoAtual para passoParaRetomar — voltaria a ser dedução pura");
});

// ══════════════════════════════════════════════════════════════════════════════════════════
// ACHADO DA REVISÃO — ABRIR UM RASCUNHO O MARCAVA COMO EDITADO.
//
// A gravação do passo roda no carregamento das SEIS páginas de passo. Como
// `PeticionamentoSessao.updatedAt` é `@updatedAt`, um `update` incondicional fazia cada
// carregamento (inclusive um F5 na mesma página) reescrever `updatedAt` — e esta lista ORDENA por
// ele e ESCREVE "atualizado em {data}" na tela. Resultado: só olhar um rascunho o punha no topo,
// dizendo que alguém o tinha editado agora. A tela mentia sobre quem mexeu em quê e quando.
//
// As duas travas abaixo guardam as duas metades da correção — e a segunda existe porque a forma
// ÓBVIA de escrever a primeira (`passoAtual: { not: passo }` sozinho) teria um defeito silencioso
// e pior: em SQL, `passoAtual != 'contexto'` é NULL para uma linha com passoAtual nulo, então
// TODA sessão antiga (nascida antes do campo existir) nunca mais teria o passo gravado.
// ══════════════════════════════════════════════════════════════════════════════════════════

teste("TRAVA: gravarPassoDaSessao não escreve quando o passo não mudou — abrir (ou recarregar) um rascunho não pode marcá-lo como editado", () => {
  const corpo = codigoDe(corpoDaFuncao(FONTE, "gravarPassoDaSessao"));
  verdade(corpo.length > 120, 'corpoDaFuncao("gravarPassoDaSessao") varredura cega');
  verdade(!/prisma\.peticionamentoSessao\.update\(/.test(corpo),
    "gravarPassoDaSessao voltou ao `update` incondicional — todo carregamento de página reescreveria updatedAt e o rascunho pularia para o topo da lista como se tivesse sido editado");
  verdade(/prisma\.peticionamentoSessao\.updateMany\(/.test(corpo),
    "gravarPassoDaSessao deixou de usar updateMany — é o `where` dele que torna a gravação um nada quando o passo não mudou");
  verdade(/not:\s*passo/.test(corpo),
    "sumiu a condição de que o passo GRAVADO é diferente do que se quer gravar — a escrita voltaria a acontecer sempre");
});

teste("TRAVA: a condição cobre a sessão ANTIGA, de passoAtual nulo — senão ela nunca gravaria passo nenhum", () => {
  const corpo = codigoDe(corpoDaFuncao(FONTE, "gravarPassoDaSessao"));
  verdade(/passoAtual:\s*null/.test(corpo),
    "sumiu o ramo `passoAtual: null` do filtro — em SQL `passoAtual != 'x'` é NULL para linha nula, então a sessão antiga jamais casaria e ficaria presa na dedução para sempre");
  // E os dois ramos têm de estar em OR: em AND, nenhuma linha casaria nunca.
  verdade(/OR:\s*\[/.test(corpo),
    "os dois ramos do filtro não estão em OR — em AND (passoAtual nulo E passoAtual diferente) nenhuma linha casa, e o passo nunca seria gravado para ninguém");
});

resumo("Peticionamento — lista de rascunhos: corte por escritório e exclusão do já exportado");
