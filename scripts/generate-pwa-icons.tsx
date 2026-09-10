// Script único, sob demanda: gera os PNGs estáticos de app/icon.png, app/apple-icon.png e
// public/icons/icon-{192,512}.png a partir do mesmo desenho de lib/pwaIcon.tsx.
//
// Por quê existir fora do fluxo normal do Next: next/og (ImageResponse) tem um bug no Windows
// (path.join aplicado a um file:// URL do import.meta.url, ver andamento.md do plano de
// adequação Impeccable) que quebra tanto `next dev` quanto `next build` nessas rotas. A saída
// escolhida foi parar de gerar os ícones em cada request/build e versionar o PNG resultante —
// já que o desenho é fixo (marca, sem dado dinâmico), gerar de novo só faz sentido se o desenho
// mudar. Quando isso acontecer: `npm i -D satori @resvg/resvg-js` (não ficam como dependência
// permanente do projeto, só servem a este script) e rode `npx tsx scripts/generate-pwa-icons.tsx`.
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { lumenIcon } from "../lib/pwaIcon";

// Reaproveita o mesmo arquivo de fonte que o next/og já traz — o bug do Windows está só no
// código de resolução do caminho, não no asset em si.
const fontData = readFileSync(
  join(process.cwd(), "node_modules/next/dist/compiled/@vercel/og/noto-sans-v27-latin-regular.ttf")
);

async function renderPng(size: number): Promise<Buffer> {
  const svg = await satori(lumenIcon(size), {
    width: size,
    height: size,
    fonts: [{ name: "Noto Sans", data: fontData, weight: 400, style: "normal" }],
  });
  return Buffer.from(new Resvg(svg).render().asPng());
}

async function main() {
  writeFileSync(join(process.cwd(), "app/icon.png"), await renderPng(512));
  writeFileSync(join(process.cwd(), "app/apple-icon.png"), await renderPng(180));
  mkdirSync(join(process.cwd(), "public/icons"), { recursive: true });
  writeFileSync(join(process.cwd(), "public/icons/icon-192.png"), await renderPng(192));
  writeFileSync(join(process.cwd(), "public/icons/icon-512.png"), await renderPng(512));
  console.log("Ícones gerados: app/icon.png, app/apple-icon.png, public/icons/icon-192.png, public/icons/icon-512.png");
}

main();
