import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, verdade, igual, resumo, codigoDe } from "./executar";

// Travas ESTRUTURAIS do seletor de documentos (PR P2/P3). As regras de filtro/busca/seleção são
// exercitadas em peticionamentoSeletorDocumentos.teste.ts; aqui, o que só se prova lendo a tela.

const RAIZ = process.cwd();
const SELETOR = codigoDe(readFileSync(join(RAIZ, "components", "peticionamento", "SeletorDeDocumentos.tsx"), "utf8"));
const CLIENTE = codigoDe(readFileSync(join(RAIZ, "components", "peticionamento", "DocumentosClient.tsx"), "utf8"));
const CSS = readFileSync(join(RAIZ, "app", "peticionamento", "peticionamento.css"), "utf8");
const BLOCO_CSS = CSS.slice(CSS.indexOf("/* ---- documentos: seletor recolhido"), CSS.indexOf("/* ---- modal (confirmar triagem"));

teste("todo item nasce RECOLHIDO — o estado inicial de 'abertos' é vazio (pedido do dono)", () => {
  verdade(/useState<ReadonlySet<string>>\(new Set\(\)\)/.test(SELETOR) && SELETOR.includes("const [abertos, setAbertos]"), "o conjunto de itens abertos não começa vazio");
  verdade(SELETOR.includes("{aberto && ("), "os documentos só devem ser desenhados quando o item está aberto");
});

teste("a lista é uma árvore ARIA de um nível só: item (nível 1) → documento (nível 2), com estado misto", () => {
  for (const trecho of ['role="tree"', 'role="treeitem"', "aria-level={1}", "aria-level={2}", "aria-expanded={aberto}", '"mixed"', 'role="group"', 'role="none"']) verdade(SELETOR.includes(trecho), `falta ${trecho}`);
  verdade(SELETOR.includes("indeterminate"), "checkbox do item sem estado indeterminado");
  verdade(!/aria-level=\{3\}/.test(SELETOR), "accordion dentro de accordion (nível 3) foi recusado pelo dono");
});

teste("filtros: fieldset/legend, chip removível com aria-label, contagem em aria-live", () => {
  for (const trecho of ["<fieldset", "<legend>", "Remover filtro", 'aria-live="polite"', "CATEGORIAS.map"]) verdade(SELETOR.includes(trecho), `falta ${trecho}`);
});

teste("atalhos: /, Alt+1..4, ?, Shift+E/C, Esc e setas da árvore", () => {
  for (const trecho of ['e.key === "/"', "Digit[1-4]", 'e.key === "?"', 'e.key === "E"', 'e.key === "C"', '"Escape"', '"ArrowDown"', '"ArrowUp"', '"ArrowRight"', '"ArrowLeft"', '"Enter"', '" "']) verdade(SELETOR.includes(trecho), `falta o atalho ${trecho}`);
});

teste("a gravação sai por UM gravador serial; a tela não chama definirDocumentosSelecionados em nenhum outro lugar", () => {
  igual((CLIENTE.match(/definirDocumentosSelecionados\(/g) ?? []).length, 1, "chamadas diretas à ação: ");
  verdade(CLIENTE.includes("criarGravadorSerial("), "a tela deixou de usar o gravador serial");
  verdade(!SELETOR.includes("definirDocumentosSelecionados"), "o seletor não grava por conta própria — quem grava é o DocumentosClient");
  // limpar a seleção também é UMA gravação
  verdade(/mudarSelecao\(\[\]\)/.test(CLIENTE), "Limpar seleção deveria usar a mesma via de gravação");
});

teste("o resumo fixo diz 'N documentos selecionados de M itens' e o total disponível fica no texto secundário", () => {
  verdade(CLIENTE.includes("documentos selecionados") && CLIENTE.includes("documentos disponíveis"), "textos do resumo");
  verdade(CLIENTE.includes("resumoDaSelecao("), "o resumo precisa vir de resumoDaSelecao (N total, M itens com marcado)");
});

teste("o passo continua permitindo 'Gerar sem documentos' e mantém a dropzone", () => {
  verdade(CLIENTE.includes("Gerar sem documentos") && CLIENTE.includes("dropzone"), "botão ou dropzone sumiram");
});

teste("CSS novo: só var(--token) — nenhum hex, nenhuma sombra, nenhum tamanho de fonte abaixo de 12px", () => {
  verdade(BLOCO_CSS.length > 3000, `bloco .sel-* não encontrado (${BLOCO_CSS.length})`);
  const semTokens = BLOCO_CSS.replace(/rgba?\([^)]*\)/g, "");
  verdade(!/#[0-9a-fA-F]{3,8}\b/.test(semTokens), "hex solto no CSS do seletor");
  verdade(!/box-shadow/.test(BLOCO_CSS), "sombra no seletor (nada aqui flutua)");
  for (const m of BLOCO_CSS.matchAll(/font(?:-size)?:\s*(?:\d+\s+)?(\d+(?:\.\d+)?)px/g)) verdade(Number(m[1]) >= 12, `fonte de ${m[1]}px abaixo do piso de 12px`);
  verdade(/prefers-reduced-motion/.test(BLOCO_CSS), "sem tratamento de prefers-reduced-motion");
});

resumo("peticionamentoSeletorTela");
