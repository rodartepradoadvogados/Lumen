import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { teste, verdade, igual, resumo, codigoDe } from "./executar";
import { perguntarAoHermes, hermesConfigurado, variaveisFaltandoDoHermes, FalhaDoHermes } from "@/lib/hermesPonte";
import { motivoDaFalhaDoHermes, motivoDePonteNaoConfigurada, semSegredoDaPonte } from "@/lib/motivoDoAtendente";

// ============================================================================
// "ANA RESPONDE": o motivo real do erro do Hermes, o botão "Responder última mensagem" no aplicativo e o
// interruptor que parece botão (site e aplicativo).
//
// O CAMINHO DO HERMES É EXERCITADO DE VERDADE contra um provedor falso local (servidor HTTP em 127.0.0.1): a
// mesma `perguntarAoHermes` que `atendenteResponde` chama, com os mesmos cabeçalhos, e a frase que a pessoa lê
// vem de `motivoDaFalhaDoHermes`. Nenhum segredo real: o token é uma sequência inventada aqui.
// ============================================================================

const RAIZ = process.cwd();
const le = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf8");
const TOKEN = "tok-de-mentira-9f8e7d6c5b4a";

// Os casos que mexem em process.env e na porta do provedor falso rodam EM FILA: `teste` dispara cada corpo
// na hora, e dois casos mexendo em HERMES_URL ao mesmo tempo se atropelariam.
let fila: Promise<unknown> = Promise.resolve();
function emFila(nome: string, corpo: () => void | Promise<void>) {
  teste(nome, () => {
    const p = fila.then(corpo);
    fila = p.catch(() => undefined);
    return p;
  });
}

type Modo = "ok" | "401" | "403" | "404" | "500-ecoando-token" | "vazio" | "lento";
let modo: Modo = "ok";
let cabecalhoRecebido = "";
let corpoRecebido = "";

function sobe(): Promise<Server> {
  return new Promise((ok) => {
    const s = createServer((req: IncomingMessage, res) => {
      cabecalhoRecebido = String(req.headers.authorization ?? "");
      let corpo = "";
      req.on("data", (c) => (corpo += c));
      req.on("end", () => {
        corpoRecebido = corpo;
        const json = (status: number, obj: unknown) => {
          res.writeHead(status, { "content-type": "application/json" });
          res.end(JSON.stringify(obj));
        };
        if (modo === "lento") return void setTimeout(() => json(200, { resposta: "tarde demais" }), 1500);
        if (modo === "401") return json(401, { erro: "não autorizado" });
        if (modo === "403") return json(403, { erro: "proibido" });
        if (modo === "404") return json(404, { erro: "perfil não existe" });
        if (modo === "500-ecoando-token") return json(500, { erro: `falhou com Authorization: Bearer ${TOKEN} em ${process.env.HERMES_URL}` });
        if (modo === "vazio") return json(200, { resposta: "   ", sessao: "s" });
        return json(200, { resposta: "Bom dia, em que posso ajudar?", sessao: "s1" });
      });
    });
    s.listen(0, "127.0.0.1", () => ok(s));
  });
}

async function falha(esperaMs = 5000): Promise<FalhaDoHermes> {
  try {
    await perguntarAoHermes({ slug: "escritorio-x", mensagem: "olá", esperaMs });
  } catch (e) {
    verdade(e instanceof FalhaDoHermes, `esperava FalhaDoHermes, veio ${String(e)}`);
    return e as FalhaDoHermes;
  }
  throw new Error("esperava falhar e a chamada passou");
}

// ── 1) O CAMINHO REAL CONTRA UM PROVEDOR FALSO ─────────────────────────────────────────────────────

emFila("HERMES: provedor falso responde 200 — a resposta chega, com Bearer e o perfil no corpo", async () => {
  const s = await sobe();
  process.env.HERMES_URL = `http://127.0.0.1:${(s.address() as AddressInfo).port}/`;
  process.env.HERMES_TOKEN = TOKEN;
  process.env.HERMES_PERFIL = "atendimento-lumen";
  modo = "ok";
  try {
    verdade(hermesConfigurado(), "com as duas variáveis a ponte existe");
    igual(variaveisFaltandoDoHermes(), []);
    const r = await perguntarAoHermes({ slug: "escritorio-x", mensagem: "olá", esperaMs: 5000 });
    igual(r.resposta, "Bom dia, em que posso ajudar?");
    igual(cabecalhoRecebido, `Bearer ${TOKEN}`);
    igual(JSON.parse(corpoRecebido).perfil, "atendimento-lumen");

    // 401 e 403: RECUSOU (o token da Vercel não confere com o da ponte).
    for (const m of ["401", "403"] as const) {
      modo = m;
      const f = await falha();
      igual(f.causa, "recusou", `causa do ${m}`);
      const frase = motivoDaFalhaDoHermes(f);
      verdade(frase.includes("recusou o acesso") && frase.includes("HERMES_TOKEN"), `frase do ${m}: ${frase}`);
      verdade(frase.includes(m), `a frase diz o código ${m}: ${frase}`);
    }

    // 404: perfil ausente.
    modo = "404";
    const f404 = await falha();
    igual(f404.causa, "perfil");
    verdade(motivoDaFalhaDoHermes(f404).includes("HERMES_PERFIL"), "404 aponta para HERMES_PERFIL");

    // 500 que ecoa o token e o endereço: a frase NÃO pode vazar nenhum dos dois.
    modo = "500-ecoando-token";
    const f500 = await falha();
    igual(f500.causa, "erro-da-ponte");
    const frase500 = motivoDaFalhaDoHermes(f500);
    verdade(frase500.includes("500"), `diz o código: ${frase500}`);
    verdade(!frase500.includes(TOKEN), `vazou o token: ${frase500}`);
    verdade(!frase500.includes(String(process.env.HERMES_URL)), `vazou o endereço da ponte: ${frase500}`);
    verdade(!frase500.includes("127.0.0.1"), `vazou o host: ${frase500}`);

    // 200 sem texto: respondeu em branco.
    modo = "vazio";
    const fv = await falha();
    igual(fv.causa, "vazia");
    verdade(motivoDaFalhaDoHermes(fv).includes("em branco"), "frase de resposta em branco");

    // Sem resposta no tempo: DEMORA, e não "indisponível".
    modo = "lento";
    const fl = await falha(300);
    igual(fl.causa, "demora");
    const fraseL = motivoDaFalhaDoHermes(fl);
    verdade(fraseL.includes("não respondeu a tempo") && !fraseL.includes("DEMORA"), `frase da demora: ${fraseL}`);
  } finally {
    s.closeAllConnections();
    s.close();
  }
});

emFila("HERMES: ponte fora do ar (porta fechada) — 'não foi possível alcançar', sem o endereço", async () => {
  const s = await sobe();
  const porta = (s.address() as AddressInfo).port;
  s.close();
  process.env.HERMES_URL = `http://127.0.0.1:${porta}`;
  process.env.HERMES_TOKEN = TOKEN;
  const f = await falha();
  igual(f.causa, "inalcancavel");
  const frase = motivoDaFalhaDoHermes(f);
  verdade(frase.includes("alcançar") && frase.includes("HERMES_URL"), frase);
  verdade(!frase.includes(TOKEN) && !frase.includes("127.0.0.1"), `vazou segredo/endereço: ${frase}`);
});

emFila("HERMES: NÃO CONFIGURADO — a frase diz QUAL variável falta (e só o nome, nunca o valor)", async () => {
  delete process.env.HERMES_URL;
  process.env.HERMES_TOKEN = TOKEN;
  igual(hermesConfigurado(), false);
  igual(variaveisFaltandoDoHermes(), ["HERMES_URL"]);
  verdade(motivoDePonteNaoConfigurada().includes("falta HERMES_URL nas variáveis de ambiente da Vercel"), motivoDePonteNaoConfigurada());
  verdade(!motivoDePonteNaoConfigurada().includes(TOKEN), "não vaza o token");

  process.env.HERMES_URL = "http://ponte.exemplo.invalido";
  delete process.env.HERMES_TOKEN;
  igual(variaveisFaltandoDoHermes(), ["HERMES_TOKEN"]);
  verdade(motivoDePonteNaoConfigurada().includes("falta HERMES_TOKEN"), motivoDePonteNaoConfigurada());

  delete process.env.HERMES_URL;
  igual(variaveisFaltandoDoHermes(), ["HERMES_URL", "HERMES_TOKEN"]);
  verdade(motivoDePonteNaoConfigurada().includes("falta HERMES_URL e HERMES_TOKEN"), motivoDePonteNaoConfigurada());

  // E a chamada direta também nasce como falha de "não configurada", com a mesma frase.
  const f = await falha();
  igual(f.causa, "nao-configurada");
  verdade(motivoDaFalhaDoHermes(f).includes("não está configurado"), motivoDaFalhaDoHermes(f));
});

emFila("semSegredoDaPonte apaga token, endereço e cabeçalho Bearer", () => {
  process.env.HERMES_URL = "https://ponte.exemplo.invalido";
  process.env.HERMES_TOKEN = TOKEN;
  const t = semSegredoDaPonte(`x ${TOKEN} y https://ponte.exemplo.invalido/chat Authorization: Bearer abc.def-123`);
  verdade(!t.includes(TOKEN) && !t.includes("ponte.exemplo.invalido") && !t.includes("abc.def-123"), t);
  verdade(!semSegredoDaPonte(motivoDaFalhaDoHermes(new Error(`boom ${TOKEN}`))).includes(TOKEN), "erro que não é do Hermes também sai limpo");
});

// ── 2) O CÓDIGO: o motivo chega à tela, e o tempo da ação cabe na espera do Hermes ────────────────

teste("atendenteResponde usa as frases novas e a ação mostra o motivo (nunca mais só 'indisponível')", () => {
  const f = codigoDe(le("lib/atendenteResponde.ts"));
  verdade(f.includes("motivoDePonteNaoConfigurada()") && f.includes("motivoDaFalhaDoHermes(erro)"), "usa motivoDoAtendente");
  verdade(!f.includes("`agente indisponível: ${motivo}`") && !f.includes('"a ponte com o agente não está configurada"'), "as frases sem motivo saíram");
  const a = codigoDe(le("lib/actions/attendance.ts"));
  verdade(a.includes("`O atendente não respondeu: ${r.motivo}.`"), "a ação devolve o motivo");
  // o segredo nunca vai ao log sem passar pelo filtro
  verdade(f.includes("semSegredoDaPonte("), "o log também passa pelo filtro");
});

teste("toda tela que hospeda 'Responder à última pergunta' tem maxDuration >= a espera do Hermes (105 s)", () => {
  const telas = ["app/(app)/atendimento/[id]/page.tsx", "app/atendimento-central/page.tsx", "app/m/(shell)/atendimento/[id]/page.tsx", "app/atendimento-app/(shell)/[id]/page.tsx"];
  const espera = Number((le("lib/hermesPonte.ts").match(/HERMES_TIMEOUT_MS \|\| ([\d_]+)/) ?? [])[1]?.replace(/_/g, ""));
  verdade(espera === 105000, `espera do Hermes lida do código: ${espera}`);
  for (const t of telas) {
    const m = codigoDe(le(t)).match(/export const maxDuration = (\d+);/);
    verdade(m && Number(m[1]) * 1000 > espera, `${t}: maxDuration ausente ou menor que a espera do Hermes (a Server Action herda o do segmento)`);
  }
});

// ── 3) O BOTÃO NO APLICATIVO ────────────────────────────────────────────────────────────────────

teste("APP: 'Responder última mensagem' reusa responderUltimaPergunta, só com a última do cliente, 44 px, carregando e erro", () => {
  const b = codigoDe(le("components/atendimento-app/BarraDoChat.tsx"));
  verdade(b.includes("responderUltimaPergunta(idDaConversa)"), "usa a ação com recorte (a mesma do site)");
  verdade(/podeResponderUltima = barra\.controle === "interruptor" && estado\.ultimaDirecao === "IN"/.test(b), "só quando a última é do cliente e a Ana pode falar");
  verdade(b.includes("Responder última mensagem"), "o texto do botão");
  verdade(/min-h-11[^"]*w-full|w-full[^"]*min-h-11/.test(b.slice(b.indexOf("Responder última mensagem") - 700, b.indexOf("Responder última mensagem"))), "alvo de 44 px");
  verdade(b.includes("está respondendo…") && b.includes("aria-busy={respondendo}") && b.includes("disabled={respondendo}"), "estado de carregando");
  verdade(/role="alert"[\s\S]{0,80}\{erroDaResposta\}/.test(b), "erro visível e anunciado");
  verdade(b.includes("setErroDaResposta(r.error)"), "o motivo devolvido pela ação vai para a tela");
  verdade(b.includes("aoResponder?.()"), "avisa a conversa para buscar a resposta na hora");
  verdade(codigoDe(le("components/atendimento-app/ChatDaConversa.tsx")).includes("aoResponder={() => void buscarNovas()}"), "a conversa busca as mensagens ao terminar");
  const acao = le("lib/actions/attendance.ts");
  const corpo = acao.slice(acao.indexOf("export async function responderUltimaPergunta"), acao.indexOf("// ===== WhatsApp: responder ao cliente"));
  verdade(corpo.includes("filtroDoAtendimento(user, user.id)") && corpo.includes("podeVerAtendimentos(user)"), "a ação aplica o recorte de acesso");
});

// ── 4) O INTERRUPTOR QUE PARECE BOTÃO ──────────────────────────────────────────────────────────

teste("INTERRUPTOR: role=switch, aria-checked, estado em texto, 44 px, radius 2, borda de 2 px, sem faixa lateral, sem checkbox", () => {
  const i = codigoDe(le("components/InterruptorDaAna.tsx"));
  verdade(i.includes('role="switch"') && i.includes("aria-checked={ligado}"), "role/aria-checked");
  verdade(i.includes('"Ligada"') && i.includes('"Desligada"') && i.includes("{nome} responde:"), "o estado escrito: 'Ana responde: Ligada/Desligada'");
  verdade(i.includes("min-h-11") && i.includes("rounded-[2px]") && i.includes("border-2"), "44 px, radius 2, borda de 2 px");
  verdade(!/\bborder-[lr]-\d|\bborder-l\b|\bborder-r\b|border-s-|border-e-/.test(i) && !/\bshadow-/.test(i) && !/#[0-9a-fA-F]{3,8}\b/.test(i) && !/rounded-(full|lg|md|xl)/.test(i), "sem faixa lateral, sombra, hex ou raio maior");
  verdade(!i.includes("focus-visible:outline-none"), "o foco visível global não é apagado");
  const site = codigoDe(le("components/AtendenteIaControle.tsx"));
  verdade(site.includes("<InterruptorDaAna") && !site.includes('type="checkbox"'), "o site usa o interruptor, não a caixinha");
  const app = codigoDe(le("components/atendimento-app/BarraDoChat.tsx"));
  verdade(app.includes("<InterruptorDaAna") && !app.includes('role="switch"'), "o app usa o mesmo componente");
  verdade(app.includes('bordaDesligada="border-atd-campo"') && app.includes('bordaLigada="border-atd-ouro-texto"'), "tokens de borda do app");
  verdade(site.includes('bordaDesligada="border-tx-3"'), "token de borda do site");
});

// ── 5) CONTRASTE, CALCULADO DO CSS QUE VAI PARA A TELA (Dia e Noite; site e app) ───────────────────

function canal(c: number) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
function lum(hex: string) {
  const h = hex.replace("#", "");
  return 0.2126 * canal(parseInt(h.slice(0, 2), 16)) + 0.7152 * canal(parseInt(h.slice(2, 4), 16)) + 0.0722 * canal(parseInt(h.slice(4, 6), 16));
}
function contraste(a: string, b: string) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
const CSS = le("app/globals.css");
function declaracoes(seletor: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = new RegExp(`(?:^|\\n)${seletor.replace(/[.]/g, "\\.")}\\s*\\{([\\s\\S]*?)\\n\\}`, "g");
  for (const m of CSS.matchAll(re)) for (const d of m[1].matchAll(/--([\w-]+):\s*([^;]+);/g)) out[d[1]] = d[2].trim();
  return out;
}
function tema(...blocos: string[]) {
  const mapa: Record<string, string> = Object.assign({}, ...blocos.map(declaracoes));
  const resolve = (nome: string, n = 0): string => {
    const v = mapa[nome];
    if (v === undefined || n > 8) throw new Error(`token --${nome} não resolvido`);
    const ref = v.match(/^var\(--([\w-]+)\)$/);
    return ref ? resolve(ref[1], n + 1) : v;
  };
  return (nome: string) => {
    const v = resolve(nome);
    if (!/^#[0-9a-fA-F]{6}$/.test(v)) throw new Error(`--${nome} = ${v} não é #hex`);
    return v;
  };
}
const TEMAS = {
  "site Dia": { t: tema(":root"), bordaOff: "tinta-3", bordaOn: "tinta", superficie: "ficha-alt" },
  "site Noite": { t: tema(":root", ".dark"), bordaOff: "tinta-3", bordaOn: "tinta", superficie: "ficha-alt" },
  "app Dia": { t: tema(":root", ".atendimento-shell"), bordaOff: "atd-campo", bordaOn: "atd-ouro-texto", superficie: "ficha-alt" },
  "app Noite": { t: tema(":root", ".dark", ".atendimento-shell", ".atendimento-dark"), bordaOff: "atd-campo", bordaOn: "atd-ouro-texto", superficie: "ficha-alt" },
} as const;

for (const [nome, { t, bordaOff, bordaOn, superficie }] of Object.entries(TEMAS)) {
  teste(`CONTRASTE ${nome}: borda >= 3:1 contra a faixa, texto AA nos dois estados`, () => {
    const faixa = t(superficie);
    const ficha = t("ficha");
    const off = contraste(t(bordaOff), faixa);
    verdade(off >= 3, `${nome}: borda desligada ${t(bordaOff)} sobre a faixa ${faixa} = ${off.toFixed(2)}:1`);
    verdade(contraste(t(bordaOff), ficha) >= 3, `${nome}: borda desligada sobre a ficha`);
    const on = contraste(t(bordaOn), faixa);
    verdade(on >= 3, `${nome}: borda ligada ${t(bordaOn)} sobre a faixa = ${on.toFixed(2)}:1`);
    // texto desligado: tinta sobre a ficha (bg-sf); ligado: acao-tx sobre acao
    const txOff = contraste(t("tinta"), ficha);
    verdade(txOff >= 4.5, `${nome}: texto desligado ${txOff.toFixed(2)}:1`);
    const txOn = contraste(t("acao-tx"), t("acao"));
    verdade(txOn >= 4.5, `${nome}: texto ligado ${t("acao-tx")} sobre ${t("acao")} = ${txOn.toFixed(2)}:1`);
    // o preenchimento ligado tem de se distinguir do desligado além da cor: a palavra e o ícone (checado no código)
  });
}

resumo("Atendimento app — Ana: motivo do Hermes, botão de responder e interruptor");
