"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, ZoomIn } from "lucide-react";

const PREVIEW_SIZE = 260;
const OUTPUT_SIZE = 480;
const MAX_ZOOM = 3;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export default function ImageCropperModal({
  file,
  onCancel,
  onConfirm,
}: {
  file: File;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragState = useRef<{ startX: number; startY: number; startOffsetX: number; startOffsetY: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Escala mínima que cobre o quadrado de preview inteiro (mesma lógica de object-fit: cover),
  // para o zoom sempre partir de "toda a foto visível, sem sobrar espaço vazio".
  const baseScale = useMemo(() => {
    if (!natural.width || !natural.height) return 1;
    return Math.max(PREVIEW_SIZE / natural.width, PREVIEW_SIZE / natural.height);
  }, [natural]);

  const scale = baseScale * zoom;
  const displayWidth = natural.width * scale;
  const displayHeight = natural.height * scale;
  const maxOffsetX = Math.max(0, (displayWidth - PREVIEW_SIZE) / 2);
  const maxOffsetY = Math.max(0, (displayHeight - PREVIEW_SIZE) / 2);

  function clampOffset(x: number, y: number) {
    return { x: clamp(x, -maxOffsetX, maxOffsetX), y: clamp(y, -maxOffsetY, maxOffsetY) };
  }

  function handleImageLoad() {
    const img = imgRef.current;
    if (!img) return;
    setNatural({ width: img.naturalWidth, height: img.naturalHeight });
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }

  function handleZoomChange(value: number) {
    setZoom(value);
    setOffset((prev) => clampOffset(prev.x, prev.y));
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = { startX: e.clientX, startY: e.clientY, startOffsetX: offset.x, startOffsetY: offset.y };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setOffset(clampOffset(dragState.current.startOffsetX + dx, dragState.current.startOffsetY + dy));
  }

  function handlePointerUp() {
    dragState.current = null;
  }

  function handleConfirm() {
    const img = imgRef.current;
    if (!img || !natural.width) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const left = (PREVIEW_SIZE - displayWidth) / 2 + offset.x;
    const top = (PREVIEW_SIZE - displayHeight) / 2 + offset.y;
    const sx = -left / scale;
    const sy = -top / scale;
    const sSize = PREVIEW_SIZE / scale;

    ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    canvas.toBlob((blob) => {
      if (blob) onConfirm(blob);
    }, "image/jpeg", 0.92);
  }

  return (
    <div className="fixed inset-0 z-[60] bg-navy-950/60 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-navy-900 rounded-xl shadow-pop w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy-800/8 dark:border-white/10">
          <h3 className="font-serif font-bold text-navy-900 dark:text-cream-50">Ajustar foto</h3>
          <button onClick={onCancel} className="text-navy-800/40 dark:text-cream-50/40 hover:text-navy-900 dark:hover:text-cream-50">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 flex flex-col items-center gap-4">
          <div
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="relative rounded-full overflow-hidden bg-navy-950/5 dark:bg-black/30 cursor-grab active:cursor-grabbing touch-none select-none"
            style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE }}
          >
            {imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                ref={imgRef}
                src={imageUrl}
                alt=""
                draggable={false}
                onLoad={handleImageLoad}
                className="absolute pointer-events-none"
                style={{
                  width: displayWidth || undefined,
                  height: displayHeight || undefined,
                  left: (PREVIEW_SIZE - displayWidth) / 2 + offset.x,
                  top: (PREVIEW_SIZE - displayHeight) / 2 + offset.y,
                }}
              />
            )}
          </div>
          <div className="w-full flex items-center gap-2">
            <ZoomIn size={16} className="text-navy-800/45 dark:text-cream-50/45 shrink-0" />
            <input
              type="range"
              min={1}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              onChange={(e) => handleZoomChange(Number(e.target.value))}
              className="w-full accent-gold-600"
            />
          </div>
          <p className="text-[11px] text-navy-800/45 dark:text-cream-50/45 text-center">Arraste a foto para posicionar e use o controle para dar zoom.</p>
          <div className="flex gap-2 w-full">
            <button onClick={onCancel} className="flex-1 text-sm font-semibold text-navy-800/60 dark:text-cream-50/60 hover:text-navy-900 dark:hover:text-cream-50 py-2.5 rounded-lg border border-navy-800/12 dark:border-white/15">
              Cancelar
            </button>
            <button onClick={handleConfirm} className="flex-1 bg-bordo-700 hover:bg-bordo-600 text-white text-sm font-semibold py-2.5 rounded-lg">
              Usar foto
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
