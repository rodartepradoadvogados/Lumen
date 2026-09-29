import TelaSessao from "@/components/site/TelaSessao";
import RecuperarSenhaForm from "@/components/RecuperarSenhaForm";

export const metadata = { title: "Recuperar senha — Lúmen" };

// Página pública (middleware.ts). Substitui o modal ForgotPasswordModal, que vivia dentro do login:
// uma página tem endereço, funciona com o botão Voltar do navegador e não prende o foco de leitor
// de tela num diálogo.
export default function RecuperarSenhaPage() {
  return (
    <TelaSessao titulo="Recuperar senha" saidaHref="/login" saidaRotulo="Voltar para entrar">
      <RecuperarSenhaForm />
    </TelaSessao>
  );
}
