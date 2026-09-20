import { dataEHoraDeBrasilia } from "@/lib/horaDeBrasilia";

// ============================================================================
// A RECUSA DE UM LEAD.
//
// Recusar não é descartar. A decisão do dono foi essa, e ela governa tudo aqui: o lead recusado
// sai das listas ativas, mas continua existindo, continua achável, e volta para a fila se alguém
// se convencer de que a recusa foi errada. Por isso não existe "excluir lead" nesta história.
//
// A RECUSA TEM DOIS PROPÓSITOS AO MESMO TEMPO, e o texto precisa servir aos dois:
//
//   PROVA      advogado que não recusa com clareza corre o risco de ser tratado como se tivesse
//              assumido o caso. A carta registra, com data e hora, que não assumiu.
//   RELAÇÃO    quem procurou um escritório e contou uma história difícil merece uma resposta
//              digna. É também o que faz o lead voltar quando tiver outro caso.
//
// O dono escolheu a versão acolhedora com os efeitos da versão seca embutidos: o texto conversa,
// e ainda assim diz as três coisas que precisam estar escritas — não há representação, ninguém
// está acompanhando prazos, e prazo não espera.
//
// O QUE ESTE ARQUIVO NÃO FAZ: não decide nada sobre o mérito, não nomeia lei, não estima prazo.
// Uma carta de recusa que opina sobre o caso é um parecer — e parecer dado a quem o escritório
// acabou de recusar é o pior dos dois mundos.
// ============================================================================

export type DadosDaCarta = {
  /** Como chamar a pessoa. Primeiro nome quando dá, porque a carta conversa. */
  nome: string;
  /** O escritório, por extenso. */
  escritorio: string;
  /** Uma frase, vinda do catálogo (lib/motivosDeRecusa.ts). */
  motivo: string;
  /** Quando a recusa foi registrada. */
  registradaEm: Date;
};

export type CartaDeRecusa = {
  titulo: string;
  /** Os parágrafos, na ordem. Texto puro: quem renderiza escolhe a marcação. */
  paragrafos: string[];
  /** Os dois avisos que a carta precisa carregar, cada um com um título curto. */
  avisos: { titulo: string; texto: string }[];
  fecho: string;
  rodape: string;
};

/**
 * A carta, montada.
 *
 * Devolve TEXTO ESTRUTURADO, e não HTML. A página monta a marcação — o que mantém esta função
 * testável sem navegador e, mais importante, impede que uma carta jurídica passe a ser construída
 * com concatenação de HTML, que é como se produz um `dangerouslySetInnerHTML` por acidente.
 */
export function montarCartaDeRecusa(d: DadosDaCarta): CartaDeRecusa {
  const primeiro = primeiroNome(d.nome);
  const motivo = motivoEmMinuscula(d.motivo);

  return {
    titulo: "Não vamos poder cuidar do seu caso",
    paragrafos: [
      `${primeiro}, obrigado por ter procurado o ${d.escritorio} e por ter contado o que está passando.`,
      `Depois de ler o que você nos enviou, concluímos que não somos o escritório certo para este caso — ${motivo}. ` +
        `Preferimos dizer isso agora a aceitar e não fazer o melhor por você.`,
    ],
    avisos: [
      {
        titulo: "Você não está representado por nós",
        texto:
          "Não há contrato nem procuração entre você e o escritório, nenhum advogado nosso está acompanhando prazos seus, " +
          "e nada do que conversamos no atendimento é parecer ou orientação jurídica.",
      },
      {
        titulo: "Não demore",
        texto:
          "Direitos têm prazo, e o prazo não espera por ninguém — ele corre enquanto você procura um advogado. " +
          "Procure outro profissional nos próximos dias.",
      },
    ],
    fecho: "Se achar que entendemos algo errado, é só responder por aqui — a gente relê.",
    rodape: `Registrado em ${dataEHoraDeBrasilia(d.registradaEm)}.`,
  };
}

/**
 * O primeiro nome, para a carta conversar.
 *
 * Quando o que está no lugar do nome é um telefone (acontece quando o WhatsApp não manda o perfil),
 * a carta não diz "5562999998888, obrigado por ter procurado" — ela abre sem vocativo.
 */
export function primeiroNome(nome: string): string {
  const limpo = (nome || "").trim();
  if (!limpo) return "Olá";
  if (/^[+\d()\s.-]+$/.test(limpo)) return "Olá";
  return limpo.split(/\s+/)[0];
}

/**
 * O motivo entra no meio de uma frase, então começa em minúscula — "concluímos que não somos o
 * escritório certo — Fora das matérias que atendemos" fica com cara de etiqueta colada, não de
 * frase. Siglas e nomes próprios ficam como estão: só a primeira letra é rebaixada, e só quando o
 * resto da palavra não é maiúsculo.
 */
export function motivoEmMinuscula(motivo: string): string {
  const m = (motivo || "").trim().replace(/[.\s]+$/, "");
  if (!m) return "o caso não se encaixa no que atendemos";
  const primeira = m.split(/\s+/)[0];
  if (primeira.length > 1 && primeira === primeira.toUpperCase()) return m;
  return m[0].toLowerCase() + m.slice(1);
}

// ── O ESTADO DA RECUSA ──────────────────────────────────────────────────────

export type EstadoDaRecusa = "EM_ANALISE" | "ARQUIVADA" | "REVERTIDA";

export type RecusaResumo = {
  estado: EstadoDaRecusa;
  enviadaEm: Date | null;
  abertaEm: Date | null;
  revisitaEm: Date | null;
};

/**
 * O que a tela diz sobre onde a recusa está.
 *
 * Frase curta e verdadeira, porque é ela que substitui a leitura de quatro datas. A ordem importa:
 * o estado final ganha do trânsito, e "aberta" ganha de "enviada" porque abrir prova mais.
 */
export function situacaoDaRecusa(r: RecusaResumo): string {
  if (r.estado === "REVERTIDA") return "Recusa desfeita — o lead voltou para a fila";
  if (r.estado === "ARQUIVADA") return "Arquivada";
  if (r.abertaEm) return "O lead abriu a carta";
  if (r.enviadaEm) return "Carta enviada, ainda não aberta";
  return "Carta pronta, ainda não enviada";
}

/** Reverter é decidir pegar o caso: só faz sentido enquanto a recusa está em análise. */
export function podeReverter(r: { estado: EstadoDaRecusa }): boolean {
  return r.estado === "EM_ANALISE";
}

/** Arquivar tira da fila de trabalho e vira histórico. Também só em análise. */
export function podeArquivar(r: { estado: EstadoDaRecusa }): boolean {
  return r.estado === "EM_ANALISE";
}

// ── O ENDEREÇO PÚBLICO ──────────────────────────────────────────────────────

/**
 * O formato do token do link.
 *
 * 32 caracteres de alfabeto hexadecimal. Não é segredo de alto valor — a carta não contém dado
 * sensível além do nome e do motivo —, mas precisa ser IMPOSSÍVEL DE ADIVINHAR, porque um link
 * sequencial deixaria qualquer um passear pelas recusas do escritório trocando um número.
 */
export const TAMANHO_DO_TOKEN = 32;
const TOKEN = /^[0-9a-f]{32}$/;

export function tokenValido(bruto: string | null | undefined): boolean {
  return TOKEN.test((bruto || "").trim());
}

export function enderecoDaCarta(token: string): string {
  return `/recusa/${token}`;
}
