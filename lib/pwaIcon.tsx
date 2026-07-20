import type { ReactElement } from "react";

// Monograma "RP" da Rodarte Prado — usado pelos ícones do PWA gerados via ImageResponse (next/og).
// Dourado (#c6a05c) sobre navy (#0b1730), com a linha decorativa fina do cabeçalho do login.
// Observação: o ImageResponse renderiza com a fonte sans padrão embutida no next/og
// (não há fonte serif disponível sem carregar arquivo externo), então usamos peso 700 para dar presença.
export function monogram(size: number): ReactElement {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#0b1730",
      }}
    >
      <div
        style={{
          display: "flex",
          width: size * 0.34,
          height: Math.max(2, size * 0.016),
          background: "#c6a05c",
          borderRadius: 999,
          marginBottom: size * 0.045,
        }}
      />
      <div
        style={{
          display: "flex",
          fontSize: size * 0.44,
          fontWeight: 700,
          color: "#c6a05c",
          letterSpacing: size * 0.008,
          lineHeight: 1,
        }}
      >
        RP
      </div>
    </div>
  );
}
