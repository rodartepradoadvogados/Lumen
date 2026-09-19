import { useId } from "react";

// ============================================================================
// O ROSTO DO LÚMEN AGENT.
//
// Antes era a "faísca" de quatro pontas — o ícone que todo produto de IA usa, e que por isso não
// diz qual produto é. O dono escolheu a Sentinela: uma cabeça de autômato vista de frente, com uma
// lente e duas linhas de escuta.
//
// ORIGINAL, E ISSO É REQUISITO. A referência que ele trouxe foi o R2-D2, personagem registrado da
// Lucasfilm. Um derivado dele na cara de um sistema vendido a escritórios de advocacia seria
// exposição a marca e a direito autoral, então o desenho carrega a IDEIA — o pequeno ajudante de
// uma lente só — sem nenhum traço emprestado.
//
// O CORPO É `currentColor` E OS SULCOS SÃO BURACOS. Assim o ícone acompanha a cor de onde está
// (bronze na aba ativa, branco sobre o grafite do botão flutuante) sem uma variante por lugar, e
// a lente e as linhas de escuta mostram o fundo de trás em vez de uma cor fixa que brigaria com
// metade dos oito temas.
//
// TUDO PREENCHIDO, NADA TRAÇADO. Em 16px um traço de 1px some no arredondamento da tela — foi
// exatamente por isso que o "selo", que era todo de traço, não passou no teste de tamanho.
// ============================================================================

export default function IconeAgente({
  size = 24,
  className = "",
  acento = "var(--guia-ativa)",
}: {
  size?: number;
  className?: string;
  /** A cor da lente. O resto do desenho segue `currentColor`. */
  acento?: string;
}) {
  // O id da máscara precisa ser único: o ícone aparece mais de uma vez na mesma tela (barra do
  // celular e cabeçalho da conversa), e dois ids iguais fazem o navegador usar sempre o primeiro.
  const idMascara = useId();

  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden="true" focusable="false">
      <mask id={idMascara}>
        <rect x="0" y="0" width="48" height="48" fill="white" />
        <rect x="14" y="19" width="20" height="8" rx="4" fill="black" />
        <rect x="17" y="31" width="14" height="2" rx="1" fill="black" />
        <rect x="17" y="35" width="9" height="2" rx="1" fill="black" />
      </mask>
      <path
        d="M12 21a12 12 0 0 1 24 0v14a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3z"
        fill="currentColor"
        mask={`url(#${idMascara})`}
      />
      <circle cx="24" cy="23" r="3.2" fill={acento} />
    </svg>
  );
}
