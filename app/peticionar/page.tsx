import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import PeticionarWorkspace from "@/components/PeticionarWorkspace";

export const dynamic = "force-dynamic";

// Página enxuta, sem Sidebar/TopBar de propósito — pensada pra abrir numa aba/janela ao
// lado do timbrado durante o peticionamento (ver components/PeticionarButton.tsx).
export default async function PeticionarPage() {
  const user = await getCurrentUser();
  if (!user || !user.active) redirect("/");

  return <PeticionarWorkspace />;
}
