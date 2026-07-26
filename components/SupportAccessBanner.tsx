import { getCurrentUser } from "@/lib/currentUser";
import { getActiveSupportSession } from "@/lib/supportAccess";
import { ACCESS_REASONS, type AccessReasonCode } from "@/lib/supportAccessConstants";
import SupportAccessBannerClient from "./SupportAccessBannerClient";

// Faixa visível a QUALQUER usuário do escritório enquanto existir uma AccessSession ativa do
// suporte da Lúmen naquele escritório — é o contraponto de components/ActingOfficeBanner.tsx
// (que avisa o PLATFORM OWNER que ele está atuando como outro escritório): esta aqui avisa o
// ESCRITÓRIO que ele está sendo acessado. Sem sessão ativa, não renderiza nada — usuário comum
// de escritório não nota diferença nenhuma no dia a dia (restrição do Passo 2).
export default async function SupportAccessBanner() {
  const viewer = await getCurrentUser();
  if (!viewer) return null;

  const session = await getActiveSupportSession(viewer.officeId);
  if (!session) return null;

  const reasonLabel = ACCESS_REASONS[session.reasonCode as AccessReasonCode] ?? session.reasonCode;

  return (
    <SupportAccessBannerClient
      sessionId={session.id}
      memberName={session.memberName}
      reasonLabel={reasonLabel}
      startedAtIso={session.startedAt.toISOString()}
      expiresAtIso={session.expiresAt.toISOString()}
    />
  );
}
