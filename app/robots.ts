import { MetadataRoute } from "next";

function getAppUrl(): string {
  return process.env.APP_URL || "https://lumen-flax-chi.vercel.app";
}

// A maior parte do site fica atrás de login (middleware redireciona quem não
// tem sessão para "/"), então não há conteúdo sensível exposto a bots — isso
// aqui só evita gastar orçamento de rastreamento em rotas de API.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/"] },
    sitemap: `${getAppUrl()}/sitemap.xml`,
  };
}
