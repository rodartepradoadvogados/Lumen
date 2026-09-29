// Carregando uma tela de aba: linhas de esqueleto com a forma da lista. Sem animação para quem pediu
// menos movimento (`motion-safe`), e um aviso para leitor de tela.
export default function CarregandoAtendimentoApp() {
  return (
    <div aria-busy="true" className="px-3 pt-3">
      <p role="status" className="sr-only">
        Carregando
      </p>
      <div className="h-11 rounded-[2px] border border-regua bg-sf motion-safe:animate-pulse" />
      <div className="mt-3 flex gap-2 overflow-hidden">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-11 w-24 shrink-0 rounded-[2px] border border-regua bg-sf motion-safe:animate-pulse" />
        ))}
      </div>
      <div className="mt-3 divide-y divide-regua border-y border-regua">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex min-h-[72px] items-center gap-3 px-1 py-3">
            <div className="h-12 w-12 shrink-0 rounded-full bg-sf-apoio motion-safe:animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-2/3 rounded-[2px] bg-sf-apoio motion-safe:animate-pulse" />
              <div className="h-3 w-full rounded-[2px] bg-sf-apoio motion-safe:animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
