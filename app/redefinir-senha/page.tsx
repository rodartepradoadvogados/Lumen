import RedefinirSenhaForm from "@/components/RedefinirSenhaForm";

export default function RedefinirSenhaPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = searchParams.token;

  return (
    <div className="min-h-screen bg-navy-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-cream-50 rounded-xl2 shadow-xl p-6">
        <h1 className="text-lg font-semibold text-navy-900 mb-1">Redefinir senha</h1>
        {token ? (
          <>
            <p className="text-sm text-navy-900/60 mb-4">Escolha sua nova senha de acesso ao sistema.</p>
            <RedefinirSenhaForm token={token} />
          </>
        ) : (
          <p className="text-sm text-red-600">Link inválido — falta o token de redefinição.</p>
        )}
      </div>
    </div>
  );
}
