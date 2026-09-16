import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { renderizarMarkdownSimples, minutosDeLeitura } from "@/lib/markdownSimples";

// Teste de mesa de lib/markdownSimples.tsx — `npm run testar`.
//
// Existe por dois motivos, e o segundo é o que o torna obrigatório:
//
// 1. O corpo da matéria vem de um robô EXTERNO, sobre o qual este repositório não tem controle. O
//    contrato é "markdown simples" (prisma/schema.prisma), e contrato com sistema de fora é
//    exatamente o lugar onde se testa o que chega.
// 2. O filtro de esquema de link é uma defesa de segurança. `[texto](javascript:...)` precisa sair
//    como TEXTO, sempre. Um teste que trava isso vale mais que o comentário que o explica.
//
// A primeira versão deste arquivo já pegou um defeito real: com o alvo do link escrito como
// `[^)\s]+`, uma URL com parêntese fechava o casamento no primeiro `)` e o segundo sobrava na
// tela — `[aqui](javascript:alert(1))` saía como "aqui).". Está travado no caso abaixo.

function html(md: string): string {
  return renderToStaticMarkup(React.createElement(React.Fragment, null, ...renderizarMarkdownSimples(md)));
}

const CASOS: { nome: string; entrada: string; esperado: string }[] = [
  { nome: "texto corrido vira um parágrafo", entrada: "O STJ decidiu.", esperado: "<p>O STJ decidiu.</p>" },
  { nome: "linha em branco separa parágrafos", entrada: "Primeiro.\n\nSegundo.", esperado: "<p>Primeiro.</p><p>Segundo.</p>" },
  { nome: "quebra simples continua o mesmo parágrafo", entrada: "Linha um\nlinha dois.", esperado: "<p>Linha um linha dois.</p>" },
  { nome: "## vira h2", entrada: "## Fundamento\n\nCorpo.", esperado: "<h2>Fundamento</h2><p>Corpo.</p>" },
  { nome: "### vira h3", entrada: "### Detalhe", esperado: "<h3>Detalhe</h3>" },
  { nome: "lista com hífen", entrada: "- um\n- dois", esperado: "<ul><li>um</li><li>dois</li></ul>" },
  { nome: "lista numerada", entrada: "1. um\n2. dois", esperado: "<ol><li>um</li><li>dois</li></ol>" },
  { nome: "bullet unicode", entrada: "• alfa\n• beta", esperado: "<ul><li>alfa</li><li>beta</li></ul>" },
  { nome: "citação junta as linhas", entrada: "> O prazo é fatal.\n> Sem exceção.", esperado: "<blockquote>O prazo é fatal. Sem exceção.</blockquote>" },
  { nome: "negrito", entrada: "O prazo é **fatal**.", esperado: "<p>O prazo é <strong>fatal</strong>.</p>" },
  { nome: "itálico com asterisco", entrada: "O termo *fatal* aqui.", esperado: "<p>O termo <em>fatal</em> aqui.</p>" },
  { nome: "itálico com underscore", entrada: "O termo _fatal_ aqui.", esperado: "<p>O termo <em>fatal</em> aqui.</p>" },
  {
    nome: "link https abre em aba nova, com rel de segurança",
    entrada: "Ver [o acórdão](https://stj.jus.br/x).",
    esperado: '<p>Ver <a href="https://stj.jus.br/x" target="_blank" rel="noopener noreferrer">o acórdão</a>.</p>',
  },
  {
    nome: "SEGURANÇA · javascript: vira texto, sem sobrar parêntese",
    entrada: "Clique [aqui](javascript:alert(1)).",
    esperado: "<p>Clique aqui.</p>",
  },
  {
    nome: "SEGURANÇA · data: vira texto",
    entrada: "Veja [isto](data:text/html,algo).",
    esperado: "<p>Veja isto.</p>",
  },
  {
    nome: "SEGURANÇA · HTML cru é escapado pelo React",
    entrada: "<script>alert(1)</script>",
    esperado: "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>",
  },
  { nome: "asterisco solto não vira formatação", entrada: "2 * 3 = 6", esperado: "<p>2 * 3 = 6</p>" },
  { nome: "lista seguida de parágrafo", entrada: "- a\n- b\n\nDepois.", esperado: "<ul><li>a</li><li>b</li></ul><p>Depois.</p>" },
  { nome: "conteúdo vazio não quebra", entrada: "", esperado: "" },
  { nome: "só espaços não quebra", entrada: "   \n\n  ", esperado: "" },
];

const MINUTOS: { palavras: number; esperado: number }[] = [
  { palavras: 0, esperado: 1 },
  { palavras: 10, esperado: 1 },
  { palavras: 400, esperado: 2 },
  { palavras: 1000, esperado: 5 },
];

let falhas = 0;
for (const caso of CASOS) {
  let obtido: string;
  try {
    obtido = html(caso.entrada);
  } catch (e) {
    console.error(`✗ ${caso.nome}\n  LANÇOU: ${(e as Error).message}`);
    falhas++;
    continue;
  }
  if (obtido !== caso.esperado) {
    console.error(`✗ ${caso.nome}\n  esperado: ${caso.esperado}\n  obtido:   ${obtido}`);
    falhas++;
  }
}
for (const caso of MINUTOS) {
  const obtido = minutosDeLeitura("palavra ".repeat(caso.palavras));
  if (obtido !== caso.esperado) {
    console.error(`✗ tempo de leitura de ${caso.palavras} palavras\n  esperado: ${caso.esperado}\n  obtido:   ${obtido}`);
    falhas++;
  }
}

const total = CASOS.length + MINUTOS.length;
if (falhas > 0) {
  console.error(`\n${falhas} de ${total} casos falharam.`);
  process.exit(1);
}
console.log(`markdownSimples: ${total} casos, todos passaram.`);
