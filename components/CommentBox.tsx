"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addComment } from "@/lib/actions/tasks";
import { Send } from "lucide-react";

export default function CommentBox({
  caseId,
  taskId,
  currentUserId,
  users,
}: {
  caseId?: string;
  taskId?: string;
  currentUserId: string;
  users: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!content.trim()) return;
    startTransition(async () => {
      await addComment({ content, authorId: currentUserId, caseId, taskId });
      setContent("");
      router.refresh();
    });
  }

  return (
    <div className="border-t border-navy-800/8 pt-3">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={`Escreva um comentário... use @${users[0]?.name.split(" ")[0] ?? "Nome"} para mencionar alguém da equipe`}
        rows={2}
        className="w-full border border-navy-800/12 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-500/40 resize-y max-h-[40vh]"
      />
      <div className="flex items-center justify-between mt-2">
        <div className="flex gap-1 flex-wrap">
          {users.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => setContent((c) => `${c}${c.endsWith(" ") || c === "" ? "" : " "}@${u.name} `)}
              className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-cream-100 text-navy-800/60 hover:bg-gold-500/15 hover:text-gold-800"
            >
              @{u.name.split(" ")[0]}
            </button>
          ))}
        </div>
        <button
          onClick={submit}
          disabled={pending || !content.trim()}
          className="flex items-center gap-1.5 bg-navy-900 hover:bg-navy-800 disabled:opacity-40 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
        >
          <Send size={13} /> Enviar
        </button>
      </div>
    </div>
  );
}
