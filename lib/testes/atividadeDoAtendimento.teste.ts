import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";
import { ORDEM_POR_ATIVIDADE, compararPorAtividade, atividadeEsperada, type ComAtividade } from "@/lib/atividadeDoAtendimento";

// ============================================================================
// A ORDEM POR ATIVIDADE (A3 do plano do Atendimento, 29/09/2026) — critério 1 do plano e as travas
// da coluna denormalizada `Attendance.ultimaAtividadeEm`.
//
// O que é prova de execução aqui: a regra de ordem (função pura) e o formato do orderBy. O que é
// varredura de código: "toda mensagem passa por registrarMensagem" — ver a nota no topo de
// executar.ts sobre as duas armadilhas de varredura (comentário que cita a trava; janela que
// transborda). A prova com banco de verdade (backfill, ordem na consulta real) está descrita no PR.
// ============================================================================

const RAIZ = process.cwd();
const le = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf8");
const dia = (dias: number, h = 10, m = 0) => new Date(Date.UTC(2026, 8, 29 - dias, h, m));
const AGORA = new Date(Date.UTC(2026, 8, 29, 17, 32));
const minAtras = (n: number) => new Date(AGORA.getTime() - n * 60000);

const lead = (id: string, criado: Date, ultimaMsg: Date | null): ComAtividade => ({
  id,
  createdAt: criado,
  ultimaAtividadeEm: atividadeEsperada(criado, ultimaMsg),
});

teste("CRITÉRIO 1: A (criado há 10 dias, mensagem há 5 min) vem ANTES de B (criado ontem, sem mensagem hoje)", () => {
  const A = lead("a", dia(10), minAtras(5));
  const B = lead("b", dia(1), dia(1, 9, 2));
  igual([B, A].sort(compararPorAtividade).map((l) => l.id), ["a", "b"]);
  igual([A, B].sort(compararPorAtividade).map((l) => l.id), ["a", "b"], "a ordem não pode depender da ordem de entrada: ");
});

teste("lead sem mensagem entra pela data de criação; mensagem recente o passa", () => {
  const semMsg = lead("s", dia(2), null);
  const comMsg = lead("m", dia(30), dia(1));
  igual([semMsg, comMsg].sort(compararPorAtividade).map((l) => l.id), ["m", "s"]);
});

teste("empate de atividade desempata por criação e depois por id — a lista não 'pula' entre um refresh e outro", () => {
  const t = dia(1);
  const x = { id: "x", createdAt: dia(5), ultimaAtividadeEm: t };
  const y = { id: "y", createdAt: dia(5), ultimaAtividadeEm: t };
  const z = { id: "z", createdAt: dia(3), ultimaAtividadeEm: t };
  igual([x, y, z].sort(compararPorAtividade).map((l) => l.id), ["z", "y", "x"]);
  igual([z, x, y].sort(compararPorAtividade).map((l) => l.id), ["z", "y", "x"]);
});

teste("ANTES DO BACKFILL a ordem é a de hoje: linhas com a mesma atividade caem no desempate por criação", () => {
  const push = dia(0, 12);
  const velho = { id: "v", createdAt: dia(9), ultimaAtividadeEm: push };
  const novo = { id: "n", createdAt: dia(1), ultimaAtividadeEm: push };
  igual([velho, novo].sort(compararPorAtividade).map((l) => l.id), ["n", "v"]);
});

teste("o orderBy do Prisma tem as MESMAS três chaves, na mesma ordem e direção do comparador", () => {
  igual(ORDEM_POR_ATIVIDADE, [{ ultimaAtividadeEm: "desc" }, { createdAt: "desc" }, { id: "desc" }]);
});

teste("a página usa o orderBy da atividade e o take vem DEPOIS dele (os 200 mais ativos, não os 200 mais novos)", () => {
  const carregar = corpoDaFuncao(le("app", "atendimento-central", "page.tsx"), "carregarLista");
  verdade(/orderBy:\s*ORDEM_POR_ATIVIDADE/.test(codigoDe(carregar)), "carregarLista não ordena por ORDEM_POR_ATIVIDADE");
  verdade(!/orderBy:\s*\{\s*createdAt/.test(codigoDe(carregar)), "carregarLista voltou a ordenar só por createdAt");
  verdade(/take:\s*200/.test(carregar), "o teto de 200 saiu");
});

// ── A TRAVA DO PONTO ÚNICO DE ESCRITA ───────────────────────────────────────────────────────────

function arquivos(dir: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (["node_modules", ".next", ".git", "hermes-agent", "servidor-hermes", "testes"].includes(nome)) continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivos(caminho, achados);
    else if (/\.(ts|tsx|mjs|cjs|js)$/.test(nome)) achados.push(caminho);
  }
  return achados;
}

const CRIA_MENSAGEM = [
  /\bwhatsappMessage\s*\.\s*(create|createMany|upsert)\s*\(/,
  /\bwhatsappMessages\s*:\s*\{\s*(create|createMany|connectOrCreate)\b/,
  /INSERT\s+INTO\s+"?WhatsappMessage"?/i,
];

teste("NENHUM arquivo cria WhatsappMessage fora de lib/registrarMensagem.ts (esquecer um ponto deixa a conversa 'parada' na lista, sem erro)", () => {
  const fora: string[] = [];
  for (const raiz of ["app", "components", "lib", "scripts"]) {
    for (const f of arquivos(join(RAIZ, raiz))) {
      const rel = relative(RAIZ, f);
      if (rel === join("lib", "registrarMensagem.ts")) continue;
      // codigoDe tira as linhas de comentário: um comentário bom cita o padrão que ele proíbe.
      const codigo = codigoDe(readFileSync(f, "utf8"));
      if (CRIA_MENSAGEM.some((re) => re.test(codigo))) fora.push(rel);
    }
  }
  igual(fora, [], "estes arquivos gravam mensagem sem passar por registrarMensagem: ");
});

teste("a varredura enxerga o que procura (teste do próprio filtro)", () => {
  verdade(CRIA_MENSAGEM.some((re) => re.test("await prisma.whatsappMessage.create({")), "não pega prisma.whatsappMessage.create");
  verdade(CRIA_MENSAGEM.some((re) => re.test("await tx.whatsappMessage.createMany({")), "não pega createMany");
  verdade(CRIA_MENSAGEM.some((re) => re.test("data: { whatsappMessages: { create: [] } }")), "não pega a criação aninhada");
  verdade(!CRIA_MENSAGEM.some((re) => re.test("prisma.whatsappMessage.findFirst({")), "casa leitura");
  const dentro = arquivos(join(RAIZ, "lib")).some((f) => relative(RAIZ, f) === join("lib", "registrarMensagem.ts") && CRIA_MENSAGEM.some((re) => re.test(codigoDe(readFileSync(f, "utf8")))));
  verdade(dentro, "a varredura não acha nem a criação legítima em registrarMensagem.ts — ela está cega");
});

teste("os cinco caminhos que gravam mensagem chamam registrarMensagem", () => {
  const esperado: Array<[string, number]> = [
    [join("lib", "whatsapp.ts"), 1],
    [join("lib", "atendenteResponde.ts"), 1],
    [join("lib", "confirmacaoDeAudio.ts"), 1],
    [join("lib", "actions", "attendance.ts"), 2],
  ];
  for (const [rel, n] of esperado) {
    const achadas = (codigoDe(le(rel)).match(/\bregistrarMensagem\(/g) ?? []).length;
    igual(achadas, n, `${rel}: `);
  }
});

teste("registrarMensagem grava mensagem e atividade na MESMA transação, com a hora da própria mensagem", () => {
  const fonte = codigoDe(le("lib", "registrarMensagem.ts"));
  const corpo = corpoDaFuncao(le("lib", "registrarMensagem.ts"), "registrarMensagem");
  verdade(corpo.length > 100, "corpoDaFuncao não achou registrarMensagem");
  verdade(/\$transaction\(/.test(fonte), "a mensagem e a atividade deixaram de ser gravadas numa transação");
  verdade(/tx\.whatsappMessage\.create\(/.test(fonte), "a criação da mensagem não usa o cliente da transação");
  verdade(/tx\.attendance\.update\(/.test(fonte), "a atividade não é gravada pelo cliente da transação");
  verdade(/ultimaAtividadeEm:\s*mensagem\.createdAt/.test(fonte), "a atividade não usa a hora da mensagem gravada (usaria o relógio do servidor)");
  verdade(/\.\.\.aoAtendimento/.test(fonte), "o que o chamador gravava no atendimento (waLastMessageAt, firstResponseAt) não passa junto");
});

// ── O SCHEMA E O BACKFILL ───────────────────────────────────────────────────────────────────────

teste("schema: a coluna NÃO é nula (default now) e tem índice por escritório", () => {
  const schema = le("prisma", "schema.prisma");
  const attendance = /model Attendance \{[\s\S]*?\n\}/.exec(schema)?.[0] ?? "";
  verdade(/ultimaAtividadeEm\s+DateTime\s+@default\(now\(\)\)/.test(attendance), "ultimaAtividadeEm não é DateTime @default(now()) — linha nova poderia nascer nula e ir para o fim da lista");
  verdade(/@@index\(\[officeId,\s*ultimaAtividadeEm\]\)/.test(attendance), "sem o índice [officeId, ultimaAtividadeEm] a lista ordena sem índice");
  verdade(/AGUARDANDO/.test(/stage\s+String[^\n]*/.exec(attendance)?.[0] ?? ""), "o comentário de Attendance.stage voltou a omitir AGUARDANDO");
});

teste("backfill: idempotente (IS DISTINCT FROM), a regra é última mensagem senão criação, e nunca derruba o build", () => {
  const script = le("scripts", "backfill-ultima-atividade.ts");
  const codigo = codigoDe(script);
  verdade(/IS DISTINCT FROM/.test(codigo), "o backfill deixou de ser idempotente — reescreveria todas as linhas a cada deploy");
  verdade(/COALESCE\(m\.ultima,\s*t\."createdAt"\)/.test(codigo), "a regra do backfill não é 'última mensagem, senão criação'");
  verdade(/max\("createdAt"\)/.test(codigo) && /"WhatsappMessage"/.test(codigo), "o backfill não olha a última mensagem");
  verdade(/process\.exit\(0\)/.test(codigo), "o backfill pode derrubar o build de produção");
});

teste("o build de produção roda o backfill DEPOIS do db push e só em produção", () => {
  const build = JSON.parse(le("package.json")).scripts.build as string;
  const iPush = build.indexOf("prisma db push");
  const iBackfill = build.indexOf("backfill-ultima-atividade");
  verdade(iPush > 0 && iBackfill > iPush, "o backfill não roda depois do prisma db push");
  verdade(/VERCEL_ENV\\?"\s*=\s*\\?"production/.test(build.slice(0, iPush)), "o backfill não está atrás do teste de VERCEL_ENV=production");
  verdade(build.slice(iPush, iBackfill).includes("&&"), "o backfill não depende do sucesso do db push");
});

resumo("Atendimento — ordem por atividade (A3)");
