// CHAVE DO PROCESSO — a identidade de "qual processo é este" para agrupar, baixar e contar
// publicações. Módulo PURO (sem Prisma, sem rede).
//
// Por que existe: o agrupamento e a baixa usavam só o número CNJ de 20 dígitos
// (`normalizarNumeroProcesso`, lib/roboBridge.ts). O Projudi de Goiás avisa por e-mail com um
// número CURTO — `5618319.57`, sete dígitos, ponto, dois dígitos — que nunca virava chave: cada
// aviso era um grupo de um item só, nunca agrupava e nunca era baixado junto. No banco de produção
// (12/10/2026): 158 avisos do Projudi, 96 deles nesse formato, 24 processos com 2 a 5 avisos soltos.
//
// A chave leva um prefixo para os dois formatos nunca colidirem:
//   "CNJ:<20 dígitos>"        número único do CNJ, com ou sem máscara
//   "CURTO:<7 dígitos>.<2>"   número curto do Projudi-GO (não tem dígito verificador conhecido,
//                             então NÃO se valida o dígito: só a forma)
//
// Número curto só identifica o processo DENTRO do sistema que o emitiu. É uma chave de agrupamento
// (mesmo número + mesmo dia = o mesmo aviso repetido), não uma prova de que dois órgãos diferentes
// não usam o mesmo número curto: por isso o agrupamento sempre exige também o mesmo dia.

const CURTO_EXATO = /^(\d{7})[.\-](\d{2})$/;

/** Forma canônica do número curto: `NNNNNNN.NN`. */
function formaCurta(sete: string, dois: string): string {
  return `${sete}.${dois}`;
}

/** Chave do processo, ou `null` quando o texto não é nenhum dos dois formatos reconhecidos. */
export function chaveDoProcesso(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const texto = raw.trim();
  if (!texto) return null;
  const digitos = texto.replace(/\D/g, "");
  if (digitos.length === 20) return `CNJ:${digitos}`;
  const curto = CURTO_EXATO.exec(texto);
  if (curto) return `CURTO:${formaCurta(curto[1], curto[2])}`;
  return null;
}

/** `true` quando o número é do formato curto do Projudi-GO (e não um CNJ). */
export function ehNumeroCurto(raw: string | null | undefined): boolean {
  return chaveDoProcesso(raw)?.startsWith("CURTO:") ?? false;
}

// Número curto dentro de um TEXTO (corpo de e-mail). Borda estrita: não pode estar colado em outros
// dígitos, pontos, vírgulas, barras ou hífens (evita pedaço de CNJ, valor em reais, data, IP).
const CURTO_NO_TEXTO = /(?<![\d.,/\-])(\d{7})\.(\d{2})(?![\d.,/\-]?\d)/;

/** Primeiro número curto encontrado no texto, em forma canônica, ou `null`. */
export function numeroCurtoNoTexto(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const m = CURTO_NO_TEXTO.exec(texto);
  return m ? formaCurta(m[1], m[2]) : null;
}
