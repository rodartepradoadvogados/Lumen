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
