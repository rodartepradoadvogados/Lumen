import { prisma } from "@/lib/prisma";
import { podeVerAtendimentos, SEM_ACESSO_AO_ATENDIMENTO, type QuemOlha } from "@/lib/acessoAtendimento";
import { lerConfiguracaoVapid } from "@/lib/pushDoAtendimento";

// ============================================================================
// INSCREVER E DESINSCREVER O APARELHO no aviso de mensagem nova (rota /api/atendimento/push).
//
// A decisão mora aqui, com as portas (banco) injetáveis, para o teste provar sem servidor:
//   401 sem sessão · 403 sem acesso ao Atendimento · 503 quando o servidor não tem VAPID (fail-closed)
//   · 400 para inscrição malformada · a linha é SEMPRE do usuário da sessão (o corpo nunca escolhe o dono).
//
// O ENDEREÇO DA INSCRIÇÃO É ENTRADA DE QUEM CHAMA — e o servidor vai fazer um POST para ele. Sem freio,
// qualquer pessoa autenticada usaria o Lúmen para bater em qualquer endereço da internet (SSRF cego).
// Por isso só entram os endereços dos serviços de push que os navegadores usam (Google, Mozilla, Apple,
// Microsoft), em HTTPS.
// ============================================================================

const MAX_INSCRICOES_POR_PESSOA = 10;
const MAX_CORPO = 4_096;

const HOSTS_EXATOS = new Set(["fcm.googleapis.com", "android.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"]);
const SUFIXOS = [".push.services.mozilla.com", ".push.apple.com", ".notify.windows.com"];

/** O endereço é de um serviço de push conhecido, em https, sem credencial nem porta estranha. */
export function enderecoDePushPermitido(endereco: string): boolean {
  let u: URL;
  try {
    u = new URL(endereco);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return false;
  const host = u.hostname.toLowerCase();
  return HOSTS_EXATOS.has(host) || SUFIXOS.some((s) => host.endsWith(s));
}

const BASE64URL = /^[A-Za-z0-9_-]+$/;

export type InscricaoValida = { endpoint: string; p256dh: string; auth: string };

/** Confere a forma da inscrição que o navegador entrega (`PushSubscription.toJSON()`). */
export function lerInscricao(corpo: unknown): { ok: true; inscricao: InscricaoValida } | { ok: false; erro: string } {
  const c = corpo as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  const endpoint = typeof c?.endpoint === "string" ? c.endpoint : "";
  const p256dh = typeof c?.keys?.p256dh === "string" ? c.keys.p256dh : "";
  const auth = typeof c?.keys?.auth === "string" ? c.keys.auth : "";
  if (!endpoint || endpoint.length > 2_048 || !enderecoDePushPermitido(endpoint)) return { ok: false, erro: "Inscrição inválida." };
  if (!BASE64URL.test(p256dh) || p256dh.length > 200 || !BASE64URL.test(auth) || auth.length > 100) return { ok: false, erro: "Inscrição inválida." };
  return { ok: true, inscricao: { endpoint, p256dh, auth } };
}

export type PortasDaInscricao = {
  gravar(dados: { officeId: string; userId: string; userAgent: string | null } & InscricaoValida): Promise<void>;
  apagar(userId: string, endpoint: string): Promise<void>;
};

export type Viewer = (QuemOlha & { id: string; officeId: string }) | null;
export type RespostaDoPush = { status: number; corpo: Record<string, unknown> };

/** GET: o servidor está pronto para avisar? Devolve a chave pública para o aparelho se inscrever. */
export function estadoDoPush(viewer: Viewer, env: Record<string, string | undefined> = process.env): RespostaDoPush {
  if (!viewer) return { status: 401, corpo: { error: "Não autenticado" } };
  if (!podeVerAtendimentos(viewer)) return { status: 403, corpo: { error: SEM_ACESSO_AO_ATENDIMENTO } };
  const cfg = lerConfiguracaoVapid(env);
  return { status: 200, corpo: cfg ? { disponivel: true, chavePublica: cfg.publica } : { disponivel: false, chavePublica: null } };
}

/** POST: registra (ou renova) o aparelho da pessoa da sessão. */
export async function inscreverAparelho(
  viewer: Viewer,
  textoDoCorpo: string,
  userAgent: string | null,
  portas: PortasDaInscricao,
  env: Record<string, string | undefined> = process.env,
): Promise<RespostaDoPush> {
  if (!viewer) return { status: 401, corpo: { error: "Não autenticado" } };
  if (!podeVerAtendimentos(viewer)) return { status: 403, corpo: { error: SEM_ACESSO_AO_ATENDIMENTO } };
  if (!lerConfiguracaoVapid(env)) return { status: 503, corpo: { error: "O aviso de mensagem nova está indisponível neste servidor." } };
  if (textoDoCorpo.length > MAX_CORPO) return { status: 400, corpo: { error: "Inscrição inválida." } };
  let bruto: unknown;
  try {
    bruto = JSON.parse(textoDoCorpo);
  } catch {
    return { status: 400, corpo: { error: "Inscrição inválida." } };
  }
  const lida = lerInscricao((bruto as { subscription?: unknown } | null)?.subscription ?? bruto);
  if (!lida.ok) return { status: 400, corpo: { error: lida.erro } };
  await portas.gravar({ officeId: viewer.officeId, userId: viewer.id, userAgent: userAgent ? userAgent.slice(0, 300) : null, ...lida.inscricao });
  return { status: 200, corpo: { ok: true } };
}

/** DELETE: apaga o aparelho — SÓ se for da própria pessoa da sessão. Sempre 200 (apagar o que não existe é ok). */
export async function desinscreverAparelho(viewer: Viewer, textoDoCorpo: string, portas: PortasDaInscricao): Promise<RespostaDoPush> {
  if (!viewer) return { status: 401, corpo: { error: "Não autenticado" } };
  if (!podeVerAtendimentos(viewer)) return { status: 403, corpo: { error: SEM_ACESSO_AO_ATENDIMENTO } };
  let endpoint = "";
  try {
    const c = JSON.parse(textoDoCorpo.slice(0, MAX_CORPO)) as { endpoint?: unknown } | null;
    endpoint = typeof c?.endpoint === "string" ? c.endpoint : "";
  } catch {
    /* corpo vazio ou torto: nada a apagar */
  }
  if (!endpoint || endpoint.length > 2_048) return { status: 400, corpo: { error: "Informe o aparelho a desinscrever." } };
  await portas.apagar(viewer.id, endpoint);
  return { status: 200, corpo: { ok: true } };
}

export const portasReaisDaInscricao: PortasDaInscricao = {
  async gravar({ officeId, userId, userAgent, endpoint, p256dh, auth }) {
    const agora = new Date();
    // O endereço é único: o mesmo aparelho que passa a ser de OUTRA pessoa (troca de conta) muda de dono.
    await prisma.atendimentoPushInscricao.upsert({
      where: { endpoint },
      create: { officeId, userId, endpoint, p256dh, auth, userAgent, lastSeen: agora },
      update: { officeId, userId, p256dh, auth, userAgent, lastSeen: agora },
    });
    // Teto por pessoa: as mais antigas (aparelhos abandonados) saem primeiro.
    const suas = await prisma.atendimentoPushInscricao.findMany({ where: { userId }, orderBy: { lastSeen: "desc" }, select: { id: true } });
    if (suas.length > MAX_INSCRICOES_POR_PESSOA) {
      await prisma.atendimentoPushInscricao.deleteMany({ where: { id: { in: suas.slice(MAX_INSCRICOES_POR_PESSOA).map((s) => s.id) } } });
    }
  },
  async apagar(userId, endpoint) {
    await prisma.atendimentoPushInscricao.deleteMany({ where: { userId, endpoint } });
  },
};
