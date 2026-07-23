"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addComment } from "@/lib/actions/tasks";
import { Send } from "lucide-react";

type UserOption = { id: string; name: string };

export default function MobileCommentForm({
  caseId,
  users = [],
}: {
  caseId: string;
  users?: UserOption[];
}) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    setContent(value);
    const cursor = e.target.selectionStart ?? value.length;
    const match = value.slice(0, cursor).match(/@([\p{L}0-9_]*)$/u);
    setMentionQuery(match ? match[1] : null);
  }

  const mentionCandidates =
    mentionQuery !== null ? users.filter((u) => u.name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 6) : [];

  function selectMention(name: string) {
    const el = textareaRef.current;
    const cursor = el?.selectionStart ?? content.length;
    const uptoCursor = content.slice(0, cursor);
    const match = uptoCursor.match(/@([\p{L}0-9_]*)$/u);
    if (!match) {
      setMentionQuery(null);
      return;
    }
    const start = cursor - match[0].length;
    const inserted = `@${name} `;
    const newContent = content.slice(0, start) + inserted + content.slice(cursor);
    setContent(newContent);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      const pos = start + inserted.length;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  }

  function submit() {
    if (!content.trim()) return;
    startTransition(async () => {
      await addComment({ content, caseId });
      setContent("");
      setMentionQuery(null);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          placeholder="Escreva um comentário... use @ para mencionar alguém"
          rows={3}
          className="w-full border border-navy-800/12 dark:border-white/10 bg-white dark:bg-navy-950 text-navy-900 dark:text-cream-50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-500/40"
          onKeyDown={(e) => {
            if (e.key === "Escape") setMentionQuery(null);
          }}
        />
        {mentionQuery !== null && mentionCandidates.length > 0 && (
          <div className="absolute left-0 bottom-full mb-1 w-56 bg-white dark:bg-navy-900 rounded-lg border border-navy-800/10 dark:border-white/10 shadow-pop z-20 overflow-hidden max-h-48 overflow-y-auto scrollbar-thin">
            {mentionCandidates.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => selectMention(u.name)}
                className="flex items-center w-full px-3 py-2 text-sm text-navy-900 dark:text-cream-50 hover:bg-cream-50 dark:hover:bg-white/5 transition-colors text-left"
              >
                {u.name}
              </button>
            ))}
          </div>
        )}
      </div>
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
