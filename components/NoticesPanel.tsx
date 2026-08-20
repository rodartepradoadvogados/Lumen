"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pin, PinOff, Trash2, Send } from "lucide-react";
import clsx from "clsx";
import { createNotice, deleteNotice, togglePinNotice } from "@/lib/actions/notices";

type Notice = {
  id: string;
  content: string;
  pinned: boolean;
  createdAt: string;
  author: { id: string; name: string; color: string };
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase();
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d}d`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `há ${mo} mês(es)`;
  return `há ${Math.floor(mo / 12)} ano(s)`;
}

export default function NoticesPanel({
  notices,
  currentUserId,
  isAdmin,
  users = [],
  onChanged,
}: {
  notices: Notice[];
  currentUserId: string | null;
  isAdmin: boolean;
  users?: { id: string; name: string }[];
  // Chamado depois de publicar/excluir/fixar um recado — components/TeamMonitorPanel.tsx usa isso
  // para recarregar a própria lista (busca sob demanda via fetchNotices, não chega mais por prop
  // de Server Component desde que este painel saiu do Painel para o menu do avatar). router.refresh()
  // sozinho não bastaria: só revalida a árvore de Server Components da rota atual, não o estado
  // buscado no cliente que alimenta este painel.
  onChanged?: () => void;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    setText(value);
    const cursor = e.target.selectionStart ?? value.length;
    const match = value.slice(0, cursor).match(/@([\p{L}0-9_]*)$/u);
    setMentionQuery(match ? match[1] : null);
  }

  const mentionCandidates =
    mentionQuery !== null
      ? users.filter((u) => u.name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 6)
      : [];

  function selectMention(name: string) {
    const el = textareaRef.current;
    const cursor = el?.selectionStart ?? text.length;
    const uptoCursor = text.slice(0, cursor);
    const match = uptoCursor.match(/@([\p{L}0-9_]*)$/u);
    if (!match) {
      setMentionQuery(null);
      return;
    }
    const start = cursor - match[0].length;
    const inserted = `@${name} `;
    const newText = text.slice(0, start) + inserted + text.slice(cursor);
    setText(newText);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      const pos = start + inserted.length;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  }

  function publish() {
    const content = text.trim();
    if (!content) return;
    setError(null);
    startTransition(async () => {
      const res = await createNotice(content);
      if (res.error) setError(res.error);
      else setText("");
      router.refresh();
      onChanged?.();
    });
  }

  function remove(id: string) {
    if (!window.confirm("Excluir este recado?")) return;
    startTransition(async () => {
      const res = await deleteNotice(id);
      if (res.error) setError(res.error);
      router.refresh();
      onChanged?.();
    });
  }

  function pin(id: string) {
    startTransition(async () => {
      await togglePinNotice(id);
      router.refresh();
      onChanged?.();
    });
  }

  return (
    <div className="flex flex-col h-full">
      <div className="divide-y divide-regua flex-1 max-h-[420px] overflow-y-auto scrollbar-thin">
        {notices.length === 0 && <p className="text-center text-sm text-tx-3 py-10">Nenhum recado ainda</p>}
        {notices.map((n) => {
          const canDelete = isAdmin || n.author.id === currentUserId;
          return (
            <div key={n.id} className={clsx("px-5 py-3 flex gap-3", n.pinned && "bg-marca-bg")}>
              <div
                className="h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                style={{ backgroundColor: n.author.color }}
              >
                {initials(n.author.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-tx">{n.author.name}</p>
                  {n.pinned && <Pin size={12} className="text-marca fill-marca" />}
                  <span className="text-[11px] text-tx-3">{relativeTime(n.createdAt)}</span>
                  <span className="ml-auto flex items-center gap-0.5">
                    {isAdmin && (
                      <button
                        onClick={() => pin(n.id)}
                        disabled={pending}
                        data-tip={n.pinned ? "Desafixar" : "Fixar recado"}
                        className="p-1 rounded text-tx-3 hover:text-marca-tx hover:bg-marca-bg"
                      >
                        {n.pinned ? <PinOff size={13} /> : <Pin size={13} />}
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => remove(n.id)}
                        disabled={pending}
                        data-tip="Excluir recado"
                        className="p-1 rounded text-tx-3 hover:text-vinho hover:bg-sf-apoio"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </span>
                </div>
                <p className="text-sm text-tx/80 mt-0.5 whitespace-pre-wrap break-words">{n.content}</p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="border-t border-regua p-3">
        {error && <p className="text-[11px] text-urgente mb-1.5">{error}</p>}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={handleTextChange}
              rows={1}
              placeholder="Escreva um recado para o escritório... use @ para mencionar alguém"
              className="w-full resize-none border border-regua-forte bg-sf text-tx placeholder:text-tx-3 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-acao-bg"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) publish();
                if (e.key === "Escape") setMentionQuery(null);
              }}
            />
            {mentionQuery !== null && mentionCandidates.length > 0 && (
              <div className="absolute left-0 bottom-full mb-1 w-56 bg-sf border border-regua shadow-pop z-20 overflow-hidden max-h-48 overflow-y-auto scrollbar-thin">
                {mentionCandidates.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => selectMention(u.name)}
                    className="flex items-center w-full px-3 py-2 text-sm text-tx hover:bg-sf-apoio transition-colors text-left"
                  >
                    {u.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={publish}
            disabled={pending || !text.trim()}
            className="bg-acao hover:bg-acao-hover text-acao-tx text-sm font-semibold px-3 flex items-center gap-1.5 disabled:opacity-50 shrink-0 transition-colors"
          >
            <Send size={14} /> Publicar
          </button>
        </div>
      </div>
    </div>
  );
}
