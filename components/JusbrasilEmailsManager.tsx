"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, Plus } from "lucide-react";
import { removerEmailPublicacoes } from "@/lib/actions/googleCredentials";

export type EmailAccountRow = {
  id: string;
  accountEmail: string;
  isPrimaryDrive: boolean;
  syncJusbrasil: boolean;
  userId: string | null;
  ownerName: string | null;
};

const BTN = "inline-flex items-center gap-1.5 h-7 border-2 border-regua-forte bg-transparent hover:bg-acao-bg text-tx text-xs font-semibold px-3 transition-colors";
const BTN_DISABLED = "inline-flex items-center gap-1.5 h-7 border-2 border-regua text-tx-3 text-xs font-semibold px-3 opacity-50 cursor-not-allowed";

function rowLabel(row: EmailAccountRow): string {
  if (row.isPrimaryDrive) return "Conta do Google Drive do escritório";
  if (row.ownerName) return `Advogado: ${row.ownerName}`;
  return "E-mail compartilhado (sem dono)";
}

// Gestão das caixas de e-mail usadas para capturar publicações/andamentos do Jusbrasil — mora
// em Conexões → Arquivos → Google Drive (entre "Reconectar Google (Drive)" e "Pasta-mãe") porque
// é a mesma conta Google do escritório que hoje já entra automaticamente nessa varredura (ver
// comentário em lib/googleDrive.ts:saveTokensFromCode — GoogleCredential.syncJusbrasil nasce
// true por padrão mesmo na conexão do Drive). Dois modos, pela permissão de quem está vendo:
// admin vê e gerencia TODAS as caixas do escritório (própria, de colegas e compartilhadas, até o
// teto de e-mails do plano); advogado comum só vê/gerencia a própria, uma só.
export default function JusbrasilEmailsManager({
  emails,
  viewerId,
  viewerIsAdmin,
  limite,
}: {
  emails: EmailAccountRow[];
  viewerId: string;
  viewerIsAdmin: boolean;
  limite: number | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const usados = emails.filter((e) => e.syncJusbrasil).length;
  const noTeto = limite != null && usados >= limite;

  function remover(id: string, email: string) {
    if (!window.confirm(`Remover ${email}? Publicações e andamentos param de ser capturados por essa caixa.`)) return;
    startTransition(() => {
      removerEmailPublicacoes(id).then((res) => {
        if (res.error) window.alert(res.error);
        router.refresh();
      });
    });
  }

  if (!viewerIsAdmin) {
    const ownRow = emails.find((e) => e.userId === viewerId) ?? null;
    return (
      <div>
        <h3 className="text-[10px] font-semibold text-tx-2 uppercase tracking-[.12em] mb-2">Meu e-mail para publicações</h3>
        {ownRow ? (
          <div className="flex items-center justify-between gap-2 border border-regua px-3 py-2">
            <span className="flex items-center gap-2 text-sm text-tx min-w-0">
              <Mail size={14} className="text-tx-3 shrink-0" />
              <span className="truncate">{ownRow.accountEmail}</span>
            </span>
            <button type="button" disabled={pending} onClick={() => remover(ownRow.id, ownRow.accountEmail)} className="text-xs font-semibold text-atencao hover:underline disabled:opacity-50 shrink-0">
              Remover
            </button>
          </div>
        ) : (
          <a href="/api/google/connect?mode=jusbrasil" className={BTN}>
            <Plus size={14} /> Conectar meu e-mail
          </a>
        )}
        <p className="text-[11px] text-tx-3 mt-1.5">Só a caixa que você conectar aqui é varrida em busca de publicações e andamentos com o seu nome.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-[10px] font-semibold text-tx-2 uppercase tracking-[.12em]">
          E-mails para publicações
          {limite != null && <span className="normal-case font-normal text-tx-3"> — {usados} de {limite} usados</span>}
        </h3>
        {noTeto ? (
          <span title={`Limite de ${limite} e-mail(s) do plano atingido`} className={BTN_DISABLED}>
            <Plus size={14} /> Adicionar e-mail
          </span>
        ) : (
          <a href="/api/google/connect?mode=jusbrasil-shared" className={BTN}>
            <Plus size={14} /> Adicionar e-mail
          </a>
        )}
      </div>

      {limite != null && (
        <p className="text-[11px] text-tx-3 mb-2">
          {limite - 1} OAB{limite - 1 !== 1 ? "s" : ""} do plano + 1 vaga fixa da conta do Google Drive do escritório.
        </p>
      )}

      {emails.length === 0 ? (
        <p className="text-sm text-tx-2">Nenhum e-mail conectado ainda.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {emails.map((row) => (
            <div key={row.id} className="flex items-center justify-between gap-2 border border-regua px-3 py-2">
              <span className="flex items-center gap-2 text-sm text-tx min-w-0">
                <Mail size={14} className="text-tx-3 shrink-0" />
                <span className="truncate">{row.accountEmail}</span>
                <span className="text-xs text-tx-3 truncate">· {rowLabel(row)}</span>
              </span>
              {row.isPrimaryDrive ? (
                <span title='Troque pelo botão "Reconectar Google (Drive)" acima' className="text-xs text-tx-3 shrink-0">
                  fixo
                </span>
              ) : (
                <button type="button" disabled={pending} onClick={() => remover(row.id, row.accountEmail)} className="text-xs font-semibold text-atencao hover:underline disabled:opacity-50 shrink-0">
                  Remover
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
