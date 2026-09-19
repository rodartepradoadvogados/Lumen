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
