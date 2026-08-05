// Motor de máscara do modo "Vidro Fosco" (Fase A do sigilo do suporte).
//
// Funções PURAS de redação: nada aqui importa Prisma, next/headers ou React. É de propósito —
// este arquivo precisa rodar num script solto (`npx tsx scripts/testar-mascaramento.ts`) sem
// subir o app, porque a única forma honesta de garantir sigilo é conseguir testar a redação
// isoladamente.
//
// Três invariantes que TODA função aqui respeita:
//   1. Nunca lança. Entrada null/undefined/"" volta como veio (null/undefined/"").
//   2. É idempotente: f(f(x)) === f(x). Isso importa porque um mesmo valor pode passar pelo
//      aplicador mais de uma vez (ex.: um objeto referenciado por duas relações no mesmo
//      resultado), e uma segunda passada não pode "mascarar a máscara" e destruir o formato.
//   3. Preserva o FORMATO. O suporte precisa conseguir dizer "o terceiro da lista" ou "esse CPF
//      termina em 123" sem nunca saber de quem é o dado.

// Caractere único de redação. Bullet (U+2022) e não "*" porque não colide com nada que apareça
// em nome, documento ou número de processo — o que garante a idempotência: um "•" nunca é
// confundido com um dígito ou letra a ser mascarado numa segunda passada.
const DOT = "•";

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

// Preserva a primeira letra de cada palavra e o comprimento das demais.
// "Maria Aparecida da Silva" -> "M••••• A••••••• d• S•••"
// Idempotente: a primeira letra continua sendo letra e o resto já é DOT, que é reescrito como DOT.
export function maskPersonName<T extends string | null | undefined>(value: T): T {
  if (isBlank(value)) return value;
  return (value as string).replace(/\S+/g, (word) => {
    const chars = [...word];
    if (chars.length <= 1) return word;
    return chars[0] + DOT.repeat(chars.length - 1);
  }) as T;
}

// Preserva os 3 ÚLTIMOS dígitos e todos os separadores. Serve para CPF, CNPJ, RG e OAB.
// "123.456.789-01" -> "•••.•••.••9-01"   |   "12.345.678/0001-99" -> "••.•••.•••/•••1-99"
// Idempotente: DOT não é dígito, então os 3 dígitos preservados continuam sendo os 3 últimos.
const DOCUMENT_VISIBLE_DIGITS = 3;
export function maskDocument<T extends string | null | undefined>(value: T): T {
  if (isBlank(value)) return value;
  const chars = [...(value as string)];
  let kept = 0;
  for (let i = chars.length - 1; i >= 0; i--) {
    if (!/\d/.test(chars[i])) continue;
    if (kept < DOCUMENT_VISIBLE_DIGITS) {
      kept++;
      continue;
    }
    chars[i] = DOT;
  }
  return chars.join("") as T;
}

// Preserva o domínio inteiro e a primeira letra do local-part.
// "joao@escritorio.com" -> "j•••@escritorio.com"
// O domínio fica visível de propósito: é o que permite diagnosticar integração de e-mail
// ("os e-mails de @clientex.com.br não estão entrando") sem identificar a pessoa.
export function maskEmail<T extends string | null | undefined>(value: T): T {
  if (isBlank(value)) return value;
  const raw = value as string;
  const at = raw.lastIndexOf("@");
  // Sem "@" não dá para separar domínio de pessoa — mascara tudo menos a primeira letra, que é
  // o comportamento conservador (nunca devolve mais do que devolveria com "@").
  if (at <= 0) return maskLocalPart(raw) as T;
  return (maskLocalPart(raw.slice(0, at)) + raw.slice(at)) as T;
}

function maskLocalPart(local: string): string {
  const chars = [...local];
  if (chars.length <= 1) return local;
  return chars[0] + DOT.repeat(chars.length - 1);
}

// Preserva o DDD (e o código de país, quando presente) e os 2 últimos dígitos.
// "(62) 99999-1234" -> "(62) •••••-••34"
// Heurística de país: só trata "55" como DDI quando há dígitos demais para ser um número
// nacional (>11 dígitos), senão "55" seria confundido com o DDD de Porto Alegre.
export function maskPhone<T extends string | null | undefined>(value: T): T {
  if (isBlank(value)) return value;
  const chars = [...(value as string)];
  const digitPositions = chars.map((c, i) => (/\d/.test(c) ? i : -1)).filter((i) => i >= 0);
  const digits = digitPositions.map((i) => chars[i]).join("");
  const keepFront = digits.length > 11 && digits.startsWith("55") ? 4 : 2;
  const keepBack = 2;
  digitPositions.forEach((pos, idx) => {
    if (idx < keepFront) return;
    if (idx >= digitPositions.length - keepBack) return;
    chars[pos] = DOT;
  });
  return chars.join("") as T;
}

// Valor monetário some por completo — não existe máscara parcial de dinheiro que não seja
// reconstituível por soma/diferença com os outros lançamentos da mesma tela.
//
// Devolve SEMPRE null. Quem aplica (lib/supportMaskingApply.ts) é que troca por 0 quando o
// campo é obrigatório no schema, porque trocar o TIPO de um campo numérico quebraria
// .toFixed(), somas e gráficos em runtime.
// O parâmetro existe para manter a assinatura simétrica com as demais máscaras (todas recebem o
// valor original) e para que trocar a estratégia no futuro não obrigue a mexer em quem chama.
// Hoje o valor é ignorado de propósito: dinheiro some por completo.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function maskMoney(_value?: unknown): null {
  return null;
}

const FREE_TEXT_PATTERN = /^\[conteúdo protegido — \d+ caracteres?\]$/;

// Some com o teor, preserva o COMPRIMENTO — que é diagnóstico de verdade: distingue publicação
// vazia de publicação truncada, campo não preenchido de campo com conteúdo.
// Idempotente por detecção explícita do próprio formato de saída: sem isso, a segunda passada
// mediria o comprimento do rótulo em vez do comprimento do texto original.
export function maskFreeText<T extends string | null | undefined>(value: T): T {
  if (isBlank(value)) return value;
  const raw = value as string;
  if (FREE_TEXT_PATTERN.test(raw)) return value;
  const n = [...raw].length;
  return `[conteúdo protegido — ${n} ${n === 1 ? "caractere" : "caracteres"}]` as T;
}

const URL_PLACEHOLDER = "[link protegido]";

// URL vira rótulo fixo. Não preserva comprimento de propósito: o comprimento de uma URL de
// Drive/Blob é praticamente um identificador (o file id domina o tamanho da string).
export function maskUrl<T extends string | null | undefined>(value: T): T {
  if (isBlank(value)) return value;
  return URL_PLACEHOLDER as T;
}

// CNJ: NNNNNNN-DD.AAAA.J.TR.OOOO
// Preserva ANO (AAAA), SEGMENTO (J) e TRIBUNAL (TR). Oculta o número sequencial (NNNNNNN), os
// dígitos verificadores (DD) e a unidade de origem (OOOO).
//
// Decisão sobre OOOO: o enunciado pedia "ano e segmento/tribunal". A unidade de origem é a
// vara/comarca específica — combinada com ano e tribunal ela estreita demais o universo de
// processos, então entra na parte oculta. Ano + segmento + tribunal já respondem sozinhos a
// pergunta de diagnóstico real ("o DJEN deste tribunal está trazendo publicação?").
//
// "0001234-56.2023.8.09.0051" -> "•••••••-••.2023.8.09.••••"
const CNJ_PATTERN = /^([\d•]{7})-([\d•]{2})\.(\d{4})\.([\d•])\.([\d•]{2})\.([\d•]{4})$/;

export function maskProcessNumber<T extends string | null | undefined>(value: T): T {
  if (isBlank(value)) return value;
  const raw = value as string;
  const match = CNJ_PATTERN.exec(raw.trim());
  if (match) {
    const [, , , year, segment, court] = match;
    return `${DOT.repeat(7)}-${DOT.repeat(2)}.${year}.${segment}.${court}.${DOT.repeat(4)}` as T;
  }
  // Não é CNJ (Publication.processNumberRaw aceita o que o tribunal mandar, inclusive texto
  // solto). Sem estrutura conhecida não dá para saber qual dígito é inofensivo — oculta todos.
  return raw.replace(/\d/g, DOT) as T;
}

// Catálogo das funções, para o mapa declarativo referenciar por nome em vez de por import
// direto (ver lib/supportMaskingMap.ts). "money" fica de fora do dicionário de string porque
// tem assinatura diferente — o aplicador trata numérico por tipo do schema, não por função.
export const STRING_MASKERS = {
  personName: maskPersonName,
  document: maskDocument,
  email: maskEmail,
  phone: maskPhone,
  freeText: maskFreeText,
  url: maskUrl,
  processNumber: maskProcessNumber,
} as const;

export type StringMaskKind = keyof typeof STRING_MASKERS;
export type MaskKind = StringMaskKind | "money";
