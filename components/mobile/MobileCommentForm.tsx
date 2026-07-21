"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addComment } from "@/lib/actions/tasks";
import { Send } from "lucide-react";

export default function MobileCommentForm({ caseId, authorId }: { caseId: string; authorId: string }) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!content.trim()) return;
    startTransition(async () => {
      await addComment({ content, authorId, caseId });
      setContent("");
      router.refresh();
    });
  }

  return (
    <div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Escreva um comentário..."
        rows={3}
        className="w-full border border-navy-800/12 dark:border-white/10 bg-white dark:bg-navy-950 text-navy-900 dark:text-cream-50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-500/40"
      />
      <div className="flex justify-end mt-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending || !content.trim()}
          className="flex items-center gap-1.5 bg-navy-900 hover:bg-navy-800 dark:bg-gold-600 dark:hover:bg-gold-700 disabled:opacity-40 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
        >
          <Send size={13} /> {pending ? "Enviando..." : "Enviar"}
        </button>
      </div>
    </div>
  );
}
