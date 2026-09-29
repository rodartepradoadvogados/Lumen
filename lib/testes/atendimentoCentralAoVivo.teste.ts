import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";
import { haTextoDigitado, INTERVALO_DA_ATUALIZACAO_MS } from "@/components/atendimento/AtualizarAoVivo";

// ============================================================================
// A ATUALIZAÇÃO AO VIVO E O INDICADOR DE NOVAS MENSAGENS (A2 do plano do Atendimento, 29/09/2026).
//
// Provas de execução: o intervalo e a regra "há texto digitado?". O resto é varredura de código —
// o comportamento no navegador (rola sozinho no fim, não move quem lê acima, pausa com texto
// digitado e com a aba oculta) foi medido em Chromium e está no PR.
// ============================================================================

const RAIZ = process.cwd();
const le = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf8");
const ROLAR = le("components", "atendimento", "RolarParaOFim.tsx");
const VIVO = le("components", "atendimento", "AtualizarAoVivo.tsx");
const CONVERSA = codigoDe(le("components", "atendimento", "Conversa.tsx"));
const PAGE = le("app", "atendimento-central", "page.tsx");
const CORPO = corpoDaFuncao(PAGE, "AtendimentoCentralPage");

teste("o intervalo é de 15 segundos (decisão do dono)", () => {
  igual(INTERVALO_DA_ATUALIZACAO_MS, 15000);
  verdade(/router\.refresh\(\)/.test(codigoDe(VIVO)), "a atualização não usa router.refresh()");
});

teste("haTextoDigitado: só conta texto de verdade na caixa de resposta (espaços não travam a atualização)", () => {
  const doc = (valores: string[]) => ({ querySelectorAll: () => valores.map((value) => ({ value })) }) as unknown as Document;
  igual(haTextoDigitado(doc([])), false);
  igual(haTextoDigitado(doc(["", "   \n "])), false);
  igual(haTextoDigitado(doc(["Olá"])), true);
  igual(haTextoDigitado(doc(["", "x"])), true);
});

teste("a pausa olha a aba e o texto ANTES de atualizar; e o seletor é o pé da conversa, não a busca da lista", () => {
  const c = codigoDe(VIVO);
  const corpo = /const atualizar = \(\) => \{[\s\S]*?\n {4}\};/.exec(c)?.[0] ?? "";
  verdade(corpo.length > 50, "não achei a função atualizar");
  const iAba = corpo.indexOf('visibilityState !== "visible"');
  const iTexto = corpo.indexOf("haTextoDigitado()");
  const iRefresh = corpo.indexOf("router.refresh()");
  verdade(iAba >= 0 && iTexto > iAba && iRefresh > iTexto, "a ordem 'aba visível → sem texto digitado → refresh' não vale");
  verdade(/\[data-caixa-de-resposta\] textarea/.test(c), "o texto digitado não é lido da caixa de resposta");
  verdade(!/name="q"|busca-atendimentos/.test(c), "a busca da lista passou a pausar a atualização");
  verdade(/visibilitychange/.test(c) && /clearInterval/.test(c), "sem retomada ao voltar para a aba, ou sem limpar o intervalo");
});

teste("a página monta a atualização SÓ na aba Atendimentos, e a caixa de resposta é a que a pausa lê", () => {
  const iAtd = CORPO.indexOf('aba === "atendimentos" && (');
  const iVivo = CORPO.indexOf("<AtualizarAoVivo");
  verdade(iAtd > 0 && iVivo > iAtd, "AtualizarAoVivo está fora do bloco da aba Atendimentos — o quadro do funil (arrastar-e-soltar) seria atualizado por baixo do mouse");
  const iCaixa = CORPO.indexOf("data-caixa-de-resposta");
  verdade(iCaixa > 0 && CORPO.indexOf("<WhatsappReplyBox", iCaixa) > iCaixa, "data-caixa-de-resposta não envolve a WhatsappReplyBox");
});

teste("RolarParaOFim: vai ao fim ao montar E ao trocar de conversa (dependência `conversa`), sem scrollIntoView", () => {
  const c = codigoDe(ROLAR);
  verdade(/\}, \[conversa\]\);/.test(c), "o efeito de ir ao fim não depende da conversa — trocar de conversa pela lista deixa a rolagem onde estava");
  verdade(!/scrollIntoView\(/.test(c), "scrollIntoView rola a página inteira e esconde o cabeçalho");
  verdade(/requestAnimationFrame\(\(\) => requestAnimationFrame/.test(c), "sumiram as duas batidas — a última mensagem volta a ficar cortada quando a altura final chega depois");
  verdade(/\[data-rolagem-da-conversa\]/.test(c), "não procura mais a caixa nomeada");
});

teste("RolarParaOFim: 'estar no fim' é medido na ÚLTIMA ROLAGEM (tolerância de 80px), e não depois de o DOM crescer", () => {
  const c = codigoDe(ROLAR);
  verdade(/TOLERANCIA_DO_FIM\s*=\s*80/.test(c), "a tolerância de 80px mudou");
  verdade(/addEventListener\("scroll"/.test(c) && /noFim\.current\s*=\s*perto/.test(c), "o 'está no fim' não é gravado no ouvinte de rolagem");
  const efeito2 = /if \(conversaVista\.current !== conversa\) return;[\s\S]*?\[chave, total\]\);/.exec(c)?.[0] ?? "";
  verdade(efeito2.length > 50, "não achei o efeito da mensagem nova");
  verdade(/if \(noFim\.current\)/.test(efeito2) && !/scrollHeight\s*-\s*\w+\.scrollTop/.test(efeito2),
    "o efeito da mensagem nova mede a distância ao fim depois do crescimento — quem estava no fim seria tratado como quem lê acima");
});

teste("o indicador: aria-live só no contador, botão que rola ao fim e zera, plural correto, sombra só nele", () => {
  const c = codigoDe(ROLAR);
  verdade(/aria-live="polite"/.test(c), "o contador perdeu o aria-live");
  igual((c.match(/aria-live=/g) ?? []).length, 1, "só o contador pode ser aria-live: ");
  verdade(/nova mensagem/.test(c) && /novas mensagens/.test(c), "o plural do aviso");
  verdade(/sticky bottom-3/.test(c), "o botão deixou de ficar colado ao pé da caixa");
  verdade(/setNovas\(0\)/.test(c), "o aviso não é zerado");
  verdade(!/aria-live/.test(CONVERSA), "o log da conversa virou aria-live — o leitor de tela leria tudo a cada atualização");
});

teste("a Conversa passa a identidade, a última mensagem e o total ao componente de rolagem", () => {
  verdade(/<RolarParaOFim conversa=\{mensagens\[0\]\.id\} chave=\{mensagens\[mensagens\.length - 1\]\.id\} total=\{mensagens\.length\}/.test(CONVERSA), "Conversa não passa conversa/chave/total");
});

resumo("Central de Atendimento — ao vivo e novas mensagens (A2)");
