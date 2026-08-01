import RedefinirSenhaForm from "@/components/RedefinirSenhaForm";

export default function RedefinirSenhaPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = searchParams.token;

  return (
    <div className="min-h-screen bg-cream-50 dark:bg-navy-950 flex items-center justify-center px-4 transition-colors">
      <div className="w-full max-w-sm bg-white dark:bg-navy-900 border border-navy-800/10 dark:border-white/10 rounded-xl2 shadow-xl p-6">
        <h1 className="text-lg font-semibold text-navy-900 dark:text-cream-50 mb-1">Redefinir senha</h1>
        {token ? (
          <>
            <p className="text-sm text-navy-900/60 dark:text-cream-50/60 mb-4">Escolha sua nova senha de acesso ao sistema.</p>
            <RedefinirSenhaForm token={token} />
          </>
        ) : (
          <p className="text-sm text-red-600 dark:text-bordo-400">Link inválido — falta o token de redefinição.</p>
        )}
      </div>
    </div>
  );
}
