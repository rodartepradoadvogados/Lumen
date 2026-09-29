import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import LoginForm from "@/components/LoginForm";
import RegistrarServiceWorker from "@/components/RegistrarServiceWorker";
import TelaSessao from "@/components/site/TelaSessao";
import InstallPrompt from "@/components/mobile/InstallPrompt";
import { destinoSeguroDoPwa } from "@/lib/pwaApps";

export const dynamic = "force-dynamic";

// Tela de entrada do app de Atendimento, DENTRO do escopo dele (/atendimento-app). O manifesto
// (dourado, "Lúmen Atendimento") vem do layout desta pasta. O middleware manda para cá quem abre
// o app sem sessão — antes ia para a homepage pública, que ligava o manifesto errado.
export default async function EntrarAtendimentoPage({ searchParams }: { searchParams: { next?: string | string[] } }) {
  const destino = destinoSeguroDoPwa("atendimento", searchParams.next);
  const user = await getCurrentUser();
  if (user?.active) redirect(destino);

  return (
    <>
      <RegistrarServiceWorker script="/sw-atendimento.js" escopo="/atendimento-app" />
      <TelaSessao titulo="Entrar no Atendimento" apoio="Use o e-mail do seu escritório." saida={false} marcaHref={null}>
        <Suspense fallback={null}>
          <LoginForm destino={destino} />
        </Suspense>
      </TelaSessao>
      <InstallPrompt app="atendimento" nome="Lúmen Atendimento" />
    </>
  );
}
