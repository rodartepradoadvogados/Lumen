"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { distributePendingPublications } from "@/lib/actions/publications";
import { Shuffle } from "lucide-react";

export default function DistributePublicationsButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ assigned?: number; error?: string } | null>(null);

  return (
    <div>
      <button
        onClick={() =>
          startTransition(async () => {
            const r = await distributePendingPublications();
            setResult(r);
            router.refresh();
          })
        }
        disabled={pending}
        className="flex items-center gap-1.5 bg-navy-900 hover:bg-navy-800 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg"
      >
        <Shuffle size={15} className={pending ? "animate-pulse" : ""} /> {pending ? "Distribuindo..." : "Distribuir pendentes"}
      </button>
      {result && (
        <div className="text-sm mt-2">
          {result.error ? (
            <p className="text-red-600">{result.error}</p>
          ) : (
            <p className="text-navy-800">{result.assigned} publicação(ões) distribuída(s)</p>
          )}
        </div>
      )}
    </div>
  );
}
