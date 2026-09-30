import Link from "next/link";
import type { ReactNode } from "react";

// BOTÃO FLUTUANTE (ex.: nova conversa): ouro cheio, raio de 18 px e sombra — a exceção assumida do app
// (o resto não tem sombra). 58 px de lado (alvo de toque). Fica preso acima da barra inferior, dentro da
// largura do app (max-w-md), respeitando a área segura do aparelho. O texto acessível é `rotulo`.

export default function BotaoFlutuante({ href, rotulo, icone }: { href: string; rotulo: string; icone: ReactNode }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-30" data-botao-flutuante-zona="">
      <div className="mx-auto flex max-w-md justify-end px-[18px]">
        <Link
          href={href}
          data-botao-flutuante=""
          className="pointer-events-auto flex h-[58px] w-[58px] items-center justify-center rounded-atd-flutuante bg-atd-ouro text-atd-ouro-tx shadow-atd-flutuante active:scale-95"
        >
          {icone}
          <span className="sr-only">{rotulo}</span>
        </Link>
      </div>
    </div>
  );
}
