"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { replyWhatsapp } from "@/lib/actions/attendance";

export default function WhatsappReplyBox({ attendanceId }: { attendanceId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSend() {
    const text = body.trim();
    if (!text || isPending) return;
    setError(null);
    startTransition(async () => {
      const res = await replyWhatsapp(attendanceId, text);
      if (res.error) {
        setError(res.error);
        return;
      }
      setBody("");
      router.refresh();
    });
  }

  return (
    <div className="mt-3">
      <div className="flex items-end gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSend();
            }
          }}
          rows={2}
          placeholder="Escreva uma resposta pelo WhatsApp…"
          disabled={isPending}
          className="flex-1 resize-none rounded-lg border border-navy-800/15 px-3 py-2 text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-gold-500/40 disabled:opacity-60"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={isPending || !body.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-navy-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-navy-800 disabled:opacity-50"
        >
          <Send size={13} />
          {isPending ? "Enviando…" : "Enviar"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}
