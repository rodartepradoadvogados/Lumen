import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { getPlatformMember } from "@/lib/platformMember";
import LumenMark from "@/components/LumenMark";
import LoginForm from "@/components/LoginForm";

// Página real de login (documento 09 do redesenho: a barra do site público tem só um link
// "Entrar", sem card embutido no hero — o formulário de fato mora aqui). Substitui o antigo
// redirecionamento "/login → /" (que existia enquanto o login vivia suspenso sobre o carrossel
// da homepage, ver git blame de HomepageLoginCard.tsx).
export const metadata = { title: "Entrar — Lúmen" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) {
    // Dono da plataforma/membro de equipe com sessão de escritório já ativa (ex.: voltou pra
    // /login por engano) cai no mesmo escolhedor do login normal, não direto pro painel do
    // escritório — ver lib/actions/auth.ts.
    const hasPlatformAccess = user.isPlatformOwner || Boolean(await getPlatformMember());
    redirect(hasPlatformAccess ? "/escolher" : "/painel");
  }

  return (
    <div className="min-h-screen bg-sf-fundo flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="flex items-center gap-2 mb-8 justify-center">
          <LumenMark size={30} />
          <span className="font-extrabold text-xl tracking-[.16em] text-tx">LÚMEN</span>
        </Link>
        <div className="bg-sf border-t-2 border-regua-forte p-6">
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>
        <Link href="/" className="block text-center text-xs font-semibold text-tx-3 hover:text-tx mt-5">
          ← Voltar ao site
        </Link>
      </div>
    </div>
  );
}
