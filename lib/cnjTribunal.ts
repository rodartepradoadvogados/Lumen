// Identifica o tribunal de origem de um processo a partir do número no padrão CNJ
// (Resolução CNJ 65/2008: NNNNNNN-DD.AAAA.J.TR.OOOO — sequencial(7).dígito(2).ano(4).
// segmento(1).tribunal(2).origem(4), 20 dígitos no total), mesmo quando o processo ainda não
// está cadastrado no Lúmen (ex.: publicação recém-chegada sem Case vinculado).
//
// A decomposição J/TR porta a lógica de robo-publicacoes/src/datajud.py:alias_do_tribunal (já
// validada em produção, usada lá para montar aliases de índice do Datajud) para TypeScript, mas
// em vez de um dicionário J→TR solto e duplicado, usa TRIBUNAIS_CATALOG (lib/tribunaisCatalog.ts)
// como única fonte de verdade — o mesmo catálogo que já alimenta o seletor de tribunais em
// /conexoes. Ver o comentário em TribunalCatalogEntry sobre a única divergência encontrada ao
// cruzar essa lógica com uma segunda fonte (TJM-SP).

import { TRIBUNAIS_CATALOG } from "@/lib/tribunaisCatalog";

export type TribunalDetectado = {
  sigla: string;
  nome: string;
};

// Map "J:TR" -> entrada do catálogo, construído uma vez no carregamento do módulo.
const CATALOGO_POR_CODIGO = new Map<string, TribunalDetectado>();
for (const t of TRIBUNAIS_CATALOG) {
  if (t.codigoJ == null || t.codigoTr == null) continue;
  CATALOGO_POR_CODIGO.set(`${t.codigoJ}:${t.codigoTr}`, { sigla: t.sigla, nome: t.nome });
}

// Aceita o número com ou sem máscara (ex.: "0000832-35.2018.4.01.3202" ou
// "00008323520184013202") — mesmo padrão de tolerância de lib/roboBridge.ts:normalizarNumeroProcesso.
export function detectarTribunalPorNumeroCNJ(numero: string | null | undefined): TribunalDetectado | null {
  if (!numero) return null;
  const digitos = numero.replace(/\D/g, "");
  if (digitos.length !== 20) return null;

  // NNNNNNN DD AAAA J TR OOOO
  const j = Number(digitos.slice(13, 14));
  const tr = Number(digitos.slice(14, 16));

  return CATALOGO_POR_CODIGO.get(`${j}:${tr}`) ?? null;
}
