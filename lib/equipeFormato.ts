// ============================================================================
// A TRAVA DA EQUIPE — nome, função e escala, e mais nada.
//
// Decisão expressa do dono, na entrevista que gerou o F6: a ferramenta "equipe" do agente NUNCA
// devolve telefone nem e-mail de ninguém. Nome, função e escala — e mais nada. Palavras dele, sem
// margem de interpretação.
//
// POR QUE ISTO É UMA FUNÇÃO PURA, E NÃO SÓ UM `select` NA CONSULTA. Um `select` de três campos
// hoje é uma trava só enquanto ninguém mexer nele: um `include` copiado de outra tela, um "já que
// estou aqui" que acrescenta `phone` para "completar o cadastro", um relacionamento que carrega o
// User inteiro — nenhum desses erros é hipotético nesta casa. Esta função é a SEGUNDA trava, a que
// sobrevive ao erro na primeira: mesmo que a consulta chegue aqui com o User inteiro — telefone,
// e-mail, CPF, endereço, hash de senha —, só os três campos abaixo atravessam para o agente. O
// resto morre neste mapeamento, e é isso que o teste de mutação prova (ver
// lib/testes/equipeFormato.teste.ts): a trava não é "cuidar para não selecionar o campo", é "o
// campo não sai daqui mesmo que exista na entrada".
// ============================================================================

/**
 * O que a consulta ao banco entrega. Aceita (e ignora de propósito) qualquer campo extra — é
 * assim que o teste de mutação simula um `include` que trouxe o User inteiro sem precisar mentir
 * sobre o tipo declarado pelo Prisma.
 */
export type LinhaEquipeBruta = {
  name: string;
  role: string | null;
  recebeTransferencia: boolean;
  [outroCampo: string]: unknown;
};

export type ItemEquipe = {
  nome: string;
  funcao: string;
  escala: boolean;
};

/** As três (e só as três) chaves que uma pessoa da equipe pode carregar para fora deste arquivo. */
export const CHAVES_DO_ITEM_EQUIPE = ["nome", "funcao", "escala"] as const;

export function formatarEquipe(linhas: readonly LinhaEquipeBruta[]): ItemEquipe[] {
  return linhas.map((u) => ({
    nome: u.name,
    // Papel vazio ("") é tratado como ausente — igual a `role: null` — para não devolver uma
    // string vazia com cara de resposta.
    funcao: u.role && u.role.trim() ? u.role.trim() : "Sem função definida",
    // `=== true` e não coerção: um valor "quase verdadeiro" (1, "true", {}) vindo de uma consulta
    // malformada não deveria contar como estar na escala.
    escala: u.recebeTransferencia === true,
  }));
}
