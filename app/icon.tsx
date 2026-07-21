import { ImageResponse } from "next/og";
import { lumenIcon } from "@/lib/pwaIcon";

// Convenção do Next 14: gera o ícone/favicon do app em código, sem arquivo binário.
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(lumenIcon(size.width), { ...size });
}
