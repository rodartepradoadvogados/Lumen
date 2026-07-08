"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { markPublicationRead, generateDeadlineFromPublication } from "@/lib/actions/publications";
import { Badge, formatDate } from "@/components/ui";
import { Check, CalendarPlus } from "lucide-react";
import Link from "next/link";

type Pub = {
  id: string;
  source: string;
  content: string;
  publishedAt: string;
  read: boolean;
  deadlineGenerated: boolean;
  case: { id: string; title: string } | null;
};

export default function PublicationRow({ pub }: { pub: Pub }) {
  const router = useRouter();
  const [showDeadlineForm, setShowDeadlineForm] = useState(false);
  const [loading, setLoading] = useState(false);

  return (
    <div className="px-5 py-4">
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        <Badge color="navy">{pub.source}</Badge>
        {!pub.read && <Badge color="gold">Não lida</Badge>}
        {pub.deadlineGenerated && <Badge color="green">Prazo gerado</Badge>}
        <span className="text-xs text-navy-800/40">{formatDate(pub.publishedAt)}</span>
      </div>
      {pub.case && (
        <Link href={`/processos/${pub.case.id}`} className="text-xs font-medium text-gold-700 hover:underline">
          {pub.case.title}
        </Link>
      )}
      <p className="text-sm text-navy-800 mt-1">{pub.content}</p>

      <div className="flex items-center gap-2 mt-2.5">
        {!pub.read && (
          <button
            onClick={() =>
              setLoading(true) ||
              markPublicationRead(pub.id).then(() => {
                router.refresh();
                setLoading(false);
              })
            }
            disabled={loading}
            className="flex items-center gap-1 text-[11px] font-semibold text-navy-800/60 hover:text-navy-900 px-2.5 py-1 rounded-lg bg-cream-100 hover:bg-cream-200"
          >
            <Check size={12} /> Marcar como lida
          </button>
        )}
        {!pub.deadlineGenerated && (
          <button
            onClick={() => setShowDeadlineForm((s) => !s)}
            className="flex items-center gap-1 text-[11px] font-semibold text-gold-800 hover:text-gold-900 px-2.5 py-1 rounded-lg bg-gold-500/10 hover:bg-gold-500/20"
          >
            <CalendarPlus size={12} /> Gerar prazo
          </button>
        )}
      </div>

      {showDeadlineForm && (
        <form
          action={async (formData) => {
            setLoading(true);
            await generateDeadlineFromPublication(pub.id, {
              title: String(formData.get("title")),
              dueDate: String(formData.get("dueDate")),
              priority: String(formData.get("priority")),
            });
            setShowDeadlineForm(false);
            setLoading(false);
            router.refresh();
          }}
          className="mt-3 p-3 rounded-lg bg-cream-50 border border-navy-800/8 space-y-2"
        >
          <input name="title" defaultValue={`Prazo: ${pub.content.slice(0, 40)}`} required className="w-full text-sm border border-navy-800/12 rounded-lg px-2.5 py-1.5" />
          <div className="flex gap-2">
            <input name="dueDate" type="date" required className="flex-1 text-sm border border-navy-800/12 rounded-lg px-2.5 py-1.5" />
            <select name="priority" className="text-sm border border-navy-800/12 rounded-lg px-2.5 py-1.5" defaultValue="ALTA">
              <option value="BAIXA">Baixa</option>
              <option value="MEDIA">Média</option>
              <option value="ALTA">Alta</option>
              <option value="URGENTE">Urgente</option>
            </select>
          </div>
          <button type="submit" disabled={loading} className="w-full bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold py-1.5 rounded-lg disabled:opacity-50">
            {loading ? "Criando..." : "Criar prazo na Agenda/Kanban"}
          </button>
        </form>
      )}
    </div>
  );
}
