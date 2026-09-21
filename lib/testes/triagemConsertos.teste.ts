import { readFileSync } from "node:fs";
import { teste, igual, verdade, resumo, codigoDe } from "./executar";

// ============================================================================
// A LINHA DA FILA PRECISA ABRIR A CONVERSA — relatado pelo dono com o produto na mão: só o botão
// "Abrir" navegava, a linha em volta era um <div> inerte. As três guias da Triagem (mais o
// celular) ensinavam três coisas diferentes sobre o que é clicável numa linha de lista.
// Padronizamos pelo que o celular (MobileAtendimentosCard) e o quadro do funil (QuadroDoFunil)
// já faziam: a área de informação é o link, e o que precisa continuar fora dele (botão "Abrir",
// ações de reverter/arquivar/ver a carta) fica como IRMÃO do link, nunca aninhado — link dentro
// de link é HTML inválido e quebra de formas silenciosas, sem erro nenhum no console.
// ============================================================================

/**
 * Devolve, para um par (abertura, fechamento) de tags JSX, o índice da primeira abertura e o da
 * primeira PRÓXIMA abertura que aparece antes do fechamento correspondente — usado para provar
 * que um <Link> não contém outro <Link> dentro. Não tenta parear chaves genéricas: com só duas
 * tags candidatas por arquivo (a linha inteira, e o botão/ação que tem de ficar fora), a primeira
 * abertura e o primeiro fechamento bastam para provar a NÃO-aninhação.
 */
function primeiroLinkNaoContemSegundo(fonte: string): boolean {
  const aberturas = [...fonte.matchAll(/<Link\b/g)].map((m) => m.index!);
  const fechamentos = [...fonte.matchAll(/<\/Link>/g)].map((m) => m.index!);
  verdade(aberturas.length >= 2, "esperava pelo menos dois <Link> na linha (a linha inteira + a ação que fica fora)");
  verdade(fechamentos.length >= 1, "não achou nenhum </Link> fechando");
  // O primeiro </Link> tem de fechar ANTES do segundo <Link> abrir — senão o segundo Link nasceu
  // dentro do primeiro.
  return fechamentos[0] < aberturas[1];
}

// ── GUIA 1 · FilaDeEspera ────────────────────────────────────────────────────

teste("a linha de 'Esperando resposta' inteira abre a conversa, e o botão Abrir fica fora do link", () => {
  const fonte = codigoDe(readFileSync("components/atendimento/FilaDeEspera.tsx", "utf8"));

  // Duas ocorrências do mesmo href: uma no link que envolve a linha inteira, outra no botão
  // "Abrir" que continua existindo. Uma só significaria que a linha voltou a ser um <div> inerte.
  const hrefs = fonte.match(/href=\{`\/atendimento\/\$\{q\.id\}`\}/g) || [];
  igual(hrefs.length, 2, "esperava o link da linha inteira MAIS o link do botão Abrir");

  verdade(primeiroLinkNaoContemSegundo(fonte), "o botão Abrir está aninhado dentro do link da linha — HTML inválido");

  // O botão continua existindo, com fronteira de palavra: `>AbrirTudo<` não devia passar aqui.
  verdade(/\bAbrir\b/.test(fonte), "o botão Abrir sumiu da tela");

  // Foco visível por teclado no link novo.
  verdade(fonte.includes("focus-visible:ring"), "o link da linha não tem foco visível por teclado");
});

// ── GUIA 3 · RecusadosParaAnalise ────────────────────────────────────────────

teste("a linha de 'Recusados' inteira abre a conversa, e as ações ficam fora do link", () => {
  // Decisão registrada: a guia 3 também virou linha inteira clicável, pela mesma razão de
  // coerência (padronizar pelo celular e pelo funil) — mas as ações (reverter/arquivar/ver a
  // carta) NÃO podem entrar no link, porque a MESMA linha tem botões que disparam ação (não
  // navegação), e um <button> dentro de um <a> também é inválido, além do link-dentro-de-link.
  const fonte = codigoDe(readFileSync("components/atendimento/RecusadosParaAnalise.tsx", "utf8"));

  const hrefsDaLinha = fonte.match(/href=\{`\/atendimento\/\$\{r\.attendanceId\}`\}/g) || [];
  igual(hrefsDaLinha.length, 1, "esperava um único link cobrindo a linha inteira (não mais um link só no nome)");

  // "Ver a recusa" é uma navegação diferente (abre direto na ficha/processo) e continua sendo o
  // seu próprio link — mas tem de ficar FORA do link da linha, como irmão.
  verdade(fonte.includes("aba=ficha&bloco=processo"), "o link 'Ver a recusa' sumiu");
  verdade(primeiroLinkNaoContemSegundo(fonte), "um link ficou aninhado dentro do link da linha — HTML inválido");

  // Os botões de ação continuam existindo e fora do link (reverter/arquivar).
  verdade(fonte.includes("reverterRecusa(r.recusaId)"), "o botão de reverter sumiu");
  verdade(fonte.includes("arquivarRecusa(r.recusaId)"), "o botão de arquivar sumiu");

  verdade(fonte.includes("focus-visible:ring"), "o link da linha não tem foco visível por teclado");
});

resumo("Triagem: a linha inteira da fila abre a conversa");
