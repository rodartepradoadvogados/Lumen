import { EsqueletoDeCartao } from "@/components/gestao/Estados";

// Fallback instantâneo do App Router para toda a área de conteúdo (o <Suspense> automático deste
// arquivo envolve só o page.tsx de cada rota; o rail, a TopBar e a barra de seção continuam
// montados). Antes era um spinner de min-h-[50vh]: a página inteira colapsava para "Carregando..."
// e o cabeçalho sumia. Agora é o ESQUELETO do gabarito (trilha, título, guias, cartões) — a tela
// já tem a forma da página que vai chegar, e nada salta quando ela chega. A pulsação para com
// `prefers-reduced-motion` (motion-reduce:animate-none).
export default function Loading() {
  return (
    <div className="tela" role="status" aria-busy="true" aria-label="Carregando">
      <div className="h-5 w-48 bg-sf-apoio animate-pulse motion-reduce:animate-none" aria-hidden="true" />
      <div className="mt-2 h-8 w-64 bg-sf-apoio animate-pulse motion-reduce:animate-none" aria-hidden="true" />
      <div className="mt-2 h-4 w-96 max-w-full bg-sf-apoio animate-pulse motion-reduce:animate-none" aria-hidden="true" />
      <div className="mt-4 h-10 border-b border-regua" aria-hidden="true" />
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <EsqueletoDeCartao linhas={5} />
        <EsqueletoDeCartao linhas={5} />
      </div>
      <span className="sr-only">Carregando…</span>
    </div>
  );
}
