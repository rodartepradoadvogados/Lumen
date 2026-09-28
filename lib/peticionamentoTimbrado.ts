import PizZip from "pizzip";
import { TWIPS_POR_MM, type MargensDaPagina } from "@/lib/peticionamentoPaginaA4";

// ══════════════════════════════════════════════════════════════════════════════════════════════
// O TIMBRADO DO ESCRITÓRIO, LIDO PARA A PRÉVIA DA MINUTA (etapa B do editor).
//
// O timbrado cadastrado em Configurações é um .docx (Office.timbradoUrl, timbradoFormato "DOCX").
// Na exportação ele é a CASCA do arquivo: o corpo da peça entra antes do <w:sectPr> final e o
// Word desenha cabeçalho, rodapé e margens dele (lib/peticionamentoDocx.ts:injetarNoTimbrado). A
// prévia precisa mostrar essa mesma casca, e para isso lê do pacote três coisas:
//
//   - as MARGENS da folha (<w:pgMar>) — é o timbrado que diz onde o texto pode começar, e é a
//     segunda fonte da conciliação de margem (lib/peticionamentoPaginaA4.ts:margensDaFolha);
//   - o CABEÇALHO e o RODAPÉ padrão (<w:headerReference>/<w:footerReference> w:type="default"):
//     o texto de cada parágrafo, o alinhamento, e as imagens — em linha ou ancoradas na folha;
//   - as IMAGENS em si (word/media), como data: URL, para a tela não precisar de uma rota nova
//     que sirva arquivo de outro escritório por engano.
//
// É PRÉVIA, NÃO É O WORD. Caixa de texto, forma desenhada, WordArt, imagem em EMF/WMF e cabeçalho
// de primeira página diferente não são desenhados — e cada um que aparece vira um AVISO na tela,
// nunca uma omissão calada. Só o .docx sai com o timbrado de verdade; timbrado em PDF não é aplicado
// nem na exportação (ver confirmarExportacao), e a prévia diz isso em vez de fingir.
//
// Só roda no servidor (PizZip + o arquivo baixado do Blob do escritório de quem pediu).
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** EMU por milímetro — unidade do DrawingML (360.000 por cm). Constante do formato, não escolha nossa. */
const EMU_POR_MM = 36000;

/** Teto do que vai para a tela em imagens. Timbrado com foto em alta resolução pesaria na página toda. */
export const TETO_DE_IMAGENS_BYTES = 3 * 1024 * 1024;

const TIPOS_DE_IMAGEM: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
  webp: "image/webp",
};

export type ImagemDoTimbrado = { src: string; larguraMm: number; alturaMm: number };

export type ImagemAncorada = ImagemDoTimbrado & {
  /** Distância da borda ESQUERDA DA FOLHA, já convertida (âncora de margem vira folha + margem). */
  esquerdaMm: number;
  /** Distância do TOPO DA FOLHA, já convertida. */
  topoMm: number;
  atrasDoTexto: boolean;
};

export type ParagrafoDoTimbrado = {
  alinhamento: "left" | "center" | "right" | "justify";
  texto: string;
  imagens: ImagemDoTimbrado[];
};

export type ParteDoTimbrado = { paragrafos: ParagrafoDoTimbrado[]; ancoradas: ImagemAncorada[] };

export type TimbradoDaPrevia = {
  margens: MargensDaPagina | null;
  /** Distância do cabeçalho ao topo da folha e do rodapé à base (<w:pgMar w:header/w:footer>). */
  cabecalhoMm: number;
  rodapeMm: number;
  cabecalho: ParteDoTimbrado;
  rodape: ParteDoTimbrado;
  avisos: string[];
};

const VAZIA: ParteDoTimbrado = { paragrafos: [], ancoradas: [] };

function atributo(tag: string, nome: string): string | null {
  const m = new RegExp(`\\b${nome.replace(":", "\\:")}="([^"]*)"`).exec(tag);
  return m ? m[1] : null;
}

function twipsParaMm(valor: string | null): number | null {
  if (valor === null) return null;
  const n = Number(valor);
  return Number.isFinite(n) ? Math.abs(n) / TWIPS_POR_MM : null;
}

function arredondar(mm: number): number {
  return Math.round(mm * 10) / 10;
}

function desescapar(texto: string): string {
  return texto
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

/** Id → alvo, de um arquivo .rels. */
function relacoes(zip: PizZip, caminho: string): Map<string, string> {
  const mapa = new Map<string, string>();
  const xml = zip.file(caminho)?.asText();
  if (!xml) return mapa;
  for (const m of xml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = atributo(m[0], "Id");
    const alvo = atributo(m[0], "Target");
    if (id && alvo) mapa.set(id, alvo);
  }
  return mapa;
}

/** "media/image1.png" relativo a word/ → "word/media/image1.png". */
function caminhoNoPacote(alvo: string): string {
  if (alvo.startsWith("/")) return alvo.slice(1);
  const partes = ["word", ...alvo.split("/")];
  const pilha: string[] = [];
  for (const p of partes) {
    if (p === "..") pilha.pop();
    else if (p && p !== ".") pilha.push(p);
  }
  return pilha.join("/");
}

/** A última seção do corpo: é ela que vale para a folha em que o conteúdo da peça entra. */
function ultimaSecao(documento: string): string {
  const fim = documento.lastIndexOf("</w:body>");
  const inicio = documento.lastIndexOf("<w:sectPr", fim === -1 ? undefined : fim);
  if (inicio === -1) return "";
  const fecha = documento.indexOf("</w:sectPr>", inicio);
  return fecha === -1 ? documento.slice(inicio) : documento.slice(inicio, fecha);
}

function referencia(secao: string, tipo: "header" | "footer"): string | null {
  const refs = [...secao.matchAll(new RegExp(`<w:${tipo}Reference\\b[^>]*>`, "g"))].map((m) => m[0]);
  const padrao = refs.find((r) => atributo(r, "w:type") === "default") ?? refs[0];
  return padrao ? atributo(padrao, "r:id") : null;
}

type Leitura = { zip: PizZip; bytes: { total: number }; avisos: Set<string>; margens: MargensDaPagina | null };

function imagem(leitura: Leitura, rels: Map<string, string>, desenho: string): ImagemDoTimbrado | null {
  const blip = /<a:blip\b[^>]*>/.exec(desenho)?.[0];
  const idDaImagem = blip ? atributo(blip, "r:embed") : null;
  if (!idDaImagem) {
    leitura.avisos.add("O timbrado tem forma ou caixa de texto desenhada — a prévia mostra só as imagens e o texto dos parágrafos.");
    return null;
  }
  const alvo = rels.get(idDaImagem);
  if (!alvo) return null;
  const caminho = caminhoNoPacote(alvo);
  const extensao = (caminho.split(".").pop() ?? "").toLowerCase();
  const tipo = TIPOS_DE_IMAGEM[extensao];
  if (!tipo) {
    leitura.avisos.add(`Uma imagem do timbrado está em ${extensao.toUpperCase() || "formato desconhecido"}, que o navegador não desenha — ela sai no Word, mas não aparece na prévia.`);
    return null;
  }
  const arquivo = leitura.zip.file(caminho);
  if (!arquivo) return null;
  const bytes = arquivo.asUint8Array();
  if (leitura.bytes.total + bytes.length > TETO_DE_IMAGENS_BYTES) {
    leitura.avisos.add("As imagens do timbrado são grandes demais para a prévia — elas saem no Word, mas parte delas não aparece aqui.");
    return null;
  }
  leitura.bytes.total += bytes.length;
  const extensaoDoDesenho = /<wp:extent\b[^>]*>/.exec(desenho)?.[0] ?? "";
  const larguraMm = arredondar(Number(atributo(extensaoDoDesenho, "cx") ?? 0) / EMU_POR_MM);
  const alturaMm = arredondar(Number(atributo(extensaoDoDesenho, "cy") ?? 0) / EMU_POR_MM);
  return { src: `data:${tipo};base64,${Buffer.from(bytes).toString("base64")}`, larguraMm, alturaMm };
}

/**
 * Posição de uma imagem ancorada, na folha. Relativa à folha ("page") vale o deslocamento; à margem,
 * soma a margem; relativa ao parágrafo/linha, soma onde a parte começa (`inicioDaParteMm`: a
 * distância do cabeçalho ao topo, ou a altura em que o rodapé fica) — aproximação declarada.
 */
function posicao(desenho: string, eixo: "H" | "V", margens: MargensDaPagina | null, inicioDaParteMm: number): number {
  const bloco = new RegExp(`<wp:position${eixo}\\b([^>]*)>([\\s\\S]*?)</wp:position${eixo}>`).exec(desenho);
  if (!bloco) return 0;
  const relativo = atributo(bloco[1], "relativeFrom") ?? "page";
  const deslocamento = Number(/<wp:posOffset>(-?\d+)<\/wp:posOffset>/.exec(bloco[2])?.[1] ?? 0) / EMU_POR_MM;
  const base =
    relativo === "page" ? 0 : eixo === "H" ? margens?.esquerdaMm ?? 0 : relativo === "margin" || relativo === "topMargin" ? margens?.topoMm ?? 0 : inicioDaParteMm;
  return arredondar(base + deslocamento);
}

function lerParte(leitura: Leitura, caminho: string, inicioDaParteMm: number): ParteDoTimbrado {
  const xml = leitura.zip.file(caminho)?.asText();
  if (!xml) return VAZIA;
  const nome = caminho.split("/").pop()!;
  const rels = relacoes(leitura.zip, caminho.replace(nome, `_rels/${nome}.rels`));
  const parte: ParteDoTimbrado = { paragrafos: [], ancoradas: [] };
  if (/<w:txbxContent\b/.test(xml)) {
    leitura.avisos.add("O timbrado tem caixa de texto — o texto de dentro dela não aparece na prévia, só no Word.");
  }
  for (const p of xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)) {
    const corpo = p[0];
    const jc = /<w:jc\b[^>]*>/.exec(corpo)?.[0];
    const valor = jc ? atributo(jc, "w:val") : null;
    const alinhamento: ParagrafoDoTimbrado["alinhamento"] =
      valor === "center" ? "center" : valor === "right" || valor === "end" ? "right" : valor === "both" ? "justify" : "left";
    const texto = desescapar([...corpo.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((t) => t[1]).join(""));
    const imagens: ImagemDoTimbrado[] = [];
    for (const d of corpo.matchAll(/<wp:(inline|anchor)\b[\s\S]*?<\/wp:\1>/g)) {
      const img = imagem(leitura, rels, d[0]);
      if (!img) continue;
      if (d[1] === "inline") {
        imagens.push(img);
        continue;
      }
      const abertura = /<wp:anchor\b[^>]*>/.exec(d[0])?.[0] ?? "";
      parte.ancoradas.push({
        ...img,
        esquerdaMm: posicao(d[0], "H", leitura.margens, inicioDaParteMm),
        topoMm: posicao(d[0], "V", leitura.margens, inicioDaParteMm),
        atrasDoTexto: atributo(abertura, "behindDoc") === "1",
      });
    }
    if (texto.trim() || imagens.length) parte.paragrafos.push({ alinhamento, texto, imagens });
  }
  return parte;
}

/**
 * Lê o timbrado .docx. Nunca lança por conteúdo estranho: um timbrado que a prévia não entende vira
 * aviso na tela, e a edição da minuta continua — quem trava a peça é a exportação, não a prévia.
 */
export function lerTimbradoDocx(arquivo: Buffer | Uint8Array): TimbradoDaPrevia {
  const avisos = new Set<string>();
  let zip: PizZip;
  try {
    zip = new PizZip(arquivo);
  } catch {
    return { margens: null, cabecalhoMm: 12.5, rodapeMm: 12.5, cabecalho: VAZIA, rodape: VAZIA, avisos: ["O arquivo do timbrado não abriu como .docx — a prévia mostra a folha sem ele."] };
  }
  const documento = zip.file("word/document.xml")?.asText() ?? "";
  const secao = ultimaSecao(documento);
  const pgMar = /<w:pgMar\b[^>]*>/.exec(secao)?.[0] ?? "";
  const topo = twipsParaMm(atributo(pgMar, "w:top"));
  const direita = twipsParaMm(atributo(pgMar, "w:right"));
  const base = twipsParaMm(atributo(pgMar, "w:bottom"));
  const esquerda = twipsParaMm(atributo(pgMar, "w:left"));
  const margens =
    topo !== null && direita !== null && base !== null && esquerda !== null
      ? { topoMm: arredondar(topo), direitaMm: arredondar(direita), baseMm: arredondar(base), esquerdaMm: arredondar(esquerda) }
      : null;
  if (!margens) avisos.add("O timbrado não declara as margens da folha — a prévia usa a margem padrão.");

  const pgSz = /<w:pgSz\b[^>]*>/.exec(secao)?.[0] ?? "";
  const larguraFolha = twipsParaMm(atributo(pgSz, "w:w"));
  if (larguraFolha !== null && Math.abs(larguraFolha - 210) > 2) {
    avisos.add(`O timbrado não é A4 (${Math.round(larguraFolha)} mm de largura) — a prévia desenha em A4.`);
  }
  if (/<w:titlePg\b/.test(secao)) {
    avisos.add("O timbrado tem cabeçalho diferente na primeira página — a prévia mostra o cabeçalho padrão em todas.");
  }

  const rels = relacoes(zip, "word/_rels/document.xml.rels");
  const leitura: Leitura = { zip, bytes: { total: 0 }, avisos, margens };
  const idCabecalho = referencia(secao, "header");
  const idRodape = referencia(secao, "footer");
  const cabecalhoMm = arredondar(twipsParaMm(atributo(pgMar, "w:header")) ?? 12.5);
  const rodapeMm = arredondar(twipsParaMm(atributo(pgMar, "w:footer")) ?? 12.5);
  // O rodapé cresce de baixo para cima; sem medir o texto dele, o começo aproximado é 10 mm acima da distância declarada.
  const inicioDoRodapeMm = 297 - rodapeMm - 10;
  const cabecalho = idCabecalho && rels.get(idCabecalho) ? lerParte(leitura, caminhoNoPacote(rels.get(idCabecalho)!), cabecalhoMm) : VAZIA;
  const rodape = idRodape && rels.get(idRodape) ? lerParte(leitura, caminhoNoPacote(rels.get(idRodape)!), inicioDoRodapeMm) : VAZIA;

  return {
    margens,
    cabecalhoMm,
    rodapeMm,
    cabecalho,
    rodape,
    avisos: [...avisos],
  };
}
