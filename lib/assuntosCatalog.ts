// Catálogo de referência de assuntos por matéria — mostrado no pop-up "Ver exemplos" do campo
// Assuntos (Case.assuntos, ver proposta aprovada em 2026-08-07). Puramente informativo: clicar
// num item preenche o primeiro campo de assunto vazio, mas o campo continua livre para qualquer
// outro texto. Começa só com as 3 matérias que o escritório deu como exemplo — fácil de completar
// com as demais (Família, Sucessões, Criminal, Previdenciário, Empresarial, Administrativo...)
// quando quiserem, é só adicionar outra entrada aqui.
export type AssuntoCatalogEntry = { materia: string; assuntos: string[] };

export const ASSUNTOS_CATALOG: AssuntoCatalogEntry[] = [
  { materia: "Trabalhista", assuntos: ["Rescisão Indireta", "Acúmulo de Função", "Danos Morais"] },
  { materia: "Cível", assuntos: ["Consumidor", "Responsabilidade Civil do Fornecedor", "Propaganda Enganosa"] },
  { materia: "Tributário", assuntos: ["Repetição do Indébito", "Compensação Tributária"] },
];
