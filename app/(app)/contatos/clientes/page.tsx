import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { Card } from "@/components/ui";
import NewContactModal from "@/components/NewContactModal";
import ClientesSearchList from "@/components/ClientesSearchList";
import { contar } from "@/lib/plural";
import PessoasPagina from "@/components/gestao/PessoasPagina";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const viewer = await getCurrentUser();
  if (!viewer) notFound();

  // SEGURANÇA (achado V8, auditoria de 05/09/2026): a lista carregava TODO cliente do escritório
  // de uma vez (necessário para a busca client-side instantânea de ClientesSearchList) — sem
  // teto nenhum. Mesmo padrão de app/(app)/processos/page.tsx: um limite alto, bem acima de
  // qualquer escritório real hoje, mais aviso de truncamento em vez de paginação de verdade
  // (mudaria a busca client-side, que depende da lista inteira já carregada).
  const CLIENTS_TAKE = 1000;
  const [clients, totalClients] = await Promise.all([
    prisma.client.findMany({
      where: { officeId: viewer.officeId },
      include: { _count: { select: { cases: true } } },
      orderBy: { name: "asc" },
      take: CLIENTS_TAKE,
    }),
    prisma.client.count({ where: { officeId: viewer.officeId } }),
  ]);

  return (
    <PessoasPagina ativa="clientes" officeId={viewer.officeId} isAdmin={Boolean(viewer.isAdmin)} frase={contar(clients.length, "cliente cadastrado", "clientes cadastrados")} acao={<NewContactModal kind="client" />}>
      {clients.length < totalClients && (
        <p className="text-xs text-tx-3 -mt-3 mb-4">
          Mostrando os primeiros {clients.length} de {totalClients} clientes cadastrados.
        </p>
      )}
      <Card>
        <ClientesSearchList clients={clients} />
      </Card>
    </PessoasPagina>
  );
}
