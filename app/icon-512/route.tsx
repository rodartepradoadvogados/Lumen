import { ImageResponse } from "next/og";
import { monogram } from "@/lib/pwaIcon";

// Ícone 512x512 referenciado pelo manifesto do PWA (inclusive como "maskable").
export function GET() {
  return new ImageResponse(monogram(512), { width: 512, height: 512 });
}
