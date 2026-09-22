// TESES A CONSIDERAR — escrita manual, e só ela (pedido do dono, 22/09/2026): "apenas para
// escrita manual, sem seleção de rol fechado, com caixa de escrita e botão de salvar e de
// cancelar, com acréscimo de nova caixa abaixo a cada tese acrescentada".
//
// O rol fechado que existia antes (três sugestões de plano de saúde em
// lib/peticionamentoQuestionario.ts) saiu do caminho do usuário: uma lista pré-pronta para marcar
// empurra a tese do MODELO para dentro da peça do advogado, que é exatamente o contrário do que
// esta etapa serve para fazer. Quem escreve a tese é quem responde por ela.
//
// Módulo PURO — só strings, nenhum acesso a Prisma/React. A tela (WizardClient) e os testes de
// mesa usam as MESMAS funções, para a regra não existir em duas versões que divergem com o tempo.
// `PeticionamentoSessao.teses` continua sendo `Json @default("[]")`: uma lista de strings, na
// ordem em que o advogado escreveu.

/**
 * O teto por tese. Não é limite de banco (o campo é Json, sem tamanho declarado) — é limite de
 * LEGIBILIDADE: uma "tese" de dez mil caracteres é uma petição inteira colada no campo errado, e
 * ela entraria no pedido ao agente como se fosse um item de lista.
 *
 * O número é dito na tela ao lado da caixa (contador), e o texto NUNCA é cortado em silêncio:
 * passar do limite é recusa com motivo, para o advogado decidir o que tirar — cortar por conta
 * própria trocaria a tese dele por uma frase pela metade que ninguém escreveu.
 */
export const LIMITE_CARACTERES_TESE = 400;

/**
 * A forma de comparação — só para decidir se duas teses são a MESMA, nunca para guardar. Ignora
 * caixa, acento, pontuação de borda e espaço repetido: "Rol da ANS é exemplificativo" e
 * "rol da ans e  exemplificativo." são a mesma tese escrita duas vezes, e a segunda não entra.
 */
export function normalizarTese(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.,;:—–-]+|[.,;:—–-]+$/g, "")
    .trim();
}

export type ResultadoDeTese = { ok: true; teses: string[] } | { ok: false; motivo: string };

/**
 * A recusa, dita em português e sempre com o motivo — a tela mostra este texto embaixo da caixa,
 * sem inventar um segundo enunciado para a mesma regra.
 *
 * `indiceIgnorado` existe para a EDIÇÃO: ao reescrever a tese nº 2, a própria tese nº 2 não pode
 * contar como duplicata dela mesma (senão salvar uma correção de vírgula seria impossível).
 */
type Veredito = { ok: true; limpo: string } | { ok: false; motivo: string };

function avaliar(teses: string[], texto: string, indiceIgnorado: number | null): Veredito {
  const limpo = texto.trim();
  if (limpo.length === 0) {
    return { ok: false, motivo: "Escreva a tese antes de salvar — caixa vazia (ou só com espaços) não entra na lista." };
  }
  if (limpo.length > LIMITE_CARACTERES_TESE) {
    return {
      ok: false,
      motivo: `Esta tese tem ${limpo.length} caracteres e o limite é ${LIMITE_CARACTERES_TESE}. Encurte o texto — nada é cortado automaticamente, para você não descobrir depois que metade da tese sumiu.`,
    };
  }
  const chave = normalizarTese(limpo);
  const jaExiste = teses.some((t, i) => i !== indiceIgnorado && normalizarTese(t) === chave);
  if (jaExiste) {
    return { ok: false, motivo: "Esta tese já está na lista — o mesmo argumento duas vezes não reforça a peça, só a repete." };
  }
  return { ok: true, limpo };
}

/** Acrescenta ao FIM — a ordem em que o advogado escreveu é a ordem que vai para o agente. */
export function acrescentarTese(teses: string[], texto: string): ResultadoDeTese {
  const veredito = avaliar(teses, texto, null);
  if (!veredito.ok) return veredito;
  return { ok: true, teses: [...teses, veredito.limpo] };
}

/** Reescreve a tese daquela posição, SEM mudar a posição — editar não reordena a lista. */
export function editarTese(teses: string[], indice: number, texto: string): ResultadoDeTese {
  if (indice < 0 || indice >= teses.length) {
    return { ok: false, motivo: "Esta tese não está mais na lista — atualize a tela antes de salvar." };
  }
  const veredito = avaliar(teses, texto, indice);
  if (!veredito.ok) return veredito;
  const copia = [...teses];
  copia[indice] = veredito.limpo;
  return { ok: true, teses: copia };
}

/** Remove a tese daquela posição, preservando a ordem das demais. Índice fora da lista não mexe em nada. */
export function removerTese(teses: string[], indice: number): string[] {
  if (indice < 0 || indice >= teses.length) return [...teses];
  return teses.filter((_, i) => i !== indice);
}
