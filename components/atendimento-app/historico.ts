// De onde a pessoa veio DENTRO do app (o caminho anterior), para o "voltar" do cabeçalho decidir entre
// `router.back()` (preserva a busca e o chip da lista) e ir a um endereço fixo (link direto, recarga).
// Guardado em módulo: a casca do app não desmonta entre telas, então o valor sobrevive à navegação.

let atual: string | null = null;
let anterior: string | null = null;

export function registrarCaminho(caminho: string) {
  if (caminho === atual) return;
  anterior = atual;
  atual = caminho;
}

export function caminhoAnterior(): string | null {
  return anterior;
}
