// ============================================================================
// O CATÁLOGO DE MOTIVOS DE RECUSA.
//
// Dois andares, e a decisão do dono foi essa: a Lúmen cadastra motivos-padrão no Painel Mestre, e
// cada escritório seleciona, acrescenta, edita, desativa ou volta ao padrão. O que este arquivo
// resolve é a pergunta que decorre disso: DADOS os dois andares, qual é a lista que aquele
// escritório vê hoje?
//
// AS TRÊS REGRAS, E POR QUE CADA UMA É ASSIM:
//
//   1. O ESCRITÓRIO NÃO GUARDA CÓPIA DO PADRÃO. Enquanto ele não editar um motivo da plataforma,
//      ele APONTA para ele — então, quando a Lúmen corrige uma frase em 2027, todo escritório que
//      nunca mexeu naquele motivo recebe a correção. Se o escritório editou, ele fica com o dele:
//      a edição é trabalho de alguém, e sobrescrever trabalho sem avisar é o erro caro. A
//      alternativa que parece mais simples — copiar tudo na primeira seleção — faz o catálogo
//      apodrecer em silêncio: quarenta escritórios continuariam mandando o texto errado.
//
//   2. EXCLUIR UM MOTIVO DA PLATAFORMA É DESATIVAR, NUNCA APAGAR. Excluir e "voltar ao padrão"
//      são a mesma coisa vista de dois lados; se a exclusão fosse definitiva, o botão de voltar ao
//      padrão não teria para onde voltar. O que o escritório criou por conta própria, esse sim
//      some de verdade quando ele exclui — é dele, e não há padrão atrás.
//
//   3. VOLTAR AO PADRÃO É APAGAR A CAMADA DO ESCRITÓRIO. Um motivo por vez, ou a lista inteira.
//      Não existe "restaurar o texto antigo do padrão": o padrão é o que a Lúmen tem AGORA.
// ============================================================================

/** Uma linha do catálogo, de qualquer um dos dois andares. */
export type MotivoBruto = {
  id: string;
  /** Nulo quando é da plataforma; preenchido quando é a camada de um escritório. */
  officeId: string | null;
  /** Quando esta linha é a versão do escritório de um motivo da plataforma, o id daquele. */
  baseId: string | null;
  rotulo: string;
  descricao: string | null;
  /** O escritório tirou este motivo das telas dele. A linha continua existindo (regra 2). */
  desativado: boolean;
  ordem: number;
};

/** Um motivo como a tela do escritório o mostra, já resolvido entre os dois andares. */
export type MotivoResolvido = {
  /** O id que a recusa vai gravar: o da camada do escritório quando existe, senão o da plataforma. */
  id: string;
  rotulo: string;
  descricao: string | null;
  /** De onde veio: muda o que a tela oferece (editar e voltar ao padrão, ou editar e excluir). */
  origem: "plataforma" | "plataforma-editado" | "proprio";
  /** O id do motivo da plataforma por trás — é para onde "voltar ao padrão" aponta. */
  baseId: string | null;
  ordem: number;
};

/**
 * A lista que este escritório vê.
 *
 * Recebe os dois andares inteiros e resolve em memória. Não é consulta: a resolução tem três
 * regras que só se entendem juntas, e escrevê-las como `where` de banco as espalharia por todo
 * lugar que precisa da lista.
 *
 * A ORDEM É ESTÁVEL: pelo campo `ordem`, e o id desempata. Um catálogo que troca de ordem entre
 * duas leituras faz quem escolhe motivo por posição escolher errado — e depois de uma semana
 * todo mundo escolhe por posição.
 */
export function motivosDoEscritorio(catalogo: MotivoBruto[], officeId: string): MotivoResolvido[] {
  const daPlataforma = catalogo.filter((m) => m.officeId === null);
  const doEscritorio = catalogo.filter((m) => m.officeId === officeId);

  // Indexado por baseId: é assim que se descobre, para cada padrão, se este escritório tem uma
  // versão própria dele.
  const camadaPorBase = new Map<string, MotivoBruto>();
  for (const m of doEscritorio) if (m.baseId) camadaPorBase.set(m.baseId, m);

  const resolvidos: MotivoResolvido[] = [];

  for (const padrao of daPlataforma) {
    // Um padrão que a própria Lúmen desativou sai para todo mundo, inclusive para quem tinha uma
    // versão própria dele: se o motivo deixou de existir na plataforma, ele não deve ser oferecido.
    if (padrao.desativado) continue;

    const meu = camadaPorBase.get(padrao.id);
    if (!meu) {
      // Regra 1: sem camada própria, o escritório aponta para o padrão e recebe as correções dele.
      resolvidos.push({
        id: padrao.id,
        rotulo: padrao.rotulo,
        descricao: padrao.descricao,
        origem: "plataforma",
        baseId: padrao.id,
        ordem: padrao.ordem,
      });
      continue;
    }
    // Regra 2: desativado pelo escritório some das telas dele — e só delas.
    if (meu.desativado) continue;
    resolvidos.push({
      id: meu.id,
      rotulo: meu.rotulo,
      descricao: meu.descricao,
      origem: "plataforma-editado",
      baseId: padrao.id,
      ordem: meu.ordem,
    });
  }

  for (const proprio of doEscritorio) {
    // As linhas com baseId já foram tratadas acima, junto do padrão a que pertencem.
    if (proprio.baseId) continue;
    if (proprio.desativado) continue;
    resolvidos.push({
      id: proprio.id,
      rotulo: proprio.rotulo,
      descricao: proprio.descricao,
      origem: "proprio",
      baseId: null,
      ordem: proprio.ordem,
    });
  }

  return resolvidos.sort((a, b) => (a.ordem !== b.ordem ? a.ordem - b.ordem : a.id.localeCompare(b.id)));
}

/**
 * O que a tela oferece para cada motivo.
 *
 * Escrito como função e não como `if` na tela porque a mesma decisão aparece em três lugares (a
 * lista, o menu de cada linha e a ação do servidor que precisa recusar o que a tela não oferece).
 */
export function acoesDoMotivo(m: MotivoResolvido): { editar: boolean; desativar: boolean; excluir: boolean; voltarAoPadrao: boolean } {
  return {
    editar: true,
    // Desativar é o "excluir" de quem tem padrão atrás (regra 2).
    desativar: m.origem !== "proprio",
    // Só o que o escritório criou some de verdade.
    excluir: m.origem === "proprio",
    voltarAoPadrao: m.origem === "plataforma-editado",
  };
}

/** Há o que voltar ao padrão nesta lista? É o que decide se o botão de restaurar tudo aparece. */
export function temEdicaoDoEscritorio(catalogo: MotivoBruto[], officeId: string): boolean {
  return catalogo.some((m) => m.officeId === officeId && m.baseId !== null);
}

export const LIMITE_DO_ROTULO = 80;

/**
 * O rótulo é o que vai para a carta que o lead lê. Uma frase, não um parágrafo — e nunca vazia,
 * porque um motivo sem texto vira uma recusa sem motivo.
 */
export function rotuloValido(bruto: string): { ok: true; rotulo: string } | { ok: false; erro: string } {
  const rotulo = (bruto || "").replace(/\s+/g, " ").trim();
  if (!rotulo) return { ok: false, erro: "Escreva o motivo." };
  if (rotulo.length > LIMITE_DO_ROTULO) return { ok: false, erro: `O motivo passa de ${LIMITE_DO_ROTULO} caracteres. Use uma frase.` };
  return { ok: true, rotulo };
}
