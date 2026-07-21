"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RotateCcw, ImagePlus, X } from "lucide-react";
import { unpublishBlogPost, updatePublishedPostImage } from "@/lib/actions/blog";
import { Badge, EmptyState } from "@/components/ui";
import PhotoPickerGrid, { type LibraryPhoto } from "@/components/PhotoPickerGrid";

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

export default function BlogPublishedManager({ posts, photos = [] }: { posts: PublishedPost[]; photos?: LibraryPhoto[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pickerPost, setPickerPost] = useState<PublishedPost | null>(null);

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

  // Chamado ao clicar numa foto do picker: troca a imagem da matéria já
  // publicada (fora do fluxo de revisão), fecha o modal e atualiza a lista.
  function handlePickImage(photoUrl: string) {
    const post = pickerPost;
    if (!post) return;
    setError(null);
    startTransition(async () => {
      const result = await updatePublishedPostImage(post.id, photoUrl);
      if (result?.error) {
        setError(result.error);
      } else {
        setPickerPost(null);
        router.refresh();
      }
    });
  }

  return (
    <div>
      {error && <p className="mx-5 mt-4 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
      <div className="divide-y divide-navy-800/8">
        {posts.map((post) => (
          <div key={post.id} className="flex items-center gap-3 px-5 py-3 hover:bg-cream-50 transition-colors">
            <Link
              href={`/blog/${post.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 flex-1 min-w-0 group"
            >
              {post.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={post.imageUrl} alt="" className="h-12 w-16 object-cover rounded-lg border border-navy-800/10 shrink-0" />
              ) : (
                <div className="h-12 w-16 rounded-lg bg-cream-100 border border-navy-800/8 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-navy-900 truncate group-hover:underline">{post.title}</p>
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
            </Link>
            <button
              type="button"
              onClick={() => setPickerPost(post)}
              disabled={pending}
              data-tip="Trocar foto"
              className="p-1.5 rounded-lg text-navy-800/30 hover:text-navy-900 hover:bg-cream-100 transition-colors disabled:opacity-40 shrink-0"
            >
              <ImagePlus size={14} />
            </button>
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

      {pickerPost && (
        <div className="fixed inset-0 z-50 bg-navy-950/40 flex items-center justify-center p-4" onClick={() => setPickerPost(null)}>
          <div
            className="bg-white rounded-xl shadow-pop w-full max-w-2xl max-h-[90vh] overflow-y-auto scrollbar-thin"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-navy-800/8">
              <div className="min-w-0">
                <h3 className="font-serif font-bold text-navy-900">Trocar foto da matéria</h3>
                <p className="text-xs text-navy-800/50 mt-0.5 truncate">{pickerPost.title}</p>
              </div>
              <button onClick={() => setPickerPost(null)} className="text-navy-800/40 hover:text-navy-900 shrink-0 ml-3">
                <X size={18} />
              </button>
            </div>
            <div className="p-5">
              {photos.length === 0 ? (
                <p className="text-sm text-navy-800/50">Nenhuma foto cadastrada na biblioteca ainda.</p>
              ) : (
                <PhotoPickerGrid photos={photos} imageUrl={pickerPost.imageUrl || ""} onSelect={handlePickImage} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
