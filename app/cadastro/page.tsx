import Link from "next/link";
import SignupForm from "@/components/SignupForm";
import TelaSessao from "@/components/site/TelaSessao";

export const metadata = { title: "Criar conta do escritório — Lúmen" };

// A tela do dinheiro. Até 2026-09-16 era a MENOS cuidada do repositório: 24 linhas, fundo
// `bg-grafite-800` (a única das quatro telas de sessão a inverter o tema das vizinhas), sem marca
// nenhuma e sem porta de volta — quem chegava aqui por um link não tinha como saber de que produto
// era a conta que estava criando. Agora usa a mesma casca das outras três.
export default function CadastroPage() {
  return (
    <TelaSessao
      titulo="Criar conta do escritório"
      apoio="Você será o primeiro administrador da conta — quem convida o resto da equipe e define o que cada um enxerga."
      rodape={
        // Direto pra página real de login (não "/"): a homepage de marketing não tem mais
        // formulário embutido desde o redesenho (documento 09, ver app/login/page.tsx) — e no
        // app mobile o link "Entrar" da barra dela fica oculto em telas estreitas
        // (`hidden md:flex` em app/page.tsx), então cair em "/" nunca levava a lugar nenhum,
        // causando o loop cadastro → home → cadastro relatado no PWA.
        <Link href="/login" className="text-corpo font-semibold text-tx-2 hover:text-tx underline underline-offset-4 transition-colors duration-100 ease-out">
          Já tem conta? Entrar
        </Link>
      }
    >
      <SignupForm />
    </TelaSessao>
  );
}
