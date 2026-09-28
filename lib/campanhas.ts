// ============================================================================
// DE QUAL CAMPANHA VEIO ESTA CONVERSA.
//
// A pessoa clica no anúncio do Instagram e cai no WhatsApp do escritório. A primeira mensagem
// dessa conversa — e só ela — carrega, no protocolo do WhatsApp, o link de origem do anúncio e o
// texto que já vinha escrito. É com esses dois que se descobre a campanha.
//
// A ORDEM É DECISÃO DO DONO: link primeiro, texto depois, e nada casando, conversa natural. Link
// é identificação; texto é palpite — o lead pode apagar o texto antes de enviar, e dois anúncios
// podem usar a mesma frase.
//
// DEGRADA PARA O LADO SEGURO. Sem campanha reconhecida o lead NÃO é recusado: é atendido como
// conversa espontânea, com o padrão Lúmen inteiro. O pior que acontece é ele ser bem atendido
// fora da campanha.
// ============================================================================

/** As opções prontas da etapa 7 do formulário. O escritório marca as que valem e acrescenta as dele. */
export const MOTIVOS_DE_RECUSA_PRONTOS = [
  "Não tem condições de arcar com os custos",
  "Não tem patrimônio envolvido na causa",
  "Não aceita pagar honorários contratuais iniciais",
  "Quer apenas informação, não quer contratar",
  "Insiste em saber preços antes da triagem",
  "Assunto fora da área desta campanha",
  "Já tem advogado constituído para o caso",
  "Não enviou os documentos obrigatórios no prazo",
];

export type CampanhaParaCasar = {
  id: string;
  ativa: boolean;
  inicioEm: Date | null;
  fimEm: Date | null;
  sourceUrl: string | null;
  textoDoClique: string | null;
  createdAt: Date;
};

export type OrigemDaConversa = {
  sourceUrl?: string | null;
  texto?: string | null;
};

/**
 * Normaliza um endereço para comparação.
 *
 * Tira protocolo, `www.`, barra final e — o que mais importa — TODA a query. Anúncio do Meta
 * chega com `fbclid`, `utm_*` e companhia grudados, e cada clique traz valores diferentes: sem
 * cortar isso, nenhum link jamais casaria, e o escritório ficaria procurando defeito no lugar
 * errado.
 */
export function normalizarUrl(bruto: string | null | undefined): string {
  const valor = (bruto || "").trim();
  if (!valor) return "";
  try {
    const u = new URL(valor.includes("://") ? valor : `https://${valor}`);
    const host = u.host.replace(/^www\./i, "").toLowerCase();
    const caminho = u.pathname.replace(/\/+$/, "");
    return host + caminho;
  } catch {
    return valor.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[?#]/)[0].replace(/\/+$/, "");
  }
}

/**
 * Normaliza um texto para comparação: minúsculas, sem acento, sem pontuação, espaços colapsados.
 *
 * Sem tirar acento, "Olá, vi o anúncio" digitado de um teclado que não põe acento nunca casaria
 * com o texto cadastrado — e a pessoa que cadastrou não teria como adivinhar isso.
 */
export function normalizarTexto(bruto: string | null | undefined): string {
  return (bruto || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function estaNoAr(c: CampanhaParaCasar, agora: Date): boolean {
  if (!c.ativa) return false;
  if (c.inicioEm && agora < c.inicioEm) return false;
  if (c.fimEm && agora > c.fimEm) return false;
  return true;
}

export type Casamento = { campanhaId: string; por: "link" | "texto" } | null;

/**
 * Acha a campanha desta conversa.
 *
 * Empate dentro do mesmo critério: vence a cadastrada mais recentemente. Entre critérios
 * diferentes, o link SEMPRE vence o texto, mesmo que a campanha do texto seja mais nova —
 * é por isso que os dois laços são separados em vez de um só com pontuação.
 */
export function casarCampanha(
  campanhas: CampanhaParaCasar[],
  origem: OrigemDaConversa,
  agora: Date,
): Casamento {
  const noAr = campanhas.filter((c) => estaNoAr(c, agora));
  const maisNova = (a: CampanhaParaCasar, b: CampanhaParaCasar) => b.createdAt.getTime() - a.createdAt.getTime();

  const urlRecebida = normalizarUrl(origem.sourceUrl);
  if (urlRecebida) {
    const porLink = noAr
      .filter((c) => c.sourceUrl && normalizarUrl(c.sourceUrl) === urlRecebida)
      .sort(maisNova);
    if (porLink[0]) return { campanhaId: porLink[0].id, por: "link" };
  }

  const textoRecebido = normalizarTexto(origem.texto);
  if (textoRecebido) {
    // COMEÇA COM, e não "é igual": o texto do clique vem pronto e a pessoa muitas vezes continua
    // escrevendo em seguida, na mesma mensagem. Exigir igualdade perderia justamente quem se deu
    // ao trabalho de explicar o caso já na primeira linha.
    const porTexto = noAr
      .filter((c) => {
        const cadastrado = normalizarTexto(c.textoDoClique);
        return cadastrado.length >= 10 && textoRecebido.startsWith(cadastrado);
      })
      .sort(maisNova);
    if (porTexto[0]) return { campanhaId: porTexto[0].id, por: "texto" };
  }

  return null;
}
