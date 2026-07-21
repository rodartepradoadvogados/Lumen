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
}: {
  notices: Notice[];
  currentUserId: string | null;
  isAdmin: boolean;
  users?: { id: string; name: string }[];
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
    });
  }

  function remove(id: string) {
    if (!window.confirm("Excluir este recado?")) return;
    startTransition(async () => {
      const res = await deleteNotice(id);
      if (res.error) setError(res.error);
      router.refresh();
    });
  }

  function pin(id: string) {
    startTransition(async () => {
      await togglePinNotice(id);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col h-full">
      <div className="divide-y divide-navy-800/5 dark:divide-white/10 flex-1 max-h-[420px] overflow-y-auto scrollbar-thin">
        {notices.length === 0 && <p className="text-center text-sm text-navy-800/35 dark:text-cream-50/35 py-10">Nenhum recado ainda</p>}
        {notices.map((n) => {
          const canDelete = isAdmin || n.author.id === currentUserId;
          return (
            <div key={n.id} className={clsx("px-5 py-3 flex gap-3", n.pinned && "bg-gold-500/5 dark:bg-gold-400/5")}>
              <div
                className="h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                style={{ backgroundColor: n.author.color }}
              >
                {initials(n.author.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-navy-900 dark:text-cream-50">{n.author.name}</p>
                  {n.pinned && <Pin size={12} className="text-gold-600 fill-gold-500 dark:text-gold-400 dark:fill-gold-400" />}
                  <span className="text-[11px] text-navy-800/40 dark:text-cream-50/40">{relativeTime(n.createdAt)}</span>
                  <span className="ml-auto flex items-center gap-0.5">
                    {isAdmin && (
                      <button
                        onClick={() => pin(n.id)}
                        disabled={pending}
                        data-tip={n.pinned ? "Desafixar" : "Fixar recado"}
                        className="p-1 rounded text-navy-800/30 dark:text-cream-50/30 hover:text-gold-700 dark:hover:text-gold-400 hover:bg-gold-500/10 dark:hover:bg-gold-400/10"
                      >
                        {n.pinned ? <PinOff size={13} /> : <Pin size={13} />}
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => remove(n.id)}
                        disabled={pending}
                        data-tip="Excluir recado"
                        className="p-1 rounded text-navy-800/30 dark:text-cream-50/30 hover:text-bordo-600 dark:hover:text-bordo-400 hover:bg-bordo-500/10 dark:hover:bg-bordo-400/10"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </span>
                </div>
                <p className="text-sm text-navy-800 dark:text-cream-50/80 mt-0.5 whitespace-pre-wrap break-words">{n.content}</p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="border-t border-navy-800/8 dark:border-white/10 p-3">
        {error && <p className="text-[11px] text-bordo-600 dark:text-bordo-400 mb-1.5">{error}</p>}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={handleTextChange}
              rows={1}
              placeholder="Escreva um recado para o escritório... use @ para mencionar alguém"
              className="w-full resize-none border border-navy-800/12 dark:border-white/10 bg-white dark:bg-navy-900 text-navy-900 dark:text-cream-50 placeholder:text-navy-800/40 dark:placeholder:text-cream-50/30 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-500/40"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) publish();
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
          <button
            onClick={publish}
            disabled={pending || !text.trim()}
            className="bg-gold-600 hover:bg-gold-700 text-white text-sm font-semibold rounded-lg px-3 flex items-center gap-1.5 disabled:opacity-50 shrink-0"
          >
            <Send size={14} /> Publicar
          </button>
        </div>
      </div>
    </div>
  );
}
