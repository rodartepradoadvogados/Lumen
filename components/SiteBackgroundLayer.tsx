import { prisma } from "@/lib/prisma";

// Camada de fundo decorativa, de baixa opacidade, atrás da área de CONTEÚDO do
// sistema (nunca atrás da Sidebar). Sorteia uma foto da biblioteca a cada
// requisição; se não houver nenhuma foto cadastrada ainda, não renderiza nada
// e o `.brand-texture` padrão (app/globals.css) continua sendo o único fundo.
export default async function SiteBackgroundLayer() {
  const photos = await prisma.photo.findMany({ select: { url: true } });
  if (photos.length === 0) return null;

  const photo = photos[Math.floor(Math.random() * photos.length)];

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 bg-cover bg-center opacity-[0.05] dark:opacity-[0.09]"
      style={{ backgroundImage: `url(${photo.url})` }}
    />
  );
}
