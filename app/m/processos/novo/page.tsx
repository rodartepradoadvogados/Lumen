import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui";
import MobileNewCaseForm from "@/components/mobile/MobileNewCaseForm";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function MobileNewCasePage({ searchParams }: { searchParams: { type?: string; processNumber?: string } }) {
  const [clients, users, assessoriasRaw] = await Promise.all([
    prisma.client.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.assessoria.findMany({ where: { status: "ATIVA" }, include: { client: true }, orderBy: { client: { name: "asc" } } }),
  ]);
  const assessorias = assessoriasRaw.map((a) => ({ id: a.id, clientName: a.client.name }));

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link href="/m/publicacoes" className="inline-flex items-center gap-1 text-xs font-semibold text-navy-800/50 dark:text-cream-50/50">
        <ArrowLeft size={13} /> Publicações
      </Link>

      <div>
        <h1 className="font-serif text-xl font-bold text-navy-900 dark:text-cream-50">Novo Processo/Caso</h1>
        <p className="text-sm text-navy-800/50 dark:text-cream-50/50">Cadastre um novo card — ele aparece na Agenda e no Kanban conforme tarefas forem criadas</p>
      </div>

      <Card className="p-4">
        <MobileNewCaseForm
          clients={clients}
          users={users}
          assessorias={assessorias}
          defaultType={searchParams.type || "JUDICIAL"}
          defaultProcessNumber={searchParams.processNumber || ""}
        />
      </Card>
    </div>
  );
}
