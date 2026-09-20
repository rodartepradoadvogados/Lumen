import { Card, Badge, EmptyState } from "@/components/ui";
import { Radar } from "lucide-react";
import { dataDeBrasilia } from "@/lib/horaDeBrasilia";

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
      <div className=" bg-sf-apoio border border-regua px-3.5 py-2.5 flex items-start gap-2">
        <Radar size={14} className="shrink-0 mt-0.5 text-urgente" />
        <p className="text-corpo text-tx-2">
          O robô de vigilância varre diariamente PNCP, DOU e diários de tribunais de contas atrás destes termos. Só leitura por aqui — para
          adicionar, ativar/desativar ou remover um termo, use o computador.
        </p>
      </div>
      <Card>
        {termos.length === 0 ? (
          <EmptyState title="Nenhum termo cadastrado" />
        ) : (
          <div className="divide-y divide-regua">
            {termos.map((t) => (
              <div key={t.id} className={`flex items-center justify-between gap-3 px-4 py-3 ${t.ativo ? "" : "opacity-45"}`}>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-tx truncate">{t.termo}</p>
                  <p className="text-corpo text-tx-2">
                    {TIPO_LABELS[t.tipo] || t.tipo}
                    {/* ultimoHitAt é o instante em que o robô achou o termo — formatDate() lia
                        sem fuso e virava um dia errado perto da meia-noite. */}
                    {t.ultimoHitAt ? ` · último alerta em ${dataDeBrasilia(t.ultimoHitAt)}` : ""}
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
