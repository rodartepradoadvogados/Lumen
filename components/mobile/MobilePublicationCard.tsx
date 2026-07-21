"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { markPublicationRead } from "@/lib/actions/publications";
import { Badge, formatDate } from "@/components/ui";
import { Check } from "lucide-react";

type Pub = {
  id: string;
  kind: string;
  source: string;
  content: string;
  publishedAt: string;
  caseId: string | null;
  caseTitle: string | null;
};

export default function MobilePublicationCard({ pub }: { pub: Pub }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="px-4 py-4">
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        <Badge color={pub.kind === "PUBLICACAO" ? "blue" : "gold"}>
          {pub.kind === "PUBLICACAO" ? "Publicação" : "Andamento"}
        </Badge>
        <Badge color="navy">{pub.source}</Badge>
        <span className="text-xs text-navy-800/40">{formatDate(pub.publishedAt)}</span>
      </div>

      {pub.caseId && pub.caseTitle && (
        <Link href={`/m/processos/${pub.caseId}`} className="text-xs font-medium text-gold-700 dark:text-gold-400 block mb-1">
          {pub.caseTitle}
        </Link>
      )}

      <p className={`text-sm text-navy-800 dark:text-cream-50/85 ${expanded ? "" : "line-clamp-3"}`}>{pub.content}</p>
      {pub.content.length > 140 && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="text-[11px] font-semibold text-navy-800/50 dark:text-cream-50/50 mt-1"
        >
          {expanded ? "Ver menos" : "Ver mais"}
        </button>
      )}

      <div className="mt-2.5">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await markPublicationRead(pub.id);
              router.refresh();
            })
          }
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-navy-800/70 dark:text-cream-50/70 px-3 py-1.5 rounded-lg bg-cream-100 dark:bg-white/5 hover:bg-cream-200 dark:hover:bg-white/10 disabled:opacity-50"
        >
          <Check size={13} /> {pending ? "Marcando..." : "Marcar como lida"}
        </button>
      </div>
    </div>
  );
}
