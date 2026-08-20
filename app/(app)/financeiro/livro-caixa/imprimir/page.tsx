import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { extratoComSaldo } from "@/lib/caixaMovimentos";
import { formatCurrency, formatDate } from "@/components/ui";
import ImprimirAoAbrir from "@/components/relatorios/ImprimirAoAbrir";
import { FolhaImprimivelStyle, FolhaCabecalho } from "@/components/relatorios/FolhaImprimivel";

export const dynamic = "force-dynamic";

// Folha imprimível do Livro Caixa — mesma lógica de saldo/filtro da tela
// (app/(app)/financeiro/livro-caixa/page.tsx) e da exportação (.xlsx), sem teto de linhas: quem
// imprime já filtrou de propósito. Ver comentário de app/(app)/financeiro/dre/imprimir/page.tsx
// sobre o caminho de impressão (sem biblioteca de PDF no projeto, de propósito).
export default async function ImprimirLivroCaixaPage({ searchParams }: { searchParams: { from?: string; to?: string } }) {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");

  const de = searchParams.from ? new Date(searchParams.from) : undefined;
  const ate = searchParams.to ? new Date(`${searchParams.to}T23:59:59`) : new Date();

  const [office, linhas] = await Promise.all([
    prisma.office.findUnique({ where: { id: viewer.officeId }, select: { name: true, cnpj: true } }),
    extratoComSaldo(viewer.officeId, { de, ate }),
  ]);

  const subtitulo = de ? `${de.toLocaleDateString("pt-BR")} a ${ate.toLocaleDateString("pt-BR")}` : `até ${ate.toLocaleDateString("pt-BR")}`;

  return (
    <>
      <FolhaImprimivelStyle />
      <ImprimirAoAbrir />
      <div className="folha">
        <FolhaCabecalho officeName={office?.name} officeCnpj={office?.cnpj} titulo="Livro Caixa" subtitulo={subtitulo} emitidoPor={viewer.name} />

        {linhas.length === 0 ? (
          <p>Nenhuma movimentação no período.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Descrição</th>
                <th style={{ textAlign: "right" }}>Valor</th>
                <th style={{ textAlign: "right" }}>Saldo Acumulado</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{formatDate(l.data)}</td>
                  <td>{l.descricao}</td>
                  <td style={{ textAlign: "right" }}>
                    {l.tipo === "entrada" ? "+" : ""}
                    {formatCurrency(l.valor)}
                  </td>
                  <td style={{ textAlign: "right" }}>{formatCurrency(l.saldo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
