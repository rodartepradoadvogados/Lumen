import { readFileSync } from "node:fs";
import { SignJWT, jwtVerify } from "jose";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";
import { emitirCredencial, lerCredencial } from "@/lib/agenteCredencial";
import { TETO_DA_PONTE_S, TETO_DA_GERACAO_MS } from "@/lib/peticionamentoTempoDeGeracao";
import { assistantTools } from "@/lib/assistantTools";

// ============================================================================
// A PAREDE POR ESCOPO — E A DESIGUALDADE QUE MANTINHA O PETICIONAMENTO DESLIGADO.
//
// Esta entrega liga as ferramentas do Hermes ao caminho de peticionamento. O que a mantinha
// desligada era concreto: `lib/actions/peticionamento.ts` nunca passava `ferramentas` à ponte, e
// mesmo que passasse, a credencial (5 minutos) morria muito antes de a geração terminar (até 15).
//
// O que se prova aqui:
//
//   1-2. A LISTA BRANCA é branca de verdade — nem financeiro (mesmo forjado no token), nem
//        qualquer ferramenta fora da lista, alcançam o escopo "peticionamento".
//   3.   O escopo "conversa" NÃO regrediu — continua vendo o catálogo inteiro de sempre.
//   4.   Credencial sem a claim `c` é "conversa" — fail closed.
//   5.   O CATÁLOGO (nomesDisponiveis, o terceiro lugar que decide, ao lado da execução e da
//        lista de erro) filtra pelo escopo.
//   6.   A DESIGUALDADE CERTA: validade(peticionamento) > TETO_DA_PONTE_S. Esta é a prova de
//        que o defeito relatado (credencial mais curta que o trabalho) está corrigido.
//   7.   validade(conversa) continua 5 minutos.
//   8.   Toda ferramenta da lista branca existe de fato em assistantTools — um nome errado na
//        lista viraria uma ferramenta silenciosamente indisponível, e nenhum teste de string
//        pegaria isso sozinho.
//
// NADA AQUI TOCA O BANCO. As duas rotas de app/api/agente/ferramentas/route.ts usadas abaixo (GET
// do catálogo, e o 400 de POST sem `ferramenta`) devolvem ANTES de qualquer `prisma.*` — mesma
// disciplina de lib/testes/transcricaoAssincrona.teste.ts: este ambiente não alcança o Postgres.
// ============================================================================

process.env.AUTH_SECRET = "segredo-de-teste-que-nao-abre-nada-em-lugar-nenhum";
const CHAVE = new TextEncoder().encode(process.env.AUTH_SECRET);
const PUBLICO = "lumen-agente-ferramentas";

// A LISTA BRANCA, copiada aqui DE PROPÓSITO (não importada da rota): o ponto do teste é notar
// se ALGUÉM MUDAR a lista de app/api/agente/ferramentas/route.ts sem querer — importar a mesma
// constante faria o teste aprovar qualquer lista, certa ou errada.
const LISTA_BRANCA_ESPERADA = [
  "consultar_perfil_do_escritorio",
  "consultar_processos",
  "consultar_atendimento",
  "buscar_cliente",
  "consultar_historico_cliente",
  "consultar_documentos",
  "consultar_assessorias",
].sort();

async function credencialForjada(campos: Record<string, unknown>): Promise<string> {
  return new SignJWT(campos)
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(PUBLICO)
    .setIssuedAt()
    .setExpirationTime("20m")
    .sign(CHAVE);
}

async function catalogoCom(token: string): Promise<{ status: number; nomes: string[] }> {
  const { GET } = await import("@/app/api/agente/ferramentas/route");
  const { NextRequest } = await import("next/server");
  const req = new NextRequest("http://localhost/api/agente/ferramentas", {
    headers: { authorization: `Bearer ${token}` },
  });
  const res = await GET(req);
  const corpo = (await res.json()) as { ferramentas?: { nome: string }[] };
  return { status: res.status, nomes: (corpo.ferramentas ?? []).map((f) => f.nome) };
}

/** O 400 de "Informe a ferramenta" devolve `disponiveis: nomesDisponiveis(permissao)` — ANTES de
 *  qualquer chamada ao banco (nem `assistantTools.find`, nem `registrarUso`, rodam neste ramo). */
async function disponiveisPeloErroDePost(token: string): Promise<string[]> {
  const { POST } = await import("@/app/api/agente/ferramentas/route");
  const { NextRequest } = await import("next/server");
  const req = new NextRequest("http://localhost/api/agente/ferramentas", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  const res = await POST(req);
  igual(res.status, 400, "POST sem `ferramenta` deveria devolver 400: ");
  const corpo = (await res.json()) as { disponiveis?: string[] };
  return corpo.disponiveis ?? [];
}

// ── 1-2. A PAREDE, PELO CATÁLOGO ────────────────────────────────────────────────────────────

teste("MUTAÇÃO-ALVO 1: escopo peticionamento NÃO alcança financeiro/indicadores, mesmo com f e a verdadeiros no token", async () => {
  // FORJADO de propósito: o token diz `f: true, a: true` (financeiro e sócio) — exatamente o que
  // um advogado sócio com acesso ao financeiro carregaria numa credencial de CONVERSA. A prova
  // das DUAS camadas é que, em escopo "peticionamento", isso não importa: a parede do escopo
  // barra a ferramenta antes mesmo de a regra do financeiro ser consultada.
  const t = await credencialForjada({ o: "esc1", u: "u1", f: true, a: true, c: "peticionamento", s: "" });
  const { status, nomes } = await catalogoCom(t);
  igual(status, 200);
  verdade(!nomes.includes("consultar_financeiro"), "consultar_financeiro vazou para o escopo peticionamento");
  verdade(!nomes.includes("consultar_indicadores"), "consultar_indicadores vazou para o escopo peticionamento");
});

teste("MUTAÇÃO-ALVO 2: escopo peticionamento não alcança ferramenta fora da lista branca (consultar_agenda)", async () => {
  const t = await credencialForjada({ o: "esc1", u: "u1", f: false, a: false, c: "peticionamento", s: "" });
  const { nomes } = await catalogoCom(t);
  verdade(!nomes.includes("consultar_agenda"), "consultar_agenda (fora da lista branca) vazou para o escopo peticionamento");
  verdade(!nomes.includes("consultar_publicacoes"), "consultar_publicacoes (fora da lista branca) vazou para o escopo peticionamento");
  verdade(!nomes.includes("consultar_equipe"), "consultar_equipe (fora da lista branca) vazou para o escopo peticionamento");
  verdade(!nomes.includes("consultar_tarefas"), "consultar_tarefas (fora da lista branca) vazou para o escopo peticionamento");
  verdade(!nomes.includes("consultar_pendencias"), "consultar_pendencias (fora da lista branca) vazou para o escopo peticionamento");
  // Controle positivo: o catálogo não voltou vazio por outro motivo qualquer.
  verdade(nomes.includes("consultar_processos"), "consultar_processos (da lista branca) deveria estar disponível");
});

teste("MUTAÇÃO-ALVO 5: o catálogo do escopo peticionamento é EXATAMENTE a lista branca — nem a mais, nem a menos", async () => {
  const t = await emitirCredencial({ officeId: "esc1", userId: "u1", financeiro: true, admin: true, escopo: "peticionamento" });
  const { nomes } = await catalogoCom(t);
  igual(nomes.slice().sort(), LISTA_BRANCA_ESPERADA);
});

teste("MUTAÇÃO-ALVO 5b: nomesDisponiveis (o 400 de POST) também filtra pelo escopo — é o TERCEIRO lugar que decide", async () => {
  const t = await emitirCredencial({ officeId: "esc1", userId: "u1", financeiro: true, admin: true, escopo: "peticionamento" });
  const disponiveis = await disponiveisPeloErroDePost(t);
  igual(disponiveis.slice().sort(), LISTA_BRANCA_ESPERADA);
});

// ── 3. NADA REGREDIU: conversa continua vendo o catálogo inteiro ──────────────────────────────

teste("MUTAÇÃO-ALVO 3: escopo conversa continua alcançando o catálogo inteiro (nada regrediu)", async () => {
  const t = await emitirCredencial({ officeId: "esc1", userId: "u1", financeiro: true, admin: true, escopo: "conversa" });
  const { nomes } = await catalogoCom(t);
  // Com financeiro E admin verdadeiros, a única trava que resta é `podeVerNivel`, que libera
  // tudo — então o catálogo do escopo conversa tem de ser do MESMO TAMANHO que assistantTools
  // inteiro, sem o corte da lista branca do peticionamento.
  igual(nomes.length, assistantTools.length, "o catálogo de conversa perdeu ferramentas que não são do peticionamento");
  verdade(nomes.includes("consultar_agenda"), "consultar_agenda sumiu do escopo conversa");
  verdade(nomes.includes("consultar_financeiro"), "consultar_financeiro sumiu do escopo conversa (sócio com acesso)");
  verdade(nomes.includes("consultar_indicadores"), "consultar_indicadores sumiu do escopo conversa (sócio)");
});

teste("a SEGUNDA CAMADA do próprio catálogo continua de pé: conversa sem acesso ao financeiro não vê financeiro/indicadores", async () => {
  // Cobertura que faltava: nenhum outro arquivo de teste chama esta rota (agente/ferramentas)
  // de verdade para exercitar `liberada` no ramo do financeiro — só o ramo do escopo, acima.
  // Achado por mutação: apagar a checagem de `podeVerNivel` dentro de `liberada` (mantendo só a
  // parede de escopo) passava verde em TODO o resto da suíte antes deste teste existir.
  const t = await emitirCredencial({ officeId: "esc1", userId: "u1", financeiro: false, admin: false, escopo: "conversa" });
  const { nomes } = await catalogoCom(t);
  verdade(!nomes.includes("consultar_financeiro"), "consultar_financeiro vazou para quem não tem acesso ao financeiro");
  verdade(!nomes.includes("consultar_indicadores"), "consultar_indicadores vazou para quem não tem acesso ao financeiro");
});

teste("a SEGUNDA CAMADA, no ponto exato da régua: financeiro sem ser sócio vê registro, não indicador", async () => {
  const t = await emitirCredencial({ officeId: "esc1", userId: "u1", financeiro: true, admin: false, escopo: "conversa" });
  const { nomes } = await catalogoCom(t);
  verdade(nomes.includes("consultar_financeiro"), "consultar_financeiro deveria estar disponível (acesso ao financeiro)");
  verdade(!nomes.includes("consultar_indicadores"), "consultar_indicadores vazou para quem tem financeiro mas não é sócio");
});

// ── 4. Sem a claim `c`, a credencial é "conversa" — fail closed ───────────────────────────────

teste("MUTAÇÃO-ALVO 4: credencial sem a claim `c` é tratada como escopo conversa", async () => {
  const t = await credencialForjada({ o: "esc1", u: "u1", f: true, a: true, s: "" }); // sem `c`
  const p = await lerCredencial(t);
  verdade(p, "a credencial sem `c` deveria continuar legível");
  igual(p!.escopo, "conversa", "escopo: ");
});

teste("um `c` que não seja exatamente a string 'peticionamento' não vale o escopo longo", async () => {
  for (const valor of ["Peticionamento", "peticionamento ", "conversa", true, 1, {}, []]) {
    const t = await credencialForjada({ o: "esc1", u: "u1", f: true, a: true, c: valor, s: "" });
    const p = await lerCredencial(t);
    verdade(p, `credencial com c=${JSON.stringify(valor)} deveria continuar legível`);
    igual(p!.escopo, "conversa", `c=${JSON.stringify(valor)} deveria cair em conversa: `);
  }
});

// ── 6. A VALIDADE CONTRA O TETO DO TRABALHO — o teste mais importante do lote ─────────────────
//
// Era EXATAMENTE esta desigualdade invertida (validade < TETO_DA_PONTE_S) que mantinha as
// ferramentas do peticionamento desligadas: a credencial expirava com a geração ainda em curso.
// Provado LENDO O JWT DE VERDADE (exp - iat), não confiando numa constante lida de olho.

teste("MUTAÇÃO-ALVO 6: a validade da credencial de PETICIONAMENTO é MAIOR que TETO_DA_PONTE_S", async () => {
  const t = await emitirCredencial({ officeId: "esc1", userId: "u1", financeiro: false, admin: false, escopo: "peticionamento" });
  const { payload } = await jwtVerify(t, CHAVE, { audience: PUBLICO });
  verdade(typeof payload.iat === "number" && typeof payload.exp === "number", "iat/exp ausentes no JWT");
  const validadeS = (payload.exp as number) - (payload.iat as number);
  verdade(
    validadeS > TETO_DA_PONTE_S,
    `a credencial de peticionamento vale ${validadeS}s, que não é MAIOR que o teto do trabalho (${TETO_DA_PONTE_S}s) — a geração pode terminar depois de a credencial expirar`,
  );
});

teste("MUTAÇÃO-ALVO 7: a validade da credencial de CONVERSA continua 5 minutos", async () => {
  const t = await emitirCredencial({ officeId: "esc1", userId: "u1", financeiro: false, admin: false, escopo: "conversa" });
  const { payload } = await jwtVerify(t, CHAVE, { audience: PUBLICO });
  const validadeS = (payload.exp as number) - (payload.iat as number);
  igual(validadeS, 5 * 60, "validade de conversa, em segundos: ");
});

// ── 8. A lista branca não cita nome errado ────────────────────────────────────────────────────

teste("MUTAÇÃO-ALVO 8: cada ferramenta da lista branca do peticionamento existe de fato em assistantTools", () => {
  const nomesRegistrados = new Set(assistantTools.map((t) => t.spec.name));
  for (const nome of LISTA_BRANCA_ESPERADA) {
    verdade(nomesRegistrados.has(nome), `"${nome}" está na lista branca do peticionamento mas não existe em assistantTools`);
  }
});

// ── A LIGAÇÃO EM SI: confirmarTriagemEGerar de fato emite a credencial e a passa à ponte ──────
//
// O DEFEITO QUE ESTA ENTREGA CONSERTA, NA RAIZ: `lib/actions/peticionamento.ts` nunca passava
// `ferramentas` para a ponte. Tudo o que este arquivo prova acima (a parede, a validade) não vale
// nada se a chamada de verdade não usar a credencial. Varredura de código, não execução — chamar
// `confirmarTriagemEGerar` de verdade tocaria Prisma e a ponte HTTP, indisponíveis aqui.
const FONTE_PETICIONAMENTO = readFileSync("lib/actions/peticionamento.ts", "utf8");

teste("confirmarTriagemEGerar emite a credencial com escopo peticionamento, e financeiro/admin SEMPRE falsos", () => {
  const corpo = codigoDe(corpoDaFuncao(FONTE_PETICIONAMENTO, "confirmarTriagemEGerar"));
  verdade(corpo.length > 2000, `corpoDaFuncao não achou confirmarTriagemEGerar (${corpo.length} caracteres)`);
  verdade(corpo.includes("emitirCredencial({"), "confirmarTriagemEGerar não chama emitirCredencial");
  const chamada = corpo.slice(corpo.indexOf("emitirCredencial({"), corpo.indexOf("emitirCredencial({") + 400);
  verdade(/escopo:\s*"peticionamento"/.test(chamada), "a credencial não pede escopo \"peticionamento\"");
  verdade(/financeiro:\s*false/.test(chamada), "a credencial não fixa financeiro: false");
  verdade(/admin:\s*false/.test(chamada), "a credencial não fixa admin: false");
});

teste("o disparo assíncrono (iniciarGeracaoNoHermes) recebe `ferramentas`", () => {
  const corpo = codigoDe(corpoDaFuncao(FONTE_PETICIONAMENTO, "confirmarTriagemEGerar"));
  verdade(corpo.includes("iniciarGeracaoNoHermes({"), "confirmarTriagemEGerar não chama iniciarGeracaoNoHermes");
  const chamada = corpo.slice(corpo.indexOf("iniciarGeracaoNoHermes({"), corpo.indexOf("iniciarGeracaoNoHermes({") + 300);
  verdade(/\bferramentas\b/.test(chamada), "iniciarGeracaoNoHermes não recebe ferramentas — a credencial se perde no disparo");
});

teste("o caminho síncrono de compatibilidade (perguntarAoHermesComPerfil) TAMBÉM recebe `ferramentas`", () => {
  // O caminho de exceção (ponte antiga sem /chat-async) não pode ser o único sem ferramentas —
  // senão uma minuta gerada durante a janela de compatibilidade perde o acesso aos dados do
  // escritório em silêncio, sem nenhum sinal de que algo mudou de comportamento.
  const corpo = codigoDe(corpoDaFuncao(FONTE_PETICIONAMENTO, "confirmarTriagemEGerar"));
  verdade(corpo.includes("perguntarAoHermesComPerfil({"), "confirmarTriagemEGerar não chama perguntarAoHermesComPerfil");
  const chamada = corpo.slice(corpo.indexOf("perguntarAoHermesComPerfil({"), corpo.indexOf("perguntarAoHermesComPerfil({") + 300);
  verdade(/\bferramentas\b/.test(chamada), "perguntarAoHermesComPerfil não recebe ferramentas — o caminho de compatibilidade fica sem dados do escritório");
});

teste("os DOIS caminhos (assíncrono e síncrono) usam a MESMA credencial — não duas emissões divergentes", () => {
  // Só UMA chamada a emitirCredencial dentro da função inteira: os dois `try` disputam a MESMA
  // geração, nunca duas gerações com credenciais (e validades) diferentes.
  const corpo = codigoDe(corpoDaFuncao(FONTE_PETICIONAMENTO, "confirmarTriagemEGerar"));
  const ocorrencias = corpo.split("emitirCredencial(").length - 1;
  igual(ocorrencias, 1, "emitirCredencial deveria ser chamada uma única vez dentro de confirmarTriagemEGerar: ");
});

// ──────────────────────────────────────────────────────────────────────────────────────────
// UM TETO SÓ, EM DUAS UNIDADES — a fragilidade que a própria correção quase reintroduziu
// ──────────────────────────────────────────────────────────────────────────────────────────
//
// A desigualdade do item 6 só vale se `TETO_DA_PONTE_S` for de fato o teto da ponte. Este bloco
// guarda essa premissa, e ela quase se perdeu: o teto em segundos nasceu como um `900` escrito à
// mão em `lib/hermesPonte.ts`, ao lado de `TETO_DA_GERACAO_MS` (lib/peticionamentoTempoDeGeracao.ts),
// que é o MESMO teto em milissegundos e já é travado contra o `servidor.py` pelas suítes.
//
// Dois literais do mesmo número, um travado e o outro não, é a forma exata do defeito que esta
// entrega veio consertar — dois lugares dizendo a mesma coisa até o dia em que um muda e o outro
// não. Agora há um só teto, num só módulo, e o de segundos é DERIVADO do de milissegundos: a trava
// contra o `servidor.py` passa a valer para as duas unidades de graça.

teste("um teto só: TETO_DA_PONTE_S é o mesmo número de TETO_DA_GERACAO_MS, em outra unidade", () => {
  igual(
    TETO_DA_PONTE_S * 1000,
    TETO_DA_GERACAO_MS,
    "o teto em segundos divergiu do teto em milissegundos — há dois números onde deveria haver um",
  );
});

teste("lib/hermesPonte.ts REEXPORTA o teto, e não escreve um literal próprio", () => {
  const fonte = readFileSync("lib/hermesPonte.ts", "utf8");
  verdade(
    /export\s*\{[^}]*\bTETO_DA_PONTE_S\b[^}]*\}\s*from\s*["']@\/lib\/peticionamentoTempoDeGeracao["']/.test(fonte),
    "lib/hermesPonte.ts deixou de reexportar TETO_DA_PONTE_S do módulo leve",
  );
  verdade(
    !/\bTETO_DA_PONTE_S\s*(:[^=]*)?=\s*[0-9]/.test(fonte),
    "lib/hermesPonte.ts voltou a escrever o teto como número à mão — é o segundo espelho sem trava",
  );
});

teste("lib/agenteCredencial.ts busca o teto no módulo leve, não no módulo da ponte", () => {
  const fonte = readFileSync("lib/agenteCredencial.ts", "utf8");
  verdade(
    /import\s*\{[^}]*\bTETO_DA_PONTE_S\b[^}]*\}\s*from\s*["']@\/lib\/peticionamentoTempoDeGeracao["']/.test(fonte),
    "a credencial não importa mais o teto de lib/peticionamentoTempoDeGeracao",
  );
  // POR QUE ISTO É REGRA, e não preferência de arrumação: lib/peticionamentoTempoDeGeracao é puro
  // de propósito — sem `prisma`, sem `next/headers` — e a tela de geração, que é componente de
  // CLIENTE, depende dessa pureza. O build contra o staging já cobrou isso uma vez (ver o
  // comentário de TETO_DA_GERACAO_MS). Fazer a credencial importar o módulo da ponte para buscar
  // um número que o módulo puro já tem é arrastar peso sem motivo, na direção do mesmo defeito.
  verdade(
    !/from\s*["']@\/lib\/hermesPonte["']/.test(fonte),
    "a credencial voltou a depender de lib/hermesPonte — o número dela mora no módulo puro",
  );
});

void resumo("agente — parede por escopo (peticionamento)");
