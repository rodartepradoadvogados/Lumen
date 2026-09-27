import { readFileSync } from "node:fs";
import { teste, igual, verdade, resumo } from "./executar";
import { assistantTools } from "../assistantTools";
import { ERRO_FIRECRAWL_NAO_CONFIGURADO } from "../firecrawl";

// pesquisar_jurisprudencia / ler_fonte_juridica (docs/agentes/peticionamento-firecrawl-
// validacao.md §5/§6) — as DUAS ferramentas de leitura pública que o agente de peticionamento usa
// para localizar e LER um julgado antes de citá-lo. Fail-closed (como lib/firecrawl.ts) e
// recusa de SSRF são o que este arquivo prova; a lógica de busca/leitura em si já é coberta por
// lib/testes/firecrawl.teste.ts.

function ferramenta(nome: string) {
  const t = assistantTools.find((f) => f.spec.name === nome);
  if (!t) throw new Error(`ferramenta "${nome}" não registrada em assistantTools`);
  return t;
}

teste("pesquisar_jurisprudencia e ler_fonte_juridica estão registradas, módulo 'pesquisa'", () => {
  igual(ferramenta("pesquisar_jurisprudencia").modulo, "pesquisa");
  igual(ferramenta("ler_fonte_juridica").modulo, "pesquisa");
});

teste("sem FIRECRAWL_API_KEY, pesquisar_jurisprudencia recusa antes de tocar a rede (fail-closed amigável)", async () => {
  delete process.env.FIRECRAWL_API_KEY;
  const fetchOriginal = globalThis.fetch;
  let chamou = false;
  globalThis.fetch = (async () => {
    chamou = true;
    throw new Error("não devia chamar");
  }) as typeof fetch;
  try {
    const resposta = await ferramenta("pesquisar_jurisprudencia").executar(
      { consulta: "tema repetitivo STJ" },
      { officeId: "esc1", userId: "u1" } as never,
    );
    verdade(!chamou, "fetch foi chamado sem chave configurada");
    verdade(typeof resposta === "string" && !resposta.startsWith("{"), "devia devolver aviso em texto, não relançar o erro");
    verdade(!/error|Error/.test(resposta) || resposta.includes("não está configurada"), `resposta inesperada: "${resposta}"`);
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

teste("sem FIRECRAWL_API_KEY, ler_fonte_juridica recusa antes de tocar a rede (fail-closed amigável)", async () => {
  delete process.env.FIRECRAWL_API_KEY;
  const fetchOriginal = globalThis.fetch;
  let chamou = false;
  globalThis.fetch = (async () => {
    chamou = true;
    throw new Error("não devia chamar");
  }) as typeof fetch;
  try {
    const resposta = await ferramenta("ler_fonte_juridica").executar(
      { url: "https://stj.jus.br/algum-julgado" },
      { officeId: "esc1", userId: "u1" } as never,
    );
    verdade(!chamou, "fetch foi chamado sem chave configurada");
    verdade(typeof resposta === "string" && resposta.includes("não está configurada"), `resposta inesperada: "${resposta}"`);
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

teste("ler_fonte_juridica recusa URL insegura (SSRF) sem sequer checar a chave do Firecrawl", async () => {
  const urlsRecusadas = [
    "http://stj.jus.br/x", // não é https
    "https://localhost/x",
    "https://127.0.0.1/x",
    "https://192.168.0.1/x",
    "ftp://stj.jus.br/x",
    "não é uma url",
  ];
  for (const url of urlsRecusadas) {
    const resposta = await ferramenta("ler_fonte_juridica").executar({ url }, { officeId: "esc1", userId: "u1" } as never);
    verdade(typeof resposta === "string" && resposta.includes("recusada"), `"${url}" devia ser recusada, veio: "${resposta}"`);
  }
});

teste("pesquisar_jurisprudencia exige o campo 'consulta'", async () => {
  const resposta = await ferramenta("pesquisar_jurisprudencia").executar({}, { officeId: "esc1", userId: "u1" } as never);
  verdade(typeof resposta === "string" && resposta.includes("consulta"), `resposta inesperada: "${resposta}"`);
});

teste("ler_fonte_juridica exige o campo 'url'", async () => {
  const resposta = await ferramenta("ler_fonte_juridica").executar({}, { officeId: "esc1", userId: "u1" } as never);
  verdade(typeof resposta === "string" && resposta.includes("url"), `resposta inesperada: "${resposta}"`);
});

teste("ERRO_FIRECRAWL_NAO_CONFIGURADO é a mesma constante de lib/firecrawl.ts (não uma string duplicada à mão)", () => {
  verdade(
    typeof ERRO_FIRECRAWL_NAO_CONFIGURADO === "string" && ERRO_FIRECRAWL_NAO_CONFIGURADO.length > 0,
    "ERRO_FIRECRAWL_NAO_CONFIGURADO devia ser uma string não vazia",
  );
});

teste("TIMEOUT_FIRECRAWL_MS fica abaixo do maxDuration=30s da rota MCP", () => {
  const fonte = readFileSync("lib/assistantTools.ts", "utf8");
  const m = fonte.match(/TIMEOUT_FIRECRAWL_MS\s*=\s*([\d_]+)/);
  verdade(!!m, "constante TIMEOUT_FIRECRAWL_MS não encontrada em lib/assistantTools.ts");
  const ms = Number((m as RegExpMatchArray)[1].replace(/_/g, ""));
  verdade(ms <= 20_000, `TIMEOUT_FIRECRAWL_MS = ${ms}ms — precisa ficar bem abaixo dos 30s da rota MCP`);
});

resumo("Ferramentas do agente — pesquisar_jurisprudencia / ler_fonte_juridica (Firecrawl, fail-closed + SSRF)");
