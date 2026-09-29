import { hojeEmBrasilia } from "@/lib/detalhesDoAtendimento";

// ============================================================================
// A FAIXA DA JANELA FECHADA (PR 6): as saídas que existem HOJE quando o WhatsApp oficial (Meta) não deixa
// escrever por texto. Só regra pura — sem banco, sem rede, sem React — para o teste poder provar.
//
// O QUE A FAIXA PROMETE, E SÓ ISSO:
// - "Ligar" é `tel:` — a LIGAÇÃO NORMAL do celular. NÃO é chamada pelo WhatsApp do escritório: a Calling API
//   da Meta é outra integração (habilitação, permissão do cliente, softphone/SIP), que o Lúmen não tem.
// - "Abrir no meu WhatsApp" é `https://wa.me/<número>`: abre a conversa NO WHATSAPP DO CELULAR DA PESSOA, a
//   partir do número PESSOAL dela. Não sai do número do escritório, não fica no histórico do Lúmen.
// - "Criar tarefa" grava uma tarefa do atendimento (a mesma ação da aba Detalhes).
// - Modelo aprovado ainda NÃO existe aqui (etapa própria, PR 15): a faixa diz "ainda não disponível".
// ============================================================================

/** Só dígitos, e o DDI do Brasil quando o número veio sem ele e tem cara de número brasileiro. */
export function digitosParaContato(bruto: string | null | undefined): string | null {
  let d = (bruto || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.replace(/^0+/, "");
  // Sem DDI só quando parece brasileiro: DDD + celular (11 dígitos, o terceiro é 9) ou DDD + fixo (10, o terceiro é 2 a 5).
  // Um número de 11 dígitos que já traz DDI de outro país (ex.: 1 415 555 0132) não pode ganhar 55.
  if ((d.length === 11 && d[2] === "9") || (d.length === 10 && /[2-5]/.test(d[2]))) d = `55${d}`;
  return d.length >= 11 && d.length <= 15 ? d : null;
}

export function enderecoDeLigar(bruto: string | null | undefined): string | null {
  const d = digitosParaContato(bruto);
  return d ? `tel:+${d}` : null;
}

export function enderecoDoWhatsappPessoal(bruto: string | null | undefined): string | null {
  const d = digitosParaContato(bruto);
  return d ? `https://wa.me/${d}` : null;
}

export const TITULO_DA_FAIXA = "Fora da janela de 24 h";
export const EXPLICACAO_DA_FAIXA =
  "O WhatsApp só deixa escrever por texto até 24 h depois da última mensagem do cliente. Depois disso, só com modelo aprovado — ainda não disponível aqui — ou quando o cliente escrever de novo.";
export const APOIO_DO_LIGAR = "Ligação normal do celular, não pelo WhatsApp.";
export const APOIO_DO_WHATSAPP_PESSOAL =
  "Abre a conversa no WhatsApp do seu celular. A mensagem sai do seu número pessoal, não do número do escritório, e não fica registrada aqui. Dali você também pode tocar em ligar, no próprio WhatsApp.";
export const PASSOS_PARA_REABRIR = [
  "O cliente escreve de novo para o número do escritório: a janela reabre na hora e o campo volta sozinho.",
  "Modelo aprovado pelo WhatsApp: é uma mensagem pronta, aprovada antes, que pode iniciar a conversa. Ainda não está disponível aqui.",
  "Outro canal: ligar, e-mail, ou o seu WhatsApp pessoal. Registre o retorno com uma tarefa.",
];

export function tituloDaTarefaDeRetorno(nome: string, nomeTemporario: boolean): string {
  const alvo = nomeTemporario || !nome.trim() ? "este número" : nome.trim();
  return `Retomar contato com ${alvo}`.slice(0, 200);
}

/** "aaaa-mm-dd" de amanhã em Brasília (a tarefa exige data). */
export function amanhaEmBrasilia(agora: Date = new Date()): string {
  const [a, m, d] = hojeEmBrasilia(agora).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10);
}
