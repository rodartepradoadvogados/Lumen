// Monograma "G·J" do produto de software "Gestão Jurídica" — usado na nova homepage
// pública (app/page.tsx), no nav e no rodapé. Badge quadrado arredondado escuro com
// contorno dourado fino e as iniciais em itálico serifado dourado, centralizadas.
// Deliberadamente separado da marca do escritório Rodarte Prado (ver components/Sidebar.tsx),
// que usa outra paleta (navy/dourado/bordô) e não este componente.
export default function GJMark({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <rect
        x="1"
        y="1"
        width="38"
        height="38"
        rx="9"
        style={{ fill: "var(--ink-3)", stroke: "var(--brass)", strokeOpacity: 0.55 }}
        strokeWidth="1"
      />
      <text
        x="20"
        y="26"
        textAnchor="middle"
        fontFamily="var(--font-gj-serif), Georgia, serif"
        fontStyle="italic"
        fontWeight="600"
        fontSize="15"
        style={{ fill: "var(--brass)" }}
      >
        G&#183;J
      </text>
    </svg>
  );
}
