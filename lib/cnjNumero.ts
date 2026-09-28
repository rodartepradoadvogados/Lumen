// NÚMERO ÚNICO DE PROCESSO, PADRÃO CNJ (Resolução CNJ 65/2008) — módulo PURO, sem rede e sem
// Prisma: NNNNNNN-DD.AAAA.J.TR.OOOO, 20 dígitos (sequencial(7).dígito(2).ano(4).segmento(1).
// tribunal(2).origem(4)), com o dígito verificador calculado por ISO 7064 MOD 97-10.
//
// docs/agentes/peticionamento-firecrawl-validacao.md §3: "processo sem número completo no padrão
// CNJ não vale. Não se cita e não se aprova." Este módulo é o que torna essa frase verificável —
// `lib/peticionamentoIdentificadorDeJulgado.ts` usa `digitoValido` para não deixar passar como
// "válido" um número que TEM a forma certa (sete segmentos, sem máscara) mas cujo dígito
// verificador não bate: hoje isso é exatamente o caso do exemplo mais perigoso, porque nenhum
// reconhecedor de FORMA (regex) pega — só a conta.

import { detectarTribunalPorNumeroCNJ } from "@/lib/cnjTribunal";

const FORMATO_CNJ = /^(\d{7})-?(\d{2})\.?(\d{4})\.?(\d)\.?(\d{2})\.?(\d{4})$/;

/** Extrai os 20 dígitos de um número CNJ (com ou sem máscara de pontuação), ou `null` se o texto
 * não tiver exatamente essa forma — 21 ou 19 dígitos, por exemplo, não normalizam. */
export function normalizarCnj(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const m = FORMATO_CNJ.exec(texto.trim());
  if (m) return m.slice(1, 7).join("");
  // Sem pontuação nenhuma ("00008323520184013202"): só aceita com exatamente 20 dígitos — texto
  // com qualquer caractere que não seja dígito nessa forma já teria casado no regex pontuado acima.
  const soDigitos = texto.replace(/\D/g, "");
  if (soDigitos === texto.trim() && soDigitos.length === 20) return soDigitos;
  return null;
}

/**
 * O dígito verificador (2 dígitos) dos 18 dígitos restantes (sequencial+ano+segmento+tribunal+
 * origem, SEM o próprio DV): `98 - (int(dígitos18 + "00") % 97)`, formatado com 2 casas. Usa
 * `BigInt` porque o número (18-20 dígitos) estoura a precisão segura de `Number` (2^53).
 */
export function digitoVerificadorCnj(digitos18: string): string {
  // BigInt(97)/BigInt(98), não o literal `97n`/`98n": o `target` deste projeto (tsconfig.json)
  // é ES2018, mais antigo que o ES2020 exigido pela sintaxe de literal BigInt.
  const resto = BigInt(`${digitos18}00`) % BigInt(97);
  const dv = BigInt(98) - resto;
  return dv.toString().padStart(2, "0");
}

/** Recompõe a máscara oficial NNNNNNN-DD.AAAA.J.TR.OOOO a partir dos 20 dígitos. */
export function formatarCnj(digitos20: string): string {
  return `${digitos20.slice(0, 7)}-${digitos20.slice(7, 9)}.${digitos20.slice(9, 13)}.${digitos20.slice(13, 14)}.${digitos20.slice(14, 16)}.${digitos20.slice(16, 20)}`;
}

/**
 * Formato de 20 dígitos + dígito verificador batendo com a conta + segmento de justiça/tribunal
 * (J.TR) reconhecido no catálogo (lib/cnjTribunal.ts) — NÃO confirma que o processo existe de
 * verdade (isso é trabalho de quem consulta o tribunal), só que o número TEM a forma, a
 * aritmética e o tribunal de um número real, o suficiente para não ser um molde nem um número
 * inventado. Um DV que bate por acaso com um código de tribunal inexistente (J.TR fora do
 * catálogo) ainda é recusado aqui.
 */
export function cnjValido(texto: string | null | undefined): boolean {
  const digitos = normalizarCnj(texto);
  if (!digitos) return false;
  const dvInformado = digitos.slice(7, 9);
  const digitos18 = digitos.slice(0, 7) + digitos.slice(9);
  if (digitoVerificadorCnj(digitos18) !== dvInformado) return false;
  return detectarTribunalPorNumeroCNJ(digitos) !== null;
}
