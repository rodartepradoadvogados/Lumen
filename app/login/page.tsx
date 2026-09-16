import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { getPlatformMember } from "@/lib/platformMember";
import LoginForm from "@/components/LoginForm";
import TelaSessao from "@/components/site/TelaSessao";

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
    <TelaSessao
      titulo="Entrar no Lúmen"
      apoio="Use o e-mail do seu escritório."
      rodape={
        <div className="flex flex-col gap-3">
          {/* O caminho do cadastro não existia nesta tela: quem chegava aqui sem conta só tinha a
              porta de volta ao site. Numa tela de funil, o desvio para "criar conta" é o link mais
              caro que pode faltar. */}
          <Link href="/cadastro" className="text-corpo font-semibold text-tx-2 hover:text-tx underline underline-offset-4 transition-colors duration-100 ease-out">
            Ainda não tem conta? Criar a conta do escritório
          </Link>
          <Link href="/" className="text-etiqueta font-semibold text-tx-3 hover:text-tx transition-colors duration-100 ease-out">
            ← Voltar ao site
          </Link>
        </div>
      }
    >
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </TelaSessao>
  );
}
