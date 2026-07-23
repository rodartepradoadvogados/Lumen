"use client";

import { useState } from "react";
import { saveWhatsappConfig, deleteWhatsappConfig } from "@/lib/actions/whatsappConfig";

export default function WhatsappConfigForm({
  connected,
  displayPhone,
}: {
  connected: boolean;
  displayPhone: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function submit(formData: FormData) {
    setError(null);
    setSuccess(false);
    setLoading(true);
    const result = await saveWhatsappConfig({
      phoneNumberId: String(formData.get("phoneNumberId") || ""),
      accessToken: String(formData.get("accessToken") || ""),
      displayPhone: String(formData.get("displayPhone") || ""),
    });
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSuccess(true);
    (document.getElementById("whatsapp-config-form") as HTMLFormElement | null)?.reset();
  }

  async function handleDisconnect() {
    if (!confirm("Desconectar o número de WhatsApp deste escritório? As conversas já registradas não são apagadas.")) return;
    setLoading(true);
    await deleteWhatsappConfig();
    setLoading(false);
  }

  return (
    <div className="space-y-3">
      {connected && (
        <p className="text-sm text-navy-900 dark:text-cream-50">
          Número conectado{displayPhone ? <> — <strong>{displayPhone}</strong></> : null}
        </p>
      )}
      <form id="whatsapp-config-form" action={submit} className="space-y-3 max-w-sm">
        <div>
          <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Phone Number ID (Meta Cloud API)</label>
          <input name="phoneNumberId" required className="cfg-input w-full dark:bg-navy-800 dark:border-white/15 dark:text-cream-50" />
        </div>
        <div>
          <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Access Token</label>
          <input name="accessToken" type="password" required className="cfg-input w-full dark:bg-navy-800 dark:border-white/15 dark:text-cream-50" />
        </div>
        <div>
          <label className="text-xs font-medium text-navy-800/60 dark:text-cream-50/60">Número exibido (opcional, só para referência)</label>
          <input name="displayPhone" placeholder="+55 62 99999-0000" className="cfg-input w-full dark:bg-navy-800 dark:border-white/15 dark:text-cream-50 dark:placeholder:text-cream-50/30" />
        </div>
        {error && <p className="text-[11px] text-red-700 dark:text-bordo-400 bg-red-50 dark:bg-bordo-400/15 border border-red-200 dark:border-bordo-400/20 rounded-lg px-2.5 py-1.5">{error}</p>}
        {success && <p className="text-[11px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-400/15 border border-emerald-200 dark:border-emerald-400/20 rounded-lg px-2.5 py-1.5">Conexão salva com sucesso.</p>}
        <div className="flex items-center gap-2">
          <button type="submit" disabled={loading} className="bg-navy-900 hover:bg-navy-800 text-white text-sm font-semibold rounded-lg px-4 py-2 disabled:opacity-50">
            {loading ? "Salvando..." : connected ? "Atualizar conexão" : "Conectar"}
          </button>
          {connected && (
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={loading}
              className="text-sm font-semibold text-red-700 dark:text-bordo-400 hover:underline disabled:opacity-50"
            >
              Desconectar
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
