import { NextRequest, NextResponse } from "next/server";
import { varrerGeracoesDeMinutaPendentes } from "@/lib/peticionamentoGeracaoAssincrona";

// Várias sessões por rodada, cada uma custando uma pergunta curta à ponte (`GET /resultado/<id>`,
// teto de 15s) mais a gravação da minuta — 300s (mesmo teto de app/api/cron/transcricoes-pendentes,
// avisos-de-figurinha, drive-sync, comunicados-outbox, daily-agenda e resumo-diario) sobra para as
// 20 sessões do teto por rodada; o que passar disso espera a próxima (a cada 5 minutos, ver
// vercel.json), sem problema — cada sessão é reconsiderada do zero.
export const maxDuration = 300;

// A REDE DE SEGURANÇA DO PETICIONAMENTO.
//
// É ELA que torna verdadeira a frase que a tela mostra ao advogado enquanto o agente redige:
// "pode fechar a aba". A tela acompanha enquanto ele estiver olhando; quando ele fecha, não sobra
// ninguém para colher a peça pronta — ela venceria na memória da ponte
// (HERMES_TAREFA_VALIDADE_S) e a sessão ficaria em GERANDO para sempre, com todo o trabalho (e o
// custo das chamadas de modelo) jogado fora em silêncio.
//
// Mesmo desenho de app/api/cron/transcricoes-pendentes e app/api/cron/avisos-de-figurinha,
// inclusive a reivindicação atômica que impede a tela e esta varredura de gravarem a mesma minuta
// duas vezes (ver lib/peticionamentoGeracaoAssincrona.ts). Roda a cada 5 minutos, o mesmo
// intervalo dos dois.
//
// FAIL-CLOSED, como todo endpoint que recebe requisição de fora: sem CRON_SECRET configurado, a
// rota recusa — nunca "por segurança ser opcional".
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await varrerGeracoesDeMinutaPendentes();
  return NextResponse.json(result, { status: 200 });
}
