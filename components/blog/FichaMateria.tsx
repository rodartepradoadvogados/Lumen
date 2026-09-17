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
//
// A MANCHETE (17/09/2026). O índice empilhava fichas todas do mesmo tamanho numa grade de duas
// colunas — "não precisa ser tudo do mesmo tamanho, quadrático", apontou o dono. A forma escolhida
// entre três propostas foi "manchete e colunas": a matéria mais recente ocupa a largura inteira,
// com a imagem ao lado do texto, e as demais seguem em três colunas. É a mesma peça, com uma
// variante — não um segundo componente, porque o que ela mostra é idêntico; só a proporção muda.
export default function FichaMateria({
  slug,
  titulo,
  resumo,
  area,
  formato,
  minutos,
  publicadoEm,
  imagem,
  manchete = false,
}: {
  slug: string;
  titulo: string;
  resumo: string;
  area: string;
  formato: string;
  minutos: number;
  publicadoEm: Date | null;
  imagem?: string | null;
  /** A matéria de abertura: largura cheia, imagem ao lado e título em corpo maior. */
  manchete?: boolean;
}) {
  return (
    <Link
      href={`/blog/${slug}`}
      // Mesma resposta de régua do resto do site (D5): a régua vira bordô e o fundo acompanha.
      // Nenhuma elevação, nenhuma sombra — a casa trocou altura por filete em F3.
      className={`bg-sf border-2 border-regua-forte rounded-[2px] overflow-hidden flex transition-[border-color,background-color] duration-100 ease-out hover:border-marca-tx hover:bg-acao-bg ${
        // Na manchete a imagem vai PARA O LADO, não por cima: empilhada em largura cheia ela
        // viraria uma faixa de 1500x160, que é moldura, não imagem. Abaixo de `md` volta a
        // empilhar, porque aí a largura não dá para duas colunas.
        manchete ? "flex-col md:flex-row md:items-stretch" : "flex-col"
      }`}
    >
      {imagem && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imagem}
          alt=""
          loading={manchete ? "eager" : "lazy"}
          decoding="async"
          className={manchete ? "w-full md:w-[42%] h-48 md:h-auto object-cover shrink-0" : "h-40 w-full object-cover"}
        />
      )}
      <div className={`flex-1 flex flex-col gap-2 ${manchete ? "p-7 md:p-8 md:justify-center" : "p-5"}`}>
        <div className="flex items-baseline gap-2 flex-wrap text-etiqueta font-extrabold uppercase tracking-[.1em]">
          <span className="text-marca-tx">{area}</span>
          <span className="text-tx-3 font-semibold normal-case tracking-normal">
            {formato} · {minutos} min de leitura
          </span>
        </div>
        <h2
          className={`font-bold text-tx leading-snug [font-family:var(--font-blog-serif)] ${
            manchete ? "text-autuacao leading-[1.16]" : "text-destaque"
          }`}
        >
          {titulo}
        </h2>
        {/* Sem `text-justify`: numa coluna de ~300px, justificar abre rios brancos no meio do
            parágrafo e a leitura piora justamente onde ela precisa ser rápida. */}
        {/* `flex-1` só fora da manchete: ali ele espicharia o resumo para preencher a altura da
            imagem, e o texto ficaria boiando no meio de um vão. */}
        <p className={`text-tx-2 ${manchete ? "text-destaque max-w-[56ch]" : "text-corpo flex-1"}`}>{resumo}</p>
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
