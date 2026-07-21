import { ImageResponse } from "next/og";
import { lumenIcon } from "@/lib/pwaIcon";

// Ícone para a tela inicial do iOS (o próprio iOS aplica a máscara de cantos arredondados).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(lumenIcon(size.width), { ...size });
}
