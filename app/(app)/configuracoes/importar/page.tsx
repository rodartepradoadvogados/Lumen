import Link from "next/link";
import { PageHeader, Card, CardHeader } from "@/components/ui";
import ImportForm from "@/components/ImportForm";
import { importCases, importAgenda, importFinance } from "@/lib/actions/import";
import { Download } from "lucide-react";

export const dynamic = "force-dynamic";

function TemplateLink({ href }: { href: string }) {
  return (
    <a href={href} download className="inline-flex items-center gap-1 text-xs font-semibold text-gold-700 hover:text-gold-800">
      <Download size={12} /> Baixar modelo .csv
    </a>
  );
}

export default function ImportarPage() {
  return (
    <div className="p-6 max-w-[800px] mx-auto animate-fade-in">
      <Link href="/configuracoes" className="text-xs font-semibold text-navy-800/50 hover:text-navy-900">
        ← Configurações
      </Link>
      <PageHeader title="Importar Dados" subtitle="Traga contatos, processos, agenda e financeiro de uma planilha (.xlsx ou .csv)" />

      <div className="space-y-5">
        <Card>
          <CardHeader
            title="Processos, Casos e Atendimentos"
            subtitle="Tipo aceita: Processo, Caso ou Atendimento. Colunas: Papel do cliente, Cliente, Outros envolvidos, Pasta, Ação, Número, Data de distribuição, Objeto, Matéria, Valor da causa, Vara, Foro, Responsável, entre outras."
          />
          <div className="p-5 space-y-3">
            <TemplateLink href="/templates/modelo-processos-casos-atendimentos.csv" />
            <ImportForm
              action={importCases}
              label="Importar Processos/Casos/Atendimentos"
              hint="Clientes e partes adversas citados na planilha são cadastrados automaticamente de forma simplificada."
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Agenda" subtitle="Colunas: Data, Hora, Tipo, Responsável, Título, Título do processo/caso/atendimento, Número do processo, Juízo, Status, Prioridade" />
          <div className="p-5 space-y-3">
            <TemplateLink href="/templates/modelo-agenda.csv" />
            <ImportForm
              action={importAgenda}
              label="Importar Agenda"
              hint="Itens são vinculados automaticamente a processos já existentes quando o número ou título coincidir; caso contrário ficam sem vínculo."
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Financeiro" subtitle="Colunas: Data, Descricao, Categoria, Centro de custo, Pago para / Recebido de, Cliente, Caso, Responsavel, Valor, Tipo (Entrada/Saída/Fatura), Status" />
          <div className="p-5 space-y-3">
            <TemplateLink href="/templates/modelo-financeiro.csv" />
            <ImportForm
              action={importFinance}
              label="Importar Financeiro"
              hint="Entrada/Fatura vira Conta a Receber, Saída vira Conta a Pagar. Categorias e centros de custo citados são cadastrados automaticamente se não existirem."
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Contatos (Clientes)" subtitle="Colunas: Nome, Tipo (PF/PJ), Documento, Email, Telefone, Endereço, Observações" />
          <div className="p-5 space-y-3">
            <TemplateLink href="/templates/modelo-contatos.csv" />
            <p className="text-xs text-navy-800/50">
              Para importar contatos avulsos, cadastre diretamente em{" "}
              <Link href="/contatos/clientes" className="text-gold-700 hover:underline">
                Contatos → Clientes
              </Link>{" "}
              — clientes citados nas planilhas de Processos e Financeiro já são criados automaticamente.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
