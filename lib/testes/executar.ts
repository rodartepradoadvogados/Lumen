// Corredor de testes de mesa — o mínimo para que uma regra escrita em código fique provada, e
// não apenas comentada. Sem dependência nova: o projeto roda isto com `tsx`, e um framework de
// teste inteiro para meia dúzia de arquivos seria peso sem retorno.

let falhas = 0;
let passaram = 0;
const pendentes: Promise<void>[] = [];

export function teste(nome: string, corpo: () => void | Promise<void>) {
  const executar = async () => {
    try {
      await corpo();
      passaram++;
    } catch (e) {
      falhas++;
      console.error(`✗ ${nome}\n  ${(e as Error).message}`);
    }
  };
  pendentes.push(executar());
}

export function igual(obtido: unknown, esperado: unknown, contexto = "") {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a !== b) throw new Error(`${contexto}esperado ${b}, obtido ${a}`);
}

export function verdade(condicao: unknown, contexto: string) {
  if (!condicao) throw new Error(contexto);
}

export async function resumo(titulo: string) {
  await Promise.all(pendentes);
  const total = passaram + falhas;
  if (falhas > 0) {
    console.error(`\n${titulo}: ${falhas} de ${total} casos falharam.`);
    process.exit(1);
  }
  console.log(`${titulo}: ${total} casos, todos passaram.`);
}

// ============================================================================
// VARREDURA DE CÓDIGO-FONTE — as duas ferramentas, e o motivo de existirem.
//
// Boa parte das regras desta casa não cabe num teste de mesa: "esta ação checa a permissão",
// "aquele `where` não perdeu o recorte por dono". A prova delas é ler o código. E lendo o código
// nasceram, sempre, os mesmos DOIS defeitos de teste — os dois já aconteceram de verdade aqui, e
// os dois deixam a varredura passando enquanto a trava que ela vigia já foi embora:
//
//   1. O COMENTÁRIO QUE EXPLICA A TRAVA satisfaz a busca pela trava. Comentário bom cita o código
//      de que fala; a varredura encontra a citação e dá a regra por cumprida. Aconteceu quatro
//      vezes numa rodada só, sempre com o comentário dizendo exatamente a frase procurada.
//   2. A JANELA DE N CARACTERES transborda para a função de baixo, e a varredura encontra na
//      vizinha a trava que a função examinada perdeu.
//
// Quem varre código daqui em diante usa estas duas funções, e não `readFileSync` + `includes`.
// ============================================================================

/** O arquivo sem as linhas de comentário — ver o defeito 1 acima. */
export function codigoDe(fonte: string): string {
  return fonte
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");
}

/**
 * O corpo de UMA função, do cabeçalho dela até o da seguinte, sem comentários.
 *
 * Devolve "" quando a função não existe — e quem chama deve conferir isso, porque uma varredura
 * que procura trava dentro de string vazia nunca acha nada e sempre passa.
 */
export function corpoDaFuncao(fonte: string, nome: string): string {
  const cabecalhos = [`export async function ${nome}(`, `async function ${nome}(`, `export function ${nome}(`, `function ${nome}(`];
  let i = -1;
  for (const c of cabecalhos) {
    i = fonte.indexOf(c);
    if (i >= 0) break;
  }
  if (i < 0) return "";
  const seguinte = fonte.slice(i + 10).search(/\n(export )?(async )?function /);
  return codigoDe(seguinte < 0 ? fonte.slice(i) : fonte.slice(i, i + 10 + seguinte));
}
