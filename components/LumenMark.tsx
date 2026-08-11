// Ícone da marca "Lúmen" — "A Fresta": um bloco de ouro chapado com um vão preciso que desenha
// o "L" pelo vazio (não por um traço desenhado). Vértice e base em vinho, marcando onde a luz
// encontra a estrutura.
//
// Manual da marca v2 (agosto/2026): a GEOMETRIA não mudou — quadrado 120 com canto 27, moldura
// de 1,3 recuada 4,5, painel 54×60 com canto 3, fresta de 6 — mudou só a cor. O navy #0a1128
// virou grafite #16191d, o ouro perdeu o degradê e virou chapado #c9962f, e o vinho clareou
// para #cd5f77 para enfim ser visível sobre o grafite. O degradê era o detalhe que mais datava
// o símbolo e o que pior sobrevivia à redução: em favicon de 16px virava um borrão.
// Ver docs/DESIGN-SYSTEM.md §15.
//
// Cores SEMPRE fixas: a marca não muda com o tema Manhã/Noite, só de tamanho e contexto.
export default function LumenMark({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Lúmen"
      style={{ flexShrink: 0 }}
    >
      <rect width="120" height="120" rx="27" fill="#16191d" />
      <rect x="4.5" y="4.5" width="111" height="111" rx="23" fill="none" stroke="#c9962f" strokeOpacity={0.35} strokeWidth="1.3" />
      {/* painel ouro — chapado, sem degradê */}
      <rect x="33" y="30" width="54" height="60" rx="3" fill="#c9962f" />
      {/* fresta em L — vão em grafite que desenha o "L" pelo vazio */}
      <rect x="50" y="30" width="6" height="46" fill="#16191d" />
      <rect x="50" y="72" width="37" height="6" fill="#16191d" />
      {/* vértice + base em vinho claro */}
      <rect x="50" y="72" width="6" height="6" fill="#cd5f77" />
      <rect x="33" y="88" width="54" height="2.4" fill="#cd5f77" />
    </svg>
  );
}
