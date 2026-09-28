import { PAPEIS_RECEPCAO, PAPEIS_ADVOGADO } from "@/lib/filaDeTransferencia";

// ============================================================================
// QUEM PODE VER O ATENDIMENTO — e quanto.
//
// A regra do dono tem TRÊS níveis, e não dois:
//
//   TOTAL     administrador e recepção/secretaria. Veem tudo: lista inteira, funil, qualquer
//             conversa. É quem organiza a captação do escritório.
//
//   PRÓPRIOS  advogado marcado para receber demandas, sócio ou não. Abre atendimento novo à mão
//             e vê SÓ o que foi repassado a ele. Não vê a lista do escritório, não vê o funil,
//             não vê a conversa do colega.
//
//   NENHUM    todo o resto. Não vê a tela, não vê o atalho, não vê atendimento na tela inicial —
//             nem no site nem no aplicativo.
//
// POR QUE O ADVOGADO COMUM ENTRA, MAS SÓ ATÉ AQUI. Ele recebe a demanda por WhatsApp e por
// e-mail e procura o lead por lá: o Lúmen não é o caminho dele, é o registro. Então ele precisa
// abrir o que lhe foi repassado — e não precisa da conversa dos outros. Atendimento é a conversa
// crua de quem ainda não é cliente contando o problema antes de saber se contrata: tem doença,
// tem dívida, tem briga de família. Quem não vai atender aquele caso não tem por que ler.
//
// A LISTA DE PAPÉIS É A MESMA DA FILA, importada e não recopiada. São perguntas diferentes —
// "quem recebe lead" e "quem pode abrir lead" — sobre o MESMO conjunto de pessoas: duas listas
// iguais escritas em dois lugares ficam iguais por um mês e divergem no dia em que alguém
// acrescenta um papel num só.
// ============================================================================

export type NivelDeAcesso = "total" | "proprios" | "nenhum";

export type QuemOlha = {
  isAdmin: boolean;
  /** Como está gravado em `User.role`. Mesmo nome do banco, para o viewer entrar sem tradutor. */
  role: string | null | undefined;
  /** `User.recebeTransferencia` — está na escala de leads. */
  recebeTransferencia?: boolean | null;
};

function papelEstaEm(papel: string | null | undefined, lista: readonly string[]): boolean {
  const p = (papel || "").trim().toLowerCase();
  return lista.some((x) => p === x);
}

/**
 * Quanto esta pessoa enxerga do Atendimento.
 *
 * FECHADO POR PADRÃO e na ordem certa: papel desconhecido, vazio ou nulo cai em "nenhum". Um
 * `role` que ninguém reconhece é exatamente o caso em que não se deve adivinhar a favor.
 */
export function nivelDeAcessoAoAtendimento(quem: QuemOlha | null | undefined): NivelDeAcesso {
  if (!quem) return "nenhum";
  if (quem.isAdmin === true) return "total";
  if (papelEstaEm(quem.role, PAPEIS_RECEPCAO)) return "total";
  // Advogado só entra se ESTIVER NA ESCALA. Advogado do escritório que não recebe lead não tem
  // por que ler a conversa de ninguém — e a marca nasce desligada, de propósito.
  if (quem.recebeTransferencia === true && papelEstaEm(quem.role, PAPEIS_ADVOGADO)) return "proprios";
  return "nenhum";
}

/** Tem alguma porta aberta? Serve para menu, atalho e cartão de tela inicial. */
export function podeVerAtendimentos(quem: QuemOlha | null | undefined): boolean {
  return nivelDeAcessoAoAtendimento(quem) !== "nenhum";
}

/** Vê o escritório inteiro — lista completa, funil, conversa de qualquer um. */
export function veTodoOAtendimento(quem: QuemOlha | null | undefined): boolean {
  return nivelDeAcessoAoAtendimento(quem) === "total";
}

/**
 * O recorte que TODA consulta de atendimento tem de carregar.
 *
 * Devolve um pedaço de `where` do Prisma: vazio para quem vê tudo, e o filtro por responsável
 * para quem só vê o que é seu. Existe como FUNÇÃO e não como regra escrita em cada tela porque
 * é isto que se esquece — a consulta nova, escrita daqui a três meses, que filtra por escritório
 * e esquece de filtrar por dono.
 *
 * Para quem não tem acesso nenhum devolve um filtro IMPOSSÍVEL, e não vazio: se alguém chamar
 * esta função sem antes barrar o acesso, o resultado é lista vazia, nunca a lista inteira.
 */
export function filtroDoAtendimento(quem: QuemOlha | null | undefined, userId: string): { responsibleId?: string } {
  const nivel = nivelDeAcessoAoAtendimento(quem);
  if (nivel === "total") return {};
  if (nivel === "proprios") return { responsibleId: userId };
  return { responsibleId: "__sem-acesso__" };
}

/**
 * O recorte dos ALERTAS de atendimento: o mesmo da lista, ou `null` para quem não vê nenhum.
 *
 * Separado de `filtroDoAtendimento` porque o sino precisa distinguir "nenhum alerta" de "todos",
 * e um filtro impossível ainda faria três consultas ao banco para devolver zero. Aqui o `null`
 * pula a consulta inteira.
 */
export function recorteDosAlertasDeAtendimento(
  quem: QuemOlha | null | undefined,
  userId: string,
): { responsibleId?: string } | null {
  const nivel = nivelDeAcessoAoAtendimento(quem);
  if (nivel === "total") return {};
  if (nivel === "proprios") return { responsibleId: userId };
  return null;
}

/** A frase da recusa. Uma só, para as telas e as ações dizerem a mesma coisa. */
export const SEM_ACESSO_AO_ATENDIMENTO =
  "O Atendimento é restrito aos sócios administradores, à recepção e aos advogados na escala de demandas.";

/** A frase de quando a pessoa tem acesso, mas não àquele atendimento. */
export const ATENDIMENTO_DE_OUTRA_PESSOA =
  "Este atendimento não foi repassado a você. Você vê apenas os que estão sob sua responsabilidade.";
