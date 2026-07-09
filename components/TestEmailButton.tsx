"use client";

import { useState, useTransition } from "react";
import { testDailyAgendaEmail } from "@/lib/actions/settings";
import { Mail } from "lucide-react";

export default function TestEmailButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ sent: boolean; reason?: string } | null>(null);

  return (
    <div>
      <button
        onClick={() => startTransition(async () => setResult(await testDailyAgendaEmail()))}
        disabled={pending}
        className="flex items-center gap-1.5 bg-navy-900 hover:bg-navy-800 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg"
      >
        <Mail size={15} /> {pending ? "Enviando..." : "Enviar e-mail de teste agora"}
      </button>
      {result && (
        <p className={`text-sm mt-2 ${result.sent ? "text-emerald-700" : "text-red-600"}`}>
          {result.sent ? "E-mail enviado com sucesso!" : `Não enviado: ${result.reason}`}
        </p>
      )}
    </div>
  );
}
