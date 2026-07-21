"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X, Check, Ban } from "lucide-react";
import { updateBlogPostDraft, publishBlogPost, rejectBlogPost } from "@/lib/actions/blog";
import { Badge, EmptyState } from "@/components/ui";
import PhotoPickerGrid, { type LibraryPhoto } from "@/components/PhotoPickerGrid";

export type PendingPost = {
  id: string;
  slug: string;
  title: string;
  area: string;
  type: string;
  summary: string;
  content: string;
  sources: string | null;
  imageUrl: string | null;
  createdAt: string;
};

const TYPE_LABELS: Record<string, string> = { NOTICIA: "Notícia curta", ANALISE: "Análise aprofundada" };

// Mesma normalização usada em lib/importers/importCore.ts, para comparar
// textos ignorando acentuação/maiúsculas (ex: "Tributario" == "Tributário").
function norm(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

// Categoria "curinga" de área — foto genérica que serve para qualquer matéria.
// Aceita tanto o valor novo ("Todos") quanto o antigo ("Geral/Escritório"), já
// que fotos cadastradas antes da renomeação continuam com o valor antigo salvo.
function isWildcardCategory(category: string) {
  const n = norm(category);
  return n === "todos" || n === "geral/escritorio" || n === "geral/escritório";
}

// Tenta detectar o tribunal mencionado no TÍTULO da matéria (só o título, para
// evitar falsos positivos vindos do corpo do texto). Usa regex com fronteira
// de palavra, case-insensitive, para cada acrônimo. TST/TRT mapeiam para o
// mesmo valor de tribunal usado nas fotos ("TRT/TST"). Se houver mais de um
// acrônimo diferente no título, usa o primeiro encontrado — é só uma sugestão,
// sempre revisável pelo admin antes de publicar.
const COURT_PATTERNS: { regex: RegExp; court: string }[] = [
  { regex: /\bSTF\b/i, court: "STF" },
  { regex: /\bSTJ\b/i, court: "STJ" },
  { regex: /\bTST\b/i, court: "TRT/TST" },
  { regex: /\bTRT\b/i, court: "TRT/TST" },
  { regex: /\bTRF\b/i, court: "TRF" },
  { regex: /\bTJ\b/i, court: "TJ" },
];

function detectCourtFromTitle(title: string): string | null {
  let best: { court: string; index: number } | null = null;
  for (const { regex, court } of COURT_PATTERNS) {
    const match = title.match(regex);
    if (match && match.index !== undefined) {
      if (best === null || match.index < best.index) {
        best = { court, index: match.index };
      }
    }
  }
  return best?.court ?? null;
}

// Pontuação de relevância de uma foto para a matéria (0 a 4, maior = mais
// relevante). Usada só para ordenar a grade de sugestões — não é uma fórmula
// sofisticada, apenas uma prioridade simples:
//   4: bate área E tribunal detectado (ou foto é curinga de tribunal "TODOS")
//   2: bate só área, ou bate só tribunal
//   1: foto é curinga de área ("Todos"/"Geral/Escritório")
//   0: não bate nada — vai para "Outras fotos"
function photoScore(photo: LibraryPhoto, normalizedArea: string, detectedCourt: string | null): number {
  const areaMatch = norm(photo.category) === normalizedArea;
  const courtMatch = detectedCourt !== null && (photo.court === detectedCourt || photo.court === "TODOS");

  if (areaMatch && courtMatch) return 4;
  if (areaMatch || courtMatch) return 2;
  if (isWildcardCategory(photo.category)) return 1;
  return 0;
}

export default function BlogReviewManager({ posts, photos = [] }: { posts: PendingPost[]; photos?: LibraryPhoto[] }) {
  if (posts.length === 0) {
    return <EmptyState title="Nenhuma matéria aguardando revisão" subtitle="Os rascunhos enviados pelo robô de conteúdo aparecem aqui." />;
  }
  return (
    <div className="divide-y divide-navy-800/8">
      {posts.map((post) => (
        <ReviewCard key={post.id} post={post} photos={photos} />
      ))}
    </div>
  );
}

function ReviewCard({ post, photos }: { post: PendingPost; photos: LibraryPhoto[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(post.title);
  const [area, setArea] = useState(post.area);
  const [type, setType] = useState(post.type);
  const [summary, setSummary] = useState(post.summary);
  const [content, setContent] = useState(post.content);
  const [imageUrl, setImageUrl] = useState(post.imageUrl || "");

  function run(fn: () => Promise<{ error?: string }>, onSuccess?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result?.error) {
        setError(result.error);
      } else {
        onSuccess?.();
        router.refresh();
      }
    });
  }

  function handleSave() {
    run(
      () => updateBlogPostDraft(post.id, { title, area, type, summary, content }),
      () => setEditing(false)
    );
  }

  function handleCancelEdit() {
    setTitle(post.title);
    setArea(post.area);
    setType(post.type);
    setSummary(post.summary);
    setContent(post.content);
    setEditing(false);
    setError(null);
  }

  function handlePublish() {
    if (!window.confirm(`Publicar "${title}" no blog público? Ela ficará visível para qualquer visitante.`)) return;
    run(() => publishBlogPost(post.id, imageUrl));
  }

  function handleReject() {
    const reason = window.prompt("Motivo da rejeição (opcional):") || "";
    if (!window.confirm("Rejeitar esta matéria? Ela não será publicada.")) return;
    run(() => rejectBlogPost(post.id, reason));
  }

  const sourceLinks = (post.sources || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const normalizedArea = norm(area);
  const detectedCourt = detectCourtFromTitle(title);
  const scoredPhotos = photos
    .map((photo) => ({ photo, score: photoScore(photo, normalizedArea, detectedCourt) }))
    .sort((a, b) => b.score - a.score);
  const suggestedPhotos = scoredPhotos.filter((p) => p.score > 0).map((p) => p.photo);
  const otherPhotos = scoredPhotos.filter((p) => p.score === 0).map((p) => p.photo);

  return (
    <div className="p-5 space-y-3">
      {error && <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex items-start gap-2 flex-wrap">
        <div className="flex-1 min-w-[220px]">
          {editing ? (
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="cfg-input w-full font-serif font-bold text-navy-900" />
          ) : (
            <h4 className="font-serif font-bold text-navy-900 text-base">{title}</h4>
          )}
          <p className="text-[11px] text-navy-800/40 mt-0.5">
            Enviado pelo robô em {new Date(post.createdAt).toLocaleString("pt-BR")}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              disabled={pending}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-navy-800 border border-navy-800/15 hover:bg-cream-100 disabled:opacity-40"
            >
              <Pencil size={13} /> Editar
            </button>
          )}
          {editing && (
            <>
              <button
                onClick={handleSave}
                disabled={pending}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-navy-900 hover:bg-navy-800 disabled:opacity-40"
              >
                <Check size={13} /> Salvar
              </button>
              <button
                onClick={handleCancelEdit}
                disabled={pending}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-navy-800 border border-navy-800/15 hover:bg-cream-100 disabled:opacity-40"
              >
                <X size={13} /> Cancelar
              </button>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] font-medium text-navy-800/55">Área</label>
            <input value={area} onChange={(e) => setArea(e.target.value)} className="cfg-input w-full" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-navy-800/55">Formato</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className="cfg-input w-full">
              <option value="NOTICIA">Notícia curta</option>
              <option value="ANALISE">Análise aprofundada</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="text-[11px] font-medium text-navy-800/55">Resumo</label>
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} className="cfg-input w-full" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-[11px] font-medium text-navy-800/55">Conteúdo</label>
            <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={10} className="cfg-input w-full font-mono text-xs" />
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge color="navy">{area}</Badge>
            <Badge color="gold">{TYPE_LABELS[type] ?? type}</Badge>
          </div>
          <p className="text-sm text-navy-800/70 italic">{summary}</p>
          <div className="text-sm text-navy-900 space-y-2 max-h-72 overflow-y-auto bg-cream-50 rounded-lg p-3 border border-navy-800/8">
            {content.split(/\n+/).filter(Boolean).map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        </div>
      )}

      {sourceLinks.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-navy-800/55 uppercase mb-1">Fontes usadas</p>
          <ul className="space-y-0.5">
            {sourceLinks.map((url, i) => (
              <li key={i}>
                <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-gold-700 hover:underline break-all">
                  {url}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {photos.length > 0 && (
        <div className="pt-2 border-t border-navy-800/8 space-y-2">
          {suggestedPhotos.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-navy-800/55 uppercase mb-1">Sugeridas para &ldquo;{area}&rdquo;</p>
              <PhotoPickerGrid photos={suggestedPhotos} imageUrl={imageUrl} onSelect={setImageUrl} />
            </div>
          )}
          {otherPhotos.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-navy-800/55 uppercase mb-1">Outras fotos</p>
              <PhotoPickerGrid photos={otherPhotos} imageUrl={imageUrl} onSelect={setImageUrl} />
            </div>
          )}
        </div>
      )}

      <div className="flex items-end gap-2 flex-wrap pt-2 border-t border-navy-800/8">
        <div className="flex-1 min-w-[220px]">
          <label className="text-[11px] font-medium text-navy-800/55">URL da imagem (opcional, adicione antes de publicar)</label>
          <input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://... (ou escolha da biblioteca acima)"
            className="cfg-input w-full"
          />
        </div>
        <button
          onClick={handleReject}
          disabled={pending}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-red-700 border border-red-200 hover:bg-red-50 disabled:opacity-40"
        >
          <Ban size={14} /> Rejeitar
        </button>
        <button
          onClick={handlePublish}
          disabled={pending}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40"
        >
          <Check size={14} /> Confirmar e publicar
        </button>
      </div>
    </div>
  );
}
