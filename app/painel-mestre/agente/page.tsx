import { requirePlatformAccess } from "@/lib/platformMember";
import PainelMestreAgenteClient from "./PainelMestreAgenteClient";

export const dynamic = "force-dynamic";

// F7 — o agente do Painel Mestre. `requirePlatformAccess()` já é o portão único de entrada na
// área (dono da plataforma OU PlatformMember ativo) — ver lib/platformMember.ts. O NOME de quem
// está logado é o único dado que desce para o client aqui; a CREDENCIAL de verdade (papel, teto
// de visibilidade) nunca sai do servidor — cada pergunta resolve o viewer de novo em
// app/api/painel-mestre/agente/route.ts, e é lá que a Lei 1 vive.
export default async function PainelMestreAgentePage() {
  const acesso = await requirePlatformAccess();

  return <PainelMestreAgenteClient nomeDeQuemPergunta={acesso.name} />;
}
