import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { teste, igual, verdade, resumo, codigoDe } from "./executar";
import { comoAguardandoConexao, decidirSaida, novoPendente, pendenteComoMensagem, pendentesParaReenviarAoVoltar, restaurarPendentes, type Pendente } from "@/lib/filaDoChat";
import { decidirSobreOPedido, resultadoDoPedido, RESERVA_EM_CURSO_MS } from "@/lib/envioDeMensagem";
import { hashDoTexto } from "@/lib/hashDoTexto";
import { destinoDepoisDeSalvar } from "@/lib/navegacaoDoAtendimentoApp";
import { estaSemConexao, registrarFalhaDeRede, registrarRedeOk, semConexao } from "@/lib/conexaoDoApp";

// ============================================================================
// R2B — MODO OFFLINE COM SIGILO PRIMEIRO, e a correção do retorno depois de salvar uma conversa nova.
//   - o service worker guarda SÓ a tela estática "Sem conexão" (executado de verdade, num sandbox);
//   - nenhum dado de conversa em Cache Storage nem IndexedDB;
//   - a fila local: "Aguardando conexão", reenvio automático sem duplicar e sem furar a regra do "sem confirmação".
// ============================================================================

const RAIZ = process.cwd();
const le = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf8");
const AGORA = new Date(Date.UTC(2026, 8, 30, 12, 0));

// ── O SERVICE WORKER, EXECUTADO ──────────────────────────────────────────────────────────────────

// O SW roda num sandbox e as suas peças (eventos, respostas) têm forma livre: `Solto` as descreve sem `any`.
type Solto = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Ouvinte = (e: Solto) => void;
function subirSw(opcoes: { rede: (url: string) => Promise<Solto> }) {
  const ouvintes: Record<string, Ouvinte> = {};
  const cachesAbertos: Record<string, Map<string, Solto>> = {};
  const gravacoes: string[] = [];
  const notificacoes: { titulo: string; opcoes: Solto }[] = [];
  const abas: Solto[] = [];
  const janelasAbertas: string[] = [];
  const respostaDaCasca = (url: string) => ({ ok: true, url, tela: true });
  const fabricaDeCache = (nome: string) => {
    const mapa = (cachesAbertos[nome] ||= new Map());
    return {
      addAll: async (urls: string[]) => {
        for (const u of urls) {
          gravacoes.push(`addAll:${u}`);
          mapa.set(u, respostaDaCasca(u));
        }
      },
      put: async (k: string) => {
        gravacoes.push(`put:${k}`);
      },
      add: async (k: string) => {
        gravacoes.push(`add:${k}`);
      },
      match: async (u: string) => mapa.get(u),
    };
  };
  const self: Solto = {
    location: { origin: "https://lumen.exemplo.com.br" },
    addEventListener: (nome: string, fn: Ouvinte) => {
      ouvintes[nome] = fn;
    },
    skipWaiting: async () => {},
    clients: {
      claim: async () => {},
      matchAll: async () => abas,
      openWindow: async (u: string) => {
        janelasAbertas.push(u);
      },
    },
    registration: {
      showNotification: async (titulo: string, o: Solto) => {
        notificacoes.push({ titulo, opcoes: o });
      },
    },
  };
  const contexto: Solto = {
    self,
    URL,
    Response: { error: () => ({ erro: true }) },
    caches: {
      open: async (n: string) => fabricaDeCache(n),
      keys: async () => Object.keys(cachesAbertos),
      delete: async (n: string) => {
        delete cachesAbertos[n];
        return true;
      },
      match: async () => undefined,
    },
    fetch: (p: Solto) => opcoes.rede(typeof p === "string" ? p : p.url),
    console,
  };
  contexto.globalThis = contexto;
  vm.createContext(contexto);
  vm.runInContext(le("public/sw-atendimento.js"), contexto);
  const disparar = async (nome: string, evento: Solto) => {
    const esperas: Promise<unknown>[] = [];
    ouvintes[nome]({ ...evento, waitUntil: (p: Promise<unknown>) => esperas.push(Promise.resolve(p)), respondWith: (p: Solto) => esperas.push(Promise.resolve(p).then((v) => (evento._resposta = v))) });
    await Promise.all(esperas);
    return evento;
  };
  return { ouvintes, cachesAbertos, gravacoes, notificacoes, abas, janelasAbertas, disparar };
}

teste("SW: na instalação guarda SÓ a tela 'Sem conexão' e o ícone; nada de conversa", async () => {
  const sw = subirSw({ rede: async () => ({ ok: true }) });
  await sw.disparar("install", {});
  igual(Object.keys(sw.cachesAbertos), ["atd-casca-v1"]);
  igual([...sw.cachesAbertos["atd-casca-v1"].keys()].sort(), ["/atendimento-offline.html", "/icons-atendimento/icon-192.png"]);
});

teste("SW: navegação sem rede cai na tela 'Sem conexão'; com rede (ou com erro do servidor) passa intacta e NADA é guardado", async () => {
  const conteudoDeConversa = { ok: true, status: 200, corpo: "<html>Maria: meu CPF é 123.456.789-00</html>" };
  let online = true;
  const sw = subirSw({ rede: async (u) => (online ? { ...conteudoDeConversa, url: u } : Promise.reject(new TypeError("Failed to fetch"))) });
  await sw.disparar("install", {});
  const gravacoesDaInstalacao = sw.gravacoes.length;

  // 1) Online: a conversa vem da rede, e o cache continua com as duas entradas da instalação.
  const conversa = await sw.disparar("fetch", { request: { method: "GET", mode: "navigate", url: "https://lumen.exemplo.com.br/atendimento-app/cm8abc" } });
  igual(conversa._resposta.corpo, conteudoDeConversa.corpo, "a página vem da rede");
  igual(sw.gravacoes.length, gravacoesDaInstalacao, "nada foi guardado ao navegar");
  igual(sw.cachesAbertos["atd-casca-v1"].size, 2);

  // 2) Offline: cai na tela estática.
  online = false;
  const semRede = await sw.disparar("fetch", { request: { method: "GET", mode: "navigate", url: "https://lumen.exemplo.com.br/atendimento-app/cm8abc" } });
  igual(semRede._resposta.url, "/atendimento-offline.html");
  const lista = await sw.disparar("fetch", { request: { method: "GET", mode: "navigate", url: "https://lumen.exemplo.com.br/atendimento-app" } });
  igual(lista._resposta.url, "/atendimento-offline.html");
  igual(sw.cachesAbertos["atd-casca-v1"].size, 2, "e nada foi acrescentado ao cache");
  verdade(!sw.gravacoes.some((g) => g.startsWith("put:") || g.startsWith("add:")), "nenhum put/add durante a navegação");
});

teste("SW: API, mídia, outros sites, POST e o que não é navegação NÃO são interceptados (seguem pela rede)", async () => {
  const sw = subirSw({ rede: async () => Promise.reject(new TypeError("offline")) });
  await sw.disparar("install", {});
  for (const req of [
    { method: "GET", mode: "cors", url: "https://lumen.exemplo.com.br/api/atendimento/cm8abc/mensagens?depois=x" },
    { method: "GET", mode: "no-cors", url: "https://lumen.exemplo.com.br/api/atendimento/cm8abc/midia/m1" },
    { method: "GET", mode: "navigate", url: "https://lumen.exemplo.com.br/api/atendimento/cm8abc/midia/m1" },
    { method: "GET", mode: "navigate", url: "https://lumen.exemplo.com.br/atendimento" },
    { method: "GET", mode: "navigate", url: "https://lumen.exemplo.com.br/atendimento-appx" },
    { method: "GET", mode: "navigate", url: "https://outro.site/atendimento-app/x" },
    { method: "POST", mode: "navigate", url: "https://lumen.exemplo.com.br/atendimento-app/sair" },
    { method: "GET", mode: "same-origin", url: "https://lumen.exemplo.com.br/_next/static/chunks/app.js" },
  ]) {
    const e = await sw.disparar("fetch", { request: req });
    verdade(e._resposta === undefined, `${req.method} ${req.mode} ${req.url} não pode ser respondido pelo SW`);
  }
});

teste("SW: caches antigos são apagados na ativação; só a casca atual sobrevive", async () => {
  const sw = subirSw({ rede: async () => ({}) });
  await sw.disparar("install", {});
  sw.cachesAbertos["atd-conversas-v0"] = new Map([["/x", { ok: true }]]);
  await sw.disparar("activate", {});
  igual(Object.keys(sw.cachesAbertos), ["atd-casca-v1"]);
});

teste("SW (push): mostra SEMPRE a frase fixa — texto/nome que chegue na carga é ignorado; tag por conversa; url só do app", async () => {
  const sw = subirSw({ rede: async () => ({}) });
  const carga = { title: "Maria Silva", body: "Meu CPF é 123.456.789-00", tag: "atd-cm8abc", url: "/atendimento-app/cm8abc", tipo: "mensagem-nova" };
  await sw.disparar("push", { data: { json: () => carga } });
  igual(sw.notificacoes.length, 1);
  const n = sw.notificacoes[0];
  igual(n.titulo, "Lúmen Atendimento");
  igual(n.opcoes.body, "Nova mensagem no Atendimento");
  igual(n.opcoes.tag, "atd-cm8abc");
  igual(n.opcoes.data.url, "/atendimento-app/cm8abc");
  verdade(!JSON.stringify(n).includes("Maria") && !JSON.stringify(n).includes("CPF"), "nada da carga vaza para a tela bloqueada");
  // Endereços de fora do app e tags estranhas são trocados por valores seguros.
  await sw.disparar("push", { data: { json: () => ({ url: "https://evil.example.com/x", tag: "<script>" }) } });
  igual(sw.notificacoes[1].opcoes.data.url, "/atendimento-app");
  igual(sw.notificacoes[1].opcoes.tag, "atd-geral");
  await sw.disparar("push", { data: { json: () => ({ url: "/atendimento-app//evil.com" }) } });
  igual(sw.notificacoes[2].opcoes.data.url, "/atendimento-app");
  // Carga ilegível: aviso neutro mesmo assim.
  await sw.disparar("push", { data: { json: () => { throw new Error("json ruim"); } } });
  igual(sw.notificacoes[3].opcoes.body, "Nova mensagem no Atendimento");
  // Sem carga nenhuma:
  await sw.disparar("push", {});
  igual(sw.notificacoes.length, 5);
});

teste("SW (toque): foca a aba que já está na conversa, leva outra aba do app até ela, ou abre uma janela", async () => {
  const foco: string[] = [];
  const navegou: string[] = [];
  const aba = (url: string, navegavel = true) => ({
    url,
    focus: async () => { foco.push(url); return undefined; },
    ...(navegavel ? { navigate: async (u: string) => { navegou.push(u); return { focus: async () => { foco.push("depois-de-navegar:" + u); } }; } } : {}),
  });
  const ev = (url: string) => ({ notification: { close() {}, data: { url } } });

  let sw = subirSw({ rede: async () => ({}) });
  sw.abas.push(aba("https://lumen.exemplo.com.br/atendimento-app/cm8abc"));
  await sw.disparar("notificationclick", ev("/atendimento-app/cm8abc"));
  igual(foco, ["https://lumen.exemplo.com.br/atendimento-app/cm8abc"]);

  sw = subirSw({ rede: async () => ({}) });
  sw.abas.push(aba("https://lumen.exemplo.com.br/atendimento-app/funil"), aba("https://lumen.exemplo.com.br/m"));
  await sw.disparar("notificationclick", ev("/atendimento-app/cm8abc"));
  igual(navegou, ["/atendimento-app/cm8abc"], "só abas do app são reaproveitadas");

  sw = subirSw({ rede: async () => ({}) });
  sw.abas.push(aba("https://lumen.exemplo.com.br/m"));
  await sw.disparar("notificationclick", ev("https://evil.example.com"));
  igual(sw.janelasAbertas, ["/atendimento-app"], "endereço de fora do app vira a raiz do app");
});

teste("SW (código): o único cache é a casca fixa; nada de put/add(request)/IndexedDB/API/mídia no arquivo", () => {
  const c = codigoDe(le("public/sw-atendimento.js"));
  verdade(!/\.put\(|cache\.add\(|indexedDB|CacheStorage|\/api\/|\/midia|localStorage|sessionStorage/.test(c), "guarda ou toca em conteúdo");
  igual((c.match(/caches\.open\(/g) ?? []).length, 1);
  verdade(c.includes('const PAGINA_SEM_CONEXAO = "/atendimento-offline.html"') && /const ATIVOS_DA_CASCA = \[PAGINA_SEM_CONEXAO, "\/icons-atendimento\/icon-192\.png"\]/.test(c), "lista fixa e mínima");
  verdade(c.includes('pedido.method !== "GET" || pedido.mode !== "navigate"'), "só navegação GET");
  verdade(!/fetch\(pedido\)\.then/.test(c) && /fetch\(pedido\)\.catch\(/.test(c), "só a FALHA de rede usa a tela offline");
});

// ── NENHUM DADO DE CONVERSA EM CACHE STORAGE NEM INDEXEDDB ───────────────────────────────────────

function arquivos(dir: string, acc: string[] = []): string[] {
  for (const n of readdirSync(join(RAIZ, dir))) {
    const rel = join(dir, n);
    if (statSync(join(RAIZ, rel)).isDirectory()) arquivos(rel, acc);
    else if (/\.(ts|tsx|js)$/.test(n)) acc.push(rel);
  }
  return acc;
}

teste("SIGILO: nenhum arquivo do app usa Cache Storage, IndexedDB ou localStorage para conversa; a fila é sessionStorage", () => {
  const lista = [...arquivos("components/atendimento-app"), ...arquivos("app/atendimento-app"), "lib/filaDoChat.ts", "lib/conexaoDoApp.ts", "lib/avisoPushDoApp.ts", "public/sw-atendimento.js"];
  for (const f of lista) {
    const c = codigoDe(le(f));
    verdade(!/indexedDB|IDBDatabase|openDatabase|CacheStorage/.test(c), `${f}: usa IndexedDB/Cache Storage`);
    if (f !== "public/sw-atendimento.js") verdade(!/\bcaches\b/.test(c), `${f}: usa caches`);
  }
  // localStorage só para preferências (tema, colunas do funil abertas) — nunca para texto de conversa.
  for (const f of lista) {
    const c = codigoDe(le(f));
    if (!/localStorage/.test(c)) continue;
    verdade(/tema|CHAVE_DO_TEMA|rp-funil|colunas/i.test(c) && !/texto|rascunho|mensagem/i.test(c.match(/localStorage[^;]*;/g)?.join(" ") ?? ""), `${f}: localStorage com cara de conteúdo`);
  }
  const fila = codigoDe(le("lib/filaDoChat.ts"));
  verdade(fila.includes("sessionStorage") && !fila.includes("localStorage"), "a fila e os rascunhos são sessionStorage");
  verdade(fila.includes("limparRastrosDoAparelho") && /k\.startsWith\(PREFIXO_DA_FILA\) \|\| k\.startsWith\(PREFIXO_DO_RASCUNHO\)/.test(fila), "e o Sair apaga os dois");
});

teste("SIGILO: a tela offline é estática, sem script externo, sem chamada de rede e sem dado", () => {
  const h = le("public/atendimento-offline.html");
  verdade(!/<script[^>]*\ssrc=|<link[^>]*rel="stylesheet"|@import|fetch\(|XMLHttpRequest|https?:\/\//.test(h), "nada externo nem chamada de rede");
  verdade(h.includes("Sem conexão") && h.includes("Tentar de novo") && h.includes('lang="pt-BR"') && h.includes("viewport"), "tela amigável e responsiva");
  verdade(!/cliente:|clientName|Attendance|conversa de/i.test(h.replace("as conversas não ficam guardadas", "")), "nenhum dado de conversa");
  verdade(h.includes("rp-atendimento-theme") && h.includes("prefers-color-scheme: dark"), "segue o tema do app");
  verdade(h.includes("min-height: 44px"), "botão de 44 px");
});

// contraste da tela offline, Dia e Noite
const canal = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
const lum = (h: string) => 0.2126 * canal(parseInt(h.slice(1, 3), 16)) + 0.7152 * canal(parseInt(h.slice(3, 5), 16)) + 0.0722 * canal(parseInt(h.slice(5, 7), 16));
const contraste = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
teste("CONTRASTE: a tela offline passa AA em Dia e em Noite (texto, apoio, botão e ícone)", () => {
  const h = le("public/atendimento-offline.html");
  const bloco = (re: RegExp) => {
    const m = h.match(re);
    if (!m) throw new Error(`bloco não achado: ${re}`);
    const t: Record<string, string> = {};
    for (const d of m[1].matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)) t[d[1]] = d[2];
    return t;
  };
  const dia = bloco(/:root \{([^}]*)\}/);
  const noite = { ...dia, ...bloco(/:root\[data-tema="noite"\] \{([^}]*)\}/) };
  const auto = { ...dia, ...bloco(/prefers-color-scheme: dark\) \{ :root:not\(\[data-tema\]\) \{([^}]*)\}/) };
  for (const [nome, t] of [["Dia", dia], ["Noite", noite], ["Automático escuro", auto]] as const) {
    verdade(contraste(t.tinta, t.tela) >= 7, `${nome}: título`);
    verdade(contraste(t.apoio, t.tela) >= 4.5, `${nome}: texto de apoio ${contraste(t.apoio, t.tela).toFixed(2)}`);
    verdade(contraste(t["ouro-tx"], t.ouro) >= 4.5, `${nome}: texto do botão`);
    verdade(contraste(t.tinta, t.pilula) >= 3, `${nome}: ícone sobre o círculo`);
    verdade(contraste(t.ouro, t.tela) >= 1 && contraste(t.tinta, t.tela) >= 3, `${nome}: foco visível (contorno na cor da tinta)`);
  }
});

teste("MIDDLEWARE: a tela offline é pública (senão o SW guardaria a tela de login no lugar dela)", () => {
  const m = codigoDe(le("middleware.ts"));
  verdade(m.includes('pathname === "/atendimento-offline.html"'), "exceção no middleware");
  verdade(le("app/atendimento-app/(shell)/AtendimentoAppShell.tsx").includes("register('/sw-atendimento.js', {scope: '/atendimento-app'})"), "o SW continua registrado no escopo do app");
});

// ── CONEXÃO: A FAIXA ─────────────────────────────────────────────────────────────────────────────

teste("CONEXÃO: 'sem conexão' = navegador offline OU última chamada falhou por rede; some quando volta", () => {
  igual(semConexao({ navegadorOnline: true, falhaDeRede: false }), false);
  igual(semConexao({ navegadorOnline: false, falhaDeRede: false }), true);
  igual(semConexao({ navegadorOnline: true, falhaDeRede: true }), true, "Wi-Fi sem internet: o navegador acha que está online");
  igual(semConexao({ navegadorOnline: false, falhaDeRede: true }), true);
  // O armazém em memória (sem janela): a falha acende e o sucesso apaga.
  registrarRedeOk();
  igual(estaSemConexao(), false);
  registrarFalhaDeRede();
  igual(estaSemConexao(), true);
  registrarFalhaDeRede();
  registrarRedeOk();
  igual(estaSemConexao(), false, "voltou: a faixa some");
});

teste("CONEXÃO (código): a faixa está em todas as telas (abas, conversa, Detalhes, novo), é discreta e sonda só um arquivo estático", () => {
  const faixa = codigoDe(le("components/atendimento-app/FaixaSemConexao.tsx"));
  verdade(faixa.includes("Sem conexão") && faixa.includes('role="status"') && faixa.includes('aria-live="polite"'), "texto e região viva");
  verdade(faixa.includes("ENDERECO_DA_SONDA") && faixa.includes('method: "HEAD"') && !faixa.includes("/api/"), "sonda arquivo estático, não API");
  verdade(le("lib/conexaoDoApp.ts").includes('ENDERECO_DA_SONDA = "/icons-atendimento/icon-192.png"'), "o arquivo da sonda é o ícone");
  verdade(!/#[0-9a-fA-F]{3,8}\b/.test(faixa) && !/\bshadow-/.test(faixa) && faixa.includes("min-h-8"), "só tokens, sem hex nem sombra");
  for (const f of ["app/atendimento-app/(shell)/AtendimentoAppShell.tsx", "app/atendimento-app/(shell)/[id]/layout.tsx", "app/atendimento-app/(shell)/novo/page.tsx"]) {
    verdade(codigoDe(le(f)).includes("<FaixaSemConexao />"), `${f} mostra a faixa`);
  }
});

// ── A FILA: AGUARDANDO CONEXÃO, SEM DUPLICAR ─────────────────────────────────────────────────────

const novo = (chave: string, texto = "Bom dia", nota = false) => novoPendente(chave, texto, AGORA, nota);

teste("FILA: sem conexão o pedido nem sai — fica 'Aguardando conexão'; com conexão sai; o que já saiu e ficou em dúvida NUNCA é remarcado", () => {
  igual(decidirSaida(novo("chave-00000001"), false), "enviar");
  igual(decidirSaida(novo("chave-00000001"), true), "aguardar");
  const emDuvida: Pendente = { ...novo("chave-00000002"), estado: "sem-confirmacao", erro: "Pode ter sido enviada", podeTentarDeNovo: true };
  igual(decidirSaida(emDuvida, true), "avisar", "sem confirmação + sem rede: não marca para reenvio automático");
  igual(decidirSaida(emDuvida, false), "enviar", "com rede, a pessoa toca em Tentar de novo (ação humana)");
  const falhou: Pendente = { ...novo("chave-00000003"), estado: "falhou", erro: "x", podeTentarDeNovo: true };
  igual(decidirSaida(falhou, true), "aguardar", "falhou (o servidor recusou): quando a pessoa toca sem rede, espera");
  const a = comoAguardandoConexao(novo("chave-00000004"));
  igual([a.estado, a.aguardando, a.podeTentarDeNovo, a.erro], ["enviando", true, false, null]);
  const bolha = pendenteComoMensagem(a, AGORA);
  igual(bolha.envioLocal, { estado: "enviando", erro: null, podeTentarDeNovo: false, aguardando: true });
  verdade(!("aguardando" in (pendenteComoMensagem(novo("chave-00000005"), AGORA).envioLocal ?? {})), "o envio comum não carrega a marca");
});

teste("FILA: ao voltar sai SÓ o que está aguardando, cada chave uma vez, na ordem; sem conexão não sai nada", () => {
  const p1 = comoAguardandoConexao(novo("chave-00000001", "um"));
  const p2 = comoAguardandoConexao(novo("chave-00000002", "dois"));
  const nota = comoAguardandoConexao(novo("chave-00000003", "nota", true));
  const emDuvida: Pendente = { ...novo("chave-00000004"), estado: "sem-confirmacao", erro: "Pode ter sido enviada", podeTentarDeNovo: true };
  const falhou: Pendente = { ...novo("chave-00000005"), estado: "falhou", erro: "recusada", podeTentarDeNovo: true };
  const enviandoAgora = novo("chave-00000006");
  const fila = [p1, emDuvida, p2, falhou, nota, enviandoAgora];
  igual(pendentesParaReenviarAoVoltar(fila, true), [], "sem conexão não sai nada");
  igual(pendentesParaReenviarAoVoltar(fila, false).map((p) => p.clientMessageId), ["chave-00000001", "chave-00000002", "chave-00000003"], "só os aguardando; dúvida, falha e envio em curso ficam");
  // Depois do primeiro disparo a marca cai (o componente faz isto em atualizarPendente): um segundo evento de 'online' não repete.
  const depois = fila.map((p) => (p.aguardando ? { ...p, estado: "enviando" as const, aguardando: false } : p));
  igual(pendentesParaReenviarAoVoltar(depois, false), [], "duas voltas seguidas não reenviam a mesma mensagem");
});

teste("FILA SEM DUPLICAR: o reenvio leva a MESMA chave e o servidor devolve a mesma mensagem; 'sem confirmação' nunca reenvia sozinho", () => {
  const p = comoAguardandoConexao(novo("chave-00000001", "Bom dia"));
  const h = hashDoTexto("Bom dia");
  const chaveNoReenvio = pendentesParaReenviarAoVoltar([p], false)[0].clientMessageId;
  igual(chaveNoReenvio, p.clientMessageId, "a chave não muda entre o toque e o reenvio");
  // O servidor: se a primeira tentativa TINHA chegado, o reenvio não vira outra cópia.
  igual(decidirSobreOPedido({ estado: "ENVIADO", textoHash: h, updatedAt: AGORA, mensagemId: "m1" }, { textoHash: h, agora: AGORA, confirmouReenvio: false }), { acao: "ja-enviado" });
  igual(decidirSobreOPedido({ estado: "FALHOU", textoHash: h, updatedAt: AGORA, mensagemId: null }, { textoHash: h, agora: AGORA, confirmouReenvio: false }), { acao: "reenviar-apos-falha" });
  // O reenvio automático NUNCA leva confirmouReenvio: uma reserva antiga sem resposta continua exigindo uma pessoa.
  const antiga = new Date(AGORA.getTime() - RESERVA_EM_CURSO_MS - 60_000);
  igual(decidirSobreOPedido({ estado: "RESERVADO", textoHash: h, updatedAt: antiga, mensagemId: null }, { textoHash: h, agora: AGORA, confirmouReenvio: false }), { acao: "sem-confirmacao" });
  igual(decidirSobreOPedido({ estado: "RESERVADO", textoHash: h, updatedAt: AGORA, mensagemId: null }, { textoHash: h, agora: AGORA, confirmouReenvio: false }), { acao: "em-andamento" });
  // Rede caiu NO MEIO do pedido (saiu e não voltou): é dúvida, não "aguardando".
  igual(resultadoDoPedido(null, null).estado, "sem-confirmacao");
  const c = codigoDe(le("components/atendimento-app/ChatDaConversa.tsx"));
  verdade(/void disparar\(p, false\)\.finally/.test(c) && !/disparar\(p, true\)\.finally/.test(c), "o reenvio automático nunca confirma reenvio incerto");
  verdade(c.includes("pendentesParaReenviarAoVoltar(vivo.current.pendentes, false)"), "só o que está marcado aguardando");
  verdade(/reenviando\.current\.has\(p\.clientMessageId\)/.test(c), "a mesma chave não parte duas vezes");
  const disparo = c.slice(c.indexOf("const disparar = useCallback("), c.indexOf("const enviar = useCallback("));
  verdade(disparo.indexOf("decidirSaida(") > 0 && disparo.indexOf("decidirSaida(") < disparo.indexOf("await fetch("), "a decisão de esperar vem ANTES de qualquer chamada de rede");
  verdade(disparo.includes('saida === "avisar"') && disparo.includes("podeTentarDeNovo: true"), "sem rede + dúvida: só avisa e devolve a ação à pessoa");
});

teste("FILA: recarregar a página com mensagens aguardando as mantém aguardando (não vira 'sem confirmação'); o que estava em curso vira dúvida", () => {
  const guardado = JSON.parse(JSON.stringify([comoAguardandoConexao(novo("chave-00000001")), novo("chave-00000002"), comoAguardandoConexao(novo("chave-00000003", "anotação", true))]));
  const lido = restaurarPendentes(guardado, AGORA);
  igual(lido.map((p) => [p.clientMessageId, p.estado, p.aguardando === true]), [["chave-00000001", "enviando", true], ["chave-00000002", "sem-confirmacao", false], ["chave-00000003", "enviando", true]]);
  igual(lido[0].podeTentarDeNovo, false);
  verdade(lido[1].podeTentarDeNovo && lido[1].erro?.includes("Pode ter sido enviada"), "a que estava em curso vira dúvida");
  // "aguardando" forjado em outro estado não vale: só vale para 'enviando'.
  const forjado = restaurarPendentes([{ ...novo("chave-00000009"), estado: "sem-confirmacao", aguardando: true }], AGORA);
  igual(forjado[0].aguardando, undefined);
  // Passadas 24 h, some (rascunho não é para sempre).
  igual(restaurarPendentes([{ ...comoAguardandoConexao(novo("chave-00000010")), criadoEm: new Date(AGORA.getTime() - 25 * 3_600_000).toISOString() }], AGORA).length, 0);
});

teste("FILA (balão): o texto 'Aguardando conexão' existe no balão e o rascunho continua só local", () => {
  const b = codigoDe(le("components/atendimento-app/BolhaDaMensagem.tsx"));
  verdade(b.includes('local?.aguardando ? "Aguardando conexão" : "Enviando…"'), "o balão diz Aguardando conexão");
  const c = codigoDe(le("components/atendimento-app/ChatDaConversa.tsx"));
  verdade(c.includes("registrarFalhaDeRede()") && c.includes("registrarRedeOk()"), "o chat alimenta a faixa");
  verdade(c.includes("useSemConexao()"), "e lê a mesma conexão");
  const fila = codigoDe(le("lib/filaDoChat.ts"));
  verdade(!/fetch\(/.test(fila), "a fila é lógica pura: rascunho e pendentes nunca saem do aparelho por conta própria");
});

// ── A CORREÇÃO DO RETORNO DEPOIS DE SALVAR ───────────────────────────────────────────────────────

teste("RETORNO: no aplicativo, salvar leva à conversa criada (ou à lista); no site /m continua indo para /m", () => {
  igual(destinoDepoisDeSalvar(true, "cm8abc123"), "/atendimento-app/cm8abc123");
  igual(destinoDepoisDeSalvar(true, null), "/atendimento-app");
  igual(destinoDepoisDeSalvar(true, undefined), "/atendimento-app");
  igual(destinoDepoisDeSalvar(true, "../../m"), "/atendimento-app", "id torto não vira caminho");
  igual(destinoDepoisDeSalvar(true, "a/b"), "/atendimento-app");
  igual(destinoDepoisDeSalvar(false, "cm8abc123"), "/m", "o site /m fica idêntico");
  igual(destinoDepoisDeSalvar(false, null), "/m");
  const f = codigoDe(le("components/mobile/MobileNewAttendanceForm.tsx"));
  verdade(f.includes("router.push(destinoDepoisDeSalvar(ehApp, attendanceId))") && !f.includes('router.push("/m")'), "o formulário usa o destino por variante");
  verdade(!codigoDe(le("app/m/(shell)/atendimento/novo/page.tsx")).includes("variante"), "o /m não passa variante");
  verdade(codigoDe(le("app/atendimento-app/(shell)/novo/page.tsx")).includes('variante="app"'), "o app passa variante=app");
});

resumo("Atendimento app — modo offline e retorno depois de salvar");
