import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { getPlatformMember, type PlatformViewer } from "@/lib/platformMember";
import { buscarConversaDoMembro } from "@/lib/painelMestreConversas";

export const dynamic = "force-dynamic";

// Abre UMA conversa anterior do agente do Painel Mestre — com todos os turnos, para a tela
// retomar de onde parou.
//
// `resolveViewer` é a MESMA cópia deliberada de app/api/painel-mestre/agente/conversas/route.ts
// (ver o comentário grande de lá — vale também aqui).
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

// LEI 1, A TRAVA MAIS IMPORTANTE DESTA ENTREGA: abrir a conversa de outro membro tem de devolver
// EXATAMENTE a mesma resposta de "não existe" — nunca uma diferente que revele que o id pertence
// a alguém. O corte por dono mora dentro de buscarConversaDoMembro (lib/painelMestreConversas.ts),
// nunca aqui.
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const viewer = await resolveViewer();
  if (!viewer) {
    return NextResponse.json({ error: "Não autenticado no Painel Mestre." }, { status: 401 });
  }

  const conversa = await buscarConversaDoMembro(params.id, viewer);
  if (!conversa) {
    return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });
  }

  return NextResponse.json({
    id: conversa.id,
    titulo: conversa.titulo,
    turnos: conversa.turnos.map((t) => ({ role: t.papel, texto: t.texto, ferramentasUsadas: t.ferramentasUsadas })),
  });
}
