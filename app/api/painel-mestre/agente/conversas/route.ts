import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { getPlatformMember, type PlatformViewer } from "@/lib/platformMember";
import { listarConversasDoMembro } from "@/lib/painelMestreConversas";

export const dynamic = "force-dynamic";

// Lista as conversas anteriores do agente do Painel Mestre para a barra lateral da tela
// (app/painel-mestre/agente/PainelMestreAgenteClient.tsx).
//
// `resolveViewer` abaixo é uma CÓPIA DELIBERADA da função de mesmo nome em
// app/api/painel-mestre/agente/route.ts — não uma importação. Duas razões: (1) aquela função é
// o alvo direto da varredura de lib/testes/painelMestreAgente.teste.ts que a revisão anterior
// escreveu depois de uma entrega apagar a autenticação inteira da rota sem deixar teste vermelho
// — mexer no arquivo dela, mesmo para extrair uma função, arrisca essas travas por motivo nenhum
// bom; (2) é o mesmo padrão já usado em lib/painelMestreFerramentas.ts (`str`/`bool` copiadas de
// lib/assistantTools.ts): uma função de ~15 linhas não vale o acoplamento entre dois arquivos só
// para não repeti-la. QUALQUER mudança em COMO se resolve quem está perguntando no Painel Mestre
// precisa ser feita nos dois lugares — este comentário existe para isso não ser esquecido.
async function resolveViewer(): Promise<PlatformViewer | null> {
  const user = await getCurrentUser({ ignoreActing: true });
  if (user?.isPlatformOwner) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      roleKey: "SOCIO",
      maxVisibility: "QUEBRA_VIDRO",
      canManageBilling: true,
      canManageMembers: true,
      canApproveAccess: true,
    };
  }
  return getPlatformMember();
}

// LEI 1: lista SÓ as conversas de quem está perguntando — o corte por dono mora dentro de
// listarConversasDoMembro (lib/painelMestreConversas.ts), nunca aqui.
export async function GET() {
  const viewer = await resolveViewer();
  if (!viewer) {
    return NextResponse.json({ error: "Não autenticado no Painel Mestre." }, { status: 401 });
  }

  const conversas = await listarConversasDoMembro(viewer);
  return NextResponse.json({ conversas });
}
