import { ImageResponse } from "next/og";
import { monogram } from "@/lib/pwaIcon";

// Ícone 192x192 referenciado pelo manifesto do PWA.
export function GET() {
  return new ImageResponse(monogram(192), { width: 192, height: 192 });
}
