"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarX, Check } from "lucide-react";
import { unscheduleBlogPost, publishBlogPost } from "@/lib/actions/blog";
import { Badge, EmptyState } from "@/components/ui";
import { dataEHoraDeBrasilia } from "@/lib/horaDeBrasilia";

export type ScheduledPost = {
  id: string;
  slug: string;
  title: string;
  area: string;
  type: string;
  origem: string | null;
  imageUrl: string | null;
  agendadaPara: string | null;
};

const TYPE_LABELS: Record<string, string> = { NOTICIA: "Notícia curta", ANALISE: "Análise aprofundada" };

// Aba "Agendamento" (docs/agentes/robo-news-juridico-firecrawl.md, Parte A5; renomeada de
// "Agendadas" em 26/09/2026 a pedido do dono) — matérias com status AGENDADO, ordenadas por
// agendadaPara (a mais próxima primeiro), com "Cancelar agendamento" (volta para Revisão
// Pendente) e "Publicar agora" (confirma antes da hora). Agendar uma matéria NOVA continua sendo
// feito de dentro da aba "Revisão Pendente" (botão "Agendar…" em cada rascunho) — esta aba só
// GERENCIA quem já está agendado.
export default function BlogScheduledManager({ posts }: { posts: ScheduledPost[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (posts.length === 0) {
    return (
      <EmptyState
        title="Nenhuma matéria agendada"
        subtitle={'Para agendar, abra a aba "Revisão Pendente" e use o botão "Agendar…" em qualquer rascunho.'}
      />
    );
  }

  function handleUnschedule(id: string, title: string) {
    if (!window.confirm(`Cancelar o agendamento de "${title}"? Ela volta para a fila de revisão pendente.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await unscheduleBlogPost(id);
      if (result?.error) setError(result.error);
      else router.refresh();
    });
  }

  function handlePublishNow(id: string, title: string) {
    if (!window.confirm(`Publicar "${title}" agora, antes do horário agendado?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await publishBlogPost(id);
      if (result?.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div>
      {error && <p className="mx-5 mt-4 text-etiqueta text-urgente bg-urgente-bg rounded-md px-3 py-2">{error}</p>}
      <div className="divide-y divide-regua">
        {posts.map((post) => (
          <div key={post.id} className="flex items-center gap-3 px-5 py-3">
            {post.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={post.imageUrl} alt="" className="h-12 w-16 object-cover border border-regua shrink-0" loading="lazy" decoding="async" />
            ) : (
              <div className="h-12 w-16 bg-sf-apoio border border-regua shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-tx truncate">{post.title}</p>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <Badge color="navy">{post.area}</Badge>
                <Badge color="gold">{TYPE_LABELS[post.type] ?? post.type}</Badge>
                {post.origem?.startsWith("ROBO_") && <Badge color="gold">Robô</Badge>}
                {post.agendadaPara && (
                  <span className="text-etiqueta text-tx-3">publica em {dataEHoraDeBrasilia(post.agendadaPara)}</span>
                )}
              </div>
            </div>
            <button
              onClick={() => handlePublishNow(post.id, post.title)}
              disabled={pending}
              data-tip="Publicar agora"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-acao-tx bg-acao hover:bg-acao-hover disabled:opacity-40 transition-colors shrink-0"
            >
              <Check size={13} /> Publicar agora
            </button>
            <button
              onClick={() => handleUnschedule(post.id, post.title)}
              disabled={pending}
              data-tip="Cancelar agendamento"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-tx border border-regua hover:bg-sf-apoio disabled:opacity-40 transition-colors shrink-0"
            >
              <CalendarX size={13} /> Cancelar
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
