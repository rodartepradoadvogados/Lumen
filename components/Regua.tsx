// Medidor em régua graduada — a forma que o contrato de direção "Guias" escolheu no lugar da
// rosca de pizza. A graduação diz QUANTO FALTA; o número ao lado diz quanto é. Uma rosca não faz
// nem uma coisa nem a outra, e o diagnóstico registrou que o portal usava a mesma cor para sete
// significados incompatíveis — aqui a cor é sempre risco ou seção, nunca categoria.
export default function Regua({
  valor,
  rotulo,
  nota,
  preenchido,
  cor = "var(--faixa-ardosia)",
  href,
}: {
  valor: string;
  rotulo: string;
  nota?: string;
  /** 0 a 1. Fora do intervalo é aparado, para um dado ruim nunca vazar da régua. */
  preenchido: number;
  cor?: string;
  href?: string;
}) {
  const largura = Math.max(0, Math.min(1, preenchido)) * 100;
  const conteudo = (
    <>
      <div className="flex items-baseline gap-2">
        <b className="font-display text-guia leading-none font-bold tabular-nums text-tx">{valor}</b>
        <span className="text-corpo text-tx-2">{rotulo}</span>
        {nota && <span className="ml-auto text-etiqueta font-semibold text-tx-3 tabular-nums shrink-0">{nota}</span>}
      </div>
      <div className="relative h-2 mt-2 bg-sf-apoio overflow-hidden" role="img" aria-label={`${valor} ${rotulo}${nota ? `, ${nota}` : ""}`}>
        <span className="absolute inset-y-0 left-0 block" style={{ width: `${largura}%`, background: cor }} />
        {/* A graduação: dez paradas, como a escala de um instrumento de medida. */}
        <span
          className="absolute inset-0 pointer-events-none"
          style={{ background: "repeating-linear-gradient(90deg, var(--linha-forte) 0 1px, transparent 1px 10%)" }}
        />
      </div>
    </>
  );
  if (!href) return <div className="block">{conteudo}</div>;
  return (
    <a href={href} className="block hover:opacity-90 transition-opacity">
      {conteudo}
    </a>
  );
}
