"use client";

import { useState, useTransition } from "react";
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
}: {
  notices: Notice[];
  currentUserId: string | null;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
      <div className="divide-y divide-navy-800/5 flex-1 max-h-[420px] overflow-y-auto scrollbar-thin">
        {notices.length === 0 && <p className="text-center text-sm text-navy-800/35 py-10">Nenhum recado ainda</p>}
        {notices.map((n) => {
          const canDelete = isAdmin || n.author.id === currentUserId;
          return (
            <div key={n.id} className={clsx("px-5 py-3 flex gap-3", n.pinned && "bg-gold-500/5")}>
              <div
                className="h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                style={{ backgroundColor: n.author.color }}
              >
                {initials(n.author.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-navy-900">{n.author.name}</p>
                  {n.pinned && <Pin size={12} className="text-gold-600 fill-gold-500" />}
                  <span className="text-[11px] text-navy-800/40">{relativeTime(n.createdAt)}</span>
                  <span className="ml-auto flex items-center gap-0.5">
                    {isAdmin && (
                      <button
                        onClick={() => pin(n.id)}
                        disabled={pending}
                        data-tip={n.pinned ? "Desafixar" : "Fixar recado"}
                        className="p-1 rounded text-navy-800/30 hover:text-gold-700 hover:bg-gold-500/10"
                      >
                        {n.pinned ? <PinOff size={13} /> : <Pin size={13} />}
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => remove(n.id)}
                        disabled={pending}
                        data-tip="Excluir recado"
                        className="p-1 rounded text-navy-800/30 hover:text-red-600 hover:bg-red-50"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </span>
                </div>
                <p className="text-sm text-navy-800 mt-0.5 whitespace-pre-wrap break-words">{n.content}</p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="border-t border-navy-800/8 p-3">
        {error && <p className="text-[11px] text-red-600 mb-1.5">{error}</p>}
        <div className="flex gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={1}
            placeholder="Escreva um recado para o escritório..."
            className="flex-1 resize-none border border-navy-800/12 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-500/40"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) publish();
            }}
          />
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
