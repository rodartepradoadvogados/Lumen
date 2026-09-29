import CabecalhoDeSecao from "@/components/configuracoes/SecaoDeConfiguracao";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { Card, CardHeader } from "@/components/ui";
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
    <div className="space-y-6">
      <CabecalhoDeSecao title="Comunicados" subtitle="Um resumo por dia, no horário que você escolher — com exceção curta para o que não pode esperar" />

      {/* Duas colunas só a partir de 1536px (2xl). Com `lg`, em 1280px a coluna do editor sobrava com
          ~120px e as guias Corpo/Assunto/Rodapé estouravam a largura do <main> em 38px. */}
      <div className={`grid grid-cols-1 gap-6 ${templates && !("error" in templates) ? "2xl:grid-cols-[640px_minmax(0,1fr)]" : ""}`}>
        <Card className="max-w-[640px]">
          <CardHeader title="Suas regras" />
          <div className="p-5">
            <ComunicadosForm initial={preferencia} />
          </div>
        </Card>

        {templates && !("error" in templates) && (
          <Card className="min-w-0">
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
