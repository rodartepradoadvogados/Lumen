import type { ReactNode } from "react";

// O título do item aberto dentro da casca de Configurações (mesmas props do PageHeader). É um <h2>:
// o único <h1> da página é o "Configurações" do gabarito (app/(app)/configuracoes/layout.tsx), para
// o título não pular a cada clique.
export default function CabecalhoDeSecao({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        <h2 className="text-guia font-bold text-tx">{title}</h2>
        {subtitle && <p className="text-corpo text-tx-2 mt-1 max-w-[68ch]">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}
