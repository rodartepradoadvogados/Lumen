"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RotateCcw, ExternalLink } from "lucide-react";
import { unpublishBlogPost } from "@/lib/actions/blog";
import { Badge, EmptyState } from "@/components/ui";

export type PublishedPost = {
  id: string;
  slug: string;
  title: string;
  area: string;
  type: string;
  imageUrl: string | null;
  publishedAt: string | null;
};

const TYPE_LABELS: Record<string, string> = { NOTICIA: "Notícia curta", ANALISE: "Análise aprofundada" };

export default function BlogPublishedManager({ posts }: { posts: PublishedPost[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (posts.length === 0) {
    return <EmptyState title="Nenhuma matéria publicada ainda" subtitle={'Confirme rascunhos na aba "Revisão Pendente" para que apareçam aqui.'} />;
  }

  function handleUnpublish(id: string, title: string) {
    if (!window.confirm(`Despublicar "${title}"? Ela sai do ar e volta para a fila de revisão pendente.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await unpublishBlogPost(id);
      if (result?.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div>
      {error && <p className="mx-5 mt-4 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
      <div className="divide-y divide-navy-800/8">
        {posts.map((post) => (
          <div key={post.id} className="flex items-center gap-3 px-5 py-3">
            {post.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={post.imageUrl} alt="" className="h-12 w-16 object-cover rounded-lg border border-navy-800/10 shrink-0" />
            ) : (
              <div className="h-12 w-16 rounded-lg bg-cream-100 border border-navy-800/8 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-navy-900 truncate">{post.title}</p>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <Badge color="navy">{post.area}</Badge>
                <Badge color="gold">{TYPE_LABELS[post.type] ?? post.type}</Badge>
                {post.publishedAt && (
                  <span className="text-[11px] text-navy-800/45">
                    publicado em {new Date(post.publishedAt).toLocaleDateString("pt-BR")}
                  </span>
                )}
              </div>
            </div>
            <Link
              href={`/blog/${post.slug}`}
              target="_blank"
              data-tip="Ver no blog"
              className="p-1.5 rounded-lg text-navy-800/30 hover:text-navy-900 hover:bg-cream-100 transition-colors shrink-0"
            >
              <ExternalLink size={14} />
            </Link>
            <button
              onClick={() => handleUnpublish(post.id, post.title)}
              disabled={pending}
              data-tip="Despublicar"
              className="p-1.5 rounded-lg text-navy-800/30 hover:text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-40 shrink-0"
            >
              <RotateCcw size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
