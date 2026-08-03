"use client";

import { useEffect, useRef, useState } from "react";
import PublicationRow from "@/components/PublicationRow";
import type { PublicationGroup } from "@/lib/publicationGrouping";

type Pub = {
  id: string;
  kind: string;
  source: string;
  content: string;
  publishedAt: string;
  read: boolean;
  deadlineGenerated: boolean;
  lawyerTag: string | null;
  processNumberRaw: string | null;
  case: { id: string; title: string; processNumber: string | null } | null;
  client: { id: string; name: string } | null;
  taskCount?: number;
  assignedToId: string | null;
  triageStatus: string;
};

const STORAGE_KEY = "rp_seen_publications";

export default function PublicationsList({
  groups,
  highlightNew = true,
  users = [],
}: {
  groups: PublicationGroup<Pub>[];
  highlightNew?: boolean;
  users?: { id: string; name: string }[];
}) {
  // Starts empty so the very first client render matches the server-rendered
  // HTML exactly (the server has no localStorage) — avoids a hydration
  // mismatch. The real "seen" set is computed client-side after mount.
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const hasRun = useRef(false);

  useEffect(() => {
    if (!highlightNew) return;
    if (hasRun.current) return; // guards against Strict Mode's double effect invocation in dev
    hasRun.current = true;

    let seen: string[] = [];
    try {
      seen = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch {
      seen = [];
    }
    const seenSet = new Set(seen);
    // "Novo" é decidido pelo grupo (chave = id do item principal), não por publicação
    // individual — senão um grupo que ganhou uma nova fonte pra um card já visto piscaria
    // inteiro de novo mesmo sem o usuário nunca ter visto aquele card.
    const fresh = new Set(groups.filter((g) => !seenSet.has(g.key)).map((g) => g.key));
    setNewIds(fresh);

    const updated = Array.from(new Set([...seen, ...groups.map((g) => g.key)])).slice(-500);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups.map((g) => g.key).join(",")]);

  return (
    <div className="divide-y divide-navy-800/5 dark:divide-white/10">
      {groups.map((g) => (
        <div key={g.key} className={newIds.has(g.key) ? "bg-gold-500/10 dark:bg-gold-400/15" : "bg-white dark:bg-navy-900"}>
          <PublicationRow group={g} users={users} />
        </div>
      ))}
    </div>
  );
}
