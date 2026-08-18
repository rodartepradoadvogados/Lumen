import { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { getAppUrl } from "@/lib/appUrl";

// Sem isso, o Next gera o sitemap uma vez no build e ele fica parado até o
// próximo deploy — matérias aprovadas depois (sem novo deploy) não apareceriam.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getAppUrl();

  // TODO(multi-tenant): mesmo stopgap de escritório único usado em app/blog/page.tsx —
  // revisitar quando cada escritório tiver sua própria URL pública.
  const office = await prisma.office.findFirst({ orderBy: { createdAt: "asc" } });
  const posts = office
    ? await prisma.blogPost.findMany({
        where: { officeId: office.id, status: "PUBLICADO" },
        select: { slug: true, publishedAt: true, updatedAt: true },
        orderBy: { publishedAt: "desc" },
      })
    : [];

  return [
    { url: base, changeFrequency: "monthly", priority: 1 },
    { url: `${base}/blog`, changeFrequency: "daily", priority: 0.9 },
    ...posts.map((post) => ({
      url: `${base}/blog/${post.slug}`,
      lastModified: post.updatedAt ?? post.publishedAt ?? undefined,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
