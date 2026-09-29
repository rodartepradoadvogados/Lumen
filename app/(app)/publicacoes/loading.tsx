// Esqueleto da fila enquanto a página carrega: 6 linhas com a forma da linha real, acessível.
export default function Loading() {
  return (
    <div className="tela tela-alta" aria-busy="true" aria-label="Carregando as publicações" role="status">
      <div className="px-4 md:px-6 pt-4 pb-3 border-b-2 border-regua-forte">
        <div className="h-8 w-48 bg-sf-apoio" />
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="px-4 py-4 border-b border-regua grid gap-2">
            <div className="h-3 bg-sf-apoio motion-safe:animate-pulse" style={{ width: "62%" }} />
            <div className="h-3 bg-sf-apoio motion-safe:animate-pulse" style={{ width: "88%" }} />
            <div className="h-3 bg-sf-apoio motion-safe:animate-pulse" style={{ width: "46%" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
