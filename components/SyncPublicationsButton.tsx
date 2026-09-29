"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runFullPublicationsSync } from "@/lib/actions/settings";
import type { FullSyncResult } from "@/lib/actions/settings";
import { RefreshCw } from "lucide-react";

// Substitui os antigos botões separados ("Sincronizar Jusbrasil agora" em Publicações + o cron
// silencioso do robô): um único botão que varre os e-mails conectados (Jusbrasil e outras
// fontes — ver lib/jusbrasilEmailSync.ts) e busca o que o robô Python (DJEN/Datajud) já captou.
export default function SyncPublicationsButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<FullSyncResult | null>(null);

  return (
    <div className="relative">
      {/* Botão de ícone: a sincronização já é automática (a cada 3 h); o ato do dia é triar. O nome
          longo de antes (49 caracteres) e o bordô saíram do cabeçalho. */}
      <button
        type="button"
        aria-label="Buscar novas publicações agora"
        title="Buscar novas publicações agora"
        onClick={() =>
          startTransition(async () => {
            const r = await runFullPublicationsSync();
            setResult(r);
            router.refresh();
          })
        }
        disabled={pending}
        className="grid place-items-center min-h-11 min-w-11 md:min-h-9 md:min-w-9 border border-regua-forte bg-transparent hover:bg-sf-apoio text-tx disabled:opacity-50"
      >
        <RefreshCw size={16} aria-hidden="true" className={pending ? "animate-spin motion-reduce:animate-none" : ""} />
      </button>
      <span role="status" className="sr-only">{pending ? "Buscando novas publicações." : ""}</span>
      {result && (
        <div className="absolute right-0 top-full mt-1 z-30 w-[min(92vw,26rem)] bg-sf border border-regua-forte shadow-pop p-3 text-sm space-y-2" role="status">
          <button type="button" onClick={() => setResult(null)} className="float-right min-h-8 px-2 text-xs font-semibold text-tx-2 hover:text-tx">
            Fechar
          </button>
          <div>
            <p className="text-xs font-semibold text-tx-2 uppercase tracking-wide">E-mail</p>
            <p className="text-tx">
              {result.email.accountsScanned} caixa(s) verificada(s), {result.email.found} e-mail(s) encontrado(s), {result.email.created} lançamento(s) criado(s), {result.email.skipped} já existente(s)
            </p>
            {result.email.errors.length > 0 && (
              <ul className="text-urgente list-disc list-inside">
                {result.email.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold text-tx-2 uppercase tracking-wide">DJEN / Datajud (robô)</p>
            <p className="text-tx">
              {result.robo.publicacoesCriadas} publicação(ões), {result.robo.andamentosCriados} andamento(s), {result.robo.processosMonitoradosCriados} processo(s) novo(s) monitorado(s)
            </p>
            {/* Itens capturados que não puderam ser atribuídos a nenhum escritório. Ficam na fila
                do robô (não são perdidos) e voltam sozinhos quando o processo ou a OAB for
                cadastrado — ver resolverOffice em lib/roboBridge.ts. */}
            {result.robo.naoRoteados > 0 && (
              <p className="text-aviso">
                {result.robo.naoRoteados} item(ns) sem escritório identificado — seguem na fila até o processo ou a OAB
                serem cadastrados.
              </p>
            )}
            {result.robo.erros.length > 0 && (
              <ul className="text-urgente list-disc list-inside">
                {result.robo.erros.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
