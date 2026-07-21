"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, Trash2 } from "lucide-react";
import { deletePhoto } from "@/lib/actions/photos";
import { Badge, EmptyState } from "@/components/ui";

export type Photo = {
  id: string;
  url: string;
  category: string;
  court: string;
  caption: string | null;
  createdAt: string;
};

export const PHOTO_CATEGORIES = [
  "Civil",
  "Consumerista",
  "Empresarial",
  "Tributário",
  "Trabalhista",
  "Previdenciário",
  "Administrativo",
  "Licitação",
  "Compliance",
  "Contratual",
  "Responsabilidade Civil",
  "Todos",
];

export const PHOTO_COURTS = [
  { value: "STF", label: "STF" },
  { value: "STJ", label: "STJ" },
  { value: "TRT/TST", label: "TRT/TST" },
  { value: "TJ", label: "TJ" },
  { value: "TRF", label: "TRF" },
  { value: "TODOS", label: "Todos" },
];

export default function PhotoLibraryManager({ photos }: { photos: Photo[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState(PHOTO_CATEGORIES[0]);
  const [court, setCourt] = useState("TODOS");
  const [caption, setCaption] = useState("");

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Selecione um arquivo de imagem.");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", category);
      formData.append("court", court);
      if (caption.trim()) formData.append("caption", caption.trim());

      const res = await fetch("/api/photos/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erro ao enviar a foto.");
        return;
      }
      setFile(null);
      setCaption("");
      setCourt("TODOS");
      const input = document.getElementById("photo-file-input") as HTMLInputElement | null;
      if (input) input.value = "";
      router.refresh();
    } catch {
      setError("Erro ao enviar a foto. Tente novamente.");
    } finally {
      setUploading(false);
    }
  }

  function handleDelete(id: string) {
    if (!window.confirm("Excluir esta foto da biblioteca? Ela deixa de estar disponível para o blog e para o fundo do site.")) return;
    setError(null);
    startTransition(async () => {
      const result = await deletePhoto(id);
      if (result?.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-4 p-5">
      {error && <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      <form onSubmit={handleUpload} className="flex gap-2 flex-wrap items-end border border-navy-800/10 dark:border-white/10 rounded-lg p-3">
        <div className="flex-1 min-w-[200px]">
          <label className="text-[11px] font-medium text-navy-800/55 dark:text-cream-50/55">Arquivo de imagem</label>
          <input
            id="photo-file-input"
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="cfg-input w-full"
          />
        </div>
        <div className="min-w-[180px]">
          <label className="text-[11px] font-medium text-navy-800/55 dark:text-cream-50/55">Categoria/Área</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="cfg-input w-full">
            {PHOTO_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[140px]">
          <label className="text-[11px] font-medium text-navy-800/55 dark:text-cream-50/55">Tribunal</label>
          <select value={court} onChange={(e) => setCourt(e.target.value)} className="cfg-input w-full">
            {PHOTO_COURTS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="text-[11px] font-medium text-navy-800/55 dark:text-cream-50/55">Legenda (opcional)</label>
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Ex: Fachada do escritório"
            className="cfg-input w-full"
          />
        </div>
        <button
          type="submit"
          disabled={uploading}
          className="flex items-center gap-1.5 bg-navy-900 hover:bg-navy-800 text-white text-sm font-semibold rounded-lg px-4 py-2 disabled:opacity-50"
        >
          <UploadCloud size={16} /> {uploading ? "Enviando..." : "Enviar"}
        </button>
      </form>

      {photos.length === 0 ? (
        <EmptyState
          title="Nenhuma foto na biblioteca ainda"
          subtitle="Envie fotos temáticas (escritório, tribunal, documentos, balança da justiça etc.) para ilustrar o blog e o fundo do site."
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {photos.map((photo) => (
            <div key={photo.id} className="rounded-xl border border-navy-800/10 dark:border-white/10 overflow-hidden bg-white dark:bg-navy-900">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt={photo.caption || photo.category} className="w-full h-28 object-cover" />
              <div className="p-2 space-y-1">
                <div className="flex items-center gap-1 flex-wrap">
                  <Badge color="navy">{photo.category}</Badge>
                  <Badge color="gold">{photo.court}</Badge>
                </div>
                {photo.caption && <p className="text-[11px] text-navy-800/55 dark:text-cream-50/55 truncate">{photo.caption}</p>}
                <button
                  onClick={() => handleDelete(photo.id)}
                  disabled={pending}
                  className="w-full flex items-center justify-center gap-1 mt-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-red-700 border border-red-200 hover:bg-red-50 disabled:opacity-40"
                >
                  <Trash2 size={12} /> Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
