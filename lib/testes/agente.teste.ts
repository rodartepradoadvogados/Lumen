import { SignJWT } from "jose";
import { teste, igual, verdade, resumo } from "./executar";
import { emitirCredencial, lerCredencial } from "@/lib/agenteCredencial";
import { verifySession, signSession } from "@/lib/auth";
import { rotulosDeProcedencia, rotuloDaFerramenta } from "@/lib/agenteProcedencia";

// ============================================================================
// A REGRA INEXORÁVEL, PROVADA.
//
// "O agente tem acesso ao escritório, mas só pode responder sobre o financeiro a quem tenha o
// acesso ao financeiro do escritório." Isso estava escrito em comentários e verificado à mão uma
// vez. Comentário não impede regressão; teste impede.
//
// O que se prova aqui é a CAMADA DA CREDENCIAL: se ela carrega a permissão fielmente, se ela se
// recusa a ser confundida com um crachá de login, e se ela morre quando deve. A camada de cima
// (a rota das ferramentas barrar a ferramenta financeira) depende desta: sem credencial confiável,
// nenhuma checagem lá em cima vale.
// ============================================================================

// O segredo dos testes é de mentira e existe só neste processo. Os dois módulos leem
// `process.env.AUTH_SECRET` na hora de assinar, e não na hora de carregar — por isso basta
// defini-lo aqui, antes do primeiro caso rodar.
process.env.AUTH_SECRET = "segredo-de-teste-que-nao-abre-nada-em-lugar-nenhum";

const CHAVE = new TextEncoder().encode(process.env.AUTH_SECRET);
const PUBLICO = "lumen-agente-ferramentas";

// ── A credencial carrega a permissão, e só ela ───────────────────────────────────────────────

teste("quem tem acesso ao financeiro atravessa com ele", async () => {
  const t = await emitirCredencial({ officeId: "esc1", userId: "u1", financeiro: true, sessionId: "s1" });
  const p = await lerCredencial(t);
  igual(p, { officeId: "esc1", userId: "u1", financeiro: true, sessionId: "s1" });
});

teste("quem NÃO tem acesso ao financeiro não o adquire no caminho", async () => {
  const t = await emitirCredencial({ officeId: "esc1", userId: "u2", financeiro: false });
  const p = await lerCredencial(t);
  verdade(p, "a credencial deveria ser válida");
  igual(p!.financeiro, false, "financeiro: ");
  igual(p!.sessionId, undefined, "sessionId: ");
});

teste("um 'f' que não seja exatamente `true` não vale acesso", async () => {
  // Forjado de propósito com o segredo certo: o ataque interessante não é o de fora, é o campo
  // com valor quase-certo. `payload.f === true` é o que separa "tem acesso" de "parece ter".
  for (const valor of ["true", 1, "1", {}, [], "sim"]) {
    const t = await new SignJWT({ o: "esc1", u: "u3", f: valor, s: "" })
      .setProtectedHeader({ alg: "HS256" })
      .setAudience(PUBLICO)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(CHAVE);
    const p = await lerCredencial(t);
    verdade(p, `a credencial com f=${JSON.stringify(valor)} deveria ser legível`);
    igual(p!.financeiro, false, `f=${JSON.stringify(valor)} deveria NÃO dar acesso: `);
  }
});

teste("sem escritório ou sem usuário, não é credencial", async () => {
  for (const carga of [{ o: "", u: "u1" }, { o: "esc1", u: "" }, { o: "esc1" }, { u: "u1" }]) {
    const t = await new SignJWT({ ...carga, f: true })
      .setProtectedHeader({ alg: "HS256" })
      .setAudience(PUBLICO)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(CHAVE);
    igual(await lerCredencial(t), null, `${JSON.stringify(carga)}: `);
  }
});

// ── A credencial morre e não se deixa adulterar ──────────────────────────────────────────────

teste("credencial vencida não abre nada", async () => {
  const t = await new SignJWT({ o: "esc1", u: "u1", f: true, s: "" })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(PUBLICO)
    .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
    .sign(CHAVE);
  igual(await lerCredencial(t), null);
});

teste("credencial adulterada não abre nada", async () => {
  const t = await emitirCredencial({ officeId: "esc1", userId: "u1", financeiro: false });
  const [cabeca, carga, assinatura] = t.split(".");
  // Troca a carga por uma que concede o financeiro, mantendo a assinatura antiga.
  const outraCarga = Buffer.from(
    JSON.stringify({ ...JSON.parse(Buffer.from(carga, "base64url").toString()), f: true }),
  ).toString("base64url");
  igual(await lerCredencial(`${cabeca}.${outraCarga}.${assinatura}`), null);
});

teste("credencial assinada com outro segredo não abre nada", async () => {
  const t = await new SignJWT({ o: "esc1", u: "u1", f: true, s: "" })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(PUBLICO)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode("outro-segredo-qualquer-com-tamanho-suficiente"));
  igual(await lerCredencial(t), null);
});

// ── Os dois crachás não se confundem ─────────────────────────────────────────────────────────
//
// Cookie de sessão e credencial de ferramenta são assinados com o MESMO segredo. Se um passasse
// pelo outro, quem interceptasse uma credencial de consulta estaria logado no sistema — ou o
// agente, de posse de um cookie, consultaria em nome de qualquer um. É o motivo de os campos se
// chamarem `o`/`u`/`f` e de haver `aud`.

teste("um cookie de sessão NÃO serve como credencial de ferramenta", async () => {
  igual(await lerCredencial(await signSession("u1")), null);
});

teste("uma credencial de ferramenta NÃO serve como cookie de sessão", async () => {
  const t = await emitirCredencial({ officeId: "esc1", userId: "u1", financeiro: true });
  igual(await verifySession(t), null);
});

teste("um token com o público errado não é credencial", async () => {
  const t = await new SignJWT({ o: "esc1", u: "u1", f: true, s: "" })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("outro-publico")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(CHAVE);
  igual(await lerCredencial(t), null);
});

teste("lixo não é credencial", async () => {
  for (const t of ["", "abc", "a.b.c", "Bearer x", "null"]) {
    igual(await lerCredencial(t), null, `${JSON.stringify(t)}: `);
  }
});

// ── A linha de procedência ───────────────────────────────────────────────────────────────────

teste("a procedência não repete a mesma fonte", () => {
  igual(
    rotulosDeProcedencia(["consultar_processos", "consultar_processos", "consultar_agenda"]),
    ["processos do escritório", "agenda"],
  );
});

teste("a procedência não lista o próprio agente como fonte", () => {
  igual(rotulosDeProcedencia(["hermes", "consultar_agenda", "hermes"]), ["agenda"]);
});

teste("a procedência preserva a ordem em que foi consultada", () => {
  igual(
    rotulosDeProcedencia(["consultar_agenda", "consultar_processos", "consultar_agenda"]),
    ["agenda", "processos do escritório"],
  );
});

teste("uma ferramenta nova ganha rótulo legível em vez do nome de código", () => {
  igual(rotuloDaFerramenta("consultar_prazos_do_mes"), "prazos do mes");
  igual(rotuloDaFerramenta("buscar_parte_contraria"), "parte contraria");
});

teste("cada ferramenta de hoje tem rótulo em português", () => {
  for (const nome of [
    "consultar_processos",
    "consultar_publicacoes",
    "consultar_agenda",
    "consultar_atendimento",
    "buscar_cliente",
    "consultar_financeiro",
  ]) {
    const r = rotuloDaFerramenta(nome);
    verdade(!r.includes("_"), `${nome} caiu no rótulo genérico ("${r}")`);
  }
});

void resumo("agente");
