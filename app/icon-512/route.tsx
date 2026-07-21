import { ImageResponse } from "next/og";
import { lumenIcon } from "@/lib/pwaIcon";

// Ícone 512x512 referenciado pelo manifesto do PWA (inclusive como "maskable").
export function GET() {
  return new ImageResponse(lumenIcon(512), { width: 512, height: 512 });
}
