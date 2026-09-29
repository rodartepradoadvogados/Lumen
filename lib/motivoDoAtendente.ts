import { FalhaDoHermes, variaveisFaltandoDoHermes } from "@/lib/hermesPonte";
import { mensagemDeErro } from "@/lib/mensagemDeErro";

// ============================================================================
// O MOTIVO REAL PELO QUAL A ANA NÃO RESPONDEU, em frase de gente.
//
// O botão "Responder à última pergunta" (site e aplicativo) mostra o que esta função devolve. Antes, todo
// defeito do assistente (Hermes) virava "agente indisponível: ..." e "a ponte com o agente não está
// configurada", que não dizem o que fazer. Aqui cada CAUSA (`FalhaDoHermes.causa`, decidida pelo código
// HTTP e nunca pelo texto) tem a sua frase: não configurado, sem resposta, recusou, perfil ausente...
//
// SEM SEGREDO NA FRASE: o valor de HERMES_TOKEN e de HERMES_URL, e qualquer "Bearer x", são apagados de
// tudo o que sai daqui (o corpo de um erro da ponte pode ecoar o cabeçalho). Só os NOMES das variáveis
// aparecem, porque é o que quem administra precisa saber onde mexer.
// ============================================================================

/** Apaga o token, o endereço da ponte e qualquer cabeçalho Bearer do texto. */
export function semSegredoDaPonte(texto: string): string {
  let t = texto;
  for (const v of [process.env.HERMES_TOKEN, process.env.HERMES_URL]) {
    const valor = v?.trim();
    if (valor && valor.length >= 4) t = t.split(valor).join("[oculto]");
  }
  return t.replace(/Bearer\s+\S+/gi, "Bearer [oculto]");
}

/** A frase para quando `hermesConfigurado()` é falso: diz QUAL variável falta. */
export function motivoDePonteNaoConfigurada(): string {
  const falta = variaveisFaltandoDoHermes();
  const quais = falta.length > 0 ? falta.join(" e ") : "HERMES_URL e HERMES_TOKEN";
  return `o assistente (Hermes) não está configurado neste servidor: falta ${quais} nas variáveis de ambiente da Vercel. Avise quem administra o sistema`;
}

/** A frase de uma falha ao falar com o Hermes. Nunca contém o token nem o endereço da ponte. */
export function motivoDaFalhaDoHermes(erro: unknown): string {
  if (!(erro instanceof FalhaDoHermes)) return semSegredoDaPonte(`falha inesperada ao falar com o assistente: ${mensagemDeErro(erro)}`);
  switch (erro.causa) {
    case "nao-configurada":
      return motivoDePonteNaoConfigurada();
    case "recusou":
      return `o servidor do assistente recusou o acesso (código ${erro.status ?? "401"}): o HERMES_TOKEN da Vercel não confere com o da ponte. Avise quem administra o sistema`;
    case "perfil":
      return "o assistente não encontrou o perfil deste escritório na ponte (confira HERMES_PERFIL na Vercel ou o provisionamento do escritório)";
    case "demora":
      return `o assistente não respondeu a tempo (${semSegredoDaPonte(erro.motivo).replace(/^DEMORA:\s*/, "")}). Tente de novo em instantes`;
    case "inalcancavel":
      return "não foi possível alcançar o servidor do assistente (fora do ar, ou HERMES_URL errado na Vercel)";
    case "vazia":
      return "o assistente respondeu em branco. Tente de novo";
    case "erro-da-ponte":
      return `o servidor do assistente devolveu erro (${erro.status ?? "sem código"}): ${semSegredoDaPonte(erro.motivo).replace(/^o servidor do Hermes respondeu \d+:?\s*/, "") || "sem detalhe"}`;
    default:
      return semSegredoDaPonte(`o assistente falhou: ${erro.motivo}`);
  }
}
