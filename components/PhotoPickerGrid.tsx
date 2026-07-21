"use client";

import { photoFileUrl } from "@/lib/photos";

export type LibraryPhoto = { id: string; url: string; category: string; court: string; caption: string | null };

// Grade de miniaturas da biblioteca de fotos, usada tanto na revisão de
// rascunhos (BlogReviewManager) quanto na troca de imagem de matérias já
// publicadas (BlogPublishedManager). Sempre usa photoFileUrl (proxy da nossa
// própria API) em vez de photo.url cru, pois o Blob Store é privado.
export default function PhotoPickerGrid({
  photos,
  imageUrl,
  onSelect,
}: {
  photos: LibraryPhoto[];
  imageUrl: string;
  onSelect: (url: string) => void;
}) {
  return (
    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-1.5">
      {photos.map((photo) => {
        const fileUrl = photoFileUrl(photo.id);
        const selected = imageUrl === fileUrl;
        return (
          <button
            key={photo.id}
            type="button"
            onClick={() => onSelect(fileUrl)}
            data-tip={photo.caption || photo.category}
            className={`rounded-lg overflow-hidden border-2 transition-colors ${
              selected ? "border-gold-600" : "border-transparent hover:border-navy-800/20"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fileUrl} alt={photo.caption || photo.category} className="h-14 w-full object-cover" />
          </button>
        );
      })}
    </div>
  );
}
