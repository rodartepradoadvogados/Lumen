import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { getPlatformMember } from "@/lib/platformMember";
import { logout } from "@/lib/actions/auth";
import LumenMark from "@/components/LumenMark";

// Tela mostrada só a quem tem sessão de escritório E acesso de plataforma (dono — Jairo/Rodrigo
// — ou membro de equipe da Lúmen vinculado a um User) logo após o login, em vez do antigo
// redirecionamento automático e incondicional para /painel-mestre (lib/actions/auth.ts). O
// Painel Mestre é ferramenta de administração da Lúmen, por fora de qualquer escritório — quem
// também é usuário de um escritório-cliente (o interno, Rodarte Prado) precisa poder escolher
// qual dos dois mundos está entrando, em vez de o sistema decidir por ele toda vez.
export const dynamic = "force-dynamic";

export default async function EscolherPage() {
  const user = await getCurrentUser({ ignoreActing: true });
  if (!user) redirect("/");

  const hasPlatformAccess = user.isPlatformOwner || Boolean(await getPlatformMember());
  if (!hasPlatformAccess) redirect("/painel");

  return (
    <div className="min-h-screen bg-sf-fundo flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <LumenMark size={30} />
          <span className="font-extrabold text-xl tracking-[.16em] text-tx">LÚMEN</span>
        </div>
        <p className="text-center text-sm text-tx-2 mb-6">
          Olá, {user.name.split(" ")[0]}. Para onde você vai?
        </p>
        <div className="grid gap-3">
          <Link
            href="/painel"
            className="block border-2 border-regua-forte bg-sf p-6 hover:border-acao transition-colors"
          >
            <div className="text-[11px] font-extrabold uppercase tracking-[.1em] text-tx-3 mb-1">Escritório</div>
            <div className="text-lg font-extrabold text-tx">Entrar no escritório</div>
            <p className="text-sm text-tx-2 mt-1">Processos, agenda, financeiro e o dia a dia do escritório.</p>
          </Link>
          <Link
            href="/painel-mestre"
            className="block border-2 border-regua-forte bg-sf p-6 hover:border-acao transition-colors"
          >
            <div className="text-[11px] font-extrabold uppercase tracking-[.1em] text-tx-3 mb-1">Plataforma</div>
            <div className="text-lg font-extrabold text-tx">Painel Mestre</div>
            <p className="text-sm text-tx-2 mt-1">Administração da Lúmen — escritórios-cliente, cobrança e acesso.</p>
          </Link>
        </div>
        <form action={logout} className="mt-6 text-center">
          <button type="submit" className="text-xs font-semibold text-tx-3 hover:text-atencao">
            Sair
          </button>
        </form>
      </div>
    </div>
  );
}
