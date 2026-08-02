// DJEN (Diário de Justiça Eletrônico Nacional / CNJ) — fonte oficial e gratuita de
// intimações, citações, despachos e publicações, consultável por número de OAB.
// https://comunica.pje.jus.br / API pública: https://comunicaapi.pje.jus.br/api/v1
//
// Esta etapa é apenas de teste/validação: busca uma amostra bruta da API para
// conferirmos juntos o formato real da resposta antes de ligar a sincronização
// automática (que ainda vai gravar em Publication, como o Jusbrasil por e-mail).

import { prisma } from "@/lib/prisma";
import { ProxyAgent, type Dispatcher } from "undici";

const DJEN_PUBLIC_PAGE = "https://comunica.pje.jus.br/consulta";
const DJEN_API_BASE = "https://comunicaapi.pje.jus.br/api/v1/comunicacao";

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "pt-BR,pt;q=0.9",
};

const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SE", "SP", "TO"];

// Extrai número e UF da OAB a partir do texto livre cadastrado em cada usuário
// (Configurações → Equipe & Acesso), ex.: "OAB/GO 78.295" ou "78295-GO". Usa uma
// lista de UFs válidas (em vez de "quaisquer 2 letras") para não confundir com
// as letras de "OAB".
function parseOab(raw: string): { numeroOab: string; ufOab: string } | null {
  const ufMatch = raw.toUpperCase().match(new RegExp(`\\b(${UFS.join("|")})\\b`));
  const numeroMatch = raw.match(/\d[\d.]{3,}/);
  if (!ufMatch || !numeroMatch) return null;
  return { numeroOab: numeroMatch[0].replace(/\D/g, ""), ufOab: ufMatch[1] };
}

// As OABs monitoradas pelo DJEN vêm dos usuários ativos com OAB cadastrada
// (Configurações → Equipe & Acesso) — não é mais uma lista fixa no código.
export async function getDjenTargets(officeId: string): Promise<{ label: string; numeroOab: string; ufOab: string }[]> {
  const users = await prisma.user.findMany({ where: { officeId, active: true, oab: { not: null } }, select: { name: true, oab: true } });
  const targets: { label: string; numeroOab: string; ufOab: string }[] = [];
  for (const u of users) {
    const parsed = u.oab ? parseOab(u.oab) : null;
    if (parsed) targets.push({ label: u.name, ...parsed });
  }
  return targets;
}

export type DjenTestResult = {
  label: string;
  numeroOab: string;
  ufOab: string;
  ok: boolean;
  status?: number;
  error?: string;
  sample?: unknown;
  cookieObtained?: boolean;
};

// O CNJ bloqueia por padrão requisições vindas de IPs de datacenter/nuvem (Vercel incluso,
// mesmo bloqueio já documentado para o robô Python em robo-publicacoes/README.md). Reaproveita
// o mesmo proxy residencial contratado para o robô — DJEN_PROXY_URL precisa estar configurada
// tanto no Railway (robô) quanto aqui (Vercel), com o mesmo valor.
function djenDispatcher(): Dispatcher | undefined {
  const proxyUrl = process.env.DJEN_PROXY_URL;
  return proxyUrl ? new ProxyAgent(proxyUrl) : undefined;
}

// `fetch` (undici) lança só "TypeError: fetch failed" no erro principal — o motivo real
// (timeout, DNS, proxy recusou conexão, etc.) fica em `.cause`, às vezes em mais de um nível.
// Sem isso, todo problema de rede/proxy aparece igual na tela, sem pista nenhuma pra debugar.
function describeFetchError(e: unknown): string {
  if (!(e instanceof Error)) return "erro desconhecido ao conectar no DJEN";
  const parts: string[] = [e.message];
  let cause: unknown = (e as { cause?: unknown }).cause;
  let depth = 0;
  while (cause && depth < 3) {
    if (cause instanceof Error) {
      const code = (cause as { code?: string }).code;
      parts.push(code ? `${cause.message} (${code})` : cause.message);
      cause = (cause as { cause?: unknown }).cause;
    } else {
      parts.push(String(cause));
      cause = undefined;
    }
    depth += 1;
  }
  return parts.join(" — causa: ");
}

// Visita a página pública de consulta primeiro (como um navegador faria) para capturar
// eventuais cookies de sessão/anti-bot antes de chamar a API — a API sozinha responde 403.
async function getSessionCookie(): Promise<string | null> {
  const res = await fetch(DJEN_PUBLIC_PAGE, {
    headers: { ...BROWSER_HEADERS, Accept: "text/html" },
    dispatcher: djenDispatcher(),
  } as RequestInit & { dispatcher?: Dispatcher });
  const setCookie = res.headers.get("set-cookie");
  return setCookie ? setCookie.split(";")[0] : null;
}

async function fetchDjenRaw(numeroOab: string, ufOab: string, cookie: string | null): Promise<{ status: number; body: unknown; parseFailed: boolean }> {
  const url = `${DJEN_API_BASE}?numeroOab=${encodeURIComponent(numeroOab)}&ufOab=${encodeURIComponent(ufOab)}&itensPorPagina=5`;
  const res = await fetch(url, {
    headers: {
      ...BROWSER_HEADERS,
      Accept: "application/json",
      Referer: DJEN_PUBLIC_PAGE,
      Origin: "https://comunica.pje.jus.br",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    dispatcher: djenDispatcher(),
  } as RequestInit & { dispatcher?: Dispatcher });
  const status = res.status;
  let body: unknown;
  let parseFailed = false;
  try {
    body = await res.json();
  } catch {
    body = await res.text().catch(() => null);
    parseFailed = true;
  }
  return { status, body, parseFailed };
}

export async function testDjenConnection(officeId: string): Promise<DjenTestResult[]> {
  const results: DjenTestResult[] = [];
  const targets = await getDjenTargets(officeId);

  let cookie: string | null = null;
  try {
    cookie = await getSessionCookie();
  } catch {
    cookie = null;
  }

  for (const target of targets) {
    try {
      const { status, body, parseFailed } = await fetchDjenRaw(target.numeroOab, target.ufOab, cookie);
      const ok = status >= 200 && status < 300 && !parseFailed;
      // O CNJ bloqueia por padrão requisições vindas de IPs de datacenter (como o do nosso
      // servidor) com 403 — não é um bug do site, é um bloqueio de infraestrutura do lado do
      // DJEN. Sem um proxy residencial pago, não há como contornar isso a partir do servidor.
      const error = !ok
        ? status === 403
          ? "DJEN bloqueou a conexão (403) por vir de um servidor/datacenter, não de um navegador comum. É um bloqueio do próprio CNJ, não um erro do sistema — só seria contornável com um proxy residencial pago."
          : parseFailed
          ? `DJEN respondeu (status ${status}) mas em um formato que não conseguimos interpretar.`
          : `DJEN respondeu com status ${status}.`
        : undefined;
      results.push({
        label: target.label,
        numeroOab: target.numeroOab,
        ufOab: target.ufOab,
        ok,
        status,
        sample: ok ? body : undefined,
        error,
        cookieObtained: Boolean(cookie),
      });
    } catch (e) {
      results.push({
        label: target.label,
        numeroOab: target.numeroOab,
        ufOab: target.ufOab,
        ok: false,
        error: describeFetchError(e),
        cookieObtained: Boolean(cookie),
      });
    }
  }
  return results;
}
