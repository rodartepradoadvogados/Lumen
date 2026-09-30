"use server";

import bcrypt from "bcryptjs";
import crypto from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ehTelaDeEntradaDePwa } from "@/lib/pwaApps";
import { prisma } from "@/lib/prisma";
import { signSession, SESSION_COOKIE_NAME, signPlatformMemberSession, PLATFORM_MEMBER_SESSION_COOKIE } from "@/lib/auth";
import { sendPasswordResetEmail } from "@/lib/email";
import { getCurrentUser } from "@/lib/currentUser";
import { getAppUrl } from "@/lib/appUrl";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hora

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Login por e-mail (não por username): num sistema multi-tenant, e-mail é o único
// identificador que continua único GLOBALMENTE (username agora é só um apelido por
// escritório, ver prisma/schema.prisma) — login por e-mail evita qualquer ambiguidade
// entre escritórios diferentes sem exigir que o usuário informe também qual escritório é o seu.
//
// Dois cadastros disputam o mesmo e-mail em teoria: User (escritório) e PlatformMember
// standalone (equipe da Lúmen sem escritório nenhum, ver createStandalonePlatformMember). Tenta
// User primeiro — é o caminho de longe mais comum — e só cai pro PlatformMember quando não acha
// (ou a senha não bate) nenhum User com este e-mail (achado A12 da revisão gauntlet: antes
// disto não existia NENHUM jeito de logar como PlatformMember standalone).
export async function login(email: string, password: string, next?: string): Promise<{ error?: string }> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (user?.active && user.passwordHash && (await bcrypt.compare(password, user.passwordHash))) {
    const token = await signSession(user.id);
    cookies().set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    await prisma.loginSession.create({ data: { userId: user.id, officeId: user.officeId } });

    if (next && next.startsWith("/") && !next.startsWith("//")) redirect(next);

    // Dono da plataforma ou membro de equipe da Lúmen com este User vinculado (ver
    // lib/platformMember.ts) é também usuário de um escritório de verdade (o interno, Rodarte
    // Prado) — em vez de decidir por ele qual dos dois mundos abrir, cai em /escolher, que
    // oferece os dois. Sem acesso de plataforma, segue direto pro próprio painel de sempre.
    const platformMember = user.isPlatformOwner
      ? null
      : await prisma.platformMember.findUnique({ where: { userId: user.id }, select: { active: true } });
    redirect(user.isPlatformOwner || platformMember?.active ? "/escolher" : "/painel");
  }

  const member = await prisma.platformMember.findUnique({ where: { email } });
  if (member?.active && member.passwordHash && (await bcrypt.compare(password, member.passwordHash))) {
    const token = await signPlatformMemberSession(member.id);
    cookies().set(PLATFORM_MEMBER_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    redirect("/painel-mestre");
  }

  return { error: "E-mail ou senha inválidos." };
}

// `destino`: para onde voltar depois de sair. Os PWAs passam a própria tela de entrada (dentro do
// escopo do app) — sem isso, "Sair" jogava o usuário para a homepage pública, fora do app. Só
// aceita as telas de entrada conhecidas; qualquer outro valor (inclusive o FormData que um
// <form action={logout}> entrega como 1º argumento) cai em "/".
export async function logout(destino?: unknown) {
  // A PushSubscription vive presa ao NAVEGADOR (endpoint), não à sessão — sem apagar aqui, um
  // aparelho compartilhado (tablet da recepção, celular de plantão) continua recebendo, depois
  // do logout, as notificações (com título e teor reais — menções, tarefas delegadas) do usuário
  // que acabou de sair, entregues a quem quer que esteja com o aparelho agora. O lado do
  // navegador (pushManager.getSubscription().unsubscribe()) é derrubado pelo próprio botão "Sair"
  // no cliente — ver app/m/mais/page.tsx.
  const viewer = await getCurrentUser();
  if (viewer) {
    await prisma.pushSubscription.deleteMany({ where: { userId: viewer.id } });
    // O aviso de mensagem nova do aplicativo de Atendimento tem tabela própria (lib/pushDoAtendimento.ts) e o mesmo
    // motivo: aparelho compartilhado não pode continuar recebendo avisos de quem saiu.
    await prisma.atendimentoPushInscricao.deleteMany({ where: { userId: viewer.id } });
  }
  // O cookie de sessão é sempre gravado com path "/" (ver login() acima). `delete(name)` sem
  // opções usa como path padrão o diretório da própria URL da Server Action — que só coincide
  // com "/" quando "Sair" é clicado a partir de uma rota de 1 nível (ex.: /painel). Clicado de
  // uma rota mais profunda (ex.: /processos/123), o Set-Cookie de exclusão nasce com path
  // "/processos" e nunca chega a sobrescrever o cookie original: o navegador mantém os dois,
  // a sessão nunca é derrubada de fato e o usuário parece preso, sempre logado de novo depois
  // do redirect. Path explícito garante que a exclusão sempre mira o mesmo cookie do login.
  cookies().delete({ name: SESSION_COOKIE_NAME, path: "/" });
  // Limpa também a sessão de PlatformMember standalone, se houver — inofensivo quando não há
  // (delete de cookie inexistente não faz nada), e evita duas telas de "Sair" separadas para
  // quem logou como equipe da Lúmen sem User de escritório.
  cookies().delete({ name: PLATFORM_MEMBER_SESSION_COOKIE, path: "/" });
  redirect(typeof destino === "string" && ehTelaDeEntradaDePwa(destino) ? destino : "/");
}

// "Esqueci minha senha" (página /recuperar-senha): gera um token de uso único (válido por 1h,
// guardado só como hash) e envia o link de redefinição para o e-mail cadastrado.
//
// A RESPOSTA É NEUTRA: devolve o mesmo resultado exista ou não a conta, esteja ela ativa ou não, e
// tenha ou não o envio funcionado. O fluxo antigo (modal) respondia "não encontramos esse e-mail" e
// mostrava o e-mail mascarado de quem existia — quem consultasse descobria quais e-mails são de
// clientes. Falha de envio vai para o log do servidor, não para a tela (o texto da página já manda
// pedir o link a um administrador). O tempo de resposta também é nivelado (piso de 3s, que cobre o envio na maioria dos casos; se o envio passar disso o tempo ainda diferencia): responder
// mais rápido quando a conta não existe seria o mesmo vazamento por outro canal.
//
// Sem limite de tentativas por e-mail ou IP, como já era no fluxo antigo: fica como pendência.
const RECUPERACAO_PISO_MS = 3000;

export async function solicitarRecuperacaoDeSenha(emailBruto: string): Promise<{ error?: string; enviado?: true }> {
  const email = String(emailBruto ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Digite um e-mail válido." };

  const inicio = Date.now();
  try {
    const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
    if (user?.active) {
      const rawToken = crypto.randomBytes(32).toString("hex");
      await prisma.user.update({
        where: { id: user.id },
        data: { resetTokenHash: hashToken(rawToken), resetTokenExpiry: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
      });
      const office = await prisma.office.findUnique({ where: { id: user.officeId }, select: { name: true } });
      const resetUrl = `${getAppUrl()}/redefinir-senha?token=${rawToken}`;
      const result = await sendPasswordResetEmail(user.email, resetUrl, office?.name || "Lúmen", user.officeId);
      if (!result.sent) console.error("[recuperar-senha] envio falhou:", result.reason);
    }
  } catch (e) {
    console.error("[recuperar-senha] erro:", e);
  }
  const falta = RECUPERACAO_PISO_MS - (Date.now() - inicio);
  if (falta > 0) await new Promise((r) => setTimeout(r, falta));
  return { enviado: true };
}

// Caminho que NÃO depende de e-mail nenhum: um administrador gera, na hora, um link de
// redefinição de uso único para qualquer pessoa da equipe (inclusive outro administrador) —
// mesmo mecanismo de token de requestPasswordReset acima (hash SHA-256 salvo em
// User.resetTokenHash, expiração de 1h em User.resetTokenExpiry, consumido por
// resetPasswordWithToken). Pensado para entregar por WhatsApp ou pessoalmente quando nenhum
// canal de e-mail (SMTP/Google/Microsoft) está disponível — ver sendCriticalEmailCascade em
// lib/email.ts.
export async function adminGenerateResetLink(userId: string): Promise<{ error?: string; url?: string; expiresAt?: string }> {
  const viewer = await getCurrentUser();
  if (!viewer?.isAdmin) return { error: "Apenas administradores podem gerar link de redefinição." };

  const user = await prisma.user.findFirst({ where: { id: userId, officeId: viewer.officeId } });
  if (!user) return { error: "Usuário não encontrado." };
  if (!user.active) return { error: "Não é possível gerar link para um membro inativo." };

  const rawToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  await prisma.user.update({
    where: { id: user.id },
    data: { resetTokenHash: hashToken(rawToken), resetTokenExpiry: expiresAt },
  });

  return { url: `${getAppUrl()}/redefinir-senha?token=${rawToken}`, expiresAt: expiresAt.toISOString() };
}

// Passo 3: valida o token (hash + expiração) e define a nova senha.
export async function resetPasswordWithToken(token: string, newPassword: string): Promise<{ error?: string; success?: boolean }> {
  if (newPassword.length < 6) return { error: "A nova senha deve ter ao menos 6 caracteres." };

  const user = await prisma.user.findFirst({ where: { resetTokenHash: hashToken(token) } });
  if (!user || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
    return { error: "Link inválido ou expirado. Solicite uma nova redefinição de senha." };
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, resetTokenHash: null, resetTokenExpiry: null },
  });
  return { success: true };
}
