import { redirect } from "next/navigation";

// O formulário de login deixou de ser uma página própria — agora mora embutido na homepage
// pública (app/page.tsx, HomepageLoginCard), suspenso sobre o banner. Esta rota só existe
// como redirecionamento de compatibilidade para quem ainda tem "/login" salvo/no histórico
// do navegador, preservando o parâmetro "next" (destino original após o login).
export default function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  const next = searchParams.next && searchParams.next.startsWith("/") && !searchParams.next.startsWith("//") ? searchParams.next : undefined;
  redirect(next ? `/?next=${encodeURIComponent(next)}` : "/");
}
