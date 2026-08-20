import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { PageHeader, Card, CardHeader } from "@/components/ui";
import { getMinhaPreferenciaComunicados } from "@/lib/actions/comunicados";
import { listEmailTemplates } from "@/lib/actions/emailTemplates";
import ComunicadosForm from "@/components/comunicados/ComunicadosForm";
import TemplateEditor from "@/components/comunicados/TemplateEditor";

export const dynamic = "force-dynamic";

// Documento 06 (Fase 3 — Comunicados): "os comunicados por e-mail ou pop-up no celular somente
// uma vez ao dia" — regra do dono do escritório. Coluna da esquerda (regras, Blocos 1-3) é
// pessoal, sem gate de isAdmin, mesma lógica de app/(app)/perfil — qualquer pessoa do escritório
// decide o próprio horário/exceções. Coluna da direita (editor de template) é ADMIN-ONLY — o
// template afeta o e-mail que todo mundo do escritório recebe pro mesmo evento, então só sócio
// vê/edita (lib/actions/emailTemplates.ts já garante isso no servidor).
export default async function ComunicadosPage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/");

  const preferencia = await getMinhaPreferenciaComunicados();
  const templates = viewer.isAdmin ? await listEmailTemplates() : null;

  return (
    <div className="p-6 max-w-[1400px] mx-auto animate-fade-in space-y-6">
      <Link href="/configuracoes" className="text-xs font-semibold text-tx-3 hover:text-tx">
        ← Configurações
      </Link>
      <PageHeader title="Comunicados" subtitle="Um resumo por dia, no horário que você escolher — com exceção curta para o que não pode esperar" />

      <div className={`grid grid-cols-1 gap-6 ${templates && !("error" in templates) ? "lg:grid-cols-[640px_1fr]" : ""}`}>
        <Card className="max-w-[640px]">
          <CardHeader title="Suas regras" />
          <div className="p-5">
            <ComunicadosForm initial={preferencia} />
          </div>
        </Card>

        {templates && !("error" in templates) && (
          <Card>
            <CardHeader title="Templates de e-mail" subtitle="O que todo mundo do escritório recebe — só sócios editam" />
            <div className="p-5">
              <TemplateEditor initial={templates} />
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
