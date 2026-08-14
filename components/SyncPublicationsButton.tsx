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
    <div>
      <button
        onClick={() =>
          startTransition(async () => {
            const r = await runFullPublicationsSync();
            setResult(r);
            router.refresh();
          })
        }
        disabled={pending}
        className="flex items-center gap-1.5 bg-acao hover:bg-acao-hover disabled:opacity-50 text-acao-tx text-sm font-semibold px-4 py-2 rounded-lg"
      >
        <RefreshCw size={15} className={pending ? "animate-spin" : ""} />
        {pending ? "Sincronizando..." : "Sincronizar publicações e andamentos processuais"}
      </button>
      {result && (
        <div className="text-sm mt-3 space-y-2">
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
