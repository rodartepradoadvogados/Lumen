import { LIMITE_DO_TEXTO } from "@/lib/envioDeMensagem";
import { podeVerAtendimentos, veTodoOAtendimento, type QuemOlha } from "@/lib/acessoAtendimento";

// ============================================================================
// RESPOSTAS RÁPIDAS DO ESCRITÓRIO (PR 10) — a regra pura (sem banco, sem React).
//
// O QUE É: textos salvos por escritório. Um toque INSERE o texto no campo de mensagem; a pessoa lê, ajusta e
// aperta Enviar. NUNCA envia sozinha (uma resposta pronta sai em nome do escritório, e mandar sem ler é como
// se manda a frase errada para o cliente errado).
//
// QUEM PODE: quem tem acesso ao Atendimento cria (o mesmo padrão das anotações: quem escreve é dono do que
// escreveu). EDITA E EXCLUI o AUTOR ou o nível total (administrador e recepção), como "desfazer recusa" e
// "responsável": o que é do escritório inteiro tem alguém que pode arrumar. Ninguém de outro escritório vê,
// edita ou exclui: toda consulta leva `officeId`.
// ============================================================================

export const LIMITE_DO_TITULO = 60;
export const LIMITE_DO_TEXTO_RAPIDO = 1000;
export const LIMITE_DE_RESPOSTAS_POR_ESCRITORIO = 100;

// O texto da resposta rápida entra no campo, que envia até LIMITE_DO_TEXTO: nunca pode ser maior que ele.
if (LIMITE_DO_TEXTO_RAPIDO > LIMITE_DO_TEXTO) throw new Error("resposta rápida maior que o limite do envio");

export type RespostaRapidaDaTela = { id: string; titulo: string; texto: string; podeEditar: boolean };

function aparar(v: unknown): string {
  return typeof v === "string" ? v.replace(/\r\n/g, "\n").trim() : "";
}

export type DadosDaResposta = { titulo: string; texto: string };

export function validarResposta(bruto: { titulo?: unknown; texto?: unknown }): { ok: true; dados: DadosDaResposta } | { ok: false; erro: string } {
  const titulo = aparar(bruto.titulo).replace(/\s+/g, " ");
  const texto = aparar(bruto.texto);
  if (!titulo) return { ok: false, erro: "Dê um título à resposta." };
  if (titulo.length > LIMITE_DO_TITULO) return { ok: false, erro: `O título pode ter até ${LIMITE_DO_TITULO} caracteres.` };
  if (!texto) return { ok: false, erro: "Escreva o texto da resposta." };
  if (texto.length > LIMITE_DO_TEXTO_RAPIDO) return { ok: false, erro: `O texto pode ter até ${LIMITE_DO_TEXTO_RAPIDO} caracteres.` };
  return { ok: true, dados: { titulo, texto } };
}

/** Editar e excluir: o autor, ou o nível total. Acesso ao Atendimento já foi exigido antes de chegar aqui. */
export function podeMexerNaResposta(quem: QuemOlha & { id: string }, criadaPorId: string | null): boolean {
  if (!podeVerAtendimentos(quem)) return false; // fechado: quem perdeu o acesso não mexe nem no que criou
  if (veTodoOAtendimento(quem)) return true;
  return criadaPorId !== null && criadaPorId === quem.id;
}

/** O que o campo de mensagem passa a conter ao inserir uma resposta: o que já estava, uma quebra de linha e o texto. */
export function textoDepoisDeInserir(atual: string, resposta: string): string {
  if (!atual.trim()) return resposta;
  return atual.endsWith("\n") ? `${atual}${resposta}` : `${atual}\n${resposta}`;
}

/** Quem vai na frente: ordem alfabética do título (sem acento), estável. */
export function ordenarRespostas<T extends { titulo: string }>(lista: T[]): T[] {
  return [...lista].sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR", { sensitivity: "base" }));
}

export const FRASES_DAS_RESPOSTAS = {
  semAcesso: "Sessão expirada ou sem acesso ao Atendimento.",
  naoEncontrada: "Resposta não encontrada.",
  semPermissao: "Só quem criou a resposta, a recepção ou um sócio administrador pode alterá-la.",
  repetida: "Já existe uma resposta com este título.",
  cheio: `O escritório já tem ${LIMITE_DE_RESPOSTAS_POR_ESCRITORIO} respostas rápidas. Exclua alguma antes de criar outra.`,
} as const;
