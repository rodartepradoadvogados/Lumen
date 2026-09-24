import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";

// ============================================================================
// A CENTRAL DE ATENDIMENTO — A CAIXA DE RESPOSTA.
//
// A Central substituiu o item antigo no menu e hospedava a conversa em modo de leitura: a atendente
// abria o cliente e não tinha onde digitar. Esta suíte prova quatro coisas, e a primeira é a que não
// pode falhar em silêncio:
//
//   1. QUEM ESCREVE PASSA PELO MESMO RECORTE DE QUEM LÊ. replyWhatsapp busca o atendimento com
//      recorteDaConversa (id + escritório de quem pediu + recorte por dono) — a regra em si está
//      provada em mesa na suíte atendimentoCentralCliques; aqui se prova que a ESCRITA a usa.
//   2. A caixa existe na Central, com o componente de sempre, para a conversa que passou pelo recorte.
//   3. Ela fica FORA da caixa que rola, fixa embaixo — lido pela ÁRVORE de <div>, com contagem
//      balanceada, e não pela grafia de uma linha.
//   4. Ela fica na régua da conversa (--atd-largura-leitura).
// ============================================================================

const RAIZ = process.cwd();
const FONTE_PAGE = readFileSync(join(RAIZ, "app", "atendimento-central", "page.tsx"), "utf8");
const CORPO_PAGE = corpoDaFuncao(FONTE_PAGE, "AtendimentoCentralPage");
const FONTE_ACOES = readFileSync(join(RAIZ, "lib", "actions", "attendance.ts"), "utf8");
const REPLY = corpoDaFuncao(FONTE_ACOES, "replyWhatsapp");

type Div = { inicio: number; fim: number; abertura: string };

/** A tag de abertura a partir de `i`, lida por contagem de chaves (um `>` dentro de `{...}` não fecha). */
function aberturaEm(fonte: string, i: number): string {
  let nivel = 0;
  for (let j = i; j < fonte.length; j++) {
    const c = fonte[j];
    if (c === "{") nivel++;
    else if (c === "}") nivel--;
    else if (c === ">" && nivel === 0) return fonte.slice(i, j + 1);
  }
  return "";
}

/** Todas as <div> do trecho com início e fim, casando abertura e fechamento por pilha. */
function divs(fonte: string): Div[] {
  const achadas: Div[] = [];
  const pilha: { inicio: number; abertura: string }[] = [];
  const re = /<div\b|<\/div>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fonte))) {
    if (m[0] === "</div>") {
      const topo = pilha.pop();
      if (topo) achadas.push({ ...topo, fim: m.index });
      continue;
    }
    const abertura = aberturaEm(fonte, m.index);
    if (abertura.endsWith("/>")) continue;
    pilha.push({ inicio: m.index, abertura });
  }
  return achadas;
}

/** As <div> que envolvem a posição `i`, da mais de dentro para a mais de fora. */
function envolvem(fonte: string, i: number): Div[] {
  return divs(fonte)
    .filter((d) => d.inicio < i && i < d.fim)
    .sort((a, b) => b.inicio - a.inicio);
}

const I_CONVERSA = CORPO_PAGE.indexOf("<Conversa");
const I_RESPOSTA = CORPO_PAGE.indexOf("<WhatsappReplyBox");

// ── 0. A varredura está lendo o que acha que lê ─────────────────────────────────────────────────

teste("a varredura achou o corpo da página e o de replyWhatsapp — senão tudo abaixo passa em cima de vazio", () => {
  verdade(CORPO_PAGE.length > 4000, "corpoDaFuncao não achou AtendimentoCentralPage");
  verdade(REPLY.length > 200 && REPLY.length < 4000, `o trecho de replyWhatsapp tem ${REPLY.length} caracteres — ou não achou, ou transbordou para a vizinha`);
  verdade(!REPLY.includes("function replyEmail"), "o trecho de replyWhatsapp transbordou para replyEmail");
  verdade(I_CONVERSA > 0, "<Conversa> sumiu da Central");
});

teste("o leitor de <div> casa abertura e fechamento de verdade (teste do próprio instrumento)", () => {
  const amostra = `<div a="1"><div b={x > 1 ? "c" : "d"}><X/></div><div e /></div>`;
  const ds = divs(amostra);
  igual(ds.length, 2, "esperava 2 divs com fechamento (a auto-fechada não conta): ");
  const dentro = envolvem(amostra, amostra.indexOf("<X/>"));
  igual(dentro.length, 2, "<X/> está dentro de duas divs: ");
  verdade(dentro[0].abertura.includes("b={x > 1"), "a mais de dentro deveria ser a div b — o `>` dentro de {} fechou a tag cedo");
});

// ── 1. QUEM ESCREVE PASSA PELO RECORTE DE QUEM LÊ ───────────────────────────────────────────────

teste("MUTAÇÃO PRINCIPAL: replyWhatsapp busca o atendimento pelo recorte da conversa, e não por um `where` cru", () => {
  verdade(/findFirst\(\s*\{\s*where:\s*recorteDaConversa\(\s*user\s*,\s*attendanceId\s*\)/.test(REPLY),
    "replyWhatsapp deixou de usar recorteDaConversa — a reconferência de escritório e de dono da escrita voltou a ser copiada à mão, ou saiu");
  verdade(!/where:\s*\{\s*id:\s*attendanceId\s*\}\s*\}\s*\)/.test(REPLY.slice(0, REPLY.indexOf("sendWhatsappText"))),
    "há uma busca do atendimento só por id ANTES do envio — o id sozinho decidindo em que conversa se escreve");
});

teste("nada é enviado antes da reconferência: a recusa do recorte vem antes do sendWhatsappText", () => {
  const iRecorte = REPLY.search(/recorteDaConversa\(/);
  const iRecusa = REPLY.search(/if\s*\(\s*!attendance\s*\)\s*return/);
  const iEnvio = REPLY.indexOf("sendWhatsappText(");
  verdade(iRecorte >= 0 && iRecusa > iRecorte && iEnvio > iRecusa,
    `ordem errada em replyWhatsapp (recorte ${iRecorte}, recusa ${iRecusa}, envio ${iEnvio}) — a mensagem sairia antes de saber se a pessoa pode escrever ali`);
  verdade(REPLY.includes("if (!podeVerAtendimentos("), "replyWhatsapp perdeu a trava de nível de acesso");
});

// ── 2. A CAIXA EXISTE NA CENTRAL ────────────────────────────────────────────────────────────────

teste("a Central hospeda o WhatsappReplyBox de sempre — nenhuma caixa nova escrita para ela", () => {
  verdade(I_RESPOSTA > 0, "a Central continua sem caixa de resposta: a atendente abre a conversa e não tem onde digitar");
  verdade(/import WhatsappReplyBox from "@\/components\/WhatsappReplyBox"/.test(FONTE_PAGE),
    "a Central não importa o componente de sempre — escreveram outra caixa de resposta");
});

teste("a caixa responde à conversa que PASSOU pelo recorte, e não ao id cru da URL", () => {
  const tag = aberturaEm(CORPO_PAGE, I_RESPOSTA);
  verdade(/attendanceId=\{\s*selecionado\.id\s*\}/.test(tag),
    `a caixa não recebe selecionado.id (${tag}) — com o id da URL, ela poderia apontar para uma conversa que a tela não mostrou`);
});

teste("a caixa só aparece quando dá para responder: número do cliente E canal do escritório configurado", () => {
  const def = CORPO_PAGE.split("\n").find((l) => /\bpodeResponder\s*=/.test(l)) ?? "";
  verdade(def.length > 0, "não há mais uma definição de podeResponder na Central");
  verdade(/\bwaPhone\b/.test(def), "podeResponder deixou de exigir o número de WhatsApp do atendimento");
  verdade(/isWhatsappConfigured\(\s*viewer\.officeId\s*\)/.test(def),
    "podeResponder deixou de perguntar se o canal do escritório DE QUEM PEDIU está configurado");
  // A caixa está no ramo verdadeiro de podeResponder: o `podeResponder ?` vem antes dela e o `:` do
  // outro ramo (a frase) vem depois.
  const iCond = CORPO_PAGE.lastIndexOf("podeResponder ?", I_RESPOSTA);
  verdade(iCond > 0 && I_RESPOSTA - iCond < 800, "a caixa de resposta não está mais sob `podeResponder ?` — apareceria sem canal configurado");
});

teste("sem por onde responder, a tela DIZ por quê — nas duas situações", () => {
  verdade(/não está configurado/.test(CORPO_PAGE), "sumiu a frase do canal do escritório não configurado");
  verdade(/não tem WhatsApp vinculado/.test(CORPO_PAGE), "sumiu a frase do atendimento sem WhatsApp");
});

teste("a chave do atendente continua em cima da caixa, como na tela do atendimento", () => {
  const iChave = CORPO_PAGE.indexOf("<AtendenteIaControle");
  verdade(iChave > 0 && iChave < I_RESPOSTA, "a chave do atendente sumiu da Central, ou foi parar embaixo da caixa");
});

// ── 3. FORA DA CAIXA QUE ROLA, FIXA EMBAIXO ─────────────────────────────────────────────────────

teste("a caixa de resposta NÃO está dentro da caixa que rola a conversa", () => {
  const daConversa = envolvem(CORPO_PAGE, I_CONVERSA);
  const rolagem = daConversa.find((d) => /\boverflow-y-auto\b/.test(d.abertura));
  verdade(!!rolagem, "não achei a caixa que rola a conversa");
  verdade(/\bmin-h-0\b/.test(rolagem!.abertura), "a caixa que rola perdeu o min-h-0 — sem ele, ela cresce em vez de rolar");
  verdade(!(rolagem!.inicio < I_RESPOSTA && I_RESPOSTA < rolagem!.fim),
    "a caixa de resposta está DENTRO da caixa que rola — numa conversa comprida ela sobe junto e some");
  const daResposta = envolvem(CORPO_PAGE, I_RESPOSTA);
  const rolaJunto = daResposta.filter((d) => /\boverflow-(y-)?(auto|scroll)\b/.test(d.abertura));
  igual(rolaJunto.map((d) => d.abertura.slice(0, 80)), [], "a caixa de resposta está dentro de alguma coisa que rola: ");
});

teste("o pé da conversa não encolhe, e a conversa e ele são irmãos da mesma coluna", () => {
  const daResposta = envolvem(CORPO_PAGE, I_RESPOSTA);
  verdade(daResposta.some((d) => /\bshrink-0\b/.test(d.abertura)), "o pé com a caixa de resposta não é shrink-0 — a conversa o espremeria");
  const daConversa = envolvem(CORPO_PAGE, I_CONVERSA);
  const coluna = daConversa.find((d) => /\bflex-col\b/.test(d.abertura) && d.inicio < I_RESPOSTA && I_RESPOSTA < d.fim);
  verdade(!!coluna, "a conversa e a caixa de resposta não estão na mesma coluna flex");
});

// A classe de ALTURA, e não de piso nem de teto: `\bh-screen` casaria por dentro de `min-h-screen`
// (o hífen é fronteira de palavra) e aprovaria exatamente o defeito que esta asserção guarda.
const ALTURA_TRAVADA = /(?<![\w-])h-(screen|dvh|svh)\b/;

teste("o filtro de altura travada não casa piso nem teto (teste do próprio filtro)", () => {
  verdade(ALTURA_TRAVADA.test(`className="flex h-screen flex-col"`), "o filtro não reconhece h-screen");
  verdade(ALTURA_TRAVADA.test(`className="h-dvh"`), "o filtro não reconhece h-dvh");
  verdade(!ALTURA_TRAVADA.test(`className="flex min-h-screen flex-col"`), "o filtro casa min-h-screen — aprovaria só um piso");
  verdade(!ALTURA_TRAVADA.test(`className="max-h-screen"`), "o filtro casa max-h-screen");
});

teste("a tela tem ALTURA travada na janela — com só um piso, quem rola é a página e a caixa desce junto", () => {
  const raiz = divs(CORPO_PAGE).sort((a, b) => a.inicio - b.inicio)[0];
  verdade(!!raiz, "não achei a div raiz da página");
  verdade(ALTURA_TRAVADA.test(raiz.abertura),
    `a raiz da Central não tem altura travada (${raiz.abertura.slice(0, 90)}) — a coluna cresce do tamanho da conversa e a caixa de resposta sai da tela`);
});

// ── 4. NA RÉGUA DA CONVERSA ─────────────────────────────────────────────────────────────────────

teste("a caixa de resposta fica na mesma medida de leitura da conversa (--atd-largura-leitura)", () => {
  const daResposta = envolvem(CORPO_PAGE, I_RESPOSTA);
  verdade(daResposta.some((d) => /max-w-\[var\(--atd-largura-leitura\)\]/.test(d.abertura)),
    "a caixa de resposta não está na régua da conversa — ela se estica até a borda e desalinha das mensagens");
});

teste("nenhum hex cru entrou na página", () => {
  verdade(!/#[0-9a-fA-F]{3,8}\b/.test(codigoDe(FONTE_PAGE)), "app/atendimento-central/page.tsx ganhou hex cru");
});

resumo("Central de Atendimento — a caixa de resposta");
