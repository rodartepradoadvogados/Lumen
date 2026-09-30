import { NextRequest, NextResponse } from "next/server";
import { acessoAoAtendimentoDaRota } from "@/lib/guardaDoAtendimento";
import { desinscreverAparelho, estadoDoPush, inscreverAparelho, portasReaisDaInscricao } from "@/lib/inscricaoDePush";

export const dynamic = "force-dynamic";

const SEM_CACHE = { "Cache-Control": "no-store" };

// O AVISO DE MENSAGEM NOVA (Web Push) do aplicativo de Atendimento — inscrever e desinscrever o aparelho.
//   GET     -> { disponivel, chavePublica }   (o servidor tem as chaves VAPID? a pública, para o aparelho se inscrever)
//   POST    -> { subscription } | a própria inscrição   (registra ou renova o aparelho da pessoa da sessão)
//   DELETE  -> { endpoint }                              (apaga o aparelho, só se for da própria pessoa)
// A guarda vem ANTES de tudo (401 sem sessão, 403 sem acesso ao Atendimento). A decisão e as validações
// (inclusive o freio de endereços de push) moram em lib/inscricaoDePush.ts, provadas em atendimentoAppPush.teste.ts.

async function guarda() {
  return acessoAoAtendimentoDaRota();
}

export async function GET() {
  const g = await guarda();
  if (g.erro) return g.erro;
  const r = estadoDoPush(g.viewer);
  return NextResponse.json(r.corpo, { status: r.status, headers: SEM_CACHE });
}

export async function POST(req: NextRequest) {
  const g = await guarda();
  if (g.erro) return g.erro;
  const r = await inscreverAparelho(g.viewer, await req.text(), req.headers.get("user-agent"), portasReaisDaInscricao);
  return NextResponse.json(r.corpo, { status: r.status, headers: SEM_CACHE });
}

export async function DELETE(req: NextRequest) {
  const g = await guarda();
  if (g.erro) return g.erro;
  const r = await desinscreverAparelho(g.viewer, await req.text(), portasReaisDaInscricao);
  return NextResponse.json(r.corpo, { status: r.status, headers: SEM_CACHE });
}
