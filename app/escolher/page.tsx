import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { getPlatformMember } from "@/lib/platformMember";
import { logout } from "@/lib/actions/auth";
import TelaSessao from "@/components/site/TelaSessao";

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
    // Esta tela não tinha `<h1>` nenhum — só um `<p>` de saudação. É o mesmo defeito de navegação
    // por títulos que a auditoria achou em /login. A pergunta vira o título, e a saudação vira a
    // linha de apoio: o contrato de direção recusa gastar o maior tipo da tela no nome de quem
    // está logado, e aqui o maior tipo é a PERGUNTA, que é o que a tela existe para fazer.
    <TelaSessao
      titulo="Para onde você vai?"
      apoio={`Olá, ${user.name.split(" ")[0]}. Você tem acesso aos dois mundos.`}
      largura="md"
      rodape={
        <form action={logout}>
          <button
            type="submit"
            className="text-etiqueta font-semibold text-tx-3 hover:text-urgente transition-colors duration-100 ease-out"
          >
            Sair
          </button>
        </form>
      }
    >
      <div className="grid gap-3">
        {[
          {
            href: "/painel",
            etiqueta: "Escritório",
            titulo: "Entrar no escritório",
            texto: "Processos, agenda, financeiro e o dia a dia do escritório.",
          },
          {
            href: "/painel-mestre",
            etiqueta: "Plataforma",
            titulo: "Painel Mestre",
            texto: "Administração da Lúmen — escritórios-cliente, cobrança e acesso.",
          },
        ].map((porta) => (
          <Link
            key={porta.href}
            href={porta.href}
            // Mesma resposta de régua dos cartões de preço do site (D5): a régua vira bordô e o
            // fundo acompanha. Nenhuma elevação, nenhuma sombra.
            className="block border-2 border-regua-forte bg-sf rounded-[2px] p-6 transition-[border-color,background-color] duration-100 ease-out hover:border-acao hover:bg-acao-bg"
          >
            <div className="text-etiqueta font-extrabold uppercase tracking-[.1em] text-tx-3 mb-1">{porta.etiqueta}</div>
            <div className="text-destaque font-extrabold text-tx">{porta.titulo}</div>
            <p className="text-corpo text-tx-2 mt-1">{porta.texto}</p>
          </Link>
        ))}
      </div>
    </TelaSessao>
  );
}
