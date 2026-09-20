import { requirePlatformAccess } from "@/lib/platformMember";
import { prisma } from "@/lib/prisma";
import { LumenPanel, LumenPanelHeader, LumenStat, LumenStatusDot } from "@/components/painelMestre/LumenUi";
import MotivosPadraoPanel from "@/components/painelMestre/MotivosPadraoPanel";

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
      <p className="text-xs font-semibold text-tx-2 uppercase tracking-wide mb-2">{nome}</p>
      <div className="flex items-center gap-2 text-sm text-tx">
        <LumenStatusDot tone={statusTone(log)} />
        {log ? (log.sucesso ? "Sucesso" : "Falha") : "Nunca rodou"}
      </div>
      {log && (
        <p className="text-xs text-tx-3 mt-1 font-mono tabular-nums">
          {formatRelativeTime(log.executadoEm)}
        </p>
      )}
      {log?.detalhe && <p className="text-xs text-tx-3 mt-1">{log.detalhe}</p>}
    </div>
  );
}

export default async function ProdutoPage() {
  await requirePlatformAccess();

  // Tabelas globais do robô Python (sem officeId — ver comentário no schema) — mesma fonte de
  // dados já lida em app/(app)/configuracoes/page.tsx, aqui só numa visão própria da Lúmen.
  const [logs, processosMonitoradosCount, padroes] = await Promise.all([
    prisma.roboExecucaoLog.findMany({ orderBy: { executadoEm: "desc" }, take: 30 }),
    prisma.roboProcessoMonitorado.count(),
    // Os motivos-padrão, com a contagem de quantos escritórios reescreveram cada um. Esse número
    // é o termômetro do texto: um motivo que metade reescreve é um motivo mal escrito.
    prisma.motivoDeRecusa.findMany({
      where: { officeId: null },
      select: { id: true, rotulo: true, descricao: true, desativado: true, _count: { select: { versoes: true } } },
      orderBy: { ordem: "asc" },
    }),
  ]);
  const motivosPadrao = padroes.map((m) => ({
    id: m.id,
    rotulo: m.rotulo,
    descricao: m.descricao,
    desativado: m.desativado,
    emUso: m._count.versoes,
  }));

  const ultimoLogDatajud = logs.find((l) => l.fonte === "DATAJUD");
  const ultimoLogDjen = logs.find((l) => l.fonte === "DJEN");

  return (
    <div className="p-6 max-w-[1100px] mx-auto animate-fade-in space-y-6">
      <div>
        <h1 className="text-autuacao font-bold text-tx">Produto e robôs</h1>
        <p className="text-sm text-tx-3 mt-1">
          Saúde dos robôs de captura (DJEN e Datajud) — somente leitura
        </p>
      </div>

      {/* O catálogo que todo escritório recebe. Fica no Produto, e não em nenhum escritório
          específico, porque é decisão de produto: é o texto que a plataforma inteira usa para
          recusar um lead. */}
      <LumenPanel>
        <LumenPanelHeader
          title="Motivos de recusa — padrão da plataforma"
          subtitle="A lista que todo escritório recebe, e que cada um pode ajustar para si"
        />
        <MotivosPadraoPanel motivos={motivosPadrao} />
      </LumenPanel>

      <LumenPanel>
        <LumenPanelHeader title="Robôs de captura" subtitle="Última execução de cada fonte" />
        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-regua">
          <FonteCard nome="DJEN" log={ultimoLogDjen} />
          <FonteCard nome="Datajud" log={ultimoLogDatajud} />
        </div>
      </LumenPanel>

      <LumenPanel>
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-x divide-regua">
          <LumenStat label="Processos monitorados" value={String(processosMonitoradosCount)} />
        </div>
      </LumenPanel>

      <LumenPanel>
        <LumenPanelHeader title="Histórico de execuções" subtitle={`Últimas ${logs.length} execução(ões)`} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-etiqueta font-semibold text-tx-3 uppercase tracking-wide border-b border-regua">
                <th className="px-5 py-2.5 font-semibold">Fonte</th>
                <th className="px-3 py-2.5 font-semibold">Quando</th>
                <th className="px-3 py-2.5 font-semibold">Resultado</th>
                <th className="px-3 py-2.5 font-semibold">Detalhe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-regua">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="px-5 py-3 text-tx">{log.fonte}</td>
                  <td className="px-3 py-3 font-mono tabular-nums text-tx-2">
                    {formatRelativeTime(log.executadoEm)}
                  </td>
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-tx-2">
                      <LumenStatusDot tone={log.sucesso ? "ok" : "risk"} /> {log.sucesso ? "sucesso" : "falha"}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-tx-3 text-xs">{log.detalhe ?? "—"}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-tx-3 text-sm">
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
