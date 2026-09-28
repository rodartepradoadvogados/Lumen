import type { GatilhoDaTransferencia } from "@/lib/filaDeTransferencia";
import { somenteDigitos } from "@/lib/whatsappEvolution";

// ============================================================================
// O AVISO AO ADVOGADO — tudo aqui é função pura, e o texto é montado uma vez só.
//
// O aviso vai por três caminhos (WhatsApp, push e e-mail) e os três leem DAQUI. Se cada canal
// montasse o seu, um dia o WhatsApp diria "triagem concluída" e o e-mail diria "o cliente pediu
// advogado" sobre o mesmo lead — e quem recebesse os dois não saberia em qual acreditar.
//
// O RESUMO NÃO É CORTADO. Foi assim que o dono pediu, e a razão é boa: resumo cortado obriga a
// abrir o sistema para saber do que se trata, e nesse caso o aviso não serviu para nada. O
// WhatsApp tem limite por mensagem, então o texto é PARTIDO em várias — nunca truncado.
//
// NENHUMA IA ESCREVE ESTE TEXTO. Seria a segunda ida ao modelo dentro do mesmo pedido que já
// gastou quase todo o tempo respondendo ao cliente — e um aviso que não sai porque o modelo
// demorou é um lead perdido. As falas do cliente vão como ele as escreveu: para advogado, a
// palavra do cliente vale mais que a paráfrase de uma máquina.
// ============================================================================

/**
 * Por que o lead chegou até você.
 *
 * Escrito do ponto de vista de quem recebe, e não do sistema: "TETO" não diz nada a um advogado
 * às onze da noite; "a conversa passou do limite sem concluir" diz.
 */
export const POR_QUE_CHEGOU: Record<GatilhoDaTransferencia, string> = {
  RISCO: "o cliente insistiu em prazo, valor ou resultado",
  PEDIDO: "o cliente pediu para falar com um advogado",
  ROTEIRO: "a triagem terminou",
  FORA_DO_ESCOPO: "o assunto não é o da campanha",
  TETO: "a conversa passou do limite de mensagens sem concluir",
};

export type DocumentoDoAviso = { nome: string; obrigatorio: boolean };

export type DadosDoAviso = {
  nomeDoCliente: string;
  /** Telefone do lead como chegou no webhook — vira o link do WhatsApp. */
  telefoneDoLead: string;
  gatilho: GatilhoDaTransferencia;
  campanha: string | null;
  anuncio: string | null;
  /** As falas do cliente, na ordem, inteiras. */
  falasDoCliente: string[];
  /** O que a campanha mandou pedir. */
  documentos: DocumentoDoAviso[];
  /** O que já está anexado ao atendimento no Lúmen. */
  anexos: string[];
  linkNoLumen: string;
};

/**
 * Quando o WhatsApp não manda o nome do perfil, o atendimento nasce com o próprio número no lugar
 * do nome — e "O QUE 5562981283481 CONTOU" é um cabeçalho ruim.
 */
export function pareceTelefone(nome: string): boolean {
  const limpo = (nome || "").trim();
  if (!limpo) return true;
  return /^[+\d()\s.-]+$/.test(limpo) && somenteDigitos(limpo).length >= 8;
}

/** Link que abre a conversa com o lead. Sem texto pronto: o que dizer é do advogado. */
export function linkDoWhatsapp(telefone: string): string {
  return `https://wa.me/${somenteDigitos(telefone)}`;
}

/** A linha única do push — onde não cabe mais do que isso. */
export function resumoCurto(d: DadosDoAviso): string {
  const quem = pareceTelefone(d.nomeDoCliente) ? "Lead novo" : d.nomeDoCliente;
  const onde = d.campanha ? ` · ${d.campanha}` : "";
  return `${quem} — ${POR_QUE_CHEGOU[d.gatilho]}${onde}.`;
}

/**
 * O aviso inteiro.
 *
 * OS DOIS LINKS FICAM NO TOPO, e nessa ordem: o Lúmen primeiro, o WhatsApp do lead depois. É a
 * ordem que o dono determinou e é a ordem certa — quem fala com o cliente antes de ler a conversa
 * pergunta o que o cliente já respondeu, e o cliente conclui que ninguém leu nada. Em cima também
 * porque, quando o resumo é longo e o texto se parte em várias mensagens, os links precisam estar
 * na PRIMEIRA — não na última, que ninguém rola para achar.
 */
export function montarAvisoDeLead(d: DadosDoAviso): string {
  const anonimo = pareceTelefone(d.nomeDoCliente);
  const nome = anonimo ? "o cliente" : d.nomeDoCliente;
  const partes: string[] = [];

  partes.push(`*Lead novo para você*${anonimo ? "" : ` — ${d.nomeDoCliente}`}`);

  const contexto = [POR_QUE_CHEGOU[d.gatilho]];
  if (d.campanha) contexto.push(`campanha: ${d.campanha}`);
  if (d.anuncio) contexto.push(`anúncio: "${d.anuncio}"`);
  partes.push(contexto.join(" · ") + ".");

  partes.push("");
  partes.push(`Abra no Lúmen: ${d.linkNoLumen}`);
  partes.push(`Depois, fale com ${nome}: ${linkDoWhatsapp(d.telefoneDoLead)}`);

  if (d.falasDoCliente.length > 0) {
    partes.push("");
    partes.push(anonimo ? "*O QUE O CLIENTE CONTOU*" : `*O QUE ${d.nomeDoCliente.toUpperCase()} CONTOU*`);
    d.falasDoCliente.forEach((f, i) => partes.push(`${i + 1}. ${f.trim()}`));
  }

  if (d.documentos.length > 0) {
    partes.push("");
    partes.push("*DOCUMENTOS PEDIDOS NESTA TRIAGEM*");
    for (const doc of d.documentos) {
      partes.push(`• ${doc.nome}${doc.obrigatorio ? " — obrigatório" : ""}`);
    }
  }

  if (d.anexos.length > 0) {
    partes.push("");
    partes.push("*JÁ ANEXADOS NO LÚMEN*");
    for (const a of d.anexos) partes.push(`• ${a}`);
  }

  return partes.join("\n");
}

/** O limite prático de uma mensagem de texto do WhatsApp, com folga para o marcador "(2/3)". */
export const LIMITE_DA_MENSAGEM = 3500;

/**
 * Parte o aviso em mensagens que cabem no WhatsApp, SEM NUNCA PERDER TEXTO.
 *
 * O CONTRATO, exatamente: as partes, na ordem, contêm cada caractere do original uma vez só.
 *
 * Quebra nas linhas — é o que preserva a leitura (uma fala do cliente não fica metade numa
 * mensagem e metade na seguinte). Uma linha sozinha maior que uma mensagem inteira (o cliente que
 * escreve três páginas num sopro, e isso acontece) é a única exceção: ela é fatiada no meio, e aí
 * a quebra de linha do original deixa de marcar onde ela começava. Perder o texto seria pior do
 * que cortá-lo no meio de uma palavra — e no WhatsApp, lido como mensagens seguidas, a leitura
 * continua corrida.
 */
export function partirEmMensagens(texto: string, limite: number = LIMITE_DA_MENSAGEM): string[] {
  if (limite < 40) throw new Error("limite pequeno demais para partir mensagem");
  if (texto.length <= limite) return [texto];

  // O marcador "(12/12)" mais a linha em branco antes dele. Reservado SEMPRE, e não só quando
  // sobram partes: descobrir na última hora que o marcador não cabe obrigaria a repartir tudo.
  const util = limite - 12;
  const pedacos: string[] = [];
  let atual = "";

  const fechar = () => {
    if (atual) pedacos.push(atual);
    atual = "";
  };

  for (const linha of texto.split("\n")) {
    let resto = linha;
    // Linha maior que uma mensagem inteira: sai sozinha, em fatias.
    while (resto.length > util) {
      fechar();
      pedacos.push(resto.slice(0, util));
      resto = resto.slice(util);
    }
    const candidato = atual ? `${atual}\n${resto}` : resto;
    if (candidato.length > util) {
      fechar();
      atual = resto;
    } else {
      atual = candidato;
    }
  }
  fechar();

  const total = pedacos.length;
  if (total <= 1) return pedacos.length ? pedacos : [texto.slice(0, util)];
  return pedacos.map((p, i) => `${p}\n\n(${i + 1}/${total})`);
}

/**
 * A frase que sai quando alguém DO ESCRITÓRIO escreve para o número do atendimento.
 *
 * Existe porque o aviso chega pelo mesmo número por onde os clientes falam, e responder um aviso é
 * o primeiro reflexo de qualquer pessoa. Sem esta frase, o advogado escreveria "ok, já vou" e:
 * viraria um LEAD no funil, com o nome dele; e o atendente de IA começaria a triá-lo como cliente.
 * As duas coisas são constrangedoras e as duas são difíceis de desfazer depois.
 */
export const FRASE_AO_COLEGA =
  "Este número é o do atendimento aos clientes — eu não converso por aqui. " +
  "O lead está no Lúmen, no link do aviso, e é por lá que você assume a conversa.";

/**
 * A frase sai UMA VEZ por pessoa a cada 24 horas.
 *
 * "Uma frase e depois silêncio" foi como o dono pediu, e é o certo dentro de um episódio: ninguém
 * quer um robô insistindo. Mas silêncio PARA SEMPRE faria o colega que escrever de novo daqui a
 * seis meses concluir que o número quebrou. Vinte e quatro horas cobre o episódio inteiro e
 * devolve a explicação a quem já esqueceu que ela existe.
 */
export const INTERVALO_DA_FRASE_MS = 24 * 60 * 60 * 1000;

export function deveExplicarAoColega(ultimaVez: Date | null | undefined, agora: Date): boolean {
  if (!ultimaVez) return true;
  return agora.getTime() - ultimaVez.getTime() >= INTERVALO_DA_FRASE_MS;
}
