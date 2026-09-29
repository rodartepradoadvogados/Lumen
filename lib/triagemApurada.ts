// ============================================================================
// O QUE A TRIAGEM APUROU — ver, confirmar, corrigir e acrescentar (N11 da proposta do aplicativo).
//
// ONDE FICA. Não há tabela de "fatos" e a Ana não grava fatos soltos: ela grava o RELATO
// (`Attendance.description`), a MATÉRIA (`area`), o documento que espera (`documentoPendente`) e a
// proposta de recusa. O que uma PESSOA faz por cima disso é o que este módulo guarda, em
// `Attendance.metadata.triagem` (a coluna Json que já existe — nenhuma mudança de schema):
//
//   carimbos  por campo da triagem ("area", "documento", "relato"): a pessoa CONFIRMOU o que veio da
//             triagem, ou o CORRIGIU. Quem, quando. Sem carimbo, o campo é "da triagem".
//   fatos     linhas que uma pessoa ACRESCENTOU ("Data do fato: 12/03", "Tem filhos menores: sim").
//
// O QUE ESTE MÓDULO NÃO FAZ: não inventa o estado "a Ana apurou" para um fato que a Ana não gravou. Um
// campo sem carimbo diz "Da triagem" — é o que o código sabe. Uma linha acrescentada diz "Anotado por
// {nome}". Prometer mais do que isso seria prometer o que o código não faz.
//
// `metadata` é compartilhado (a rota antiga `ana-responde` espalha o objeto e devolve): toda escrita aqui
// PRESERVA as outras chaves.
// ============================================================================

export type CampoDaTriagem = "area" | "documento" | "relato";
export const CAMPOS_DA_TRIAGEM: CampoDaTriagem[] = ["area", "documento", "relato"];

export type EstadoDoCarimbo = "CONFIRMADO" | "CORRIGIDO";
export type Carimbo = { estado: EstadoDoCarimbo; por: string; em: string };
export type FatoAcrescentado = { id: string; rotulo: string; valor: string; estado: EstadoDoCarimbo | "PESSOA"; por: string; em: string };

/**
 * "Manter atendimento": a pessoa leu a proposta de recusa da Ana e decidiu NÃO recusar. A nota da Ana não é
 * apagada (é dela, e prova o que ela viu): fica guardada quando foi dispensada e por quem. Se a Ana propuser
 * de novo (`propostaDeRecusaEm` diferente), o cartão volta.
 */
export type PropostaMantida = { por: string; em: string; propostaEm: string | null };

export type TriagemGravada = {
  carimbos: Partial<Record<CampoDaTriagem, Carimbo>>;
  fatos: FatoAcrescentado[];
  propostaMantida?: PropostaMantida;
};

export const LIMITE_ROTULO = 60;
export const LIMITE_VALOR = 500;
export const LIMITE_RELATO = 4000;
export const LIMITE_DE_FATOS = 30;

const vazia = (): TriagemGravada => ({ carimbos: {}, fatos: [] });

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** Lê o que está gravado, descartando o que não tem a forma certa (o Json vem do banco, não da tela). */
export function lerTriagem(metadata: unknown): TriagemGravada {
  if (!ehObjeto(metadata) || !ehObjeto(metadata.triagem)) return vazia();
  const bruto = metadata.triagem;
  const out = vazia();

  if (ehObjeto(bruto.carimbos)) {
    for (const campo of CAMPOS_DA_TRIAGEM) {
      const c = bruto.carimbos[campo];
      if (!ehObjeto(c)) continue;
      const estado = c.estado === "CONFIRMADO" || c.estado === "CORRIGIDO" ? c.estado : null;
      const por = texto(c.por, 120);
      const em = texto(c.em, 40);
      if (estado && por && em) out.carimbos[campo] = { estado, por, em };
    }
  }

  if (Array.isArray(bruto.fatos)) {
    for (const f of bruto.fatos) {
      if (!ehObjeto(f)) continue;
      const id = texto(f.id, 60);
      const rotulo = texto(f.rotulo, LIMITE_ROTULO);
      const valor = texto(f.valor, LIMITE_VALOR);
      const por = texto(f.por, 120);
      const em = texto(f.em, 40);
      const estado = f.estado === "CONFIRMADO" || f.estado === "CORRIGIDO" || f.estado === "PESSOA" ? f.estado : null;
      if (id && rotulo && valor && por && em && estado) out.fatos.push({ id, rotulo, valor, estado, por, em });
    }
  }
  if (ehObjeto(bruto.propostaMantida)) {
    const por = texto(bruto.propostaMantida.por, 120);
    const em = texto(bruto.propostaMantida.em, 40);
    if (por && em) out.propostaMantida = { por, em, propostaEm: texto(bruto.propostaMantida.propostaEm, 40) };
  }
  return out.fatos.length > LIMITE_DE_FATOS ? { ...out, fatos: out.fatos.slice(0, LIMITE_DE_FATOS) } : out;
}

/** Devolve o `metadata` inteiro com a triagem trocada — as outras chaves ficam como estavam. */
export function gravarTriagem(metadata: unknown, t: TriagemGravada): Record<string, unknown> {
  const base = ehObjeto(metadata) ? { ...metadata } : {};
  base.triagem = { carimbos: t.carimbos, fatos: t.fatos, ...(t.propostaMantida ? { propostaMantida: t.propostaMantida } : {}) };
  return base;
}

export type Quem = { nome: string };
const carimbo = (estado: EstadoDoCarimbo, quem: Quem, agora: Date): Carimbo => ({ estado, por: quem.nome, em: agora.toISOString() });

export function validarFato(rotulo: string, valor: string): string | null {
  if (!rotulo.trim()) return "Diga o que é a informação (por exemplo: “Data do fato”).";
  if (rotulo.trim().length > LIMITE_ROTULO) return `O nome da informação pode ter até ${LIMITE_ROTULO} caracteres.`;
  if (!valor.trim()) return "Escreva o valor da informação.";
  if (valor.trim().length > LIMITE_VALOR) return `O valor pode ter até ${LIMITE_VALOR} caracteres.`;
  return null;
}

export function acrescentarFato(t: TriagemGravada, dado: { id: string; rotulo: string; valor: string }, quem: Quem, agora: Date): TriagemGravada {
  const erro = validarFato(dado.rotulo, dado.valor);
  if (erro) throw new Error(erro);
  if (t.fatos.length >= LIMITE_DE_FATOS) throw new Error(`No máximo ${LIMITE_DE_FATOS} informações por atendimento.`);
  const fato: FatoAcrescentado = { id: dado.id, rotulo: dado.rotulo.trim(), valor: dado.valor.trim(), estado: "PESSOA", por: quem.nome, em: agora.toISOString() };
  return { ...t, fatos: [...t.fatos, fato] };
}

/** Confirmar um campo da triagem ou uma linha acrescentada. `null` quando o alvo não existe. */
export function confirmarItem(t: TriagemGravada, alvo: { campo: CampoDaTriagem } | { fatoId: string }, quem: Quem, agora: Date): TriagemGravada | null {
  if ("campo" in alvo) return { ...t, carimbos: { ...t.carimbos, [alvo.campo]: carimbo("CONFIRMADO", quem, agora) } };
  if (!t.fatos.some((f) => f.id === alvo.fatoId)) return null;
  return { ...t, fatos: t.fatos.map((f) => (f.id === alvo.fatoId ? { ...f, estado: "CONFIRMADO", por: quem.nome, em: agora.toISOString() } : f)) };
}

/** Corrigir uma linha acrescentada (o valor novo é a pessoa que dá). Os campos-base são corrigidos no próprio campo. */
export function corrigirFato(t: TriagemGravada, fatoId: string, valor: string, quem: Quem, agora: Date): TriagemGravada | null {
  if (!t.fatos.some((f) => f.id === fatoId)) return null;
  if (!valor.trim()) throw new Error("Escreva o valor da informação.");
  if (valor.trim().length > LIMITE_VALOR) throw new Error(`O valor pode ter até ${LIMITE_VALOR} caracteres.`);
  return { ...t, fatos: t.fatos.map((f) => (f.id === fatoId ? { ...f, valor: valor.trim(), estado: "CORRIGIDO", por: quem.nome, em: agora.toISOString() } : f)) };
}

export function removerFato(t: TriagemGravada, fatoId: string): TriagemGravada | null {
  if (!t.fatos.some((f) => f.id === fatoId)) return null;
  return { ...t, fatos: t.fatos.filter((f) => f.id !== fatoId) };
}

export function carimbarCorrecao(t: TriagemGravada, campo: CampoDaTriagem, quem: Quem, agora: Date): TriagemGravada {
  return { ...t, carimbos: { ...t.carimbos, [campo]: carimbo("CORRIGIDO", quem, agora) } };
}

/** O que a tela escreve ao lado de cada item: de onde ele veio e, se uma pessoa mexeu, quem. */
export function rotuloDaOrigem(estado: EstadoDoCarimbo | "PESSOA" | null, por?: string): string {
  if (estado === "CONFIRMADO") return por ? `Confirmado por ${por}` : "Confirmado";
  if (estado === "CORRIGIDO") return por ? `Corrigido por ${por}` : "Corrigido";
  if (estado === "PESSOA") return por ? `Anotado por ${por}` : "Anotado pela equipe";
  return "Da triagem";
}

/** A proposta de recusa que a Ana deixou ainda pede decisão? (Não, se uma pessoa a dispensou e a Ana não propôs de novo.) */
export function propostaPedeDecisao(t: TriagemGravada, propostaDeRecusa: string | null, propostaDeRecusaEm: Date | string | null): boolean {
  if (!propostaDeRecusa) return false;
  if (!t.propostaMantida) return true;
  const atual = propostaDeRecusaEm ? new Date(propostaDeRecusaEm).toISOString() : null;
  return t.propostaMantida.propostaEm !== atual;
}

export function manterProposta(t: TriagemGravada, propostaDeRecusaEm: Date | string | null, quem: Quem, agora: Date): TriagemGravada {
  return { ...t, propostaMantida: { por: quem.nome, em: agora.toISOString(), propostaEm: propostaDeRecusaEm ? new Date(propostaDeRecusaEm).toISOString() : null } };
}

export function reabrirProposta(t: TriagemGravada): TriagemGravada {
  const resto: TriagemGravada = { carimbos: t.carimbos, fatos: t.fatos };
  return resto;
}
