import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";
import { stageOptions, stageLabels, faseDaUrl, faseDoLead, filtroDeFase } from "@/lib/funil";
import { contagensPorFase, tempoRelativo, previaDaMensagem, prefixoDaPrevia, estaEsperandoResposta } from "@/lib/listaDeAtendimentos";
import { hrefDaConversa, hrefDaLista } from "@/lib/conversaDaCentral";

// ============================================================================
// A LISTA COM FASE (A4 do plano do Atendimento, 29/09/2026) — filtro por fase, linha nova, arquivados
// escondidos, e as travas de isolamento por escritório da consulta nova (R1 do plano).
// ============================================================================

const RAIZ = process.cwd();
const le = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf8");
const PAGE = le("app", "atendimento-central", "page.tsx");
const CARREGAR = corpoDaFuncao(PAGE, "carregarLista");
const LISTA = le("components", "atendimento", "ListaDeConversas.tsx");
const SELETOR = le("components", "atendimento", "SeletorDeFase.tsx");

// ── A FASE: as seis do funil, e nada além ──────────────────────────────────────────────────────

teste("as fases do seletor são EXATAMENTE as do funil: Novo, Aguardando, Qualificação, Proposta, Fechado, Perdido", () => {
  igual(stageOptions.map((s) => stageLabels[s]), ["Novo", "Aguardando", "Qualificação", "Proposta", "Fechado", "Perdido"]);
  verdade(/from "@\/lib\/funil"/.test(SELETOR), "o seletor não importa as fases de lib/funil.ts");
  verdade(!/const\s+\w*[Ff]ases?\w*\s*=\s*\[/.test(codigoDe(SELETOR)), "o seletor declarou a própria lista de fases (a lista é uma só: lib/funil.ts)");
});

teste("?fase= só vale se existir no funil; inválido, ausente ou lista equivale a 'Todas' (null)", () => {
  for (const s of stageOptions) igual(faseDaUrl(s), s);
  igual(faseDaUrl("xyz"), null);
  igual(faseDaUrl("qualificacao"), null, "minúscula não é estágio: ");
  igual(faseDaUrl(""), null);
  igual(faseDaUrl(undefined), null);
  igual(faseDaUrl(["PROPOSTA", "FECHADO"]), "PROPOSTA");
  igual(faseDaUrl("QUALIFICACAO'; DROP TABLE"), null, "o valor cru da URL nunca passa: ");
});

teste("filtro: 'Todas' é ausência de filtro; 'Novo' inclui estágio desconhecido; as outras são igualdade", () => {
  igual(filtroDeFase(null), {});
  igual(filtroDeFase("QUALIFICACAO"), { stage: "QUALIFICACAO" });
  igual(filtroDeFase("NOVO"), { stage: { notIn: ["AGUARDANDO", "QUALIFICACAO", "PROPOSTA", "FECHADO", "PERDIDO"] } });
  igual(faseDoLead("XYZ"), "NOVO");
  igual(faseDoLead("FECHADO"), "FECHADO");
});

teste("contagem por fase: o número do menu bate com o filtro (desconhecido conta em Novo) e toda fase existe", () => {
  const c = contagensPorFase([
    { stage: "NOVO", _count: { _all: 3 } },
    { stage: "XYZ", _count: { _all: 2 } },
    { stage: "QUALIFICACAO", _count: { _all: 4 } },
    { stage: "FECHADO", _count: 1 },
  ]);
  igual(c, { TODAS: 10, NOVO: 5, AGUARDANDO: 0, QUALIFICACAO: 4, PROPOSTA: 0, FECHADO: 1, PERDIDO: 0 });
  igual(contagensPorFase([]).TODAS, 0);
});

// ── A CONSULTA: isolamento, fase antes do take, arquivados ─────────────────────────────────────

teste("R1: TODA consulta da lista carrega o recorte por escritório e por dono (não só a das linhas)", () => {
  const codigo = codigoDe(CARREGAR);
  verdade(CARREGAR.length > 800, "corpoDaFuncao não achou carregarLista");
  verdade(/officeId:\s*viewer\.officeId/.test(codigo), "a consulta perdeu o officeId de quem pediu");
  verdade(/\.\.\.filtroDoAtendimento\(viewer,\s*viewer\.id\)/.test(codigo), "a consulta perdeu o recorte por dono");
  // As três consultas paralelas partem do MESMO recorte. Cada trecho vai de um `prisma.attendance.`
  // ao próximo — nunca uma janela de N caracteres, que transborda para a vizinha (ver executar.ts).
  const partes = codigo.split("prisma.attendance.").slice(1);
  igual(partes.map((p) => /^(\w+)/.exec(p)?.[1]), ["findMany", "groupBy", "count"], "esperava exatamente as três consultas (linhas, contagens por fase, escondidos): ");
  for (const parte of partes) {
    verdade(/baseFilters|recorteDeDono/.test(parte), `uma consulta da lista não parte do recorte de dono/escritório: ${parte.slice(0, 80)}`);
  }
});

teste("a fase entra no `where` das linhas ANTES do take — e NÃO no groupBy do menu (ele conta todas as fases)", () => {
  const codigo = codigoDe(CARREGAR);
  const linhas = /prisma\.attendance\.findMany\(\{[\s\S]*?take:\s*200/.exec(codigo)?.[0] ?? "";
  verdade(/filtroDeFase\(pedido\.fase\)/.test(linhas), "a fase não está no where do findMany, antes do take — o filtro esconderia conversa fora dos 200 mais recentes");
  const grupo = /prisma\.attendance\.groupBy\(\{[^\n]*\}\),/.exec(codigo)?.[0] ?? "";
  verdade(grupo.includes('by: ["stage"]'), "o menu não conta por stage");
  verdade(!/filtroDeFase/.test(grupo), "o groupBy do menu está filtrado pela fase — todas as fases mostrariam a contagem da escolhida");
});

teste("arquivados e recusados ficam ESCONDIDOS por padrão, rascunho nunca aparece, e `?status=` explícito vale", () => {
  const codigo = codigoDe(CARREGAR);
  verdade(/ESCONDIDOS_POR_PADRAO\s*=\s*\["ARQUIVADO",\s*"RECUSADO"\]/.test(codigo), "a lista deixou de esconder arquivados e recusados por padrão");
  verdade(/notIn:\s*\["RASCUNHO",\s*\.\.\.ESCONDIDOS_POR_PADRAO\]/.test(codigo), "o padrão da lista não exclui rascunho + escondidos");
  verdade(/\{\s*not:\s*"RASCUNHO"\s*\}/.test(codigo), "com 'mostrar arquivados' o rascunho passaria a aparecer");
  verdade(/pedido\.status\s*\?\s*pedido\.status/.test(codigo), "o ?status= explícito deixou de valer");
});

teste("o take continua 200 e a ordem é a da atividade (nada de varredura de tabela)", () => {
  verdade(/take:\s*200/.test(CARREGAR) && /orderBy:\s*ORDEM_POR_ATIVIDADE/.test(codigoDe(CARREGAR)), "o teto ou a ordem saíram");
});

// ── A LINHA ─────────────────────────────────────────────────────────────────────────────────────

teste("a linha mostra a FASE (stage), não o status; 'Convertido' virou a marca 'Processo'", () => {
  const codigo = codigoDe(LISTA);
  verdade(/stageLabels\[fase\]/.test(codigo), "a linha não escreve o nome da fase");
  verdade(!/attendanceStatusLabels|\.status\b/.test(codigo), "a linha voltou a usar `status`");
  verdade(/convertedCaseId/.test(codigo) && />\s*Processo\s*</.test(codigo), "sem a marca 'Processo' para lead convertido");
  verdade(!/`f-\$\{/.test(codigo) && !/\bf-\$\{/.test(codigo), "classe de fase montada em tempo de execução — o Tailwind não a geraria");
  verdade(/stageDot\[fase\]/.test(codigo), "o ponto da fase não vem do mapa estático stageDot");
});

teste("a bolinha da linha é o FATO 'a última mensagem é do cliente' — não depende da fase", () => {
  verdade(/estaEsperandoResposta\(ultima\)/.test(codigoDe(LISTA)) && /bolinha-espera/.test(LISTA), "a linha perdeu a bolinha");
  verdade(!/bolinha-espera[\s\S]{0,400}AGUARDANDO/.test(codigoDe(LISTA)), "a bolinha foi amarrada ao estágio Aguardando");
  verdade(estaEsperandoResposta({ direction: "IN", body: "", porAgente: false, createdAt: new Date() }), "IN não é 'esperando'");
  verdade(!estaEsperandoResposta({ direction: "OUT", body: "", porAgente: false, createdAt: new Date() }), "OUT é 'esperando'");
  verdade(!estaEsperandoResposta(undefined), "conversa sem mensagem é 'esperando'");
});

teste("NÃO existe contador de não lidas (decisão do dono): nenhum campo por usuário, nenhum contador na linha", () => {
  verdade(!/naoLida|nao_lida|unread/i.test(codigoDe(LISTA)), "a linha ganhou um contador de não lidas");
  verdade(!/naoLida|lidoEm|lastReadAt|unread/i.test(le("prisma", "schema.prisma").split("model Attendance {")[1]?.split("\n}")[0] ?? ""), "o schema ganhou campo de leitura");
});

teste("prefixo da prévia: 'Ana:' para o atendente de IA, 'Você:' para pessoa, nada para o cliente", () => {
  const base = { body: "x", createdAt: new Date() };
  igual(prefixoDaPrevia({ ...base, direction: "OUT", porAgente: true }, "Ana"), "Ana: ");
  igual(prefixoDaPrevia({ ...base, direction: "OUT", porAgente: false }, "Ana"), "Você: ");
  igual(prefixoDaPrevia({ ...base, direction: "IN", porAgente: false }, "Ana"), "");
  igual(prefixoDaPrevia(undefined, "Ana"), "");
});

teste("prévia: uma linha só, com reticências acima do limite", () => {
  igual(previaDaMensagem("  Olá,\n\n  tudo   bem?  "), "Olá, tudo bem?");
  const longa = "a".repeat(300);
  verdade(previaDaMensagem(longa).length <= 140 && previaDaMensagem(longa).endsWith("…"), "prévia longa não foi cortada");
});

teste("horário relativo, sempre em Brasília: agora / min / hora de hoje / ontem / dd/MM", () => {
  const agora = new Date("2026-09-29T17:32:00Z"); // 14:32 em Brasília
  igual(tempoRelativo(new Date("2026-09-29T17:31:40Z"), agora), "agora");
  igual(tempoRelativo(new Date("2026-09-29T17:20:00Z"), agora), "12 min");
  igual(tempoRelativo(new Date("2026-09-29T12:05:00Z"), agora), "09:05");
  igual(tempoRelativo(new Date("2026-09-28T15:00:00Z"), agora), "ontem");
  igual(tempoRelativo(new Date("2026-09-19T15:00:00Z"), agora), "19/09");
  // O dia é o de BRASÍLIA: 01h de 30/09 em UTC ainda é 22h de 29/09 aqui — "hoje", não "ontem".
  igual(tempoRelativo(new Date("2026-09-30T01:10:00Z"), new Date("2026-09-30T02:30:00Z")), "22:10");
});

teste("o endereço leva o recorte no clique e na volta; só o que existe", () => {
  igual(hrefDaConversa("central", "x"), "/atendimento-central?aba=atendimentos&id=x");
  igual(hrefDaConversa("central", "x", { fase: "PROPOSTA", q: "ana", arquivados: true }), "/atendimento-central?aba=atendimentos&id=x&fase=PROPOSTA&q=ana&arq=1");
  igual(hrefDaConversa("classico", "x", { fase: "PROPOSTA" }), "/atendimento/x", "o destino clássico ignora o recorte: ");
  igual(hrefDaLista({ fase: null, arquivados: false }), "/atendimento-central?aba=atendimentos");
});

// ── O SELETOR ───────────────────────────────────────────────────────────────────────────────────

teste("seletor acessível: menu com menuitemradio, aria-checked, aria-expanded, Esc devolve o foco", () => {
  const c = codigoDe(SELETOR);
  for (const marca of ['aria-haspopup="menu"', "aria-expanded={aberto}", 'role="menuitemradio"', "aria-checked={marcada}", 'role="menu"', '"Escape"', "ArrowDown", "ArrowUp"]) {
    verdade(c.includes(marca), `o seletor perdeu ${marca}`);
  }
  verdade(/botao\.current\?\.focus\(\)/.test(c), "Esc não devolve o foco ao botão");
  verdade(/aria-label=\{`\$\{o\.rotulo\}, \$\{n\}/.test(c), "a contagem deixou de fazer parte do nome acessível");
  verdade(/hrefDaLista\(\{\s*fase:\s*o\.chave/.test(c), "os itens não escrevem o endereço por hrefDaLista");
});

teste("R5: o seletor (cliente) importa constantes de módulos NEUTROS, nunca de outro arquivo 'use client'", () => {
  verdade(SELETOR.startsWith('"use client"'), "o seletor deixou de ser componente de cliente");
  for (const imp of SELETOR.matchAll(/from "(@\/[^"]+)"/g)) {
    const alvo = imp[1].replace("@/", "");
    if (alvo.startsWith("components/")) verdade(false, `o seletor importa componente ${alvo} — exporte constantes de módulo neutro`);
    else verdade(!/^"use client"/.test(le(`${alvo}.ts`)), `${alvo} é "use client" e o seletor importa dele`);
  }
});

teste("R7/R8/critério 10: nenhum hex, nenhum tamanho de fonte arbitrário, nenhuma sombra em cartão/lista nos arquivos novos", () => {
  for (const [nome, fonte] of [["ListaDeConversas", LISTA], ["SeletorDeFase", SELETOR], ["page", PAGE]] as const) {
    const c = codigoDe(fonte);
    verdade(!/#[0-9a-fA-F]{3,8}\b/.test(c), `${nome} tem hex cru`);
    verdade(!new RegExp("text-\\[\\d+px\\]").test(c), `${nome} tem tamanho de fonte arbitrário`);
    verdade(!/\b(?:bg|text|border|ring)-(?:marca-tx|acao|tx(?:-[23])?)\/\d+/.test(c), `${nome} usa opacidade /NN sobre token`);
  }
  verdade(!/shadow/.test(codigoDe(LISTA)), "a lista ganhou sombra");
  const sombrasNoSeletor = [...codigoDe(SELETOR).matchAll(/shadow/g)].length;
  igual(sombrasNoSeletor, 1, "só o menu (que flutua) pode ter sombra: ");
});

resumo("Central de Atendimento — lista com fase (A4)");
