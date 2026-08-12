import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { gerarRelatorio } from "@/lib/actions/relatorioPersonalizado";
import { BASE_DATA_OPCOES, CRITERIO_AUTORIA_OPCOES, filtrosPadrao, type RelatorioFiltros } from "@/lib/relatorioPersonalizado";
import { montarRelatorioWord } from "@/lib/relatorioDocx";

export const dynamic = "force-dynamic";

// Download do Relatório Personalizado em Word. GET (e não POST) porque o disparo é um clique que
// deve virar download direto no navegador, sem tela intermediária — os filtros vão no mesmo
// formato base64 usado pela folha de impressão.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });

  const bruto = new URL(req.url).searchParams.get("f");
  let filtros: RelatorioFiltros;
  try {
    filtros = bruto
      ? (JSON.parse(decodeURIComponent(Buffer.from(bruto, "base64").toString("utf8"))) as RelatorioFiltros)
      : filtrosPadrao();
  } catch {
    filtros = filtrosPadrao();
  }

  const [office, r] = await Promise.all([
    prisma.office.findUnique({
      where: { id: user.officeId },
      select: { name: true, cnpj: true, timbradoUrl: true, timbradoFormato: true },
    }),
    gerarRelatorio(filtros),
  ]);

  if (r.error || !r.resultado) {
    return NextResponse.json({ error: r.error ?? "Não foi possível gerar o relatório." }, { status: 400 });
  }

  // Só o timbrado em .docx serve de recipiente para um .docx. Com timbrado em PDF (ou sem
  // timbrado), o documento sai com cabeçalho textual do escritório — nunca em branco.
  let timbrado: Buffer | null = null;
  if (office?.timbradoUrl && office.timbradoFormato === "DOCX") {
    try {
      const resp = await fetch(office.timbradoUrl);
      if (resp.ok) timbrado = Buffer.from(await resp.arrayBuffer());
    } catch {
      // Timbrado inacessível não pode impedir a emissão do relatório — segue sem ele.
      timbrado = null;
    }
  }

  let arquivo: Buffer;
  try {
    arquivo = montarRelatorioWord(
      r.resultado,
      {
        escritorio: office?.name ?? "",
        cnpj: office?.cnpj ?? null,
        de: filtros.de,
        ate: filtros.ate,
        baseLabel: BASE_DATA_OPCOES.find((o) => o.value === filtros.baseData)?.label ?? "",
        criterioLabel: CRITERIO_AUTORIA_OPCOES.find((o) => o.value === filtros.criterioAutoria)?.label ?? "",
        emitidoPor: user.name,
        incluirCabecalhoTextual: !timbrado,
      },
      timbrado
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro ao gerar o documento." }, { status: 400 });
  }

  const nome = `Relatorio-${filtros.de}-a-${filtros.ate}.docx`;
  return new NextResponse(new Uint8Array(arquivo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "no-store",
    },
  });
}
