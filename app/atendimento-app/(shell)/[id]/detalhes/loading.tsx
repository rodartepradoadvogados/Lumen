// Carregando os Detalhes: três fichas de esqueleto (o cabeçalho e as guias já estão na tela).
export default function CarregandoDetalhes() {
  const ficha = "rounded-[2px] border border-regua bg-sf motion-safe:animate-pulse";
  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-hidden px-4 py-4" aria-busy="true">
      <p className="sr-only" role="status">
        Carregando os detalhes
      </p>
      <div className={`${ficha} h-24`} />
      <div className={`${ficha} h-40`} />
      <div className={`${ficha} h-32`} />
    </div>
  );
}
