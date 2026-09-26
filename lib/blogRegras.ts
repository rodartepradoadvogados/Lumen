// ============================================================================
// REGRAS DO BLOG JURÍDICO — SEM REDE, SEM PRISMA.
//
// Extraído de app/api/blog/draft/route.ts (docs/agentes/robo-news-juridico-firecrawl.md, Parte
// A2) para que as regras editoriais (área permitida, dupla validação de fontes, limites de
// tamanho, duplicata) fiquem num lugar só, testável de mesa, e reutilizável por quem mais vier a
// gerar matéria (Parte C — Hermes, futuro). A rota importa daqui em vez de reimplementar.
//
// "Dupla validação" aqui é só a FORMA da fonte (≥2 URLs https, domínios distintos, ao menos uma
// oficial) — nunca o CONTEÚDO. Confirmar que a fonte realmente diz o que a matéria alega é
// trabalho de quem pesquisa (a skill/Routine, ou o Hermes na Parte C), não deste módulo.
// ============================================================================

/** As únicas áreas aceitas numa matéria do blog — docs/agentes/robo-news-juridico-firecrawl.md §4. */
export const AREAS_DO_BLOG = [
  "Cível",
  "Consumerista",
  "Empresarial",
  "Tributário",
  "Trabalhista",
  "Previdenciário",
  "Administrativo",
  "Licitação",
  "Compliance",
  "Due Diligence",
  "Contratual",
  "Responsabilidade Civil",
  "Execuções",
] as const;

export type AreaDoBlog = (typeof AREAS_DO_BLOG)[number];

export function areaValida(area: string): area is AreaDoBlog {
  return (AREAS_DO_BLOG as readonly string[]).includes(area);
}

export const LIMITE_TITULO = 180;
export const LIMITE_RESUMO = 400;
export const LIMITE_CONTEUDO = 12_000;

function tentarParsear(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function correspondeDominio(host: string, dominio: string): boolean {
  return host === dominio || host.endsWith(`.${dominio}`);
}

/** Domínios oficiais aceitos como fonte primária: tribunais (qualquer `*.jus.br`) e as três
 * fontes legislativas citadas na especificação. */
const DOMINIOS_OFICIAIS = ["jus.br", "planalto.gov.br", "in.gov.br", "camara.leg.br", "senado.leg.br"];

export function ehOficial(url: string): boolean {
  const u = tentarParsear(url);
  if (!u) return false;
  const host = u.hostname.toLowerCase();
  return DOMINIOS_OFICIAIS.some((d) => correspondeDominio(host, d));
}

/** Portais jurídicos aceitos como fonte secundária — Jusbrasil só conta quando o caminho é de
 * notícia (`/noticias/...`); o resto do site (peças, processos de terceiros) não é fonte de
 * matéria de blog. */
export function ehPortalJuridico(url: string): boolean {
  const u = tentarParsear(url);
  if (!u) return false;
  const host = u.hostname.toLowerCase();
  if (correspondeDominio(host, "migalhas.com.br")) return true;
  if (correspondeDominio(host, "conjur.com.br")) return true;
  if (correspondeDominio(host, "jusbrasil.com.br") && u.pathname.toLowerCase().startsWith("/noticias")) return true;
  return false;
}

/**
 * A dupla validação de FORMA exigida pela especificação: pelo menos 2 URLs `https://`, de
 * domínios distintos, com pelo menos uma oficial. Não exige que a segunda seja necessariamente um
 * dos portais listados em `ehPortalJuridico` — a especificação aceita "quaisquer duas
 * independentes" quando não há decisão judicial envolvida.
 */
export function validarFontes(sources: string[] | null | undefined): { ok: true } | { ok: false; motivo: string } {
  const urls = (sources || []).map((s) => s.trim()).filter(Boolean);

  if (urls.length < 2) {
    return { ok: false, motivo: "são necessárias pelo menos 2 fontes independentes, cada uma efetivamente lida." };
  }
  for (const url of urls) {
    if (!/^https:\/\//i.test(url)) {
      return { ok: false, motivo: `a fonte "${url}" não é uma URL https — snippet de busca ou link inseguro não valem.` };
    }
  }

  const hosts = urls.map((u) => tentarParsear(u)?.hostname.toLowerCase() ?? null);
  if (hosts.some((h) => !h)) {
    return { ok: false, motivo: "uma das fontes não é uma URL válida." };
  }
  if (new Set(hosts).size < 2) {
    return { ok: false, motivo: "as fontes precisam ser de domínios distintos — duas URLs do mesmo site não valem como dupla validação." };
  }

  if (!urls.some((u) => ehOficial(u))) {
    return { ok: false, motivo: "nenhuma das fontes é oficial (um *.jus.br, planalto.gov.br, in.gov.br, camara.leg.br ou senado.leg.br)." };
  }

  return { ok: true };
}

export function limitesValidos(campos: { title: string; summary: string; content: string }): { ok: true } | { ok: false; motivo: string } {
  if (campos.title.length > LIMITE_TITULO) {
    return { ok: false, motivo: `o título excede ${LIMITE_TITULO} caracteres.` };
  }
  if (campos.summary.length > LIMITE_RESUMO) {
    return { ok: false, motivo: `o resumo excede ${LIMITE_RESUMO} caracteres.` };
  }
  if (campos.content.length > LIMITE_CONTEUDO) {
    return { ok: false, motivo: `o conteúdo excede ${LIMITE_CONTEUDO} caracteres.` };
  }
  return { ok: true };
}

/** Normaliza um título para comparação de duplicata: sem acento, minúsculo, sem pontuação, espaços
 * colapsados. Mesma lógica que já existia em app/api/blog/draft/route.ts antes desta extração. */
export function normalizarTitulo(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Duplicata = título normalizado igual a algum já existente, OU alguma fonte do candidato já
 * citada em outra matéria (mesmo fato, título reescrito de outro jeito). Quem chama decide a
 * janela de tempo e o filtro de escritório/status — aqui só a comparação, pura.
 */
export function ehDuplicata(
  candidato: { title: string; sources?: string[] | null },
  existentes: { title: string; sources?: string[] | null }[],
): boolean {
  const tituloNormalizado = normalizarTitulo(candidato.title);
  const fontesCandidato = (candidato.sources || []).map((s) => s.trim()).filter(Boolean);

  return existentes.some((p) => {
    if (normalizarTitulo(p.title) === tituloNormalizado) return true;
    if (fontesCandidato.length === 0) return false;
    const fontesExistentes = (p.sources || []).map((s) => s.trim()).filter(Boolean);
    return fontesCandidato.some((s) => fontesExistentes.includes(s));
  });
}
