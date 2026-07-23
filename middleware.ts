import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Rotas públicas: a homepage pública (marketing do software, antes do login),
  // login, /cadastro (cadastro público de escritório novo — signupOffice(), precisa
  // ser acessível SEM sessão, é assim que um Office passa a existir), /redefinir-senha
  // (precisa ser acessível SEM sessão — é justamente para quem esqueceu a senha e não
  // consegue logar, ver ForgotPasswordModal), assets internos do Next, o blog jurídico
  // público (leitura livre, sem login), as fotos estáticas da própria homepage
  // (public/homepage/*, usadas em <img>/next-image por visitantes SEM sessão — sem
  // essa exceção, o middleware barrava até a busca interna do otimizador de imagem do
  // Next, /_next/image, que primeiro precisa buscar o arquivo original em
  // /homepage/*.webp neste mesmo domínio) e — para o PWA funcionar sem sessão — o
  // manifesto e os ícones gerados por convenção (/manifest.webmanifest, /icon*, /apple-icon).
  if (
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/cadastro" ||
    pathname === "/redefinir-senha" ||
    pathname === "/blog" ||
    pathname.startsWith("/blog/") ||
    pathname.startsWith("/homepage/") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/apple-icon" ||
    pathname.startsWith("/icon") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;

  if (!session) {
    // O formulário de login mora na homepage pública (app/page.tsx), não numa página própria
    // — ver HomepageLoginCard. Preserva o destino original para retornar a ele após o login.
    const loginUrl = new URL("/", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
