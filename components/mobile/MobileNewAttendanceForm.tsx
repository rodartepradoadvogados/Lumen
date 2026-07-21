"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createAttendance } from "@/lib/actions/attendance";
import { Send } from "lucide-react";

const inputClass =
  "w-full mt-1 border border-navy-800/12 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-navy-900 dark:text-cream-50 bg-white dark:bg-navy-950 focus:outline-none focus:ring-2 focus:ring-gold-500/40";
const labelClass = "text-xs font-medium text-navy-800/60 dark:text-cream-50/60";

// Formulário compacto de atendimento rápido para o app mobile. Sempre cria um atendimento
// "de nome livre" (sem clientId/isNewClient) — comportamento mínimo equivalente ao que
// existia antes do NewAttendanceModal do desktop ganhar o fluxo de seleção/cadastro de cliente.
export default function MobileNewAttendanceForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(formData: FormData) {
    const clientName = String(formData.get("clientName") || "").trim();
    const subject = String(formData.get("subject") || "").trim();
    if (!clientName || !subject) {
      setError("Preencha ao menos o nome do contato e o assunto.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await createAttendance({
        clientName,
        contactPhone: String(formData.get("contactPhone") || "") || undefined,
        clientEmail: String(formData.get("clientEmail") || "") || undefined,
        subject,
        area: String(formData.get("area") || "") || undefined,
        channel: String(formData.get("channel") || "WHATSAPP"),
      });
      router.push("/m");
    } catch {
      setError("Não foi possível salvar o atendimento. Tente novamente.");
      setLoading(false);
    }
  }

  return (
    <form action={handleSubmit} className="space-y-3">
      <div>
        <label className={labelClass}>Nome do contato</label>
        <input name="clientName" required className={inputClass} placeholder="Nome completo" />
      </div>

      <div>
        <label className={labelClass}>Assunto</label>
        <input name="subject" required className={inputClass} placeholder="Do que se trata" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Telefone</label>
          <input name="contactPhone" className={inputClass} placeholder="(00) 00000-0000" />
        </div>
        <div>
          <label className={labelClass}>E-mail</label>
          <input name="clientEmail" type="email" className={inputClass} placeholder="cliente@exemplo.com" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Canal</label>
          <select name="channel" defaultValue="WHATSAPP" className={inputClass}>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="EMAIL">E-mail</option>
            <option value="TELEFONE">Telefone</option>
            <option value="PRESENCIAL">Presencial</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Matéria</label>
          <select name="area" defaultValue="" className={inputClass}>
            <option value="">Não definida</option>
            <option value="Cível">Cível</option>
            <option value="Trabalhista">Trabalhista</option>
            <option value="Tributário">Tributário</option>
            <option value="Família">Família</option>
            <option value="Sucessões">Sucessões</option>
            <option value="Criminal">Criminal</option>
            <option value="Previdenciário">Previdenciário</option>
            <option value="Empresarial">Empresarial</option>
            <option value="Consumidor">Consumidor</option>
            <option value="Administrativo">Administrativo</option>
            <option value="Outra">Outra</option>
          </select>
        </div>
      </div>

      {error && <p className="text-xs font-semibold text-bordo-600 dark:text-bordo-400">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-1.5 bg-gold-600 hover:bg-gold-700 dark:bg-gold-500 dark:hover:bg-gold-600 text-white font-semibold text-sm py-2.5 rounded-lg transition-colors disabled:opacity-50"
      >
        <Send size={15} /> {loading ? "Salvando..." : "Criar atendimento"}
      </button>
    </form>
  );
}
