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
      {error && <p className="mx-5 mt-4 text-[11px] text-urgente bg-urgente-bg rounded-md px-3 py-2">{error}</p>}
      <div className="divide-y divide-regua">
        {posts.map((post) => (
          <div key={post.id} className="flex items-center gap-3 px-5 py-3 hover:bg-sf-apoio transition-colors">
            <Link
              href={`/blog/${post.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 flex-1 min-w-0 group"
            >
              {post.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={post.imageUrl} alt="" className="h-12 w-16 object-cover border border-regua shrink-0" />
              ) : (
                <div className="h-12 w-16 bg-sf-apoio border border-regua shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-tx truncate group-hover:underline">{post.title}</p>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <Badge color="navy">{post.area}</Badge>
                  <Badge color="gold">{TYPE_LABELS[post.type] ?? post.type}</Badge>
                  {post.publishedAt && (
                    <span className="text-[11px] text-tx-3">
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
              className="p-1.5 text-tx-3 hover:text-tx hover:bg-sf-apoio transition-colors disabled:opacity-40 shrink-0 rounded-md"
            >
              <ImagePlus size={14} />
            </button>
            <button
              onClick={() => handleUnpublish(post.id, post.title)}
              disabled={pending}
              data-tip="Despublicar"
              className="p-1.5 text-tx-3 hover:text-aviso hover:bg-aviso-bg transition-colors disabled:opacity-40 shrink-0 rounded-md"
            >
              <RotateCcw size={14} />
            </button>
          </div>
        ))}
      </div>

      {pickerPost && (
        <div className="fixed inset-0 z-50 bg-grafite-900/40 flex items-center justify-center p-4">
          <div
            className="bg-sf shadow-pop w-full max-w-2xl max-h-[90vh] overflow-y-auto scrollbar-thin"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-regua">
              <div className="min-w-0">
                <h3 className="font-bold text-tx">Trocar foto da matéria</h3>
                <p className="text-xs text-tx-3 mt-0.5 truncate">{pickerPost.title}</p>
              </div>
              <button onClick={() => setPickerPost(null)} className="text-tx-3 hover:text-tx shrink-0 ml-3">
                <X size={18} />
              </button>
            </div>
            <div className="p-5">
              {photos.length === 0 ? (
                <p className="text-sm text-tx-3">Nenhuma foto cadastrada na biblioteca ainda.</p>
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
