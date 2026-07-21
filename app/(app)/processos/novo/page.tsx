import { prisma } from "@/lib/prisma";
import { createCase } from "@/lib/actions/cases";
import { PageHeader, Card } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function NewCasePage({ searchParams }: { searchParams: { type?: string; processNumber?: string; title?: string } }) {
  const defaultType = searchParams.type || "JUDICIAL";
  const [clients, users] = await Promise.all([
    prisma.client.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  async function submit(formData: FormData) {
    "use server";
    await createCase({
      title: String(formData.get("title")),
      type: String(formData.get("type")),
      area: String(formData.get("area") || ""),
      processNumber: String(formData.get("processNumber") || ""),
      court: String(formData.get("court") || ""),
      caseValue: String(formData.get("caseValue") || ""),
      clientId: String(formData.get("clientId") || ""),
      opposingPartyName: String(formData.get("opposingPartyName") || ""),
      opposingPartyRole: String(formData.get("opposingPartyRole") || ""),
      responsibleId: String(formData.get("responsibleId") || ""),
      description: String(formData.get("description") || ""),
    });
  }

  return (
    <div className="p-6 max-w-2xl mx-auto animate-fade-in">
      <PageHeader title="Novo Processo/Caso" subtitle="Cadastre um novo card — ele aparecerá na Agenda e no Kanban conforme tarefas forem criadas" />
      <Card className="p-6">
        <form action={submit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Título do Caso</label>
            <input name="title" required defaultValue={searchParams.title} className="input" placeholder="Ex: Fulano de Tal x Empresa XYZ" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Tipo</label>
              <select name="type" defaultValue={defaultType} className="input">
                <option value="JUDICIAL">Judicial</option>
                <option value="EXTRAJUDICIAL">Extrajudicial</option>
                <option value="ATENDIMENTO">Atendimento</option>
                <option value="CONSULTIVO">Consultivo</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Área</label>
              <input name="area" className="input" placeholder="Cível, Trabalhista, Família..." />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Número do Processo</label>
              <input name="processNumber" defaultValue={searchParams.processNumber} className="input" placeholder="0000000-00.0000.0.00.0000" />
            </div>
            <div>
              <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Vara/Comarca</label>
              <input name="court" className="input" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Valor da Causa (R$)</label>
              <input name="caseValue" type="number" step="0.01" className="input" />
            </div>
            <div>
              <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Advogado Responsável</label>
              <select name="responsibleId" className="input">
                <option value="">Não definido</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Cliente</label>
            <select name="clientId" className="input">
              <option value="">Selecionar cliente...</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Parte Adversa (nome)</label>
              <input name="opposingPartyName" className="input" placeholder="Nome da parte contrária" />
            </div>
            <div>
              <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Polo da Parte Adversa</label>
              <select name="opposingPartyRole" className="input">
                <option value="">Não definido</option>
                <option value="AUTOR">Autor</option>
                <option value="REU">Réu</option>
                <option value="OUTRO">Outro</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Descrição / Observações</label>
            <textarea name="description" rows={3} className="input" />
          </div>

          <button type="submit" className="w-full bg-gold-600 hover:bg-gold-700 text-white font-semibold py-2.5 rounded-lg transition-colors">
            Criar Caso
          </button>
        </form>
      </Card>

      <style>{`
        .input { width: 100%; margin-top: 0.25rem; border: 1px solid rgba(15,31,61,0.12); border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; color: #14213d; background: #fff; }
        .input:focus { outline: none; box-shadow: 0 0 0 2px rgba(198,160,92,0.4); }
        .dark .input { border-color: rgba(255,255,255,0.15); background: #0f1f3d; color: #fbfaf7; }
      `}</style>
    </div>
  );
}
