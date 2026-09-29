// ============================================================================
// AS COLUNAS DO FUNIL COMEÇAM RECOLHIDAS (29/09/2026).
//
// Pedido do dono: para consultar e gerenciar, o funil abre com TODAS as colunas fechadas — só o nome
// e a contagem — e cada pessoa abre a que quiser. A escolha fica no aparelho (`localStorage`, sempre
// em try/catch: modo privado e dados bloqueados lançam), mas QUEM NUNCA ESCOLHEU VÊ TUDO RECOLHIDO.
//
// Regra pura, sem React e sem navegador, para o teste executar. O lado de navegador é
// components/atendimento/ColunasRecolhiveis.tsx.
//
// FORMATO GRAVADO: um JSON `{"NOVO":true,"PROPOSTA":true}` só com as colunas ABERTAS. Lixo, JSON
// quebrado, valor de outro tipo ou coluna que não existe mais viram "recolhida" — o padrão errado
// nunca abre coluna sozinho.
// ============================================================================

export type SuperficieDoFunil = "central" | "site" | "app";

export const CHAVE_DAS_COLUNAS = (superficie: SuperficieDoFunil) => `rp-funil-abertas-${superficie}`;

export type ColunasAbertas = Record<string, boolean>;

/** O que estava gravado -> quais colunas estão abertas. Qualquer coisa estranha = nenhuma aberta. */
export function lerColunasAbertas(bruto: string | null | undefined, estagios: readonly string[]): ColunasAbertas {
  const abertas: ColunasAbertas = {};
  if (!bruto) return abertas;
  try {
    const dado: unknown = JSON.parse(bruto);
    if (!dado || typeof dado !== "object" || Array.isArray(dado)) return abertas;
    for (const e of estagios) if ((dado as Record<string, unknown>)[e] === true) abertas[e] = true;
  } catch {
    /* JSON quebrado: tudo recolhido */
  }
  return abertas;
}

export function alternarColuna(abertas: ColunasAbertas, estagio: string): ColunasAbertas {
  const nova = { ...abertas };
  if (nova[estagio]) delete nova[estagio];
  else nova[estagio] = true;
  return nova;
}

/** "Expandir todas" (abrir = true) ou "Recolher todas". */
export function definirTodas(estagios: readonly string[], abrir: boolean): ColunasAbertas {
  const abertas: ColunasAbertas = {};
  if (abrir) for (const e of estagios) abertas[e] = true;
  return abertas;
}

/** O botão único do topo oferece "Recolher todas" só quando TODAS estão abertas; senão, "Expandir todas". */
export function todasAbertas(abertas: ColunasAbertas, estagios: readonly string[]): boolean {
  return estagios.length > 0 && estagios.every((e) => abertas[e] === true);
}
