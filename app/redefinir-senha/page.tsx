import RedefinirSenhaForm from "@/components/RedefinirSenhaForm";
import TelaSessao from "@/components/site/TelaSessao";

export const metadata = { title: "Redefinir senha — Lúmen" };

export default function RedefinirSenhaPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = searchParams.token;

  return (
    <TelaSessao
      titulo="Redefinir senha"
      apoio={token ? "Escolha sua nova senha de acesso ao sistema." : undefined}
      saidaHref="/login"
      saidaRotulo="Voltar para entrar"
    >
      {token ? (
        <RedefinirSenhaForm token={token} />
      ) : (
        // Erro que o visitante não causou e não pode consertar sozinho: diz o que aconteceu E o
        // que fazer, em vez de só apontar o defeito. Filete de topo em `--urgente`, sem fundo
        // chapado — o mesmo tratamento do componente Aviso do produto.
        <div className="border-t-2 border-urgente bg-sf-apoio p-4">
          <p className="text-corpo font-semibold text-tx">Este link não serve para redefinir a senha.</p>
          <p className="text-corpo text-tx-2 mt-1">
            Falta o código de redefinição no endereço. Peça um link novo na tela de entrada — os
            links de redefinição têm validade curta, de propósito.
          </p>
        </div>
      )}
    </TelaSessao>
  );
}
