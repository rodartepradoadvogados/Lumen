"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { replyEmail, updateAttendanceClientEmail } from "@/lib/actions/attendance";

export default function EmailReplyPanel({ attendanceId, clientEmail }: { attendanceId: string; clientEmail: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState(clientEmail || "");
  const [editingEmail, setEditingEmail] = useState(!clientEmail);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSaveEmail() {
    const value = email.trim();
    if (!value || isPending) return;
    setError(null);
    startTransition(async () => {
      await updateAttendanceClientEmail(attendanceId, value);
      setEditingEmail(false);
      router.refresh();
    });
  }

  function handleSend() {
    const subjectText = subject.trim();
    const bodyText = body.trim();
    if (!subjectText || !bodyText || isPending) return;
    setError(null);
    startTransition(async () => {
      const res = await replyEmail(attendanceId, subjectText, bodyText);
      if (res.error) {
        setError(res.error);
        return;
      }
      setSubject("");
      setBody("");
      router.refresh();
    });
  }

  if (editingEmail) {
    return (
      <div className="mt-3">
        <div className="flex items-end gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="e-mail do cliente"
            disabled={isPending}
            className="flex-1 rounded-lg border border-navy-800/15 px-3 py-2 text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-gold-500/40 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={handleSaveEmail}
            disabled={isPending || !email.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-navy-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-navy-800 disabled:opacity-50"
          >
            Salvar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-navy-800/45">Para: {email}</span>
        <button type="button" onClick={() => setEditingEmail(true)} className="text-xs font-semibold text-gold-700 hover:underline">
          Alterar e-mail
        </button>
      </div>
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Assunto"
        disabled={isPending}
        className="w-full rounded-lg border border-navy-800/15 px-3 py-2 text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-gold-500/40 disabled:opacity-60"
      />
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
          rows={3}
          placeholder="Escreva uma resposta por e-mail…"
          disabled={isPending}
          className="flex-1 resize-none rounded-lg border border-navy-800/15 px-3 py-2 text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-gold-500/40 disabled:opacity-60"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={isPending || !subject.trim() || !body.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-navy-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-navy-800 disabled:opacity-50"
        >
          <Send size={13} />
          {isPending ? "Enviando…" : "Enviar e-mail"}
        </button>
      </div>
      {error && <p className="text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}
