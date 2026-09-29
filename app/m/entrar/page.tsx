import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import LoginForm from "@/components/LoginForm";
import RegistrarServiceWorker from "@/components/RegistrarServiceWorker";
import TelaSessao from "@/components/site/TelaSessao";
import InstallPrompt from "@/components/mobile/InstallPrompt";
import { destinoSeguroDoPwa, PWA_APPS } from "@/lib/pwaApps";

export const dynamic = "force-dynamic";

// Tela de entrada do app mobile, DENTRO do escopo dele (/m). O middleware manda para cá quem abre
// /m sem sessão — antes ia para a homepage pública, fora de qualquer PWA (ver lib/pwaApps.ts).
export const metadata: Metadata = {
  title: "Entrar | Lúmen",
  manifest: PWA_APPS.mobile.manifest,
};

export default async function EntrarMobilePage({ searchParams }: { searchParams: { next?: string | string[] } }) {
  const destino = destinoSeguroDoPwa("mobile", searchParams.next);
  const user = await getCurrentUser();
  if (user?.active) redirect(destino);

  return (
    <>
      <RegistrarServiceWorker script="/sw-m.js" escopo="/m" />
      <TelaSessao titulo="Entrar no Lúmen" apoio="Use o e-mail do seu escritório." saida={false} marcaHref={null}>
        <Suspense fallback={null}>
          <LoginForm destino={destino} />
        </Suspense>
      </TelaSessao>
      <InstallPrompt />
    </>
  );
}
