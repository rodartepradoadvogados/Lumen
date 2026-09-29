import Link from "next/link";
import SignupForm from "@/components/SignupForm";
import TelaSessao from "@/components/site/TelaSessao";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Criar conta do escritório — Lúmen" };

// A tela do dinheiro. Usa a mesma casca das outras telas de sessão (fundo, cartão, guia, marca e
// saída no alto).
//
// `?plano=KEY` (botões "Criar conta no Silver" da Capa): a chave é validada contra o catálogo
// (Plan.key, plano ativo e não sob medida). Chave inválida é ignorada em silêncio: a tela funciona
// igual, sem chip. O plano chega ao servidor de novo no envio e é validado outra vez (signupOffice).
export default async function CadastroPage({ searchParams }: { searchParams: { plano?: string | string[] } }) {
  const chave = typeof searchParams.plano === "string" ? searchParams.plano.slice(0, 40) : "";
  const plano = chave
    ? await prisma.plan.findFirst({ where: { key: chave, active: true, isCustom: false }, select: { key: true, name: true } })
    : null;

  return (
    <TelaSessao
      titulo="Criar conta do escritório"
      apoio="Você será o primeiro administrador da conta — quem convida o resto da equipe e define o que cada um enxerga."
      rodape={
        // Direto pra página real de login (não "/"): a homepage de marketing não tem formulário
        // embutido, e no app mobile o link "Entrar" da barra dela some em telas estreitas — cair em
        // "/" nunca levava a lugar nenhum (loop cadastro → home → cadastro relatado no PWA).
        <Link href="/login" className="inline-flex items-center min-h-[44px] text-corpo font-semibold text-tx-2 hover:text-tx underline underline-offset-4 transition-colors duration-100 ease-out">
          Já tem conta? Entrar
        </Link>
      }
    >
      <SignupForm plano={plano} />
    </TelaSessao>
  );
}
