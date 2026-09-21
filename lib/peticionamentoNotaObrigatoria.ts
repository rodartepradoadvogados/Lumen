// A NOTA DE DESTAQUE OBRIGATÓRIA — especificação §3: texto fixo, não editável no momento da
// geração. É AQUI, em código, que os dois hard gates que a especificação nomeia explicitamente
// ("bloqueio técnico de sistema — não depende de o modelo se lembrar") viram fato consumado:
//
//   1. Toda jurisprudência citada carrega fonte + aviso de validação cruzada — o aviso é
//      ACRESCENTADO por este módulo a CADA precedente, sempre, mesmo que o texto que o Hermes
//      mandou já tivesse alguma coisa parecida. O modelo nunca decide se o aviso aparece.
//   2. A minuta nunca omite que é rascunho de IA — o bloco inteiro é montado por código a
//      partir de dados estruturados, nunca copiado de um parágrafo de texto livre que o modelo
//      escreveu (que poderia, um dia, "esquecer" uma linha).
//
// Módulo PURO — recebe dados já resolvidos (sessão, precedentes, documentos) e devolve texto.
// Não decide layout de tela nem chama o Hermes.

export type PrecedenteCitado = {
  /** Ex.: "STJ, REsp 1.874.782/SP (Tema 990)" */
  texto: string;
  /** Link da fonte original — sem link, o hard gate ainda escreve a linha, mas avisa que falta. */
  fonte: string | null;
};

export type DadosNotaObrigatoria = {
  precedentes: PrecedenteCitado[];
  documentosBaseConsultados: string[];
  /** Descrição pronta do contexto vinculado — já resolvida (ex.: "Processo nº ... · Atendimento #482") ou null para sessão avulsa. */
  contextoVinculadoDescricao: string | null;
  geradoEm: Date;
  perfil: string;
  sessaoId: string;
};

const AVISO_VALIDACAO_CRUZADA =
  "requer validação cruzada antes do uso (ex.: site do tribunal + Conjur/Migalhas/Jusbrasil)";

/** Uma linha de precedente, SEMPRE com fonte (ou aviso de ausência) e SEMPRE com o aviso de validação cruzada — nunca opcional, nunca decidido pelo texto livre do modelo. */
function linhaDoPrecedente(p: PrecedenteCitado): string {
  const fonte = p.fonte ? `fonte original: ${p.fonte}` : "fonte não informada pelo agente — não usar sem localizar a fonte original";
  return `${p.texto} — ${fonte} — ${AVISO_VALIDACAO_CRUZADA}`;
}

function linhaJurisprudencia(precedentes: PrecedenteCitado[]): string {
  if (precedentes.length === 0) return "Jurisprudência citada: nenhum precedente citado nesta minuta.";
  return `Jurisprudência citada: ${precedentes.map(linhaDoPrecedente).join("; ")}.`;
}

function linhaDocumentos(documentos: string[]): string {
  if (documentos.length === 0) return "Documentos-base consultados: nenhum documento consultado nesta sessão.";
  return `Documentos-base consultados: ${documentos.join(", ")}.`;
}

function linhaContexto(descricao: string | null): string {
  // Sessão avulsa NUNCA fica com a linha em branco nem some — contrato §2 é explícito.
  return `Contexto vinculado: ${descricao ?? "sem vínculo — petição avulsa"}.`;
}

function linhaRodape(geradoEm: Date, perfil: string, sessaoId: string): string {
  const dataHora = geradoEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return `Gerado em: ${dataHora} · Perfil: ${perfil} · Sessão: ${sessaoId}.`;
}

/**
 * O texto literal da nota — cabeçalho fixo (especificação §3, reproduzido palavra por palavra)
 * seguido das quatro linhas, cada uma sempre presente. Devolvido como texto simples (uma linha
 * por item); quem monta o .docx (lib/peticionamentoDocx.ts) decide a formatação visual.
 */
export function montarNotaObrigatoria(dados: DadosNotaObrigatoria): string {
  const linhas = [
    "MINUTA GERADA POR IA — REVISÃO OBRIGATÓRIA",
    `Este documento é um rascunho produzido pelo agente de peticionamento do Lúmen (perfil ${dados.perfil}) e não deve ser protocolado sem revisão integral por advogado habilitado.`,
    "",
    linhaJurisprudencia(dados.precedentes),
    linhaDocumentos(dados.documentosBaseConsultados),
    linhaContexto(dados.contextoVinculadoDescricao),
    linhaRodape(dados.geradoEm, dados.perfil, dados.sessaoId),
  ];
  return linhas.join("\n");
}
