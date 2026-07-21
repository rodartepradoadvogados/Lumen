// Camada de fundo decorativa, de baixa opacidade, atrás da área de CONTEÚDO do
// sistema (nunca atrás da Sidebar) — mesma foto do escritório usada no banner "O direito
// muda todo dia" da homepage pública (public/backgrounds/escritorio.webp), pra manter a
// identidade visual consistente entre a landing e o setor interno.
export default function SiteBackgroundLayer() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 bg-cover bg-center opacity-[0.20] dark:opacity-[0.09]"
      style={{ backgroundImage: "url(/backgrounds/escritorio.webp)" }}
    />
  );
}
