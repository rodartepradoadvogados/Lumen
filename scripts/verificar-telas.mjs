// VERIFICAÇÃO DE TELA — navega o produto rodando e mede o que só existe depois de renderizar.
//
// Por que este script existe. Até 18/09/2026 este ambiente não alcançava o banco (a política de
// rede bloqueia TCP na 5432), então nenhuma verificação conseguia abrir o produto: `tsc`, `lint`,
// `build` e harness de CSS pegam muita coisa, e não pegam "isto está cortado na minha tela".
// Nove dos quinze apontamentos da conferência visual do dono saíram desse buraco.
//
// Com o adaptador WebSocket (ver lib/prisma.ts) o produto sobe aqui, e passou a ser possível
// medir na tela montada. Este script é o começo do guard que falta: altura de controle, corte de
// rótulo e rolagem horizontal não são lintáveis, porque só existem depois do layout.
//
// COMO RODAR
//   1. suba o servidor contra um banco de STAGING (nunca produção):
//        DATABASE_URL=<staging> LUMEN_DB_ADAPTADOR=neon AUTH_SECRET=<qualquer> npx next start -p 3401
//   2. rode:
//        LUMEN_VERIF_URL=http://127.0.0.1:3401 \
//        LUMEN_VERIF_EMAIL=... LUMEN_VERIF_SENHA=... \
//        node scripts/verificar-telas.mjs ./saida
//
// Sai com código 1 se qualquer tela reprovar, para poder virar passo de CI quando houver banco
// de staging no pipeline.
import fs from "node:fs";

// O Playwright pode estar no projeto (devDependency) ou instalado globalmente no ambiente do
// agente. Tenta o normal e cai para o caminho global — assim o script serve nos dois lugares sem
// obrigar o repositório a carregar ~300 MB de navegador como dependência.
const { chromium } = await import("playwright").catch(() =>
  import(process.env.LUMEN_VERIF_PLAYWRIGHT ?? "/opt/node22/lib/node_modules/playwright/index.mjs")
);

const BASE = process.env.LUMEN_VERIF_URL ?? "http://127.0.0.1:3401";
const EMAIL = process.env.LUMEN_VERIF_EMAIL;
const SENHA = process.env.LUMEN_VERIF_SENHA;
const SAIDA = process.argv[2] ?? "./verificacao";

if (!EMAIL || !SENHA) {
  console.error("Faltam LUMEN_VERIF_EMAIL e LUMEN_VERIF_SENHA.");
  process.exit(1);
}
fs.mkdirSync(SAIDA, { recursive: true });

// DUAS PASSAGENS, com critérios diferentes — e isso é o ponto, não um detalhe.
//
// O piso de 44px é de TOQUE: ele vale no PWA, que se usa com o polegar. Aplicá-lo ao portal de
// mesa reprovaria "Peticionar", "Novo" e a busca da barra de topo, que têm 32px de propósito e
// se clicam com o mouse. A primeira versão deste script fazia exatamente isso e acusou 8
// "defeitos" por tela, nenhum verdadeiro. Um guard que grita onde não há problema ensina a
// ignorá-lo — e aí ele não guarda nada.
const PASSAGENS = [
  { nome: "portal", largura: 1600, pisoToque: null, rotas: ["/painel", "/agenda", "/publicacoes", "/processos", "/financeiro", "/alertas", "/configuracoes"] },
  { nome: "app", largura: 390, pisoToque: 44, rotas: ["/m", "/m/agenda", "/m/processos", "/m/publicacoes", "/m/financeiro", "/m/mais"] },
];

const navegador = await chromium.launch();
const ctx = await navegador.newContext({ viewport: { width: 1600, height: 1000 } });
const pagina = await ctx.newPage();
const errosDePagina = [];
pagina.on("pageerror", (e) => errosDePagina.push(String(e).slice(0, 160)));

await pagina.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await pagina.fill('input[name="email"]', EMAIL);
await pagina.fill('input[name="password"]', SENHA);
await pagina.click('button[type="submit"]');
await pagina.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 30000 });

let reprovas = 0;
let telas = 0;
for (const passagem of PASSAGENS) {
await pagina.setViewportSize({ width: passagem.largura, height: 1000 });
console.log(`\n— ${passagem.nome} (${passagem.largura}px)`);
for (const rota of passagem.rotas) {
  telas += 1;
  await pagina.goto(BASE + rota, { waitUntil: "networkidle" });
  await pagina.waitForTimeout(500);

  const m = await pagina.evaluate((piso) => {
    const rail = document.querySelector("aside");
    const nav = rail?.querySelector("nav");
    // `sr-only` é texto POSTO para leitor de tela e escondido do olho com um recorte de 1px.
    // Ele sempre "transborda" a própria caixa — é como a técnica funciona. Contá-lo como texto
    // cortado foi o outro falso positivo da primeira versão: acusava o <h1> oculto do Painel.
    const invisivelDePropósito = (e) => {
      const cs = getComputedStyle(e);
      if (cs.clip === "rect(0px, 0px, 0px, 0px)") return true;
      if (cs.clipPath === "inset(50%)") return true;
      const r = e.getBoundingClientRect();
      return r.width <= 1 || r.height <= 1;
    };
    // Controles pequenos demais para o dedo. Só na passagem de toque, e só o que está visível.
    const pequenos = piso === null ? [] : [...document.querySelectorAll("button, a, select, [role='button']")]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.height < piso && !invisivelDePropósito(e);
      })
      .map((e) => `${e.tagName.toLowerCase()}:${(e.textContent ?? "").trim().slice(0, 28) || "(sem texto)"}`);
    // Texto cortado pela própria caixa, sem reticências que expliquem o corte.
    const cortados = [...document.querySelectorAll("span, p, h1, h2, h3")]
      .filter((e) => {
        if (invisivelDePropósito(e)) return false;
        if (e.scrollWidth <= Math.ceil(e.clientWidth) + 1) return false;
        // Reticências (aqui ou num ancestral próximo) são decisão, não defeito.
        let n = e;
        for (let i = 0; i < 3 && n; i += 1, n = n.parentElement) {
          if (getComputedStyle(n).textOverflow.includes("ellipsis")) return false;
        }
        return true;
      })
      .map((e) => (e.textContent ?? "").trim().slice(0, 34));
    return {
      railRolaX: nav ? nav.scrollWidth > nav.clientWidth : null,
      paginaRolaX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      temH1: Boolean(document.querySelector("h1")),
      pequenos: [...new Set(pequenos)].slice(0, 8),
      cortados: [...new Set(cortados)].slice(0, 8),
    };
  }, passagem.pisoToque);

  const falhas = [];
  if (m.railRolaX) falhas.push("rail rola na horizontal");
  if (m.paginaRolaX) falhas.push("página rola na horizontal");
  if (!m.temH1) falhas.push("sem <h1>");
  if (m.pequenos.length) falhas.push(`${m.pequenos.length} controle(s) abaixo de ${passagem.pisoToque}px: ${m.pequenos.join(", ")}`);
  if (m.cortados.length) falhas.push(`texto cortado: ${m.cortados.join(" | ")}`);

  if (falhas.length) {
    reprovas += 1;
    console.log(`✗ ${rota}`);
    for (const f of falhas) console.log(`    ${f}`);
  } else {
    console.log(`✓ ${rota}`);
  }
  await pagina.screenshot({ path: `${SAIDA}/${passagem.nome}${rota.replace(/\//g, "-")}.png`, fullPage: true });
}
}

if (errosDePagina.length) {
  reprovas += 1;
  console.log(`✗ erros de JavaScript em alguma tela:`);
  for (const e of [...new Set(errosDePagina)].slice(0, 6)) console.log(`    ${e}`);
}

await navegador.close();
console.log(reprovas === 0 ? `\nTodas as ${telas} telas passaram.` : `\n${reprovas} tela(s) com achado.`);
process.exit(reprovas === 0 ? 0 : 1);
