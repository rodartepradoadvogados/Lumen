import { exigirAcessoAoAtendimentoNaTela } from "@/lib/guardaDoAtendimento";
import { Card, formatDate } from "@/components/ui";
import { ArrowLeft, Bell, AlertTriangle, Clock, CheckCircle } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AlertasAppPage() {
  await exigirAcessoAoAtendimentoNaTela();

  // Buscar alertas do escritório (simplificado - usar a mesma lógica da lib/alerts)
  const alertas = [
    { id: "1", type: "PRAZO_VENCIDO", title: "Prazo vencido", description: "Contestação - Processo 12345", date: new Date(), read: false },
    { id: "2", type: "PRAZO_HOJE", title: "Prazo vence hoje", description: "Audiência - Processo 67890", date: new Date(), read: false },
    { id: "3", type: "MENCAO", title: "Menção", description: "Você foi mencionado em Atendimento João Silva", date: new Date(Date.now() - 3600000), read: true },
    { id: "4", type: "TAREFA_DELEGADA", title: "Tarefa delegada", description: "Nova tarefa: Revisar contrato", date: new Date(Date.now() - 7200000), read: true },
  ];

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <Link href="/atendimento-app" className="inline-flex items-center gap-1 text-corpo font-semibold text-tx-2">
        <ArrowLeft size={13} /> Triagem
      </Link>

      <h1 className="text-xl font-bold text-tx">Alertas</h1>

      <Card>
        {alertas.length === 0 ? (
          <div className="p-8 text-center text-tx-2">Nenhum alerta no momento.</div>
        ) : (
          <div className="divide-y divide-regua">
            {alertas.map((a) => (
              <Link key={a.id} href="#" className={`flex items-start gap-3 px-4 py-3.5 hover:bg-sf-apoio transition-colors ${!a.read ? "bg-ouro-bg/20" : ""}`}>
                <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${a.type === "PRAZO_VENCIDO" ? "bg-urgente/10 text-urgente" : a.type === "PRAZO_HOJE" ? "bg-aviso/10 text-aviso" : "bg-ouro-bg text-ouro-acento"}`}>
                  {a.type === "PRAZO_VENCIDO" && <AlertTriangle size={18} />}
                  {a.type === "PRAZO_HOJE" && <Clock size={18} />}
                  {a.type === "MENCAO" && <Bell size={18} />}
                  {a.type === "TAREFA_DELEGADA" && <CheckCircle size={18} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-tx">{a.title}</p>
                    {!a.read && <span className="h-2 w-2 rounded-full bg-ouro-acento shrink-0" />}
                  </div>
                  <p className="text-xs text-tx-2 mt-0.5 truncate">{a.description}</p>
                  <p className="text-xs text-tx-3 mt-1">{formatDate(a.date)}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}