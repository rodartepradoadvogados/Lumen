import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";

export const dynamic = "force-dynamic";

// Rota de diagnóstico do COLETOR DE LICITAÇÕES DO PNCP — existe porque o robô Python
// (robo-publicacoes/src/pncp.py) foi escrito num ambiente SEM acesso à internet nem ao
// Postgres de produção: o mapeamento de nomes de campo da resposta do PNCP (ver aviso no topo
// daquele arquivo) é uma tentativa defensiva, nunca confirmada contra uma resposta real. Esta
// rota faz UMA chamada de verdade à API pública do PNCP (janela de 1 dia, uma modalidade) e
// devolve o status HTTP, a quantidade de itens recebidos e as CHAVES do primeiro item — é
// assim que o dono do escritório confirma, em produção, se `_normalizar_item()` em pncp.py
// está tentando os nomes de campo certos (e corrige o arquivo se não estiver).
//
// Uso: GET /api/admin/testar-pncp (logado como admin do escritório)
//      GET /api/admin/testar-pncp?uf=GO&modalidade=6  (parâmetros opcionais)

const BASE_URL = "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao";

// Mesmo User-Agent de navegador usado em robo-publicacoes/src/http_client.py — há relato de que
// o WAF do PNCP descarta requisição sem isso.
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function formatarAAAAMMDD(d: Date): string {
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${ano}${mes}${dia}`;
}

export async function GET(req: NextRequest) {
  const viewer = await getCurrentUser();
  if (!viewer?.isAdmin) {
    return NextResponse.json({ error: "Apenas administradores podem rodar isso." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  const uf = req.nextUrl.searchParams.get("uf") || "GO";
  const modalidadeParam = req.nextUrl.searchParams.get("modalidade");
  const modalidade = modalidadeParam ? parseInt(modalidadeParam, 10) : 6; // 6 = Pregão - Eletrônico (melhor-esforço, ver src/pncp.py)

  const hoje = new Date();
  const params = new URLSearchParams({
    dataInicial: formatarAAAAMMDD(hoje),
    dataFinal: formatarAAAAMMDD(hoje),
    codigoModalidadeContratacao: String(Number.isFinite(modalidade) ? modalidade : 6),
    uf,
    pagina: "1",
    tamanhoPagina: "10",
  });

  const url = `${BASE_URL}?${params.toString()}`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": BROWSER_USER_AGENT, Accept: "application/json" },
      cache: "no-store",
    });

    const status = res.status;
    if (!res.ok) {
      const corpo = await res.text().catch(() => "");
      return NextResponse.json(
        { status, quantidadeItens: 0, chavesPrimeiroItem: null, erro: `PNCP respondeu ${status}: ${corpo.slice(0, 500)}`, urlConsultada: url },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    let payload: unknown;
    try {
      payload = await res.json();
    } catch {
      return NextResponse.json(
        { status, quantidadeItens: 0, chavesPrimeiroItem: null, erro: "Resposta não é JSON válido.", urlConsultada: url },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    // Tentamos os mesmos envelopes prováveis de robo-publicacoes/src/pncp.py:_extrair_lista_itens
    // — se nenhum bater, devolvemos as chaves do payload bruto para ajudar a identificar o
    // formato real (em vez de simplesmente reportar "0 itens" sem contexto nenhum).
    let itens: unknown[] = [];
    if (Array.isArray(payload)) {
      itens = payload;
    } else if (payload && typeof payload === "object") {
      for (const chave of ["data", "items", "content", "resultado"]) {
        const valor = (payload as Record<string, unknown>)[chave];
        if (Array.isArray(valor)) {
          itens = valor;
          break;
        }
      }
    }

    const primeiroItem = itens[0];
    const chavesPrimeiroItem =
      primeiroItem && typeof primeiroItem === "object" ? Object.keys(primeiroItem as Record<string, unknown>) : null;

    return NextResponse.json(
      {
        status,
        quantidadeItens: itens.length,
        chavesPrimeiroItem,
        chavesRespostaBruta: payload && typeof payload === "object" && !Array.isArray(payload) ? Object.keys(payload as object) : null,
        primeiroItemAmostra: primeiroItem ?? null,
        urlConsultada: url,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    // Falha de rede (timeout, DNS, conexão recusada) — nunca deixa a rota quebrar sem
    // resposta; devolve o erro pra diagnóstico (ex.: rodando isso de um ambiente sem rede).
    const message = e instanceof Error ? e.message : "erro desconhecido";
    return NextResponse.json(
      { status: 0, quantidadeItens: 0, chavesPrimeiroItem: null, erro: `Falha de rede: ${message}`, urlConsultada: url },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}
