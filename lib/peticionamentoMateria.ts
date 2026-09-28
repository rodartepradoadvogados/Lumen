// As matérias "DO LÚMEN" — lista global, igual para todo escritório (contraponto de
// PeticionamentoMateria no schema, que guarda as matérias QUE UM escritório específico
// adicionou — decisions.md §9, item 4: "a matéria nova vale só para aquele escritório, nunca
// vira opção global do Lúmen").
//
// Deliberadamente uma lista PRÓPRIA da aba de peticionamento, e não lib/caseMaterias.ts: aquela
// lista é a de Processo (Case.materias, usada para relatório/filtro de processo) e tem um
// vocabulário mais curto; a especificação e os mockups desta aba usam um vocabulário próprio,
// que inclui "Direito Médico e Saúde Suplementar" (matéria com skill já treinada,
// direito-medico-negativa-cobertura) — juntar as duas listas hoje mudaria silenciosamente o
// catálogo de Processos, que não é escopo desta entrega.

export const MATERIAS_DO_LUMEN = [
  "Cível",
  "Trabalhista",
  "Tributário",
  "Direito Médico e Saúde Suplementar",
  "Sucessões",
  "Família",
  "Imobiliário",
  "Empresarial",
] as const;

export function ehMateriaDoLumen(nome: string): boolean {
  return (MATERIAS_DO_LUMEN as readonly string[]).includes(nome);
}

export type ResultadoValidacaoMateria = { ok: true; nomeNormalizado: string } | { ok: false; erro: string };

/**
 * Valida o nome digitado ao "+ Adicionar matéria" (decisions.md §9, item 4) — trim, tamanho
 * mínimo/máximo, e nunca permite cadastrar de novo um nome que já existe na lista global do
 * Lúmen (isso confundiria "matéria do escritório" com "matéria do Lúmen" na mesma sessão).
 * `materiasJaDoEscritorio` são os nomes que ESTE escritório já cadastrou, para barrar duplicata.
 */
export function validarNovaMateria(nomeDigitado: string, materiasJaDoEscritorio: string[]): ResultadoValidacaoMateria {
  const nome = nomeDigitado.trim();
  if (nome.length === 0) return { ok: false, erro: "Digite o nome da nova matéria." };
  if (nome.length > 60) return { ok: false, erro: "Nome da matéria longo demais (máximo 60 caracteres)." };
  if (ehMateriaDoLumen(nome)) return { ok: false, erro: "Esta matéria já existe na lista do Lúmen — não é preciso cadastrar de novo." };
  const jaExiste = materiasJaDoEscritorio.some((m) => m.trim().toLowerCase() === nome.toLowerCase());
  if (jaExiste) return { ok: false, erro: "Este escritório já cadastrou uma matéria com este nome." };
  return { ok: true, nomeNormalizado: nome };
}

// ── MAIS DE UMA MATÉRIA (pedido do dono, 22/09/2026: "Em vincular contexto, precisa de permitir
// marcar mais de uma matéria") ────────────────────────────────────────────────────────────────
//
// O contrato está escrito no schema (PeticionamentoSessao.materiasNomes): `materiaNome` continua
// sendo a matéria PRINCIPAL (a primeira marcada) e `materiasNomes` é a lista COMPLETA, incluindo
// a principal, na ordem em que foram marcadas. As duas funções abaixo são o lado PURO disso — a
// leitura fail-open do dado antigo e a normalização do que a tela mandou.

export type MateriaEscolhida = { nome: string; ehDoEscritorio: boolean };

/**
 * A LEITURA FAIL-OPEN, exigida pelo schema: "uma sessão antiga (materiasNomes vazia, materiaNome
 * preenchida) tem de ser lida como 'uma matéria só' sem nenhum passo de migração".
 *
 * Recebe `materiasNomes` como `unknown` de propósito — é uma coluna Json, e o que vem do Prisma
 * pode ser array, null, ou (se alguém gravar torto um dia) qualquer outra coisa. Nada aqui
 * estoura: lista inválida vira lista vazia, e a matéria principal salva o caso antigo.
 */
export function lerMateriasDaSessao(materiasNomes: unknown, materiaNome: string | null | undefined): string[] {
  const lista = Array.isArray(materiasNomes)
    ? materiasNomes.filter((n): n is string => typeof n === "string" && n.trim().length > 0).map((n) => n.trim())
    : [];
  if (lista.length > 0) return lista;
  const principal = (materiaNome ?? "").trim();
  return principal ? [principal] : [];
}

/** A matéria-cabeça — a primeira da lista, ou a antiga `materiaNome` quando a lista não existe. */
export function materiaPrincipalDaSessao(materiasNomes: unknown, materiaNome: string | null | undefined): string | null {
  return lerMateriasDaSessao(materiasNomes, materiaNome)[0] ?? null;
}

/**
 * O que a tela mandou, pronto para gravar: sem vazio, sem repetida, ordem de marcação preservada
 * (é ela que decide quem é a principal). A comparação de duplicata ignora caixa — "Cível" e
 * "cível" são a mesma matéria, e deixar as duas entrarem faria o prompt listar a mesma coisa
 * duas vezes ao agente.
 */
export function normalizarSelecaoDeMaterias(selecao: MateriaEscolhida[]): MateriaEscolhida[] {
  const vistas = new Set<string>();
  const saida: MateriaEscolhida[] = [];
  for (const item of selecao) {
    const nome = (item?.nome ?? "").trim();
    if (!nome) continue;
    const chave = nome.toLowerCase();
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    saida.push({ nome, ehDoEscritorio: !!item.ehDoEscritorio });
  }
  return saida;
}
