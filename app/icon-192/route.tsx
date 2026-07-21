import { ImageResponse } from "next/og";
import { lumenIcon } from "@/lib/pwaIcon";

// Ícone 192x192 referenciado pelo manifesto do PWA.
export function GET() {
  return new ImageResponse(lumenIcon(192), { width: 192, height: 192 });
}
