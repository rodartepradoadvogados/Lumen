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
        <Link href="/" className="block text-center mt-4 text-sm font-semibold text-tx-2 hover:text-tx underline">
          Já tem conta? Entrar
        </Link>
      </div>
    </div>
  );
}
