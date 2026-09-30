import type { ReactNode } from "react";

// TÍTULO GRANDE DE TELA (26px/700) com subtítulo discreto e um espaço à direita (ex.: botão Dia/Noite).
// Sem caixa, sem faixa, sem filete: o título é texto sobre o fundo da tela.

export default function TituloDeTela({ titulo, subtitulo, acao, comoH1 = true }: { titulo: string; subtitulo?: string; acao?: ReactNode; comoH1?: boolean }) {
  const Titulo = comoH1 ? "h1" : "p";
  return (
    <div data-titulo-de-tela="" className="flex min-h-14 items-center justify-between gap-2 pl-5 pr-2 pt-1.5">
      <div className="min-w-0">
        <Titulo className="truncate text-app-titulo font-bold text-tx">{titulo}</Titulo>
        {subtitulo && <p className="-mt-0.5 truncate text-app-meta text-atd-terciario">{subtitulo}</p>}
      </div>
      {acao}
    </div>
  );
}
