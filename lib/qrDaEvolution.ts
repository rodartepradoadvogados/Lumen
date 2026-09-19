// ============================================================================
// A TELA DO QR — o pedaço que precisa ser função pura.
//
// O QR chega de um servidor de fora (a Evolution do escritório) e vai parar num `src` de <img>.
// Isso é o suficiente para exigir cuidado: um `src` aceita muito mais do que imagem, e o que
// vem de fora não é confiável só porque o escritório foi quem instalou o servidor.
// ============================================================================

/** O nome da instância na Evolution. Estável: reconectar não pode criar uma instância nova. */
export function nomeDaInstancia(officeId: string): string {
  return `lumen-${officeId}`;
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const PREFIXOS_ACEITOS = ["data:image/png;base64,", "data:image/jpeg;base64,"];

/**
 * Transforma o que a Evolution devolveu num `src` de imagem — ou em nada.
 *
 * A Evolution às vezes manda `data:image/png;base64,iVBOR...` e às vezes manda só o base64 cru.
 * As duas formas são aceitas; QUALQUER OUTRA COISA É RECUSADA, e é aí que está o ponto: sem esta
 * função, um `src` recebido de fora poderia ser `javascript:...`, `data:text/html,...` ou um
 * endereço remoto — e o navegador obedeceria. Não é paranoia teórica: o endereço da Evolution é
 * digitado à mão numa tela de configuração, e um erro de digitação já basta para o Lúmen passar a
 * confiar num servidor que não é o do escritório.
 *
 * Devolve nulo quando não dá para provar que é imagem. A tela mostra "não veio QR" em vez de
 * renderizar o que quer que seja.
 */
export function urlDoQr(bruto: string | null | undefined): string | null {
  const limpo = (bruto || "").replace(/\s+/g, "");
  if (!limpo) return null;

  const prefixo = PREFIXOS_ACEITOS.find((p) => limpo.startsWith(p));
  if (prefixo) {
    const corpo = limpo.slice(prefixo.length);
    return corpo.length > 32 && BASE64.test(corpo) ? limpo : null;
  }

  // Sem prefixo: só vale se for base64 puro, e aí o prefixo é NOSSO, não dele.
  if (limpo.length > 32 && BASE64.test(limpo)) return `data:image/png;base64,${limpo}`;
  return null;
}

export type EstadoDaConexao = "conectado" | "conectando" | "desconectado" | "desconhecido";

/**
 * Traduz o estado da Evolution para o que a tela mostra.
 *
 * "open" é o único estado que significa conectado de verdade. Tratar "connecting" como conectado
 * faria a tela dizer que está tudo certo enquanto o aparelho ainda não leu o QR — e o escritório
 * fecharia a tela achando que acabou.
 */
export function lerEstado(bruto: string | null | undefined): EstadoDaConexao {
  switch ((bruto || "").toLowerCase()) {
    case "open":
      return "conectado";
    case "connecting":
      return "conectando";
    case "close":
    case "closed":
      return "desconectado";
    default:
      return "desconhecido";
  }
}

export const TEXTO_DO_ESTADO: Record<EstadoDaConexao, string> = {
  conectado: "Conectado",
  conectando: "Aguardando a leitura do QR",
  desconectado: "Desconectado",
  desconhecido: "Estado desconhecido",
};
