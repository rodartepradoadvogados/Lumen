import { COUNTRIES } from "@/lib/countries";
import { mesmoNumero } from "@/lib/whatsappEvolution";

// ============================================================================
// QUEM É ESTE NÚMERO.
//
// Um atendimento do WhatsApp nasce com um telefone e, quando muito, o nome do perfil. Mas o
// escritório já conhece muita gente: clientes, advogados parceiros e adversos, fornecedores, a
// própria equipe. O número que acaba de chegar pode ser de alguém que já está na agenda.
//
// POR QUE ISSO IMPORTA MAIS DO QUE PARECE. O advogado que atende às onze da noite precisa saber,
// antes de responder, se está falando com um cliente de cinco anos ou com um desconhecido. A
// primeira frase é outra. E o pior caso é responder a um ADVOGADO ADVERSO como se fosse lead —
// o que, num processo em curso, é exatamente o tipo de coisa que não se desfaz.
//
// A COMPARAÇÃO É A MESMA DA FILA (mesmoNumero, lib/whatsappEvolution.ts), que trata o nono
// dígito: celular brasileiro tem 11 dígitos com DDD, mas o WhatsApp guarda contas antigas com 10,
// e é assim que o número chega no webhook. Comparar as cadeias direto faria o cliente de cinco
// anos aparecer como desconhecido.
// ============================================================================

export type TipoDeContato = "cliente" | "advogado" | "fornecedor" | "equipe";

export type ContatoConhecido = {
  tipo: TipoDeContato;
  id: string;
  nome: string;
  telefone: string;
  /** Uma linha de contexto: "Cliente desde 2024", "Advogado adverso", o papel de quem é da casa. */
  detalhe?: string | null;
};

/**
 * A ordem em que os tipos são considerados quando o MESMO número está em duas agendas.
 *
 * Advogado vem primeiro, e é de propósito: se um número está cadastrado como advogado adverso E
 * como cliente, é a condição de adverso que muda o que se pode dizer na conversa. Errar para o
 * lado "é só um cliente" é o erro caro; errar para o lado "cuidado, é advogado" só faz alguém
 * conferir antes de escrever.
 */
const PRECEDENCIA: TipoDeContato[] = ["advogado", "cliente", "equipe", "fornecedor"];

export const ROTULO_DO_TIPO: Record<TipoDeContato, string> = {
  cliente: "Cliente",
  advogado: "Advogado",
  fornecedor: "Fornecedor",
  equipe: "Equipe do escritório",
};

/**
 * Onde este contato mora no Lúmen.
 *
 * Só o cliente tem ficha própria hoje; os outros três moram nas listas, que abrem filtradas pelo
 * nome. Mandar para a lista é melhor do que não mandar para lugar nenhum — e o dia em que o
 * advogado ganhar ficha, muda-se uma linha aqui e não cinco telas.
 */
export function enderecoDoContato(contato: { tipo: TipoDeContato; id: string; nome: string }): string {
  switch (contato.tipo) {
    case "cliente":
      return `/contatos/clientes/${contato.id}`;
    case "advogado":
      return `/contatos/advogados?q=${encodeURIComponent(contato.nome)}`;
    case "fornecedor":
      return `/contatos/fornecedores?q=${encodeURIComponent(contato.nome)}`;
    case "equipe":
      return `/contatos/equipe?q=${encodeURIComponent(contato.nome)}`;
  }
}

/**
 * Acha quem é o número entre os contatos conhecidos.
 *
 * Devolve nulo quando não casa com ninguém — e nulo aqui não é falha: é a resposta que faz a tela
 * oferecer o cadastro. Contato sem telefone nunca casa (um cadastro vazio não pode "reconhecer"
 * todo mundo, que é o que uma comparação descuidada de string vazia faria).
 */
export function casarContato(contatos: ContatoConhecido[], numero: string | null | undefined): ContatoConhecido | null {
  const alvo = (numero || "").trim();
  if (!alvo) return null;

  // Cadastro sem telefone nunca casa, e quem garante isso é `mesmoNumero` (que devolve falso
  // quando qualquer um dos dois lados fica sem dígitos) — não uma segunda guarda aqui. Não
  // repetir a checagem é deliberado: duas guardas para a mesma coisa fazem parecer que a de baixo
  // pode ser removida sem consequência. O teste em lib/testes/numero.teste.ts prova o
  // comportamento, e prova-o ATRAVÉS daqui, que é onde ele importa.
  const candidatos = contatos.filter((c) => mesmoNumero(c.telefone, alvo));
  if (candidatos.length === 0) return null;

  for (const tipo of PRECEDENCIA) {
    const achado = candidatos.find((c) => c.tipo === tipo);
    if (achado) return achado;
  }
  return candidatos[0];
}

/** Os tipos que a tela oferece para cadastrar um número desconhecido. Equipe não entra: quem é da casa é cadastrado em Configurações. */
export const TIPOS_PARA_CADASTRAR: TipoDeContato[] = ["cliente", "advogado", "fornecedor"];

export function podeCadastrarComo(tipo: string): tipo is TipoDeContato {
  return (TIPOS_PARA_CADASTRAR as string[]).includes(tipo);
}

/**
 * Parte um número em DDI e assinante, para nascer no cadastro do jeito que os formulários guardam
 * (duas colunas, `phone` e `phoneDdi` — ver components/PhoneInput.tsx).
 *
 * O número do WhatsApp chega colado ("556299998888"), e guardar isso inteiro na coluna `phone`
 * criaria exatamente o defeito que o PhoneInput existe para corrigir: telefone que o wa.me não
 * reconhece — só que ao contrário, com o DDI grudado no DDD.
 *
 * A ORDEM DAS REGRAS É O QUE IMPORTA AQUI, e ela é brasileira de propósito:
 *
 *   1. Começa com 55 e tem 12 ou 13 dígitos → é brasileiro com DDI. Este é o caso de quase todos
 *      os números que passam por aqui, e ele é reconhecido primeiro justamente para não ser
 *      confundido pela regra 3.
 *   2. Tem 10 ou 11 dígitos → é nacional SEM DDI, e o DDI fica vazio para quem chamou preencher.
 *      Sem esta regra "62999998888" seria lido como Indonésia (DDI 62) com um assinante de nove
 *      dígitos — um número que existe, é plausível, e está errado.
 *   3. Só então, prefixo de DDI conhecido, do mais longo para o mais curto. É o caminho do número
 *      estrangeiro de verdade, que é raro e por isso vem por último.
 *
 * QUANDO NÃO DÁ PARA SABER, NÃO CHUTA: devolve o número inteiro com DDI vazio. Um cadastro com
 * DDI em branco é um erro que alguém corrige em dois cliques; um cadastro com o DDD errado
 * ninguém percebe.
 */
export function separarDdi(bruto: string | null | undefined): { ddi: string; numero: string } {
  const digitos = (bruto || "").replace(/\D/g, "");
  if (!digitos) return { ddi: "", numero: "" };

  if (digitos.startsWith("55") && (digitos.length === 12 || digitos.length === 13)) {
    return { ddi: "55", numero: digitos.slice(2) };
  }
  if (digitos.length === 10 || digitos.length === 11) return { ddi: "", numero: digitos };

  const ddis = Array.from(new Set(COUNTRIES.map((c) => c.ddi))).sort((a, b) => b.length - a.length);
  for (const ddi of ddis) {
    if (!digitos.startsWith(ddi)) continue;
    const resto = digitos.slice(ddi.length);
    if (resto.length >= 8 && resto.length <= 11) return { ddi, numero: resto };
  }
  return { ddi: "", numero: digitos };
}
