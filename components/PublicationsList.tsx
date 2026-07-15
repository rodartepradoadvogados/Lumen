"use client";

import { useEffect, useRef, useState } from "react";
import PublicationRow from "@/components/PublicationRow";

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
  case: { id: string; title: string } | null;
  client: { id: string; name: string } | null;
  taskCount?: number;
  assignedToId: string | null;
  triageStatus: string;
};

const STORAGE_KEY = "rp_seen_publications";

export default function PublicationsList({
  publications,
  highlightNew = true,
  users = [],
}: {
  publications: Pub[];
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
    const fresh = new Set(publications.filter((p) => !seenSet.has(p.id)).map((p) => p.id));
    setNewIds(fresh);

    const updated = Array.from(new Set([...seen, ...publications.map((p) => p.id)])).slice(-500);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publications.map((p) => p.id).join(",")]);

  return (
    <div className="divide-y divide-navy-800/5">
      {publications.map((p) => (
        <div key={p.id} className={newIds.has(p.id) ? "bg-gold-500/10" : "bg-white"}>
          <PublicationRow pub={p} users={users} />
        </div>
      ))}
    </div>
  );
}
