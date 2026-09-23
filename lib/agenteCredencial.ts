import { SignJWT, jwtVerify } from "jose";
import { TETO_DA_PONTE_S } from "@/lib/peticionamentoTempoDeGeracao";

// A CREDENCIAL DE UMA PERGUNTA.
//
// O Lúmen Agent não consulta o banco: ele PERGUNTA ao Lúmen, e o Lúmen responde só o que aquela
// pessoa poderia ver na tela. Esta credencial é o que carrega essa permissão até lá e de volta.
//
// POR QUE ELA É DA PERGUNTA, E NÃO DO ESCRITÓRIO. Seria mais simples dar ao agente um token fixo
// por escritório. Seria também errado: dentro do mesmo escritório, o financeiro só é visível para
// administradores e para quem tem acesso expresso (ver `User.financeAccess`). Com um token de
// escritório, bastaria um advogado sem esse acesso pedir ao agente "quanto entrou este mês" para
// contornar a regra pela porta dos fundos — e a regra do dono é inexorável: o financeiro responde
// a quem tem acesso ao financeiro, e a mais ninguém.
//
// Então a credencial nasce A CADA PERGUNTA, já sabendo QUEM perguntou e o que essa pessoa pode
// ver. Quem decide não é o agente: é o Lúmen, do lado de cá, na hora de executar a ferramenta.
//
// VIDA CURTA — MAS NÃO UMA SÓ. Existem dois trabalhos com relógios inteiramente diferentes por
// baixo (ver `EscopoDaCredencial`), e uma validade única já escondeu um defeito real: a de
// peticionamento herdava os "5 minutos, exatamente como conversa" desta credencial enquanto a
// geração no Hermes podia legitimamente levar até 15 — a credencial morria com o trabalho ainda
// em curso, e a ferramenta simplesmente parava de responder no meio da minuta. Por isso a
// validade agora é FUNÇÃO DO ESCOPO, e cada uma tem seu próprio motivo escrito abaixo.

const PUBLICO = "lumen-agente-ferramentas";

/** Quem pode carregar esta credencial, e por quanto tempo — ver `validadeDoEscopo`. */
export type EscopoDaCredencial = "conversa" | "peticionamento";

/**
 * A CONVERSA (chat interno, Hermes ou a reserva). Cinco minutos, exatamente como sempre: o Hermes
 * responde em segundos a uma pergunta de chat, e uma credencial que sobrevivesse mais do que isso
 * só aumentaria a janela de um token vazado sem trazer nada de volta.
 */
const VALIDADE_CONVERSA = "5m";

/**
 * A FOLGA DA CREDENCIAL DE PETICIONAMENTO SOBRE O TETO DA PONTE, em segundos.
 *
 * PAGA DUAS COISAS CONCRETAS, e nenhuma delas é "margem de segurança" solta:
 *
 *   1. A FILA. `TETO_DA_PONTE_S` mede o relógio de UM processo do Hermes já em execução; ele não
 *      inclui o tempo que a tarefa pode esperar na ponte antes de esse processo sequer começar
 *      (a ponte limita quantas gerações rodam ao mesmo tempo — ver "máximo de gerações em
 *      andamento" em lib/peticionamentoGeracaoAssincrona.ts). Sem esta parcela, uma geração que
 *      esperasse na fila chegaria ao fim do seu próprio trabalho com uma credencial que já não
 *      existe mais havia minutos.
 *   2. A PARTIDA DO PROCESSO. O `subprocess` do Hermes carrega o perfil do escritório do disco
 *      (state.db) antes de responder à primeira pergunta de ferramenta — tempo que também corre
 *      FORA do relógio de `TETO_DA_PONTE_S`, que só conta a partir do processo já de pé.
 *
 * Dois minutos (120s) cobrem folgadamente as duas somadas nesta instalação (um perfil só, poucas
 * gerações simultâneas) sem esticar a vida da credencial ao ponto de um vazamento importar — ela
 * continua não sobrevivendo nem a uma volta de café.
 */
const FOLGA_DA_FILA_E_DA_PARTIDA_S = 120;

/**
 * O PETICIONAMENTO. Deriva de `TETO_DA_PONTE_S` (o teto do TRABALHO na ponte, hoje 900s = quinze
 * minutos) e não de um número solto: os dois têm de andar juntos, e derivar é o que torna isso
 * verdade sem depender de alguém lembrar de mexer nos dois lugares no mesmo dia. Nunca escrever
 * esta validade menor do que `TETO_DA_PONTE_S` — é exatamente essa desigualdade invertida que
 * manteve as ferramentas do peticionamento desligadas sem ninguém perceber.
 */
const VALIDADE_PETICIONAMENTO = `${TETO_DA_PONTE_S + FOLGA_DA_FILA_E_DA_PARTIDA_S}s`;

function validadeDoEscopo(escopo: EscopoDaCredencial): string {
  return escopo === "peticionamento" ? VALIDADE_PETICIONAMENTO : VALIDADE_CONVERSA;
}

function segredo(): Uint8Array {
  const valor = process.env.AUTH_SECRET;
  if (!valor) throw new Error("AUTH_SECRET não configurada");
  return new TextEncoder().encode(valor);
}

export type PermissaoDaPergunta = {
  officeId: string;
  userId: string;
  /** Se esta pessoa pode ver o financeiro do escritório. Decidido aqui, nunca pelo agente. */
  financeiro: boolean;
  /**
   * Se esta pessoa é sócia do escritório.
   *
   * Separado de `financeiro` porque dentro do financeiro há DOIS níveis (ver
   * lib/nivelFinanceiro.ts): o registro — contas, vencimentos, saldo — que quem tem acesso vê; e
   * o indicador — faturamento, lucro, margem, projeção — que só sócio vê. Sem este campo, quem
   * paga as contas do escritório saberia também a margem de lucro dele.
   */
  admin: boolean;
  /**
   * QUAL TRABALHO esta credencial escolta — decide tanto a VALIDADE (`validadeDoEscopo`) quanto,
   * do lado da rota (app/api/agente/ferramentas/route.ts), QUAIS ferramentas ela alcança. Nasce
   * aqui, e não é inferido de nenhum outro campo: inferir a partir de "tem sessionId" ou de
   * qualquer outra pista seria a mesma classe de atalho que esta casa já pagou caro em outros
   * lugares (ver `motivoDaRecusa` decidindo por texto em vez de campo).
   */
  escopo: EscopoDaCredencial;
  sessionId?: string;
};

/**
 * Emite a credencial que acompanha UMA pergunta.
 *
 * Os campos vão com nomes curtos (`o`, `u`, `f`, `c`) por um motivo de segurança, não de
 * economia: o cookie de sessão do Lúmen é assinado com o MESMO segredo e identifica o usuário
 * pelo campo `userId` (ver lib/auth.ts). Se esta credencial também usasse `userId`, ela seria
 * aceita como um cookie de sessão válido — um crachá de consulta viraria um crachá de login. Com
 * outro nome de campo, `verifySession` a rejeita, como deve. `c` (escopo) segue a mesma regra:
 * nenhum claim de sessão existente usa esse nome.
 */
export async function emitirCredencial(p: PermissaoDaPergunta): Promise<string> {
  return new SignJWT({ o: p.officeId, u: p.userId, f: p.financeiro, a: p.admin, s: p.sessionId ?? "", c: p.escopo })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(PUBLICO)
    .setIssuedAt()
    .setExpirationTime(validadeDoEscopo(p.escopo))
    .sign(segredo());
}

/** Lê a credencial. Devolve nulo em qualquer problema — expirada, adulterada ou de outro uso. */
export async function lerCredencial(token: string): Promise<PermissaoDaPergunta | null> {
  try {
    const { payload } = await jwtVerify(token, segredo(), { audience: PUBLICO });
    const officeId = typeof payload.o === "string" ? payload.o : "";
    const userId = typeof payload.u === "string" ? payload.u : "";
    if (!officeId || !userId) return null;
    return {
      officeId,
      userId,
      financeiro: payload.f === true,
      // `=== true` e não coerção: uma credencial antiga (emitida antes deste campo existir) não
      // tem `a`, e `undefined` tem de virar FALSO. O erro na outra direção daria indicador de
      // escritório a quem não é sócio, em silêncio, durante a janela de cinco minutos em que
      // credenciais antigas ainda valem depois de um deploy.
      admin: payload.a === true,
      // `=== "peticionamento"` e não coerção, pelo MESMO raciocínio de `admin` acima, e FAIL
      // CLOSED de propósito: uma credencial sem `c` (emitida antes deste campo existir, ou
      // qualquer valor que não seja exatamente a string esperada) vale como "conversa" — o
      // escopo mais curto e mais restrito, nunca o de peticionamento. O erro na outra direção
      // daria à credencial de chat comum a vida longa e o alcance de ferramentas pensados para
      // uma minuta inteira, em silêncio, durante a janela de deploy em que credenciais antigas
      // ainda valem.
      escopo: payload.c === "peticionamento" ? "peticionamento" : "conversa",
      sessionId: typeof payload.s === "string" && payload.s ? payload.s : undefined,
    };
  } catch {
    return null;
  }
}
