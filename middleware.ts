import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE_NAME, verifyPlatformMemberSession, PLATFORM_MEMBER_SESSION_COOKIE } from "@/lib/auth";

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
  // /homepage/*.webp neste mesmo domínio), o sitemap/robots (senão buscadores recebem
  // redirect pro login em vez do conteúdo) e — para o PWA funcionar sem sessão — o
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
    pathname === "/favicon.ico" ||
    pathname === "/sitemap.xml" ||
    pathname === "/robots.txt"
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;

  // PlatformMember standalone (sem User de escritório nenhum, ver lib/auth.ts) autentica com um
  // cookie/claim próprio — sem isto, quem só tem essa sessão nunca passaria daqui pra chegar em
  // /painel-mestre (achado A12 da revisão gauntlet). A checagem fina de QUEM pode entrar em
  // /painel-mestre continua nas próprias páginas (requirePlatformAccess); aqui só decide se a
  // requisição segue ou volta pro login.
  const pmToken = !session ? req.cookies.get(PLATFORM_MEMBER_SESSION_COOKIE)?.value : undefined;
  const pmSession = pmToken ? await verifyPlatformMemberSession(pmToken) : null;

  if (!session && !pmSession) {
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
