"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addComment } from "@/lib/actions/tasks";
import { Send } from "lucide-react";

export default function CommentBox({
  caseId,
  taskId,
  licitacaoId,
  users,
  onSubmitted,
}: {
  caseId?: string;
  taskId?: string;
  licitacaoId?: string;
  users: { id: string; name: string }[];
  // Chamado depois que o comentário é salvo e o router é atualizado — usado pelo
  // TaskDetailModal (card estilo Trello) pra recarregar a própria lista de comentários, já que
  // ele busca os dados uma vez no mount em vez de depender do re-render do router.refresh().
  onSubmitted?: () => void;
}) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!content.trim()) return;
    startTransition(async () => {
      await addComment({ content, caseId, taskId, licitacaoId });
      setContent("");
      router.refresh();
      onSubmitted?.();
    });
  }

  return (
    <div className="border-t border-regua pt-3">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={`Escreva um comentário... use @${users[0]?.name.split(" ")[0] ?? "Nome"} para mencionar alguém da equipe`}
        rows={2}
        className="w-full border border-regua px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-acao/40 resize-y max-h-[40vh]"
      />
      <div className="flex items-center justify-between mt-2">
        <div className="flex gap-1 flex-wrap">
          {users.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => setContent((c) => `${c}${c.endsWith(" ") || c === "" ? "" : " "}@${u.name} `)}
              className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-sf-apoio text-tx-2 hover:bg-acao-bg hover:text-acao"
            >
              @{u.name.split(" ")[0]}
            </button>
          ))}
        </div>
        <button
          onClick={submit}
          disabled={pending || !content.trim()}
          className="flex items-center gap-1.5 bg-acao hover:bg-acao-hover disabled:opacity-40 text-acao-tx text-xs font-semibold px-3 py-1.5 transition-colors"
        >
          <Send size={13} /> Enviar
        </button>
      </div>
    </div>
  );
}
