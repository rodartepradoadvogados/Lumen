import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";
import {
  hermesConfigurado,
  listarPerfisDoHermes,
  provisionarNoHermes,
  desprovisionarNoHermes,
  FalhaDoHermes,
} from "@/lib/hermesPonte";
import { mensagemDeErro } from "@/lib/mensagemDeErro";

export const dynamic = "force-dynamic";
// Criar um perfil no Hermes é trabalho de máquina, não de requisição de tela: o script copia
// arquivos e prepara o ambiente do inquilino. O teto é maior que o do chat por isso.
export const maxDuration = 180;

// PERFIS DOS ESCRITÓRIOS NO HERMES — criar, listar, remover.
//
// Um escritório sem perfil provisionado tem a caixa de conversa MUDA: o Hermes responde "perfil
// não encontrado" e não há nada que a pessoa possa fazer pela tela. Por isso estas três operações
// são caminho crítico do produto, e não conforto de administrador.
//
// ANTES, aqui se executava `python3 /root/.hermes/.../provision_tenant.py` com `execSync`. Nunca
// poderia funcionar na Vercel — aquele script vive na máquina do Hermes, não no contêiner da
// função. E o comando era montado como TEXTO, com o slug vindo direto da URL: `--slug ${slug}`
// fazia de um parâmetro de consulta um pedaço de linha de comando. Agora a chamada atravessa a
// ponte (lib/hermesPonte.ts), e do outro lado o script recebe uma lista de argumentos, sem shell
// no meio.
//
// Restrito ao dono da plataforma, como era. `ignoreActing: true` de propósito: a checagem tem de
// valer contra a identidade REAL de quem está logado, não contra um escritório que ele esteja
// "atuando como" no momento.

function semPonte() {
  return NextResponse.json(
    {
      error:
        "A ponte com o Hermes não está configurada. Defina HERMES_URL e HERMES_TOKEN — ver servidor-hermes/LEIA-ME.md.",
    },
    { status: 503 },
  );
}

/** Traduz a falha da ponte para o que a tela mostra, preservando o motivo. */
function respostaDeErro(erro: unknown, acao: string) {
  const motivo = erro instanceof FalhaDoHermes ? erro.motivo : mensagemDeErro(erro);
  console.error(`[hermes/provision] ${acao}:`, motivo);
  const naoEncontrado = motivo.includes("não encontrado");
  return NextResponse.json({ error: `${acao}: ${motivo}` }, { status: naoEncontrado ? 404 : 502 });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser({ ignoreActing: true });
  if (!user || !user.active || !user.isPlatformOwner) {
    return NextResponse.json({ error: "Acesso restrito ao dono da plataforma." }, { status: 403 });
  }
  if (!hermesConfigurado()) return semPonte();

  let body: { slug?: string; officeId?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const { slug, officeId, name } = body;
  if (!slug || !officeId || !name) {
    return NextResponse.json({ error: "slug, officeId e name são obrigatórios." }, { status: 400 });
  }

  // O escritório é conferido no BANCO antes de virar perfil no Hermes: sem isto, um engano de
  // digitação criaria um perfil órfão, que ninguém usa e ninguém lembra de remover.
  const office = await prisma.office.findUnique({ where: { id: officeId }, select: { slug: true } });
  if (!office) {
    return NextResponse.json({ error: "Escritório não encontrado." }, { status: 404 });
  }
  if (office.slug !== slug) {
    return NextResponse.json({ error: "Slug não confere com o escritório." }, { status: 400 });
  }

  try {
    const perfil = await provisionarNoHermes({ slug, officeId, nome: name });
    return NextResponse.json({ success: true, profile: perfil });
  } catch (erro) {
    return respostaDeErro(erro, "Falha no provisionamento");
  }
}

export async function GET() {
  const user = await getCurrentUser({ ignoreActing: true });
  if (!user || !user.active || !user.isPlatformOwner) {
    return NextResponse.json({ error: "Acesso restrito ao dono da plataforma." }, { status: 403 });
  }
  if (!hermesConfigurado()) return semPonte();

  try {
    return NextResponse.json(await listarPerfisDoHermes());
  } catch (erro) {
    return respostaDeErro(erro, "Falha ao listar perfis");
  }
}

export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser({ ignoreActing: true });
  if (!user || !user.active || !user.isPlatformOwner) {
    return NextResponse.json({ error: "Acesso restrito ao dono da plataforma." }, { status: 403 });
  }
  if (!hermesConfigurado()) return semPonte();

  const slug = new URL(request.url).searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "slug obrigatório." }, { status: 400 });
  }

  try {
    return NextResponse.json(await desprovisionarNoHermes(slug));
  } catch (erro) {
    return respostaDeErro(erro, "Falha ao remover perfil");
  }
}
