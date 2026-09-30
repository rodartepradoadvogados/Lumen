// Carregando uma tela de aba: esqueleto com a forma da lista no acabamento WhatsApp (pílulas e linhas sem
// divisória). Sem animação para quem pediu menos movimento (`motion-safe`), e um aviso para leitor de tela.
export default function CarregandoAtendimentoApp() {
  return (
    <div aria-busy="true" className="px-4 pt-2">
      <p role="status" className="sr-only">
        Carregando
      </p>
      <div className="h-11 rounded-atd-pilula bg-atd-pilula motion-safe:animate-pulse" />
      <div className="mt-3 flex gap-2 overflow-hidden">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-9 w-24 shrink-0 rounded-atd-pilula bg-atd-pilula motion-safe:animate-pulse" />
        ))}
      </div>
      <div className="mt-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex min-h-[72px] items-center gap-3.5 py-3">
            <div className="h-[52px] w-[52px] shrink-0 rounded-full bg-atd-pilula motion-safe:animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-2/3 rounded-atd-etiqueta bg-atd-pilula motion-safe:animate-pulse" />
              <div className="h-3 w-full rounded-atd-etiqueta bg-atd-pilula motion-safe:animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
