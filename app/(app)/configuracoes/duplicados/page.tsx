import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/currentUser";
import { PageHeader } from "@/components/ui";
import { listarClientesDuplicados } from "@/lib/actions/clientDuplicates";
import DuplicadosClientesView from "@/components/DuplicadosClientesView";
import PastasParecidasDriveView from "@/components/PastasParecidasDriveView";

export const dynamic = "force-dynamic";

export default async function DuplicadosPage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");
  if (!viewer.isAdmin) redirect("/configuracoes");

  const { error, grupos } = await listarClientesDuplicados();

  return (
    <div className="p-6 max-w-4xl mx-auto animate-fade-in space-y-6">
      <Link href="/configuracoes?secao=modelos&cat=documentos" className="inline-flex items-center gap-1.5 text-xs text-tx-2 hover:text-tx">
        <ArrowLeft size={13} /> Voltar para Modelos &amp; Integrações
      </Link>

      <PageHeader
        title="Cadastros de cliente parecidos"
        subtitle="Agrupa clientes com o mesmo nome (ignorando acento, maiúscula e espaço) — a causa mais comum de a mesma empresa aparecer duas vezes em Assessoria, cada uma com sua própria pasta no Drive"
      />

      <div className="bg-acao-bg border border-regua rounded-xl px-4 py-3 text-xs text-tx-2 space-y-1">
        <p>
          Cada cliente tem no máximo uma Assessoria — então duas pastas da mesma empresa em Assessoria só acontecem
          quando existem <strong className="text-tx">dois cadastros de cliente</strong> para ela. Escolha qual é o
          correto e unifique o outro dentro dele.
        </p>
        <p>
          <strong className="text-tx">Nada é apagado.</strong> O que sai do lugar antigo no Drive vai para a Lixeira
          (reversível por 30 dias); nenhum cadastro de cliente é excluído, e a Assessoria duplicada vira histórico
          encerrado, não é removida.
        </p>
      </div>

      {error ? <p className="text-sm text-urgente bg-urgente-bg rounded-lg px-3 py-2">{error}</p> : <DuplicadosClientesView grupos={grupos ?? []} />}

      <div className="pt-2">
        <PageHeader
          title="Pastas parecidas no Drive (Assessoria)"
          subtitle="Olha direto pro Drive, independente do cadastro no banco — inclusive pastas soltas ou cujo nome só bate por causa do CPF/CNPJ escrito nele"
        />
      </div>
      <PastasParecidasDriveView />
    </div>
  );
}
