import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { PageHeader, Card, CardHeader } from "@/components/ui";
import { naturezaOf, NATUREZA_LABELS } from "@/lib/caseNatureza";
import { RAIZ_ROTULO, type RaizKey } from "@/lib/driveNaming";
import { nomeacaoDoEscritorio } from "@/lib/driveNamingOffice";

export const dynamic = "force-dynamic";

const PROVIDER_LABELS: Record<string, string> = {
  GOOGLE_DRIVE: "Google Drive",
  ONEDRIVE: "OneDrive",
  DROPBOX: "Dropbox",
};

export default async function RelatorioPastasPage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");
  if (!viewer.isAdmin) redirect("/configuracoes");

  // Os nomes vêm da MESMA fonte que o sistema usa para criar as pastas (lib/driveNaming.ts) e são
  // os DESTE escritório. Antes esta tela repetia os literais "Lúmen - *" por conta própria, com um
  // comentário admitindo a duplicação — o que a deixaria livre para divergir do que o sistema
  // realmente cria assim que a nomenclatura virasse configurável.
  const [nomeacao, office, casesRaw, assessoriasRaw, atendimentosCount] = await Promise.all([
    nomeacaoDoEscritorio(viewer.officeId),
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
    prisma.attendance.count({ where: { officeId: viewer.officeId } }),
  ]);

  const providerLabel = PROVIDER_LABELS[office?.storageProvider ?? "GOOGLE_DRIVE"] ?? office?.storageProvider ?? "—";

  const processos = casesRaw.filter((c) => naturezaOf(c.type) !== "CASO");
  const casos = casesRaw.filter((c) => naturezaOf(c.type) === "CASO");

  const caminho = (raiz: RaizKey, item?: string) =>
    [nomeacao.pastaMae, nomeacao.raizes[raiz], item].filter(Boolean).join(" › ");

  const raizes = Object.keys(RAIZ_ROTULO) as RaizKey[];

  return (
    <div className="p-6 max-w-5xl mx-auto animate-fade-in space-y-6">
      <Link href="/conexoes" className="inline-flex items-center gap-1.5 text-xs text-tx-2 hover:text-tx">
        <ArrowLeft size={13} /> Voltar para Conexões
      </Link>

      <PageHeader
        title="Onde os anexos estão sendo salvos"
        subtitle={`${processos.length} processo(s), ${casos.length} caso(s) e ${assessoriasRaw.length} assessoria(s) ativos · armazenamento: ${providerLabel}`}
      />

      <div className="bg-acao-bg border-t-2 border-regua-forte px-4 py-3 text-xs text-tx-2 space-y-1">
        <p>
          O <strong className="text-tx">caminho</strong> abaixo é o que a convenção deste escritório usa para criar pasta nova. A
          coluna <strong className="text-tx">Pasta</strong> mostra se ela já existe de fato: quando ainda não existe, nasce
          automaticamente no primeiro anexo enviado, exatamente nesse caminho.
        </p>
        <p>
          Os nomes vêm de{" "}
          <Link href="/configuracoes?secao=geral" className="text-acao font-semibold hover:underline">
            Configurações → Geral → Pastas no armazenamento
          </Link>
          . Mudar a configuração lá muda o caminho das pastas <strong className="text-tx">novas</strong>; as que já existem
          continuam onde estão, com os links intactos.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Estrutura deste escritório"
          subtitle={`Pasta-mãe “${nomeacao.pastaMae}” · ${raizes.length} pastas de sistema`}
        />
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-x-6">
          {raizes.map((r) => (
            <div key={r} className="flex items-baseline justify-between gap-3 py-1.5 border-b border-regua">
              <span className="text-xs text-tx-2 shrink-0">{RAIZ_ROTULO[r]}</span>
              <span className="text-[11px] font-mono text-tx truncate">{nomeacao.raizes[r]}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Processos" subtitle={`${processos.length} ativo(s) — Judicial e Administrativo`} />
        <FolderTable
          rows={processos.map((c) => ({
            id: c.id,
            href: `/processos/${c.id}`,
            titulo: c.title,
            detalhe: c.processNumber ?? undefined,
            tag: NATUREZA_LABELS[naturezaOf(c.type)],
            caminho: caminho("processos", c.title),
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
            // Caso vinculado a assessoria continua indo pra raiz de Casos por decisão do dono do
            // escritório (ver PR #6): fica fora da pasta da empresa de propósito, pra não gerar
            // erro de organização — não existe um caminho "dentro da assessoria" a mostrar aqui.
            caminho: caminho("casos", c.title),
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
            caminho: caminho("assessoria", a.client.name),
            temPasta: Boolean(a.driveFolderId),
          }))}
          semRegistro="Nenhuma assessoria ativa."
        />
      </Card>

      {atendimentosCount > 0 && (
        <Card>
          <CardHeader title="Atendimentos" subtitle={`${atendimentosCount} cadastrado(s)`} />
          <p className="text-sm text-tx-2 p-5">
            Cada atendimento com anexo ganha uma pasta em{" "}
            <code className="bg-sf-apoio px-1 rounded font-mono text-xs">{caminho("atendimentos", "{assunto}")}</code>.
          </p>
        </Card>
      )}
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
