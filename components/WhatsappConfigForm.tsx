"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveWhatsappConfig, deleteWhatsappConfig } from "@/lib/actions/whatsappConfig";

export default function WhatsappConfigForm({
  connected,
  displayPhone,
}: {
  connected: boolean;
  displayPhone: string | null;
}) {
  const router = useRouter();
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
    setError(null);
    setLoading(true);
    const result = await deleteWhatsappConfig();
    setLoading(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {connected && (
        <p className="flex items-center gap-2 border-l-[3px] border-concluido text-concluido bg-sf-apoio px-3 py-2 text-xs font-medium">
          Número conectado{displayPhone ? <> — <strong>{displayPhone}</strong></> : null}
        </p>
      )}
      <form id="whatsapp-config-form" action={submit} className="space-y-3 max-w-sm">
        <div>
          <label className="text-xs font-medium text-tx-2">Phone Number ID (Meta Cloud API)</label>
          <input name="phoneNumberId" required className="cfg-input w-full" />
        </div>
        <div>
          <label className="text-xs font-medium text-tx-2">Access Token</label>
          <input name="accessToken" type="password" required className="cfg-input w-full" />
        </div>
        <div>
          <label className="text-xs font-medium text-tx-2">Número exibido (opcional, só para referência)</label>
          <input name="displayPhone" placeholder="+55 62 99999-0000" className="cfg-input w-full" />
        </div>
        {error && <p className="flex items-center gap-2 border-l-[3px] border-vinho text-vinho bg-sf-apoio px-2.5 py-1.5 text-[11px]">{error}</p>}
        {success && (
          <p className="flex items-center gap-2 border-l-[3px] border-concluido text-concluido bg-sf-apoio px-2.5 py-1.5 text-[11px]">Conexão salva com sucesso.</p>
        )}
        <div className="flex items-center gap-2">
          <button type="submit" disabled={loading} className="bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-4 py-2 disabled:opacity-50 transition-colors">
            {loading ? "Salvando..." : connected ? "Atualizar conexão" : "Conectar"}
          </button>
          {connected && (
            <button type="button" onClick={handleDisconnect} disabled={loading} className="text-sm font-semibold text-vinho hover:underline disabled:opacity-50">
              Desconectar
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
