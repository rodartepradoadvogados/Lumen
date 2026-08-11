import RedefinirSenhaForm from "@/components/RedefinirSenhaForm";

export default function RedefinirSenhaPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = searchParams.token;

  return (
    <div className="min-h-screen bg-sf-fundo flex items-center justify-center px-4 transition-colors">
      {/* Cartão sobre fundo vazio: aqui a sombra é legítima, não é cartão parado numa lista. */}
      <div className="w-full max-w-sm bg-sf border border-regua rounded-xl2 shadow-modal p-6">
        <h1 className="text-lg font-semibold text-tx mb-1">Redefinir senha</h1>
        {token ? (
          <>
            <p className="text-sm text-tx-2 mb-4">Escolha sua nova senha de acesso ao sistema.</p>
            <RedefinirSenhaForm token={token} />
          </>
        ) : (
          <p className="text-sm text-urgente">Link inválido — falta o token de redefinição.</p>
        )}
      </div>
    </div>
  );
}
