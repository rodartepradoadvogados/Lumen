// Textura granulada quase imperceptível (DESIGN-SYSTEM.md — acabamento "premium" da
// Início/Painel, agosto/2026) — ruído em mix-blend-mode:overlay, opacidade baixa e distinta por
// tema (--grain-opacity, ver app/globals.css), no lugar de uma cor de fundo chapada. Requer que o
// elemento pai tenha `position: relative` e que o conteúdo real fique acima com `z-10`.
export default function GrainOverlay() {
  return (
    <svg
      className="absolute inset-0 h-full w-full pointer-events-none mix-blend-overlay opacity-[var(--grain-opacity)]"
      aria-hidden="true"
    >
      <filter id="lumen-grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
      </filter>
      <rect width="100%" height="100%" filter="url(#lumen-grain)" />
    </svg>
  );
}
