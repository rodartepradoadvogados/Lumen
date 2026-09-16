import Link from "next/link";

// Linha do índice e do rodapé de matéria. Uma forma só para as duas, porque são a mesma coisa:
// "aqui tem um texto, vale a pena entrar?".
//
// O que ela mostra e a versão anterior não mostrava: a ÁREA do direito. `BlogPost.area` existe em
// toda matéria, tem índice próprio no banco (@@index([officeId, area])) e é prometida com todas as
// letras na descrição do blog — "civil, consumerista, empresarial, tributário, trabalhista,
// previdenciário e mais". O índice mostrava só "Notícia curta"/"Análise aprofundada", que é o
// FORMATO. Para quem lê blog jurídico, a área é o primeiro filtro; o formato é o segundo.
//
// E o tempo de leitura, que vem da contagem real de palavras do corpo — não de uma estimativa.
export default function FichaMateria({
  slug,
  titulo,
  resumo,
  area,
  formato,
  minutos,
  publicadoEm,
  imagem,
}: {
  slug: string;
  titulo: string;
  resumo: string;
  area: string;
  formato: string;
  minutos: number;
  publicadoEm: Date | null;
  imagem?: string | null;
}) {
  return (
    <Link
      href={`/blog/${slug}`}
      // Mesma resposta de régua do resto do site (D5): a régua vira bordô e o fundo acompanha.
      // Nenhuma elevação, nenhuma sombra — a casa trocou altura por filete em F3.
      className="bg-sf border-2 border-regua-forte rounded-[2px] overflow-hidden flex flex-col transition-[border-color,background-color] duration-100 ease-out hover:border-acao hover:bg-acao-bg"
    >
      {imagem && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imagem} alt="" loading="lazy" decoding="async" className="h-40 w-full object-cover" />
      )}
      <div className="p-5 flex-1 flex flex-col gap-2">
        <div className="flex items-baseline gap-2 flex-wrap text-etiqueta font-extrabold uppercase tracking-[.1em]">
          <span className="text-marca-tx">{area}</span>
          <span className="text-tx-3 font-semibold normal-case tracking-normal">
            {formato} · {minutos} min de leitura
          </span>
        </div>
        <h2 className="font-bold text-tx text-destaque leading-snug [font-family:var(--font-blog-serif)]">{titulo}</h2>
        {/* Sem `text-justify`: numa coluna de ~300px, justificar abre rios brancos no meio do
            parágrafo e a leitura piora justamente onde ela precisa ser rápida. */}
        <p className="text-corpo text-tx-2 flex-1">{resumo}</p>
        <div className="flex items-baseline justify-between gap-3 mt-1">
          {publicadoEm ? (
            <time dateTime={publicadoEm.toISOString()} className="text-etiqueta text-tx-3">
              {publicadoEm.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
            </time>
          ) : (
            <span />
          )}
          <span className="text-etiqueta font-extrabold uppercase tracking-[.07em] text-marca-tx">Ler →</span>
        </div>
      </div>
    </Link>
  );
}
