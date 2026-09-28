import { readFileSync } from "node:fs";
import { teste, igual, verdade, resumo } from "./executar";
import {
  motivosDoEscritorio,
  acoesDoMotivo,
  temEdicaoDoEscritorio,
  rotuloValido,
  LIMITE_DO_ROTULO,
  type MotivoBruto,
} from "@/lib/motivosDeRecusa";

// ============================================================================
// O CATÁLOGO DE MOTIVOS DE RECUSA — DOIS ANDARES.
//
// Três regras que só se entendem juntas, e cada uma tem um jeito próprio de errar calado:
//
//   Q22  quem NÃO editou recebe a correção do padrão; quem editou fica com o dele.
//   Q23  excluir um motivo da plataforma é DESATIVAR, nunca apagar.
//   Q24  voltar ao padrão é apagar a camada do escritório — um motivo, ou a lista toda.
//
// O erro mais caro dos três é o primeiro pelo avesso: copiar o padrão na primeira seleção. Tudo
// continua funcionando, ninguém percebe nada, e dois anos depois quarenta escritórios mandam ao
// cliente um texto que a Lúmen corrigiu e que nunca chegou neles.
// ============================================================================

const ESC = "escritorio-1";
const OUTRO = "escritorio-2";

const padrao = (id: string, rotulo: string, ordem: number, desativado = false): MotivoBruto => ({
  id,
  officeId: null,
  baseId: null,
  rotulo,
  descricao: null,
  desativado,
  ordem,
});

const camada = (id: string, baseId: string | null, rotulo: string, ordem: number, desativado = false, officeId = ESC): MotivoBruto => ({
  id,
  officeId,
  baseId,
  rotulo,
  descricao: null,
  desativado,
  ordem,
});

const CATALOGO_BASE = [
  padrao("p1", "Fora da nossa área", 1),
  padrao("p2", "Valor da causa abaixo do mínimo", 2),
  padrao("p3", "Comarca fora do nosso alcance", 3),
];

// ── REGRA 1 · A CORREÇÃO DO PADRÃO CHEGA A QUEM NÃO MEXEU ───────────────────

teste("sem camada própria, o escritório vê o texto da plataforma", () => {
  const lista = motivosDoEscritorio(CATALOGO_BASE, ESC);
  igual(lista.map((m) => m.rotulo), ["Fora da nossa área", "Valor da causa abaixo do mínimo", "Comarca fora do nosso alcance"]);
  igual(lista.map((m) => m.origem), ["plataforma", "plataforma", "plataforma"]);
});

teste("a Lúmen corrige o padrão e quem não mexeu recebe a correção", () => {
  // O coração da regra: o escritório não guarda cópia. Se guardasse, este teste passaria com o
  // texto velho — e passaria em silêncio, que é o problema.
  const corrigido = [padrao("p1", "Fora das matérias que atendemos", 1), ...CATALOGO_BASE.slice(1)];
  const lista = motivosDoEscritorio(corrigido, ESC);
  igual(lista[0].rotulo, "Fora das matérias que atendemos");
  igual(lista[0].id, "p1");
});

teste("quem editou fica com o dele, e a correção da Lúmen não apaga o trabalho dele", () => {
  const corrigido = [padrao("p1", "Fora das matérias que atendemos", 1), ...CATALOGO_BASE.slice(1)];
  const meu = camada("e1", "p1", "Não atuamos em trabalhista", 1);
  const lista = motivosDoEscritorio([...corrigido, meu], ESC);
  igual(lista[0].rotulo, "Não atuamos em trabalhista");
  igual(lista[0].origem, "plataforma-editado");
  // O id que a recusa vai gravar é o da camada do escritório, não o do padrão.
  igual(lista[0].id, "e1");
  igual(lista[0].baseId, "p1");
});

teste("a edição de um escritório não vaza para outro", () => {
  const meu = camada("e1", "p1", "Não atuamos em trabalhista", 1, false, ESC);
  igual(motivosDoEscritorio([...CATALOGO_BASE, meu], OUTRO)[0].rotulo, "Fora da nossa área");
  igual(motivosDoEscritorio([...CATALOGO_BASE, meu], ESC)[0].rotulo, "Não atuamos em trabalhista");
});

// ── REGRA 2 · DESATIVAR, NUNCA APAGAR ───────────────────────────────────────

teste("motivo desativado pelo escritório some só das telas dele", () => {
  const escondido = camada("e2", "p2", "Valor da causa abaixo do mínimo", 2, true);
  const minha = motivosDoEscritorio([...CATALOGO_BASE, escondido], ESC);
  igual(minha.map((m) => m.baseId), ["p1", "p3"]);
  // O outro escritório continua vendo os três.
  igual(motivosDoEscritorio([...CATALOGO_BASE, escondido], OUTRO).length, 3);
});

teste("motivo que a própria Lúmen desativou some para todo mundo", () => {
  // Inclusive para quem tinha versão própria dele: se o motivo deixou de existir na plataforma,
  // ele não deve continuar sendo oferecido por uma camada órfã.
  const catalogo = [padrao("p1", "Fora da nossa área", 1, true), ...CATALOGO_BASE.slice(1), camada("e1", "p1", "Meu texto", 1)];
  const lista = motivosDoEscritorio(catalogo, ESC);
  verdade(!lista.some((m) => m.baseId === "p1"), "um padrão desativado pela Lúmen não pode sobreviver pela camada do escritório");
  igual(lista.length, 2);
});

teste("o que o escritório criou por conta própria aparece e é dele", () => {
  const proprio = camada("e9", null, "Cliente de escritório concorrente", 10);
  const lista = motivosDoEscritorio([...CATALOGO_BASE, proprio], ESC);
  igual(lista.length, 4);
  igual(lista[3].origem, "proprio");
  igual(lista[3].baseId, null);
});

// ── AS AÇÕES QUE CADA LINHA OFERECE ─────────────────────────────────────────

teste("padrão não se exclui, próprio não volta ao padrão", () => {
  const lista = motivosDoEscritorio([...CATALOGO_BASE, camada("e1", "p1", "Meu", 1), camada("e9", null, "Meu mesmo", 9)], ESC);
  const daPlataforma = lista.find((m) => m.origem === "plataforma")!;
  const editado = lista.find((m) => m.origem === "plataforma-editado")!;
  const proprio = lista.find((m) => m.origem === "proprio")!;

  igual(acoesDoMotivo(daPlataforma), { editar: true, desativar: true, excluir: false, voltarAoPadrao: false });
  igual(acoesDoMotivo(editado), { editar: true, desativar: true, excluir: false, voltarAoPadrao: true });
  // O que o escritório criou some de verdade: não há padrão atrás para onde voltar.
  igual(acoesDoMotivo(proprio), { editar: true, desativar: false, excluir: true, voltarAoPadrao: false });
});

teste('"voltar a lista inteira" só aparece quando há o que voltar', () => {
  igual(temEdicaoDoEscritorio(CATALOGO_BASE, ESC), false);
  // Um motivo PRÓPRIO não é edição de padrão — voltar ao padrão não o apagaria, então ele não
  // pode acender o botão.
  igual(temEdicaoDoEscritorio([...CATALOGO_BASE, camada("e9", null, "Meu mesmo", 9)], ESC), false);
  igual(temEdicaoDoEscritorio([...CATALOGO_BASE, camada("e1", "p1", "Meu", 1)], ESC), true);
  // E não acende pelo trabalho do vizinho.
  igual(temEdicaoDoEscritorio([...CATALOGO_BASE, camada("e1", "p1", "Meu", 1, false, OUTRO)], ESC), false);
});

// ── A ORDEM ─────────────────────────────────────────────────────────────────

teste("a ordem é estável entre duas leituras do banco", () => {
  // Quem escolhe motivo escolhe por posição depois da primeira semana. Uma lista que se reordena
  // sozinha faz essa pessoa escolher o motivo errado — e o motivo errado vai numa carta.
  const catalogo = [padrao("pB", "B", 1), padrao("pA", "A", 1), padrao("pC", "C", 0)];
  const a = motivosDoEscritorio(catalogo, ESC).map((m) => m.id);
  const b = motivosDoEscritorio([...catalogo].reverse(), ESC).map((m) => m.id);
  igual(a, b);
  igual(a, ["pC", "pA", "pB"]);
});

teste("catálogo vazio não estoura e não inventa motivo", () => {
  igual(motivosDoEscritorio([], ESC), []);
});

// ── O RÓTULO ────────────────────────────────────────────────────────────────

teste("o rótulo é uma frase, e nunca vazio", () => {
  // Um motivo sem texto vira uma recusa sem motivo — e a recusa sem motivo é exatamente o que
  // este catálogo existe para não acontecer.
  igual(rotuloValido("   "), { ok: false, erro: "Escreva o motivo." });
  igual(rotuloValido("\n\t "), { ok: false, erro: "Escreva o motivo." });
  igual(rotuloValido("  Fora   da nossa  área \n"), { ok: true, rotulo: "Fora da nossa área" });
  const longo = rotuloValido("x".repeat(LIMITE_DO_ROTULO + 1));
  verdade(!longo.ok, "deveria recusar rótulo longo demais");
  igual(rotuloValido("x".repeat(LIMITE_DO_ROTULO)).ok, true);
});

// ── AS TRAVAS DA ESCRITA ────────────────────────────────────────────────────
//
// O módulo acima é puro e está provado. Mas o defeito que mais custa caro NÃO cabe nele: é
// SELECIONAR criando linha na camada do escritório. Se isso acontecer, o módulo puro continua
// certo, os doze casos acima continuam passando, e o catálogo apodrece em silêncio. A prova, aqui,
// é sobre o código que escreve.

const ACOES = readFileSync("lib/actions/motivosDeRecusa.ts", "utf8");

/**
 * O corpo de UMA ação, do cabeçalho dela até o da seguinte.
 *
 * Uma janela de N caracteres não serve: ela transborda para a ação de baixo, e aí a varredura
 * encontra na vizinha a trava que a função examinada perdeu. Foi exatamente isso que uma mutação
 * deliberada mostrou — tirar `officeId: null` de editarMotivoPadrao passava batido porque
 * desativarMotivoPadrao, logo abaixo, ainda tinha.
 *
 * E OS COMENTÁRIOS SAEM. Este arquivo explica cada trava em prosa, citando o próprio código que a
 * trava usa; uma varredura que lesse o comentário encontraria a trava justamente no texto que
 * lamenta a falta dela. Uma segunda mutação mostrou isso também: a frase "`officeId: null` no
 * WHERE" satisfazia a busca depois de o WHERE ter perdido o `officeId: null`.
 */
function corpoDa(nome: string): string {
  const i = ACOES.indexOf(`export async function ${nome}(`);
  if (i < 0) return "";
  const proxima = ACOES.indexOf("export async function ", i + 10);
  return semComentarios(ACOES.slice(i, proxima < 0 ? undefined : proxima));
}

function semComentarios(fonte: string): string {
  return fonte
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");
}

teste("a camada do escritório só nasce ao editar ou ao remover — nunca ao selecionar", () => {
  // Toda criação de linha com `officeId` do escritório E `baseId` preenchido tem de estar dentro
  // de editarMotivo ou removerMotivo. Uma terceira aparecendo é o sinal de que alguém escreveu
  // "ao marcar, grava".
  const criacoesComBase = ACOES.split("prisma.motivoDeRecusa.create(").slice(1).filter((t) => t.slice(0, 260).includes("baseId:"));
  igual(criacoesComBase.length, 2, "esperado exatamente duas criações de camada (editar e remover): ");

  const nomes = ["editarMotivo", "removerMotivo"];
  for (const nome of nomes) {
    const i = ACOES.indexOf(`export async function ${nome}(`);
    verdade(i > 0, `${nome} não existe`);
  }
  // E não existe ação de "selecionar": se um dia existir, ela não pode gravar nada.
  verdade(!/export async function selecionarMotivo/.test(ACOES), "nasceu uma ação de selecionar — ela não pode criar linha");
});

teste("voltar ao padrão nunca apaga o que o escritório criou sozinho", () => {
  // `baseId: { not: null }` nas duas ações de restaurar é o que separa "desfazer minha edição de
  // um padrão" de "apagar o motivo que eu criei". Sem ele, o botão de restaurar vira uma
  // exclusão em massa do trabalho do escritório.
  for (const nome of ["voltarAoPadrao", "voltarListaAoPadrao"]) {
    const i = ACOES.indexOf(`export async function ${nome}(`);
    verdade(i > 0, `${nome} não existe`);
    const corpo = corpoDa(nome);
    verdade(corpo.includes("baseId: { not: null }"), `${nome} apagaria também os motivos próprios do escritório`);
    verdade(corpo.includes("officeId: r.viewer.officeId"), `${nome} não se limita ao escritório de quem pediu`);
  }
});

teste("as duas portas não se abrem entre si", () => {
  // A Lúmen mexe no padrão; o escritório mexe na camada dele. Um administrador de escritório
  // editando um motivo-padrão mudaria a carta de todos os outros escritórios.
  for (const nome of ["criarMotivoPadrao", "editarMotivoPadrao", "desativarMotivoPadrao"]) {
    const i = ACOES.indexOf(`export async function ${nome}(`);
    verdade(i > 0, `${nome} não existe`);
    verdade(corpoDa(nome).includes("await isPlatformStaff()"), `${nome} não checa a equipe da Lúmen`);
  }
  // E as ações da plataforma que ALTERAM têm de fixar officeId: null no WHERE, senão viram um
  // jeito de a Lúmen editar a camada de um escritório sem querer.
  for (const nome of ["editarMotivoPadrao", "desativarMotivoPadrao"]) {
    verdade(corpoDa(nome).includes("officeId: null"), `${nome} não se limita aos padrões da plataforma`);
  }
  for (const nome of ["criarMotivoProprio", "editarMotivo", "removerMotivo", "voltarAoPadrao", "voltarListaAoPadrao"]) {
    const i = ACOES.indexOf(`export async function ${nome}(`);
    verdade(i > 0, `${nome} não existe`);
    verdade(corpoDa(nome).includes("await donoDoEscritorio()"), `${nome} não checa o administrador do escritório`);
  }
});

teste("ninguém lê o catálogo de outro escritório", () => {
  const i = ACOES.indexOf("async function lerCatalogo(");
  verdade(i > 0, "lerCatalogo não existe");
  const proxima = ACOES.indexOf("export async function ", i);
  verdade(
    semComentarios(ACOES.slice(i, proxima < 0 ? undefined : proxima)).includes("[{ officeId: null }, { officeId }]"),
    "lerCatalogo traria a camada de outros escritórios",
  );
});

resumo("Catálogo de motivos de recusa");
