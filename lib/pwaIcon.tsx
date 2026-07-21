import type { ReactElement } from "react";

// Ícone "A Fresta" da marca Lúmen, usado pelos ícones do PWA gerados via ImageResponse
// (next/og): app/icon.tsx, app/apple-icon.tsx, app/icon-192/route.tsx, app/icon-512/route.tsx.
// Reconstrói o mesmo desenho do componente components/LumenMark.tsx (dois planos de ouro
// separados por um vão em "L" azul-marinho, vértice e base em bordô), mas com <div>s em vez
// de <svg>/gradiente SVG — o renderizador do ImageResponse (Satori) suporta flexbox/posição
// absoluta e gradiente CSS em background, não o elemento <linearGradient> do SVG.
//
// Todas as medidas são frações do desenho original (viewBox 120×120 do manual de
// identidade), escaladas pelo `size` pedido — assim o ícone fica proporcional em qualquer
// tamanho (16 a 512px) sem redesenhar nada.
export function lumenIcon(size: number): ReactElement {
  const px = (fraction: number) => size * fraction;

  return (
    <div
      style={{
        width: size,
        height: size,
        position: "relative",
        display: "flex",
        background: "#0a1128",
        borderRadius: px(27 / 120),
      }}
    >
      <div
        style={{
          position: "absolute",
          left: px(4.5 / 120),
          top: px(4.5 / 120),
          width: px(111 / 120),
          height: px(111 / 120),
          borderRadius: px(23 / 120),
          border: `${Math.max(1, px(1.3 / 120))}px solid rgba(184, 134, 11, 0.35)`,
        }}
      />
      {/* painel ouro */}
      <div
        style={{
          position: "absolute",
          left: px(33 / 120),
          top: px(30 / 120),
          width: px(54 / 120),
          height: px(60 / 120),
          borderRadius: px(3 / 120),
          background: "linear-gradient(180deg, #e7c15a 0%, #b8860b 100%)",
        }}
      />
      {/* fresta em L — vão navy que desenha o "L" pelo vazio */}
      <div style={{ position: "absolute", left: px(50 / 120), top: px(30 / 120), width: px(6 / 120), height: px(46 / 120), background: "#0a1128" }} />
      <div style={{ position: "absolute", left: px(50 / 120), top: px(72 / 120), width: px(37 / 120), height: px(6 / 120), background: "#0a1128" }} />
      {/* vértice + base em bordô */}
      <div style={{ position: "absolute", left: px(50 / 120), top: px(72 / 120), width: px(6 / 120), height: px(6 / 120), background: "#6e0d25" }} />
      <div style={{ position: "absolute", left: px(33 / 120), top: px(88 / 120), width: px(54 / 120), height: px(2.4 / 120), background: "#6e0d25" }} />
    </div>
  );
}
