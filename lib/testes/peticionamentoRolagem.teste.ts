import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, verdade, resumo, codigoDe } from "./executar";

// ITEM 5 DO PEDIDO DO DONO (22/09/2026), palavras dele: "a barra de Cliente confirmado: ---
// pular questionário e continuar precisa ficar congelada, bem como o menu à esquerda e a parte de
// cima, ou seja, a rolagem só deve afetar às demandas filtradas".
//
// Por que isto é testável em código, e não só "olhando a tela": o defeito era UMA declaração —
// `.app-shell { min-height: 100vh }` com a linha do meio em `1fr`. Nesse arranjo a linha do meio
// tem mínimo automático (o tamanho do conteúdo), o grid cresce além da janela e o
// `overflow: auto` de `.main` nunca chega a valer nada: quem rola é a PÁGINA, levando embora o
// rail e a barra de cima. Voltar essa declaração para `min-height` é um `sed` de dez caracteres,
// e a tela volta a rolar inteira sem nada quebrar em vermelho — a não ser aqui.
//
// A varredura lê o BLOCO da regra (do seletor até a chave que o fecha), nunca uma janela de N
// caracteres: as regras vizinhas deste arquivo também falam de altura e overflow, e uma janela
// larga encontraria na vizinha a declaração que a regra examinada perdeu.

const RAIZ = process.cwd();
const CSS = readFileSync(join(RAIZ, "app", "peticionamento", "peticionamento.css"), "utf8");

/** O bloco de UMA regra CSS: do seletor até o `}` que o fecha. "" quando a regra não existe. */
function regra(seletor: string): string {
  const i = CSS.indexOf(seletor);
  if (i < 0) return "";
  const abre = CSS.indexOf("{", i);
  if (abre < 0) return "";
  const fecha = CSS.indexOf("}", abre);
  if (fecha < 0) return "";
  return CSS.slice(i, fecha + 1);
}

teste("TRAVA: o chassi tem ALTURA fixa — não `min-height`, que deixa o grid crescer e a página rolar inteira", () => {
  const bloco = regra(".peticionamento .app-shell");
  verdade(bloco.length > 80, `a regra .app-shell devolveu ${bloco.length} caracteres — varredura cega`);
  verdade(/\bheight:\s*100dvh/.test(bloco), "o chassi perdeu a altura fixa em 100dvh — o rail e a barra de cima voltam a rolar junto com o conteúdo");
  verdade(!/min-height:\s*100vh/.test(bloco), "`min-height: 100vh` de volta: o grid volta a crescer além da tela e a rolagem volta a ser da página inteira");
});

teste("TRAVA: a linha do meio do chassi é minmax(0, 1fr) — `1fr` sozinho tem mínimo automático e transborda", () => {
  const bloco = regra(".peticionamento .app-shell");
  verdade(/grid-template-rows:\s*48px\s+minmax\(0,\s*1fr\)/.test(bloco),
    "a linha do meio deixou de ser minmax(0, 1fr) — com `1fr` o mínimo é o tamanho do conteúdo, e o overflow de .main nunca chega a valer");
});

teste("TRAVA: o miolo continua sendo a caixa que rola (rail e topo ficam fora dela)", () => {
  const bloco = regra(".peticionamento .main {");
  verdade(bloco.length > 60, `a regra .main devolveu ${bloco.length} caracteres — varredura cega`);
  verdade(/overflow:\s*auto/.test(bloco), ".main deixou de rolar");
  verdade(/min-height:\s*0/.test(bloco), ".main sem min-height: 0 dentro de um grid volta a empurrar o chassi para fora da tela");
});

teste("TRAVA: na tela de contexto nem o miolo rola — quem rola é só a região dos resultados", () => {
  const fixa = regra(".peticionamento .main.main-fixa");
  verdade(fixa.length > 30, "a regra .main.main-fixa não existe — sem ela, a parte de cima da tela de contexto volta a rolar");
  verdade(/overflow:\s*hidden/.test(fixa), ".main-fixa deveria travar a própria rolagem");

  const pagina = regra(".peticionamento .ctx-page");
  verdade(pagina.length > 60, "a regra .ctx-page não existe — a tela de contexto perdeu a divisão em três faixas");
  verdade(/grid-template-rows:\s*auto\s+minmax\(0,\s*1fr\)\s+auto/.test(pagina),
    "a tela de contexto deixou de ser topo fixo · miolo rolável · barra congelada");

  const rolagem = regra(".peticionamento .ctx-rolagem");
  verdade(/overflow-y:\s*auto/.test(rolagem), "a região dos resultados deixou de ser a que rola");
  verdade(/min-height:\s*0/.test(rolagem), "sem min-height: 0 a região de resultados cresce e empurra a barra de baixo para fora da tela");
});

teste("TRAVA: a barra de baixo (Cliente confirmado / Continuar) fica presa ao fim da tela", () => {
  const bloco = regra(".peticionamento .sticky-bar");
  verdade(bloco.length > 60, "a regra .sticky-bar sumiu");
  verdade(/position:\s*sticky/.test(bloco) && /bottom:\s*0/.test(bloco), "a barra de baixo deixou de ficar congelada no fim da tela");
});

teste("TRAVA: no telefone a divisão em faixas fixas é desfeita — senão sobraria uma tira para a lista", () => {
  const i = CSS.indexOf("@media (max-width: 860px)");
  verdade(i > 0, "a media query de telefone sumiu do arquivo");
  const trecho = CSS.slice(i);
  const fim = trecho.indexOf("\n}\n");
  const media = fim > 0 ? trecho.slice(0, fim) : trecho;
  verdade(/\.main\.main-fixa\s*\{\s*overflow:\s*auto/.test(media), "no telefone .main-fixa precisa voltar a rolar — com três faixas fixas sobrariam ~100px para os resultados");
  verdade(/\.ctx-page\s*\{\s*display:\s*block/.test(media), "no telefone a tela de contexto precisa voltar a ser uma coluna só");
  verdade(/\.ctx-topo-grade\s*\{\s*grid-template-columns:\s*1fr/.test(media), "natureza e matéria lado a lado não cabem na largura de um telefone");
});

teste("TRAVA: a tela de contexto pede o chassi de rolagem travada — e nenhuma outra tela é afetada sem pedir", () => {
  const shell = codigoDe(readFileSync(join(RAIZ, "components", "peticionamento", "Shell.tsx"), "utf8"));
  verdade(shell.includes("rolagemSoNoMiolo"), "o Shell perdeu a opção de travar a rolagem no miolo");
  verdade(shell.includes("main-fixa"), "o Shell não aplica mais a classe que trava a rolagem");

  const pagina = codigoDe(readFileSync(join(RAIZ, "app", "peticionamento", "[id]", "contexto", "page.tsx"), "utf8"));
  verdade(pagina.includes("rolagemSoNoMiolo"), "a tela de contexto deixou de pedir a rolagem travada — o pedido do dono era sobre ESTA tela");

  // As demais telas de sessão (wizard, documentos, minuta…) não pedem: elas são texto longo, e
  // travar a rolagem nelas seria transformar a correção de uma tela em defeito nas outras.
  for (const outra of ["wizard", "documentos", "minuta", "confirmar", "tipo"]) {
    const fonte = codigoDe(readFileSync(join(RAIZ, "app", "peticionamento", "[id]", outra, "page.tsx"), "utf8"));
    verdade(!fonte.includes("rolagemSoNoMiolo"), `a tela "${outra}" passou a travar a rolagem sem precisar`);
  }
});

teste("TRAVA: a região que rola contém os resultados, e a barra congelada está FORA dela", () => {
  const tela = codigoDe(readFileSync(join(RAIZ, "components", "peticionamento", "ContextoClient.tsx"), "utf8"));
  const posRolagem = tela.indexOf('className="ctx-rolagem"');
  const posBarra = tela.indexOf('className="sticky-bar"');
  const posTopo = tela.indexOf('className="ctx-topo"');
  verdade(posTopo >= 0 && posRolagem > posTopo, "a região de rolagem deveria vir depois do topo fixo");
  verdade(posBarra > posRolagem, "a barra congelada deveria vir depois da região que rola");
  // ACHADO DE MUTAÇÃO (22/09/2026): "vir depois no arquivo" NÃO distingue "depois da região" de
  // "DENTRO da região" — um elemento aninhado também aparece depois da abertura do pai. Mover a
  // barra para dentro de .ctx-rolagem (onde ela rolaria junto com os resultados, que é o defeito
  // que o dono pediu para corrigir) passava verde nesta checagem. A régua de verdade é a mesma de
  // corpoDaFuncao: a TAG QUE FECHA na mesma indentação da que abre. Se ela vier antes da barra, a
  // barra está fora da região; se vier depois, está dentro.
  const inicioDaLinha = tela.lastIndexOf("\n", posRolagem) + 1;
  const indentacao = tela.slice(inicioDaLinha, tela.lastIndexOf("<div", posRolagem));
  const fechamento = tela.indexOf(`\n${indentacao}</div>`, posRolagem);
  verdade(fechamento > 0, "não achei o fechamento de .ctx-rolagem na indentação dela — varredura cega");
  verdade(fechamento < posBarra,
    "a barra congelada está DENTRO da região que rola — ela rolaria junto com os resultados, que é exatamente o defeito do item 5");
  // A busca e as matérias moram no topo FIXO; os resultados, dentro da região que rola.
  const topo = tela.slice(posTopo, posRolagem);
  verdade(topo.includes("ctx-filtro"), "a caixa de seleção/busca saiu da parte de cima — o dono pediu que ela ficasse lá");
  verdade(topo.includes("Natureza do procedimento"), "a natureza do procedimento saiu da parte de cima (item 4 do pedido)");
  const miolo = tela.slice(posRolagem, posBarra);
  verdade(miolo.includes("resultados.map"), "os resultados filtrados não estão dentro da região que rola");
});

resumo("Peticionamento — rolagem só nas demandas filtradas (item 5 do pedido do dono)");
