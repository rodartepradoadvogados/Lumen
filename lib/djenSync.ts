// DJEN (Diário de Justiça Eletrônico Nacional / CNJ) — fonte oficial e gratuita de
// intimações, citações, despachos e publicações, consultável por número de OAB.
// https://comunica.pje.jus.br / API pública: https://comunicaapi.pje.jus.br/api/v1
//
// Esta etapa é apenas de teste/validação: busca uma amostra bruta da API para
// conferirmos juntos o formato real da resposta antes de ligar a sincronização
// automática (que ainda vai gravar em Publication, como o Jusbrasil por e-mail).

const DJEN_PUBLIC_PAGE = "https://comunica.pje.jus.br/consulta";
const DJEN_API_BASE = "https://comunicaapi.pje.jus.br/api/v1/comunicacao";

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "pt-BR,pt;q=0.9",
};

export const DJEN_OAB_TARGETS = [
  { label: "Jairo Rodarte", numeroOab: "78295", ufOab: "GO" },
  { label: "Rodrigo Prado", numeroOab: "32943", ufOab: "GO" },
];

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

// Visita a página pública de consulta primeiro (como um navegador faria) para capturar
// eventuais cookies de sessão/anti-bot antes de chamar a API — a API sozinha responde 403.
async function getSessionCookie(): Promise<string | null> {
  const res = await fetch(DJEN_PUBLIC_PAGE, {
    headers: { ...BROWSER_HEADERS, Accept: "text/html" },
  });
  const setCookie = res.headers.get("set-cookie");
  return setCookie ? setCookie.split(";")[0] : null;
}

async function fetchDjenRaw(numeroOab: string, ufOab: string, cookie: string | null): Promise<{ status: number; body: unknown }> {
  const url = `${DJEN_API_BASE}?numeroOab=${encodeURIComponent(numeroOab)}&ufOab=${encodeURIComponent(ufOab)}&itensPorPagina=5`;
  const res = await fetch(url, {
    headers: {
      ...BROWSER_HEADERS,
      Accept: "application/json",
      Referer: DJEN_PUBLIC_PAGE,
      Origin: "https://comunica.pje.jus.br",
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });
  const status = res.status;
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = await res.text().catch(() => null);
  }
  return { status, body };
}

export async function testDjenConnection(): Promise<DjenTestResult[]> {
  const results: DjenTestResult[] = [];

  let cookie: string | null = null;
  try {
    cookie = await getSessionCookie();
  } catch {
    cookie = null;
  }

  for (const target of DJEN_OAB_TARGETS) {
    try {
      const { status, body } = await fetchDjenRaw(target.numeroOab, target.ufOab, cookie);
      results.push({
        label: target.label,
        numeroOab: target.numeroOab,
        ufOab: target.ufOab,
        ok: status >= 200 && status < 300,
        status,
        sample: body,
        cookieObtained: Boolean(cookie),
      });
    } catch (e) {
      results.push({
        label: target.label,
        numeroOab: target.numeroOab,
        ufOab: target.ufOab,
        ok: false,
        error: e instanceof Error ? e.message : "erro desconhecido ao conectar no DJEN",
        cookieObtained: Boolean(cookie),
      });
    }
  }
  return results;
}
