import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";
import {
  textoSeguroParaHistorico,
  AVISO_RESPOSTA_SOB_SESSAO_DE_SUPORTE,
} from "@/lib/painelMestreConversas";
import { FERRAMENTAS_QUE_EXIGEM_SESSAO_DE_SUPORTE } from "@/lib/painelMestreFerramentas";

// ============================================================================
// A MEMÓRIA E A TRILHA DE AUDITORIA DO AGENTE DO PAINEL MESTRE (lib/painelMestreConversas.ts),
// varridas contra as mesmas três leis de lib/testes/painelMestreAgente.teste.ts, com foco nas
// DUAS cláusulas que esta entrega acrescenta:
//
//   LEI 1 (cláusula nova) — "uma conversa gravada é de quem a criou." Ninguém abre, lê nem
//   continua a conversa de outro membro.
//   LEI 2 — uma resposta obtida com uma sessão de suporte aberta não pode ser relida depois que
//   ela fechar, como se o acesso ainda valesse.
//   LEI 3 — a única escrita que esta entrega introduz é sobre CONVERSA (dado da plataforma),
//   nunca sobre dado de escritório.
// ============================================================================

const RAIZ = process.cwd();
const FONTE = readFileSync(join(RAIZ, "lib", "painelMestreConversas.ts"), "utf8");
const CODIGO = codigoDe(FONTE);

// ── LEI 2: o que sobrevive no histórico ─────────────────────────────────────────────────────

teste("textoSeguroParaHistorico: sem ferramenta de sessão, o texto passa intacto", () => {
  igual(textoSeguroParaHistorico("O MRR deste mês é R$ 12.000.", []), "O MRR deste mês é R$ 12.000.");
  igual(textoSeguroParaHistorico("42 escritórios ativos.", ["consultar_escritorios"]), "42 escritórios ativos.");
});

teste("textoSeguroParaHistorico: usar consultar_atividade_do_escritorio substitui o texto pelo aviso fixo", () => {
  const textoDeVerdade = "O escritório Fulano tem 5 processos ativos e 2 atendimentos abertos.";
  const gravado = textoSeguroParaHistorico(textoDeVerdade, ["consultar_atividade_do_escritorio"]);
  verdade(gravado !== textoDeVerdade, "o teor de verdade sobreviveu — a Lei 2 furou no histórico gravado");
  igual(gravado, AVISO_RESPOSTA_SOB_SESSAO_DE_SUPORTE);
});

teste("textoSeguroParaHistorico: basta UMA ferramenta de sessão entre várias para redigir o turno inteiro", () => {
  const gravado = textoSeguroParaHistorico("resposta combinada", ["consultar_escritorios", "consultar_atividade_do_escritorio"]);
  igual(gravado, AVISO_RESPOSTA_SOB_SESSAO_DE_SUPORTE);
});

teste("FERRAMENTAS_QUE_EXIGEM_SESSAO_DE_SUPORTE é calculada do registro de ferramentas, e hoje contém só consultar_atividade_do_escritorio", () => {
  igual(FERRAMENTAS_QUE_EXIGEM_SESSAO_DE_SUPORTE, ["consultar_atividade_do_escritorio"]);
});

teste("Lei 2 (estrutural): registrarTurno só chama textoSeguroParaHistorico para o papel assistant", () => {
  const corpo = corpoDaFuncao(CODIGO, "registrarTurno");
  verdade(corpo.length > 300, "corpoDaFuncao não achou registrarTurno — varredura cega");
  verdade(
    corpo.includes('input.papel === "assistant" ? textoSeguroParaHistorico(input.texto, input.ferramentasUsadas) : input.texto'),
    "sumiu a chamada a textoSeguroParaHistorico — o turno do assistente passaria a gravar o teor de verdade sempre, mesmo sob sessão de suporte",
  );
});

// ── LEI 1 (cláusula nova): "uma conversa gravada é de quem a criou" ─────────────────────────

teste("Lei 1 (a trava mais importante desta entrega): buscarConversaDoMembro filtra por membroId DENTRO do where que busca a conversa", () => {
  const corpo = corpoDaFuncao(CODIGO, "buscarConversaDoMembro");
  verdade(corpo.length > 300, "corpoDaFuncao não achou buscarConversaDoMembro — varredura cega");
  verdade(
    corpo.includes("where: { id: conversaId, membroId }"),
    "o where de buscarConversaDoMembro não tem mais membroId junto do id — qualquer membro passaria a ler a conversa de qualquer outro",
  );
  // membroId precisa vir de uma resolução PRÓPRIA do viewer (nunca do corpo da requisição nem de
  // um parâmetro externo) — confirma que a função resolve o dono antes de usar a variável.
  const posResolucao = corpo.indexOf("membroIdSomenteLeitura(viewer)");
  const posWhere = corpo.indexOf("where: { id: conversaId, membroId }");
  verdade(posResolucao >= 0 && posWhere >= 0 && posResolucao < posWhere, "o membroId usado no where não vem da resolução do viewer, ou vem depois da consulta");
});

teste("Lei 1: sem um PlatformMember resolvido para o viewer, buscarConversaDoMembro nunca chega a consultar o banco — devolve null direto", () => {
  const corpo = corpoDaFuncao(CODIGO, "buscarConversaDoMembro");
  verdade(/if \(!membroId\) return null;/.test(corpo), "sumiu a saída antecipada quando não há membroId — uma consulta com membroId undefined poderia bater errado");
});

teste("Lei 1 na escrita: registrarTurno confirma que a conversa é do MESMO membroId antes de gravar qualquer turno", () => {
  const corpo = corpoDaFuncao(CODIGO, "registrarTurno");
  verdade(
    corpo.includes("where: { id: input.conversaId, membroId }"),
    "registrarTurno deixou de confirmar o dono da conversa antes de escrever — um conversaId forjado gravaria um turno na conversa de outro membro",
  );
  verdade(/if \(!conversa\)[\s\S]{0,100}throw new Error/.test(corpo), "a ausência de dono não interrompe a gravação — precisa lançar erro, nunca seguir escrevendo");
  // A checagem de dono tem de vir ANTES do create do turno — senão o dado já foi gravado antes
  // de a recusa decidir alguma coisa.
  const posChecagem = corpo.indexOf("where: { id: input.conversaId, membroId }");
  const posCreate = corpo.indexOf("painelMestreTurno.create(");
  verdade(posChecagem >= 0 && posCreate >= 0 && posChecagem < posCreate, "o turno é criado antes de confirmar o dono da conversa");
});

teste("Lei 1: listarConversasDoMembro também filtra por membroId — nunca lista a conversa de outro membro na barra lateral", () => {
  const corpo = corpoDaFuncao(CODIGO, "listarConversasDoMembro");
  verdade(corpo.length > 100, "corpoDaFuncao não achou listarConversasDoMembro — varredura cega");
  verdade(corpo.includes("where: { membroId }"), "sumiu o filtro por membroId — a lista passaria a devolver conversas de qualquer membro");
});

// ── LEI 3: a única escrita é sobre CONVERSA (dado da plataforma) ────────────────────────────

teste("Lei 3: todo verbo de escrita do Prisma em lib/painelMestreConversas.ts só toca painelMestreConversa/painelMestreTurno/platformMember/platformRole", () => {
  const PERMITIDOS = new Set(["painelMestreConversa", "painelMestreTurno", "platformMember", "platformRole"]);
  const regex = /prisma\.(\w+)\.(create|update|upsert|delete|updateMany|deleteMany|createMany)\(/g;
  let m: RegExpExecArray | null;
  let encontrouAlgum = false;
  while ((m = regex.exec(CODIGO))) {
    encontrouAlgum = true;
    verdade(PERMITIDOS.has(m[1]), `lib/painelMestreConversas.ts escreve em "${m[1]}" — modelo fora da lista permitida para esta entrega`);
  }
  verdade(encontrouAlgum, "a varredura não encontrou NENHUMA escrita — regex pode ter parado de casar com o código de verdade (varredura cega)");
});

teste("lib/painelMestreConversas.ts não usa prismaBase (o client SEM a máscara de Vidro Fosco)", () => {
  verdade(!CODIGO.includes("prismaBase"), "lib/painelMestreConversas.ts importa ou usa prismaBase");
});

// ── OS DOIS ENDPOINTS DE LEITURA (barra lateral e "abrir conversa") ─────────────────────────
//
// Nenhum dos dois fala com o Prisma direto — os dois delegam a leitura, JÁ FILTRADA POR DONO,
// para lib/painelMestreConversas.ts (testado acima). Aqui só resta provar que cada rota (1)
// recusa quem não está autenticado e (2) de fato usa a função certa, e não uma consulta própria.

const FONTE_LISTA = readFileSync(join(RAIZ, "app", "api", "painel-mestre", "agente", "conversas", "route.ts"), "utf8");
const CODIGO_LISTA = codigoDe(FONTE_LISTA);

teste("GET /api/painel-mestre/agente/conversas: recusa quem não está autenticado e delega a listagem a listarConversasDoMembro(viewer)", () => {
  const corpo = corpoDaFuncao(CODIGO_LISTA, "GET");
  verdade(corpo.length > 100, "corpoDaFuncao não achou GET — varredura cega");
  verdade(/if \(!viewer\)[\s\S]{0,150}status: 401/.test(corpo), "sumiu a recusa de quem não está autenticado");
  verdade(corpo.includes("listarConversasDoMembro(viewer)"), "a rota deixou de delegar a listarConversasDoMembro — pode ter passado a consultar o Prisma direto, sem o corte por dono");
  verdade(!/\bprisma\s*\./.test(CODIGO_LISTA), "a rota de listagem chama `prisma.` diretamente — toda leitura tem de passar por lib/painelMestreConversas.ts");
});

const FONTE_UMA = readFileSync(join(RAIZ, "app", "api", "painel-mestre", "agente", "conversas", "[id]", "route.ts"), "utf8");
const CODIGO_UMA = codigoDe(FONTE_UMA);

teste("GET /api/painel-mestre/agente/conversas/[id]: recusa quem não está autenticado e delega a busca a buscarConversaDoMembro", () => {
  const corpo = corpoDaFuncao(CODIGO_UMA, "GET");
  verdade(corpo.length > 100, "corpoDaFuncao não achou GET — varredura cega");
  verdade(/if \(!viewer\)[\s\S]{0,150}status: 401/.test(corpo), "sumiu a recusa de quem não está autenticado");
  verdade(corpo.includes("buscarConversaDoMembro(params.id, viewer)"), "a rota deixou de delegar a buscarConversaDoMembro — pode ter passado a consultar o Prisma direto, sem o corte por dono");
  verdade(!/\bprisma\s*\./.test(CODIGO_UMA), "a rota de uma conversa chama `prisma.` diretamente — toda leitura tem de passar por lib/painelMestreConversas.ts");
});

teste("GET /api/painel-mestre/agente/conversas/[id]: conversa não encontrada (inexistente OU de outro membro) devolve 404 — a MESMA resposta para os dois casos", () => {
  const corpo = corpoDaFuncao(CODIGO_UMA, "GET");
  verdade(/if \(!conversa\)[\s\S]{0,150}status: 404/.test(corpo), "sumiu a recusa por 404 — a rota pode ter passado a devolver a conversa de qualquer um, ou uma resposta que revela a diferença entre 'não existe' e 'é de outro dono'");
  // UMA ÚNICA ramificação de erro — nunca duas respostas diferentes (uma para "não existe" e
  // outra para "existe mas não é seu"), porque a SEGUNDA seria um jeito de descobrir que o id
  // pertence a alguém.
  const ocorrenciasDe404 = (corpo.match(/status: 404/g) || []).length;
  igual(ocorrenciasDe404, 1, "há mais de uma resposta 404 diferente — risco de uma delas vazar a existência da conversa de outro membro");
});

void resumo("Memória e auditoria do Painel Mestre (lib/painelMestreConversas.ts)");
