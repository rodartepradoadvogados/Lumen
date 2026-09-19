import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";
import { mensagemDeErro } from "@/lib/mensagemDeErro";
import { usoPorEscritorio } from "@/lib/agenteUso";
import {
  hermesConfigurado,
  perfilDoEscritorio,
  estadoDosPerfis,
  perguntarAoHermes,
  FalhaDoHermes,
} from "@/lib/hermesPonte";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ============================================================================
// PAINEL MESTRE — o estado do Lúmen Agent em cada escritório.
//
// DOIS DEFEITOS CORRIGIDOS AQUI, e vale saber quais eram, porque os dois enganavam quem olhava:
//
// 1. A listagem filtrava `isInternal: false`, escondendo o escritório interno da plataforma — o
//    do próprio dono. Ele procurava o escritório dele na tela e não achava, enquanto o agente
//    estava lá, funcionando. Agora todos aparecem, com o interno marcado como tal.
//
// 2. O status vinha de executar o binário do Hermes E de ler /root/.hermes no disco — duas coisas
//    que não existem num contêiner da Vercel. A chamada sempre falhava, e o código traduzia
//    qualquer falha como "não provisionado". Resultado: TODO escritório aparecia como não
//    provisionado, para sempre, inclusive os que estavam perfeitos. Um status que só sabe dizer
//    uma coisa não é um status, é um enfeite.
//
// Agora o estado vem pela ponte (lib/hermesPonte.ts), que lê o disco da máquina certa. E é leitura
// de disco: a rota antiga mandava o agente responder "ping" para descobrir se estava vivo — uma
// chamada de modelo, PAGA, por escritório, toda vez que a tela abrisse.
// ============================================================================

function semPonte() {
  return NextResponse.json(
    {
      error:
        "A ponte com o Hermes não está configurada. Defina HERMES_URL e HERMES_TOKEN — ver servidor-hermes/LEIA-ME.md.",
    },
    { status: 503 },
  );
}

async function exigirDono() {
  // `ignoreActing: true`: a checagem vale contra a identidade REAL de quem está logado, nunca
  // contra um escritório que o dono esteja "atuando como" no momento.
  const user = await getCurrentUser({ ignoreActing: true });
  if (!user || !user.active || !user.isPlatformOwner) return null;
  return user;
}

export async function GET(request: NextRequest) {
  if (!(await exigirDono())) {
    return NextResponse.json({ error: "Acesso restrito ao dono da plataforma." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "list";
  const slug = searchParams.get("slug");

  if (action === "list") {
    // TODOS os escritórios, inclusive o interno — ver a nota no topo.
    const offices = await prisma.office.findMany({
      select: { id: true, slug: true, name: true, status: true, isInternal: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    const perfis = offices.map((o) => perfilDoEscritorio(o.slug));

    // O USO vem do banco do Lúmen, não da ponte. Ele não depende de o servidor do Hermes estar
    // de pé, nem de ninguém ter configurado nada: o registro de auditoria já grava cada pergunta
    // desde o primeiro dia. Por isso esta parte da tela responde mesmo quando a ponte não
    // responde — e é a que diz se o produto está sendo usado.
    const uso = await usoPorEscritorio(offices.map((o) => o.id));

    // Sem a ponte, a tela ainda serve: lista os escritórios e diz que o estado é desconhecido —
    // que é a verdade. É diferente de dizer "não provisionado", que seria uma afirmação falsa.
    let estados: Awaited<ReturnType<typeof estadoDosPerfis>> = [];
    let aviso: string | null = null;
    if (hermesConfigurado()) {
      try {
        estados = await estadoDosPerfis(perfis);
      } catch (erro) {
        aviso = erro instanceof FalhaDoHermes ? erro.motivo : mensagemDeErro(erro);
      }
    } else {
      aviso = "ponte não configurada";
    }

    const porPerfil = new Map(estados.map((e) => [e.perfil, e]));

    return NextResponse.json({
      aviso,
      profiles: offices.map((office) => {
        const perfil = perfilDoEscritorio(office.slug);
        const estado = porPerfil.get(perfil);
        return {
          office: {
            id: office.id,
            slug: office.slug,
            name: office.name,
            status: office.status,
            isInternal: office.isInternal,
          },
          profile: perfil,
          status: estado ? (estado.existe ? "ready" : "not_provisioned") : "unknown",
          sessionCount: estado?.sessoes ?? 0,
          memorySizeKB: estado?.memoriaKB ?? 0,
          uso: uso.get(office.id) ?? null,
        };
      }),
    });
  }

  if (action === "status" && slug) {
    const office = await prisma.office.findUnique({ where: { slug }, select: { slug: true } });
    if (!office) return NextResponse.json({ error: "Escritório não encontrado" }, { status: 404 });
    if (!hermesConfigurado()) return semPonte();

    const perfil = perfilDoEscritorio(slug);
    try {
      const [estado] = await estadoDosPerfis([perfil]);
      return NextResponse.json({
        profile: perfil,
        health: estado?.existe ? "provisioned" : "not_provisioned",
        sessionCount: estado?.sessoes ?? 0,
        memorySizeKB: estado?.memoriaKB ?? 0,
        sessions: [],
      });
    } catch (erro) {
      const motivo = erro instanceof FalhaDoHermes ? erro.motivo : mensagemDeErro(erro);
      return NextResponse.json({ error: motivo }, { status: 502 });
    }
  }

  return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
}

export async function POST(request: NextRequest) {
  if (!(await exigirDono())) {
    return NextResponse.json({ error: "Acesso restrito ao dono da plataforma." }, { status: 403 });
  }

  let body: { action?: string; slug?: string; sessionId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  }

  const { action, slug } = body;
  if (!slug) return NextResponse.json({ error: "slug obrigatório" }, { status: 400 });
  if (!hermesConfigurado()) return semPonte();

  const office = await prisma.office.findUnique({ where: { slug }, select: { slug: true } });
  if (!office) return NextResponse.json({ error: "Escritório não encontrado" }, { status: 404 });

  // Teste de verdade: manda uma pergunta e vê se volta resposta. Custa uma chamada de modelo, e
  // por isso é uma AÇÃO que alguém pede, não algo que a tela faça sozinha ao abrir.
  if (action === "restart") {
    try {
      const r = await perguntarAoHermes({ slug, mensagem: "responda apenas: ok" });
      return NextResponse.json({ success: true, message: `Respondeu: ${r.resposta.slice(0, 120)}` });
    } catch (erro) {
      const motivo = erro instanceof FalhaDoHermes ? erro.motivo : mensagemDeErro(erro);
      return NextResponse.json({ error: motivo }, { status: 502 });
    }
  }

  // Apagar memória e apagar conversa ainda não têm porta na ponte. Dizer isso é melhor que a rota
  // antiga fazia: ela chamava `fs.unlinkSync` num caminho do contêiner da Vercel, não encontrava
  // nada, e respondia "Memória limpa" — sucesso anunciado sobre coisa nenhuma.
  if (action === "clear_memory" || action === "delete_session") {
    return NextResponse.json(
      { error: "Ainda não disponível pela ponte. Será feito na máquina do Hermes." },
      { status: 501 },
    );
  }

  return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
}
