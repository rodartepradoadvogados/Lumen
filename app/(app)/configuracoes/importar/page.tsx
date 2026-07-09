import Link from "next/link";
import { PageHeader, Card, CardHeader } from "@/components/ui";
import ImportForm from "@/components/ImportForm";
import { importCases, importAgenda } from "@/lib/actions/import";

export const dynamic = "force-dynamic";

export default function ImportarPage() {
  return (
    <div className="p-6 max-w-[800px] mx-auto animate-fade-in">
      <Link href="/configuracoes" className="text-xs font-semibold text-navy-800/50 hover:text-navy-900">
        ← Configurações
      </Link>
      <PageHeader title="Importar Dados" subtitle="Traga processos, casos e agenda de uma planilha (.xlsx ou .csv)" />

      <div className="space-y-5">
        <Card>
          <CardHeader title="Processos e Casos" subtitle="Colunas esperadas: Tipo, Título, Papel do cliente, Cliente, Outros envolvidos, Pasta, Ação, Número, Data de distribuição, Objeto, Matéria, Valor da causa, Vara, Foro, Responsável, entre outras" />
          <div className="p-5">
            <ImportForm
              action={importCases}
              label="Importar Processos/Casos"
              hint="Clientes e partes adversas citados na planilha são cadastrados automaticamente de forma simplificada."
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Agenda" subtitle="Colunas esperadas: Data, Hora, Tipo, Responsável, Título, Título do processo/caso/atendimento, Número do processo, Juízo, Status, Prioridade" />
          <div className="p-5">
            <ImportForm
              action={importAgenda}
              label="Importar Agenda"
              hint="Itens são vinculados automaticamente a processos já existentes quando o número ou título coincidir; caso contrário ficam sem vínculo."
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
