import { useId } from "react";

// Ícone da marca "Lúmen" — "A Fresta": dois planos de ouro separados por um vão preciso em
// azul-marinho, que desenha o "L" pelo vazio (não por um traço desenhado). Vértice e base
// do "L" em bordô, marcando onde a luz encontra a estrutura. Substitui o antigo monograma
// "G·J" (GJMark) em toda a marca — nav/rodapé da landing, Sidebar do portal, blog e app
// mobile (ver manual de identidade visual "Lúmen").
//
// Cores SEMPRE fixas (não seguem --brass/--oxblood nem o tema Dia/Tarde/Noite) — a marca
// não muda de cor com o tema, só de tamanho/contexto (ver regras "Faça e não faça").
export default function LumenMark({ size = 36 }: { size?: number }) {
  const gradientId = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Lúmen"
      style={{ flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e7c15a" />
          <stop offset="100%" stopColor="#b8860b" />
        </linearGradient>
      </defs>
      <rect width="120" height="120" rx="27" fill="#0a1128" />
      <rect x="4.5" y="4.5" width="111" height="111" rx="23" fill="none" stroke="#b8860b" strokeOpacity={0.35} strokeWidth="1.3" />
      {/* painel ouro */}
      <rect x="33" y="30" width="54" height="60" rx="3" fill={`url(#${gradientId})`} />
      {/* fresta em L — vão navy que desenha o "L" pelo vazio */}
      <rect x="50" y="30" width="6" height="46" fill="#0a1128" />
      <rect x="50" y="72" width="37" height="6" fill="#0a1128" />
      {/* vértice + base em bordô */}
      <rect x="50" y="72" width="6" height="6" fill="#6e0d25" />
      <rect x="33" y="88" width="54" height="2.4" fill="#6e0d25" />
    </svg>
  );
}
