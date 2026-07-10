// DJEN (Diário de Justiça Eletrônico Nacional / CNJ) — fonte oficial e gratuita de
// intimações, citações, despachos e publicações, consultável por número de OAB.
// https://comunica.pje.jus.br / API pública: https://comunicaapi.pje.jus.br/api/v1
//
// Esta etapa é apenas de teste/validação: busca uma amostra bruta da API para
// conferirmos juntos o formato real da resposta antes de ligar a sincronização
// automática (que ainda vai gravar em Publication, como o Jusbrasil por e-mail).

const DJEN_API_BASE = "https://comunicaapi.pje.jus.br/api/v1/comunicacao";

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
};

async function fetchDjenRaw(numeroOab: string, ufOab: string): Promise<{ status: number; body: unknown }> {
  const url = `${DJEN_API_BASE}?numeroOab=${encodeURIComponent(numeroOab)}&ufOab=${encodeURIComponent(ufOab)}&itensPorPagina=5`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Referer: "https://comunica.pje.jus.br/",
      Origin: "https://comunica.pje.jus.br",
      "Accept-Language": "pt-BR,pt;q=0.9",
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
  for (const target of DJEN_OAB_TARGETS) {
    try {
      const { status, body } = await fetchDjenRaw(target.numeroOab, target.ufOab);
      results.push({
        label: target.label,
        numeroOab: target.numeroOab,
        ufOab: target.ufOab,
        ok: status >= 200 && status < 300,
        status,
        sample: body,
      });
    } catch (e) {
      results.push({
        label: target.label,
        numeroOab: target.numeroOab,
        ufOab: target.ufOab,
        ok: false,
        error: e instanceof Error ? e.message : "erro desconhecido ao conectar no DJEN",
      });
    }
  }
  return results;
}
