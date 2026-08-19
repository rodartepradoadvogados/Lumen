import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { PageHeader, Card, CardHeader } from "@/components/ui";
import { getMinhaPreferenciaComunicados } from "@/lib/actions/comunicados";
import ComunicadosForm from "@/components/comunicados/ComunicadosForm";

export const dynamic = "force-dynamic";

// Documento 06 (Fase 3 — Comunicados): "os comunicados por e-mail ou pop-up no celular somente
// uma vez ao dia" — regra do dono do escritório. Nova rota, pessoal (cada usuário configura a
// própria); sem gate de isAdmin, mesma lógica de app/(app)/perfil — qualquer pessoa do
// escritório decide o próprio horário/exceções.
//
// Editor de template (coluna com prévia ao vivo, documento 06) fica para a próxima PR desta
// fase — esta cobre só a coluna de regras (Blocos 1-3).
export default async function ComunicadosPage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");

  const preferencia = await getMinhaPreferenciaComunicados();

  return (
    <div className="p-6 max-w-[720px] mx-auto animate-fade-in space-y-6">
      <Link href="/configuracoes" className="text-xs font-semibold text-tx-3 hover:text-tx">
        ← Configurações
      </Link>
      <PageHeader title="Comunicados" subtitle="Um resumo por dia, no horário que você escolher — com exceção curta para o que não pode esperar" />

      <Card>
        <CardHeader title="Suas regras" />
        <div className="p-5">
          <ComunicadosForm initial={preferencia} />
        </div>
      </Card>
    </div>
  );
}
