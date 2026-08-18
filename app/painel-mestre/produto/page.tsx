import { requirePlatformAccess } from "@/lib/platformMember";
import { prisma } from "@/lib/prisma";
import { LumenPanel, LumenPanelHeader, LumenStat, LumenStatusDot } from "@/components/painelMestre/LumenUi";

export const dynamic = "force-dynamic";

// Mesmo cálculo de app/(app)/configuracoes/page.tsx (formatRelativeTime) — copiado aqui de
// propósito: é uma função pura, sem dependência de servidor, e este painel não importa nada
// daquela página (área do escritório) para não criar acoplamento entre as duas cascas visuais.
function formatRelativeTime(date: Date): string {
  const minutos = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutos < 1) return "agora mesmo";
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `há ${horas}h`;
  const dias = Math.round(horas / 24);
  return `há ${dias} dia(s)`;
}

type RoboLog = { id: number; fonte: string; sucesso: boolean; detalhe: string | null; executadoEm: Date };

function statusTone(log: RoboLog | undefined): "ok" | "risk" | "slate" {
  if (!log) return "slate";
  return log.sucesso ? "ok" : "risk";
}

function FonteCard({ nome, log }: { nome: string; log: RoboLog | undefined }) {
  return (
    <div className="p-5">
      <p className="text-xs font-semibold text-white/60 uppercase tracking-wide mb-2">{nome}</p>
      <div className="flex items-center gap-2 text-sm text-white">
        <LumenStatusDot tone={statusTone(log)} />
        {log ? (log.sucesso ? "Sucesso" : "Falha") : "Nunca rodou"}
      </div>
      {log && (
        <p className="text-xs text-white/50 mt-1 font-mono tabular-nums">
          {formatRelativeTime(log.executadoEm)}
        </p>
      )}
      {log?.detalhe && <p className="text-xs text-white/45 mt-1">{log.detalhe}</p>}
    </div>
  );
}

export default async function ProdutoPage() {
  await requirePlatformAccess();

  // Tabelas globais do robô Python (sem officeId — ver comentário no schema) — mesma fonte de
  // dados já lida em app/(app)/configuracoes/page.tsx, aqui só numa visão própria da Lúmen.
  const [logs, processosMonitoradosCount] = await Promise.all([
    prisma.roboExecucaoLog.findMany({ orderBy: { executadoEm: "desc" }, take: 30 }),
    prisma.roboProcessoMonitorado.count(),
  ]);

  const ultimoLogDatajud = logs.find((l) => l.fonte === "DATAJUD");
  const ultimoLogDjen = logs.find((l) => l.fonte === "DJEN");

  return (
    <div className="p-6 max-w-[1100px] mx-auto animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Produto e robôs</h1>
        <p className="text-sm text-white/55 mt-1">
          Saúde dos robôs de captura (DJEN e Datajud) — somente leitura
        </p>
      </div>

      <LumenPanel>
        <LumenPanelHeader title="Robôs de captura" subtitle="Última execução de cada fonte" />
        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-white/10">
          <FonteCard nome="DJEN" log={ultimoLogDjen} />
          <FonteCard nome="Datajud" log={ultimoLogDatajud} />
        </div>
      </LumenPanel>

      <LumenPanel>
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-x divide-white/10">
          <LumenStat label="Processos monitorados" value={String(processosMonitoradosCount)} />
        </div>
      </LumenPanel>

      <LumenPanel>
        <LumenPanelHeader title="Histórico de execuções" subtitle={`Últimas ${logs.length} execução(ões)`} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-semibold text-white/40 uppercase tracking-wide border-b border-white/10">
                <th className="px-5 py-2.5 font-semibold">Fonte</th>
                <th className="px-3 py-2.5 font-semibold">Quando</th>
                <th className="px-3 py-2.5 font-semibold">Resultado</th>
                <th className="px-3 py-2.5 font-semibold">Detalhe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="px-5 py-3 text-white">{log.fonte}</td>
                  <td className="px-3 py-3 font-mono tabular-nums text-white/70">
                    {formatRelativeTime(log.executadoEm)}
                  </td>
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/80">
                      <LumenStatusDot tone={log.sucesso ? "ok" : "risk"} /> {log.sucesso ? "sucesso" : "falha"}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-white/50 text-xs">{log.detalhe ?? "—"}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-white/40 text-sm">
                    Nenhuma execução registrada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </LumenPanel>
    </div>
  );
}
