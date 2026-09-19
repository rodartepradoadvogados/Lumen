import { SignJWT, jwtVerify } from "jose";

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
// VIDA CURTA. Cinco minutos. O Hermes pode levar até dois para responder; o resto é folga. Uma
// credencial que vaze depois disso não abre nada.

const PUBLICO = "lumen-agente-ferramentas";
const VALIDADE = "5m";

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
  sessionId?: string;
};

/**
 * Emite a credencial que acompanha UMA pergunta.
 *
 * Os campos vão com nomes curtos (`o`, `u`, `f`) por um motivo de segurança, não de economia: o
 * cookie de sessão do Lúmen é assinado com o MESMO segredo e identifica o usuário pelo campo
 * `userId` (ver lib/auth.ts). Se esta credencial também usasse `userId`, ela seria aceita como um
 * cookie de sessão válido — um crachá de consulta viraria um crachá de login. Com outro nome de
 * campo, `verifySession` a rejeita, como deve.
 */
export async function emitirCredencial(p: PermissaoDaPergunta): Promise<string> {
  return new SignJWT({ o: p.officeId, u: p.userId, f: p.financeiro, s: p.sessionId ?? "" })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(PUBLICO)
    .setIssuedAt()
    .setExpirationTime(VALIDADE)
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
      sessionId: typeof payload.s === "string" && payload.s ? payload.s : undefined,
    };
  } catch {
    return null;
  }
}
