import { Card, Badge, EmptyState, formatDate } from "@/components/ui";
import { Radar } from "lucide-react";

type Termo = {
  id: string;
  termo: string;
  tipo: string;
  ativo: boolean;
  ultimoHitAt: string | null;
};

const TIPO_LABELS: Record<string, string> = {
  NOME: "Nome",
  DOCUMENTO: "Documento",
  NUMERO: "Número",
  LIVRE: "Livre",
};

// Aba Vigilância, versão mobile — só existe para processo administrativo (mesmo filtro de
// natureza da aba no site, ver lib/caseNatureza.ts), só leitura dos termos já cadastrados.
// Cadastrar/ativar/remover termo continua no site (components/TermosVigilanciaPanel.tsx).
export default function MobileCaseVigilanciaTab({ termos }: { termos: Termo[] }) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-cream-100 dark:bg-white/5 border border-navy-800/8 dark:border-white/10 px-3.5 py-2.5 flex items-start gap-2">
        <Radar size={14} className="shrink-0 mt-0.5 text-bordo-700 dark:text-bordo-400" />
        <p className="text-xs text-navy-800/60 dark:text-cream-50/60">
          O robô de vigilância varre diariamente PNCP, DOU e diários de tribunais de contas atrás destes termos. Só leitura por aqui — para
          adicionar, ativar/desativar ou remover um termo, use o computador.
        </p>
      </div>
      <Card>
        {termos.length === 0 ? (
          <EmptyState title="Nenhum termo cadastrado" />
        ) : (
          <div className="divide-y divide-navy-800/5 dark:divide-white/10">
            {termos.map((t) => (
              <div key={t.id} className={`flex items-center justify-between gap-3 px-4 py-3 ${t.ativo ? "" : "opacity-45"}`}>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-navy-900 dark:text-cream-50 truncate">{t.termo}</p>
                  <p className="text-[11px] text-navy-800/45 dark:text-cream-50/45">
                    {TIPO_LABELS[t.tipo] || t.tipo}
                    {t.ultimoHitAt ? ` · último alerta em ${formatDate(t.ultimoHitAt)}` : ""}
                  </p>
                </div>
                <Badge color={t.ativo ? "green" : "slate"}>{t.ativo ? "Ativo" : "Inativo"}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
