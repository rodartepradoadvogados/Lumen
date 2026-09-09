import Link from "next/link";
import SignupForm from "@/components/SignupForm";

export default function CadastroPage() {
  return (
    <div className="min-h-screen bg-grafite-800 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-sf shadow-modal p-6">
        <h1 className="text-lg font-semibold text-tx mb-1">Criar conta do escritório</h1>
        <p className="text-sm text-tx-2 mb-4">
          Cadastre seu escritório na Lúmen — você será o primeiro administrador da conta.
        </p>
        <SignupForm />
        {/* Direto pra página real de login (não "/"): a homepage de marketing não tem mais
            formulário embutido desde o redesenho (documento 09, ver app/login/page.tsx) — e no
            app mobile o link "Entrar" da barra dela fica oculto em telas estreitas
            (`hidden md:flex` em app/page.tsx), então cair em "/" nunca levava a lugar nenhum,
            causando o loop cadastro → home → cadastro relatado no PWA. */}
        <Link href="/login" className="block text-center mt-4 text-sm font-semibold text-tx-2 hover:text-tx underline">
          Já tem conta? Entrar
        </Link>
      </div>
    </div>
  );
}
