// ============================================================================
// FIRECRAWL — BUSCA E LEITURA DE PÁGINAS DA WEB, SÓ NO SERVIDOR.
//
// Cliente mínimo da API REST v2 do Firecrawl (https://docs.firecrawl.dev/api-reference/v2-introduction),
// deixado pronto "para eventual necessidade": nenhuma tela ou rota do Lúmen o usa ainda. Quem
// precisar (robô de conteúdo jurídico, pesquisa de jurisprudência pelo assistente, conferência de
// uma página de tribunal) importa daqui em vez de reinventar a chamada.
//
// Sem SDK de propósito — `fetch` nativo e duas rotas (`/scrape` e `/search`) bastam, e uma
// dependência a mais não compra nada aqui.
//
// SÓ NO SERVIDOR. A chave é um segredo de conta paga; este módulo nunca pode ser importado por um
// componente "use client" (ela não tem prefixo NEXT_PUBLIC_, então o Next nem a embutiria — mas o
// import quebraria em silêncio com "não configurado" no navegador, o que confunde).
//
// FAIL-CLOSED. Sem FIRECRAWL_API_KEY, nenhuma chamada sai: `lerConfigDoFirecrawl` devolve `null` e
// as funções de rede lançam ERRO_FIRECRAWL_NAO_CONFIGURADO — nunca um "tenta sem chave" pelo plano
// gratuito anônimo. Mesma regra de CRON_SECRET/ASAAS_WEBHOOK_TOKEN — ver CLAUDE.md.
// ============================================================================

export const FIRECRAWL_BASE_PADRAO = "https://api.firecrawl.dev/v2";

export const ERRO_FIRECRAWL_NAO_CONFIGURADO =
  "o Firecrawl não está configurado (falta FIRECRAWL_API_KEY)";

export type ConfigDoFirecrawl = { chave: string; base: string };

export type PaginaLida = { url: string; titulo: string | null; markdown: string };

export type ResultadoDeBusca = { url: string; titulo: string | null; descricao: string | null };

/**
 * Lê a configuração a partir de valores JÁ RESOLVIDOS (não de `process.env` direto) — cabe num teste
 * de mesa sem simular variável de ambiente global. Falta a chave → `null`, sem meio-termo.
 */
export function lerConfigDoFirecrawl(env: { chave?: string | null; base?: string | null }): ConfigDoFirecrawl | null {
  const chave = env.chave?.trim();
  if (!chave) return null;
  const base = (env.base?.trim() || FIRECRAWL_BASE_PADRAO).replace(/\/+$/, "");
  return { chave, base };
}

function configDoAmbiente(): ConfigDoFirecrawl {
  const config = lerConfigDoFirecrawl({
    chave: process.env.FIRECRAWL_API_KEY,
    base: process.env.FIRECRAWL_API_URL,
  });
  if (!config) throw new Error(ERRO_FIRECRAWL_NAO_CONFIGURADO);
  return config;
}

async function chamar<T>(caminho: string, corpo: unknown, config: ConfigDoFirecrawl, timeoutMs: number): Promise<T> {
  const resposta = await fetch(`${config.base}${caminho}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.chave}`, "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  const json = (await resposta.json().catch(() => null)) as { success?: boolean; error?: string } | null;
  if (!resposta.ok || !json?.success) {
    // Nunca ecoar a chave; só status e a mensagem que o próprio Firecrawl devolveu.
    throw new Error(`Firecrawl ${caminho} falhou (HTTP ${resposta.status}): ${json?.error ?? "resposta inválida"}`);
  }
  return json as T;
}

/** Lê uma página pública (HTML ou documento com URL pública, ex.: PDF) e devolve o conteúdo principal em markdown. */
export async function lerPagina(
  url: string,
  opcoes: { timeoutMs?: number; config?: ConfigDoFirecrawl } = {},
): Promise<PaginaLida> {
  const config = opcoes.config ?? configDoAmbiente();
  const r = await chamar<{ data?: { markdown?: string; metadata?: { title?: string; sourceURL?: string } } }>(
    "/scrape",
    { url, formats: ["markdown"], onlyMainContent: true },
    config,
    opcoes.timeoutMs ?? 60_000,
  );
  return {
    url: r.data?.metadata?.sourceURL ?? url,
    titulo: r.data?.metadata?.title ?? null,
    markdown: r.data?.markdown ?? "",
  };
}

/** Busca na web e devolve os resultados (sem o conteúdo das páginas — para isso, `lerPagina` em cada URL). */
export async function buscarNaWeb(
  consulta: string,
  opcoes: { limite?: number; timeoutMs?: number; config?: ConfigDoFirecrawl } = {},
): Promise<ResultadoDeBusca[]> {
  const config = opcoes.config ?? configDoAmbiente();
  const r = await chamar<{ data?: { web?: { url: string; title?: string; description?: string }[] } }>(
    "/search",
    { query: consulta, limit: opcoes.limite ?? 5 },
    config,
    opcoes.timeoutMs ?? 60_000,
  );
  return (r.data?.web ?? []).map((w) => ({ url: w.url, titulo: w.title ?? null, descricao: w.description ?? null }));
}
