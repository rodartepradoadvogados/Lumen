import { readFileSync } from "node:fs";
import { teste, igual, verdade, resumo, codigoDe } from "./executar";
import { lerConfigDoFirecrawl, FIRECRAWL_BASE_PADRAO, lerPagina, ERRO_FIRECRAWL_NAO_CONFIGURADO } from "../firecrawl";

// ============================================================================
// FIRECRAWL (lib/firecrawl.ts) — fail-closed: sem FIRECRAWL_API_KEY, nenhuma chamada sai.
// ============================================================================

teste("sem chave (ausente, vazia ou só espaço) a configuração é null", () => {
  igual(lerConfigDoFirecrawl({}), null);
  igual(lerConfigDoFirecrawl({ chave: "" }), null);
  igual(lerConfigDoFirecrawl({ chave: "   " }), null);
});

teste("com chave, usa a base padrão e tira barra final de base customizada", () => {
  igual(lerConfigDoFirecrawl({ chave: " fc-x " }), { chave: "fc-x", base: FIRECRAWL_BASE_PADRAO });
  igual(lerConfigDoFirecrawl({ chave: "fc-x", base: "https://fc.exemplo/v2/" }), { chave: "fc-x", base: "https://fc.exemplo/v2" });
});

teste("sem FIRECRAWL_API_KEY no ambiente, lerPagina recusa antes de tocar a rede", async () => {
  delete process.env.FIRECRAWL_API_KEY;
  const fetchOriginal = globalThis.fetch;
  let chamou = false;
  globalThis.fetch = (async () => {
    chamou = true;
    throw new Error("não devia chamar");
  }) as typeof fetch;
  try {
    let erro = "";
    await lerPagina("https://exemplo.com").catch((e: Error) => (erro = e.message));
    igual(erro, ERRO_FIRECRAWL_NAO_CONFIGURADO);
    verdade(!chamou, "fetch foi chamado sem chave configurada");
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

teste("a chave não tem prefixo NEXT_PUBLIC_ (nunca vai para o navegador)", () => {
  const fonte = codigoDe(readFileSync("lib/firecrawl.ts", "utf8"));
  verdade(!fonte.includes("NEXT_PUBLIC_FIRECRAWL"), "a chave do Firecrawl ganhou prefixo público");
});

resumo("Firecrawl (fail-closed)");
