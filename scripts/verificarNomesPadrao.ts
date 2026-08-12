// Trava de compatibilidade: os nomes de pasta PADRÃO (lib/driveNaming.ts) têm que continuar
// idênticos, byte a byte, aos que ficavam cravados nos três módulos de armazenamento antes de a
// nomenclatura virar configurável por escritório. Qualquer divergência aqui significa que um
// escritório já existente passaria a criar pastas NOVAS ao lado das que já usa — exatamente o que
// esta configuração não pode causar em quem nunca a tocou.
//
// Rodar com: npx tsx scripts/verificarNomesPadrao.ts
import { montarNomeacao } from "../lib/driveNaming";

const ESPERADO_ANTIGO = {
  pastaMae: "Lúmen",
  raizes: {
    anexos: "Lúmen - Anexos",
    modelos: "Lúmen - Modelos de Documento",
    gerados: "Lúmen - Documentos Gerados",
    assessoria: "Lúmen - Assessoria",
    processos: "Lúmen - Processos",
    atendimentos: "Lúmen - Atendimentos",
    casos: "Lúmen - Casos",
    financeiroDespesas: "Lúmen - Financeiro - Despesas",
    financeiroReceitas: "Lúmen - Financeiro - Receitas",
  },
};

let falhas = 0;
const padrao = montarNomeacao(null, null);

if (padrao.pastaMae !== ESPERADO_ANTIGO.pastaMae) {
  console.error(`FALHOU pasta-mãe: esperado "${ESPERADO_ANTIGO.pastaMae}", veio "${padrao.pastaMae}"`);
  falhas++;
}
for (const [k, esperado] of Object.entries(ESPERADO_ANTIGO.raizes)) {
  const veio = padrao.raizes[k as keyof typeof padrao.raizes];
  if (veio !== esperado) {
    console.error(`FALHOU raiz ${k}: esperado "${esperado}", veio "${veio}"`);
    falhas++;
  }
}

// Escritório que configurou nomes próprios
const custom = montarNomeacao("Escritório Alfa", "Alfa - ");
if (custom.raizes.processos !== "Alfa - Processos") {
  console.error(`FALHOU prefixo custom: veio "${custom.raizes.processos}"`);
  falhas++;
}
// Prefixo vazio é escolha válida e diferente de "não configurado"
const semPrefixo = montarNomeacao("Alfa", "");
if (semPrefixo.raizes.processos !== "Processos") {
  console.error(`FALHOU prefixo vazio: veio "${semPrefixo.raizes.processos}"`);
  falhas++;
}
if (montarNomeacao("Alfa", null).raizes.processos !== "Lúmen - Processos") {
  console.error("FALHOU: prefixo nulo deveria cair no padrão");
  falhas++;
}

if (falhas > 0) {
  console.error(`\n${falhas} verificação(ões) falharam.`);
  process.exit(1);
}
console.log("OK — os nomes padrão são idênticos aos de antes, e a customização funciona.");
