// "1 tarefa" / "2 tarefas". Substitui o "tarefa(s)" espalhado pelas telas de Gestão — o "(s)" é
// jargão de formulário, não português de tela (consolidado da Gestão, R18). Não cobre plural
// irregular: passe as duas formas quando não bastar acrescentar "s".
export function contar(n: number, singular: string, plural?: string): string {
  return `${n} ${n === 1 ? singular : (plural ?? `${singular}s`)}`;
}

// Só a palavra, sem o número: `palavra(n, "ativo")` -> "ativos".
export function palavra(n: number, singular: string, plural?: string): string {
  return n === 1 ? singular : (plural ?? `${singular}s`);
}
