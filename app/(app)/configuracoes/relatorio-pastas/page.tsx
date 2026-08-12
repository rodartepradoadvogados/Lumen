import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { PageHeader, Card, CardHeader } from "@/components/ui";
import { naturezaOf, NATUREZA_LABELS } from "@/lib/caseNatureza";

export const dynamic = "force-dynamic";

// Nomes de raiz — idênticos nos três provedores (ver lib/googleDrive.ts, lib/oneDriveStorage.ts,
// lib/dropboxStorage.ts: as constantes *_ROOT_NAME têm o mesmo valor nos três arquivos). Repetidos
// aqui como string literal, e não importados, porque essas constantes não são exportadas — são
// implementação interna de cada módulo de armazenamento; duplicar 5 strings é mais simples e mais
// seguro do que exportar constantes internas só para uma tela de relatório ler.
const RAIZ = {
  processos: "Lúmen - Processos",
  casos: "Lúmen - Casos",
  assessoria: "Lúmen - Assessoria",
} as const;

const PROVIDER_LABELS: Record<string, string> = {
  GOOGLE_DRIVE: "Google Drive",
  ONEDRIVE: "OneDrive",
  DROPBOX: "Dropbox",
};

export default async function RelatorioPastasPage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");
  if (!viewer.isAdmin) redirect("/configuracoes");

  const [office, casesRaw, assessoriasRaw] = await Promise.all([
    prisma.office.findUnique({ where: { id: viewer.officeId }, select: { storageProvider: true } }),
    prisma.case.findMany({
      where: { officeId: viewer.officeId, status: "ATIVO" },
      select: {
        id: true,
        title: true,
        processNumber: true,
        type: true,
        driveFolderId: true,
        assessoria: { select: { client: { select: { name: true } } } },
      },
      orderBy: { title: "asc" },
    }),
    prisma.assessoria.findMany({
      where: { officeId: viewer.officeId, status: "ATIVA" },
      select: { id: true, driveFolderId: true, client: { select: { name: true } } },
      orderBy: { client: { name: "asc" } },
    }),
  ]);

  const providerLabel = PROVIDER_LABELS[office?.storageProvider ?? "GOOGLE_DRIVE"] ?? office?.storageProvider ?? "—";

  const processos = casesRaw.filter((c) => naturezaOf(c.type) !== "CASO");
  const casos = casesRaw.filter((c) => naturezaOf(c.type) === "CASO");

  return (
    <div className="p-6 max-w-5xl mx-auto animate-fade-in space-y-6">
      <Link href="/configuracoes?secao=modelos" className="inline-flex items-center gap-1.5 text-xs text-tx-2 hover:text-tx">
        <ArrowLeft size={13} /> Voltar para Modelos &amp; Integrações
      </Link>

      <PageHeader
        title="Onde os anexos estão sendo salvos"
        subtitle={`${processos.length} processo(s), ${casos.length} caso(s) e ${assessoriasRaw.length} assessoria(s) ativos · armazenamento: ${providerLabel}`}
      />

      <div className="bg-acao-bg border border-regua rounded-xl px-4 py-3 text-xs text-tx-2 space-y-1">
        <p>
          O <strong className="text-tx">caminho</strong> abaixo é o que a convenção do sistema usa para criar pasta nova — a mesma
          regra de <code className="bg-sf px-1 rounded">getOrCreateCaseFolder</code>/<code className="bg-sf px-1 rounded">getOrCreateAssessoriaCompanyFolder</code>. A
          coluna <strong className="text-tx">Pasta</strong> mostra se ela já existe de fato: quando ainda não existe, nasce
          automaticamente no primeiro anexo enviado, exatamente nesse caminho.
        </p>
        <p>
          Se uma pasta foi criada antes da migração para a pasta-mãe &ldquo;Lúmen&rdquo;, ela pode ainda estar solta na raiz do
          armazenamento, fora do caminho mostrado aqui, até você rodar &ldquo;Conferir migração da pasta-mãe&rdquo; em Modelos &amp;
          Integrações → Manutenção do Drive.
        </p>
      </div>

      <Card>
        <CardHeader title="Processos" subtitle={`${processos.length} ativo(s) — Judicial e Administrativo`} />
        <FolderTable
          rows={processos.map((c) => ({
            id: c.id,
            href: `/processos/${c.id}`,
            titulo: c.title,
            detalhe: c.processNumber ?? undefined,
            tag: NATUREZA_LABELS[naturezaOf(c.type)],
            caminho: `Lúmen › ${RAIZ.processos} › ${c.title}`,
            temPasta: Boolean(c.driveFolderId),
          }))}
          semRegistro="Nenhum processo ativo."
        />
      </Card>

      <Card>
        <CardHeader title="Casos" subtitle={`${casos.length} ativo(s) — extrajudicial, consultivo e legados`} />
        <FolderTable
          rows={casos.map((c) => ({
            id: c.id,
            href: `/processos/${c.id}`,
            titulo: c.title,
            detalhe: c.assessoria?.client.name ? `Vinculado a ${c.assessoria.client.name}` : undefined,
            tag: NATUREZA_LABELS.CASO,
            // Caso vinculado a assessoria continua indo pra Lúmen - Casos por decisão do dono do
            // escritório (ver PR #6): fica fora da pasta da empresa de propósito, pra não gerar
            // erro de organização — não existe um caminho "dentro da assessoria" a mostrar aqui.
            caminho: `Lúmen › ${RAIZ.casos} › ${c.title}`,
            temPasta: Boolean(c.driveFolderId),
          }))}
          semRegistro="Nenhum caso ativo."
        />
      </Card>

      <Card>
        <CardHeader title="Assessorias jurídicas" subtitle={`${assessoriasRaw.length} ativa(s)`} />
        <FolderTable
          rows={assessoriasRaw.map((a) => ({
            id: a.id,
            href: `/assessoria/${a.id}`,
            titulo: a.client.name,
            tag: "Assessoria",
            caminho: `Lúmen › ${RAIZ.assessoria} › ${a.client.name}`,
            temPasta: Boolean(a.driveFolderId),
          }))}
          semRegistro="Nenhuma assessoria ativa."
        />
      </Card>
    </div>
  );
}

function FolderTable({
  rows,
  semRegistro,
}: {
  rows: { id: string; href: string; titulo: string; detalhe?: string; tag: string; caminho: string; temPasta: boolean }[];
  semRegistro: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-tx-2 p-5">{semRegistro}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-sf-apoio">
          <tr>
            <th className="text-left px-4 py-2 font-semibold text-tx-2 text-xs uppercase tracking-wide">Nome</th>
            <th className="text-left px-4 py-2 font-semibold text-tx-2 text-xs uppercase tracking-wide">Caminho no armazenamento</th>
            <th className="text-left px-4 py-2 font-semibold text-tx-2 text-xs uppercase tracking-wide">Pasta</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-regua">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-2.5 align-top">
                <Link href={r.href} className="text-acao hover:underline font-medium">
                  {r.titulo}
                </Link>
                <div className="text-[11px] text-tx-3 tabular-nums">{r.detalhe ?? r.tag}</div>
              </td>
              <td className="px-4 py-2.5 align-top text-tx-2 font-mono text-xs">{r.caminho}</td>
              <td className="px-4 py-2.5 align-top">
                {r.temPasta ? (
                  <span className="text-concluido text-xs font-semibold">Já existe</span>
                ) : (
                  <span className="text-tx-3 text-xs">Nasce no 1º anexo</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
