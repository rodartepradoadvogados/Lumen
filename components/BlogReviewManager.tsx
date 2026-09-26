"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X, Check, Ban, Trash2, CalendarClock } from "lucide-react";
import { updateBlogPostDraft, publishBlogPost, rejectBlogPost, deleteBlogPost, scheduleBlogPost } from "@/lib/actions/blog";
import { Badge, EmptyState } from "@/components/ui";
import PhotoPickerGrid, { type LibraryPhoto } from "@/components/PhotoPickerGrid";
import { FUSO_DO_ESCRITORIO } from "@/lib/horaDeBrasilia";

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
  origem: string | null;
  createdAt: string;
};

// Formata a data mínima aceita pelo <input type="datetime-local"> (agora + 5min, no fuso local do
// navegador — a conversão para o fuso do escritório acontece no servidor, em scheduleBlogPost).
function minDatetimeLocal(): string {
  const d = new Date(Date.now() + 5 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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
    <div className="divide-y divide-regua">
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
  const [scheduling, setScheduling] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");
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

  function handleConfirmSchedule() {
    if (!scheduleAt) {
      setError("Escolha uma data e hora para o agendamento.");
      return;
    }
    run(
      () => scheduleBlogPost(post.id, scheduleAt, imageUrl),
      () => setScheduling(false)
    );
  }

  function handleReject() {
    const reason = window.prompt("Motivo da rejeição (opcional):") || "";
    if (!window.confirm("Rejeitar esta matéria? Ela não será publicada.")) return;
    run(() => rejectBlogPost(post.id, reason));
  }

  // Excluir é diferente de rejeitar: rejeitar mantém a matéria na fila do robô como "já
  // tratada" (não reenviar o mesmo assunto); excluir é para a matéria que não devia ter sido
  // cadastrada (duplicata, erro, teste) — soft-delete, some da tela, sem afetar o dedup do robô.
  function handleDelete() {
    if (!window.confirm(`Excluir "${title}"? Ela sai desta lista e não pode ser publicada depois. Esta ação não pode ser desfeita por aqui.`)) return;
    run(() => deleteBlogPost(post.id));
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
      {error && <p className="text-etiqueta text-urgente bg-urgente-bg rounded-md px-3 py-2">{error}</p>}

      <div className="flex items-start gap-2 flex-wrap">
        <div className="flex-1 min-w-[220px]">
          {editing ? (
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="cfg-input w-full font-bold text-tx" />
          ) : (
            <h4 className="font-bold text-tx text-base">{title}</h4>
          )}
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {post.origem?.startsWith("ROBO_") && <Badge color="gold">Robô</Badge>}
            <p className="text-etiqueta text-tx-3">
              Enviado em {new Date(post.createdAt).toLocaleString("pt-BR", { timeZone: FUSO_DO_ESCRITORIO })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              disabled={pending}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-tx border border-regua hover:bg-sf-apoio disabled:opacity-40"
            >
              <Pencil size={13} /> Editar
            </button>
          )}
          {editing && (
            <>
              <button
                onClick={handleSave}
                disabled={pending}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-acao-tx bg-acao hover:bg-acao-hover disabled:opacity-40 transition-colors"
              >
                <Check size={13} /> Salvar
              </button>
              <button
                onClick={handleCancelEdit}
                disabled={pending}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-tx border border-regua hover:bg-sf-apoio disabled:opacity-40"
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
            <label className="text-etiqueta font-medium text-tx-2">Área</label>
            <input value={area} onChange={(e) => setArea(e.target.value)} className="cfg-input w-full" />
          </div>
          <div>
            <label className="text-etiqueta font-medium text-tx-2">Formato</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className="cfg-input w-full">
              <option value="NOTICIA">Notícia curta</option>
              <option value="ANALISE">Análise aprofundada</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="text-etiqueta font-medium text-tx-2">Resumo</label>
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} className="cfg-input w-full" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-etiqueta font-medium text-tx-2">Conteúdo</label>
            <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={10} className="cfg-input w-full font-mono text-xs" />
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge color="navy">{area}</Badge>
            <Badge color="gold">{TYPE_LABELS[type] ?? type}</Badge>
          </div>
          <p className="text-sm text-tx-2 italic">{summary}</p>
          <div className="text-sm text-tx space-y-2 max-h-72 overflow-y-auto bg-sf-apoio p-3 border border-regua">
            {content.split(/\n+/).filter(Boolean).map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        </div>
      )}

      {sourceLinks.length > 0 && (
        <div>
          <p className="text-etiqueta font-semibold text-tx-2 uppercase mb-1">Fontes usadas</p>
          <ul className="space-y-0.5">
            {sourceLinks.map((url, i) => (
              <li key={i}>
                <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-marca-tx hover:underline break-all">
                  {url}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {photos.length > 0 && (
        <div className="pt-2 border-t border-regua space-y-2">
          {suggestedPhotos.length > 0 && (
            <div>
              <p className="text-etiqueta font-semibold text-tx-2 uppercase mb-1">Sugeridas para &ldquo;{area}&rdquo;</p>
              <PhotoPickerGrid photos={suggestedPhotos} imageUrl={imageUrl} onSelect={setImageUrl} />
            </div>
          )}
          {otherPhotos.length > 0 && (
            <div>
              <p className="text-etiqueta font-semibold text-tx-2 uppercase mb-1">Outras fotos</p>
              <PhotoPickerGrid photos={otherPhotos} imageUrl={imageUrl} onSelect={setImageUrl} />
            </div>
          )}
        </div>
      )}

      <div className="flex items-end gap-2 flex-wrap pt-2 border-t border-regua">
        <div className="flex-1 min-w-[220px]">
          <label className="text-etiqueta font-medium text-tx-2">URL da imagem (opcional, adicione antes de publicar)</label>
          <input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://... (ou escolha da biblioteca acima)"
            className="cfg-input w-full"
          />
        </div>
        {/* text-atencao/hover:bg-grave-bg — mesmo par de tokens de components/DeleteButton.tsx e
            components/HolidaysManager.tsx para ação destrutiva; `text-vinho` (usado no botão
            Rejeitar ao lado) é uma classe sem `DEFAULT` no tema — não gera regra no Tailwind, e
            não é replicada aqui por não fazer parte do escopo desta entrega. */}
        <button
          onClick={handleDelete}
          disabled={pending}
          data-tip="Excluir matéria"
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-atencao border border-regua hover:bg-grave-bg disabled:opacity-40"
        >
          <Trash2 size={14} /> Excluir
        </button>
        <button
          onClick={handleReject}
          disabled={pending}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-vinho border border-regua hover:bg-sf-apoio disabled:opacity-40"
        >
          <Ban size={14} /> Rejeitar
        </button>
        <button
          onClick={() => setScheduling((s) => !s)}
          disabled={pending}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-tx border border-regua hover:bg-sf-apoio disabled:opacity-40"
        >
          <CalendarClock size={14} /> Agendar…
        </button>
        <button
          onClick={handlePublish}
          disabled={pending}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-acao-tx bg-acao hover:bg-acao-hover disabled:opacity-40 transition-colors"
        >
          <Check size={14} /> Confirmar e publicar
        </button>
      </div>

      {scheduling && (
        <div className="flex items-end gap-2 flex-wrap pt-2 border-t border-regua">
          <div>
            <label className="text-etiqueta font-medium text-tx-2">Publicar em (horário de Brasília)</label>
            <input
              type="datetime-local"
              value={scheduleAt}
              min={minDatetimeLocal()}
              onChange={(e) => setScheduleAt(e.target.value)}
              className="cfg-input"
            />
          </div>
          <button
            onClick={handleConfirmSchedule}
            disabled={pending}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-acao-tx bg-acao hover:bg-acao-hover disabled:opacity-40 transition-colors"
          >
            <CalendarClock size={14} /> Confirmar agendamento
          </button>
          <button
            onClick={() => setScheduling(false)}
            disabled={pending}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-tx border border-regua hover:bg-sf-apoio disabled:opacity-40"
          >
            <X size={13} /> Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
