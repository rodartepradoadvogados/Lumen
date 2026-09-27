import { teste, igual, resumo } from "./executar";
import { normalizarCnj, digitoVerificadorCnj, cnjValido, formatarCnj } from "../cnjNumero";

// NÚMERO ÚNICO DE PROCESSO CNJ (Resolução CNJ 65/2008) — docs/agentes/peticionamento-firecrawl-
// validacao.md §3. Os 5 números da tabela do documento são exatamente os fixados aqui: os 3
// primeiros têm dígito verificador correto; os 2 últimos são os MESMOS números usados hoje (antes
// desta entrega) como "válidos" em lib/testes/peticionamentoCitacoes.teste.ts, com DV errado.

teste("os 3 números válidos da tabela passam", () => {
  igual(cnjValido("0001234-85.2023.5.18.0001"), true);
  igual(cnjValido("1001234-68.2021.8.26.0000"), true);
  igual(cnjValido("5012345-88.2024.8.09.0051"), true);
});

teste("os 2 números inválidos da tabela (DV errado) falham", () => {
  igual(cnjValido("0001234-56.2023.5.18.0001"), false);
  igual(cnjValido("1001234-56.2021.8.26.0000"), false);
});

teste("digitoVerificadorCnj reproduz os DVs da tabela", () => {
  igual(digitoVerificadorCnj("0001234" + "2023" + "5" + "18" + "0001"), "85");
  igual(digitoVerificadorCnj("1001234" + "2021" + "8" + "26" + "0000"), "68");
  igual(digitoVerificadorCnj("5012345" + "2024" + "8" + "09" + "0051"), "88");
});

teste("19 ou 21 dígitos falham — não é 'quase 20', é inválido", () => {
  igual(normalizarCnj("0001234-85.2023.5.18.001"), null, "19 dígitos (um a menos na origem)");
  igual(normalizarCnj("0001234-85.2023.5.18.00011"), null, "21 dígitos (um a mais na origem)");
  igual(cnjValido("000123485202351800"), false, "18 dígitos corridos");
});

teste("J.TR fora do catálogo de tribunais recusa, mesmo com DV batendo", () => {
  // Justiça "9" e tribunal "99" não existem em lib/tribunaisCatalog.ts — o DV é calculado sobre os
  // mesmos dígitos, então pode bater por acaso; o número ainda não é válido.
  const digitos18 = "0001234" + "2023" + "9" + "99" + "0001";
  const dv = digitoVerificadorCnj(digitos18);
  const numero = `0001234-${dv}.2023.9.99.0001`;
  igual(cnjValido(numero), false);
});

teste("aceita com ou sem a pontuação da máscara oficial", () => {
  igual(cnjValido("00012348520235180001"), true, "20 dígitos corridos, sem pontuação");
  igual(cnjValido("0001234-85.2023.5.18.0001"), true, "com a pontuação oficial");
});

teste("normalizarCnj devolve null para texto vazio/nulo/sem forma de número", () => {
  igual(normalizarCnj(""), null);
  igual(normalizarCnj(null), null);
  igual(normalizarCnj(undefined), null);
  igual(normalizarCnj("processo sem número"), null);
});

teste("formatarCnj recompõe a máscara oficial a partir dos 20 dígitos", () => {
  igual(formatarCnj("00012348520235180001"), "0001234-85.2023.5.18.0001");
});

resumo("Número CNJ — formato e dígito verificador (Resolução CNJ 65/2008)");
