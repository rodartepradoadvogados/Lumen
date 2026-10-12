// Vocabulário dos desfechos de uma publicação que sai da fila para TODO o escritório.
// Fica fora de lib/actions/publicacoesFila.ts porque arquivo "use server" só pode exportar funções async.

export type DesfechoDeConclusao = "SO_CIENCIA" | "SEM_PROVIDENCIA" | "DUPLICADA" | "TRATADO_NO_TRIBUNAL";
export type MotivoDeDescarte = "NAO_PUBLICACAO" | "NAO_DO_ESCRITORIO";

export const ROTULO_DO_DESFECHO: Record<string, string> = {
  SO_CIENCIA: "só ciência",
  SEM_PROVIDENCIA: "sem providência",
  DUPLICADA: "duplicada",
  TRATADO_NO_TRIBUNAL: "já aberto e tratado no tribunal",
  NAO_PUBLICACAO: "não é publicação",
  NAO_DO_ESCRITORIO: "não é do escritório",
};

export const DESFECHOS_DE_CONCLUSAO: DesfechoDeConclusao[] = ["SO_CIENCIA", "SEM_PROVIDENCIA", "DUPLICADA", "TRATADO_NO_TRIBUNAL"];
export const MOTIVOS_DE_DESCARTE: MotivoDeDescarte[] = ["NAO_PUBLICACAO", "NAO_DO_ESCRITORIO"];
