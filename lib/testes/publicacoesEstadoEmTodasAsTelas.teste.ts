import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, verdade, resumo } from "./executar";

// Trava: toda tela que lista ou conta publicações precisa excluir quarentena e descartadas
// (estado ATIVA), inclusive o app mobile (/m). Ver docs/ESTADO-ATUAL-E-ARMADILHAS.md §35.
const RAIZ = process.cwd();
const le = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf8");

const TELAS = [
  "app/m/(shell)/publicacoes/page.tsx",
  "app/m/(shell)/page.tsx",
  "app/m/(shell)/relatorios/page.tsx",
  "app/m/(shell)/processos/[id]/page.tsx",
  "app/(app)/processos/[id]/page.tsx",
  "app/(app)/contatos/clientes/[id]/page.tsx",
  "app/reuniao/[id]/page.tsx",
  "lib/actions/relatorioPersonalizado.ts",
];

for (const arquivo of TELAS) {
  teste(`ESTADO: ${arquivo} só considera publicações ATIVAS`, () => {
    const fonte = le(...arquivo.split("/"));
    verdade(/estado:\s*"ATIVA"|publicacoesDaFilaWhere/.test(fonte), "falta o filtro de estado");
  });
}

teste("MOBILE: o cartão avisa que aviso de intimação não traz prazo", () => {
  const cartao = le("components", "mobile", "MobilePublicationCard.tsx");
  verdade(cartao.includes("AVISO_INTIMACAO") && cartao.includes("limiteParaAbrirOAviso"), "cartão sem aviso de intimação");
});

teste("MOBILE: o cartão conclui e descarta pelas mesmas ações do servidor do site, com desfazer", () => {
  const cartao = le("components", "mobile", "MobilePublicationCard.tsx");
  verdade(cartao.includes("concluirParaTodos") && cartao.includes("descartarPublicacao"), "cartão sem as ações do servidor");
  verdade(cartao.includes("desfazerDescarte") && cartao.includes("restorePublicationSnapshots"), "cartão sem desfazer");
  verdade(cartao.includes("Tratar") && cartao.includes("MobileConcluirSheet"), "cartão sem Tratar/Concluir");
});

teste("MOBILE: aviso de intimação não oferece 'só ciência' no painel Concluir", () => {
  const painel = le("components", "mobile", "MobileConcluirSheet.tsx");
  verdade(painel.includes('["TRATADO_NO_TRIBUNAL", "Já abri no tribunal e tratei"'), "aviso sem a saída 'já abri no tribunal'");
  verdade(painel.includes("ehAviso ? \"TRATADO_NO_TRIBUNAL\" : \"SO_CIENCIA\""), "padrão do aviso deve ser TRATADO_NO_TRIBUNAL");
});

resumo("Publicações: estado ATIVA em todas as telas, inclusive /m");
