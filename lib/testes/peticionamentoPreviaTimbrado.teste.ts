import { readFileSync } from "node:fs";
import { join } from "node:path";
import PizZip from "pizzip";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";
import {
  PAGINA_A4,
  AREA_DE_TEXTO_MINIMA_MM,
  larguraUtilMm,
  margensDaFolha,
  margensValidas,
  mmParaTwips,
  paginarBlocos,
} from "@/lib/peticionamentoPaginaA4";
import { lerTimbradoDocx } from "@/lib/peticionamentoTimbrado";
import { montarPeticaoWord, trocarMargensDaUltimaSecao } from "@/lib/peticionamentoDocx";
import { hashDeTexto, normalizarTextoCitacao } from "@/lib/peticionamentoCitacoes";
import { sanitizarMinutaHtml, textoPuroDaMinutaHtml } from "@/lib/peticionamentoMinutaFormatada";

// ============================================================================
// ETAPA B DO EDITOR DE MINUTA — A PRÉVIA NO PAPEL TIMBRADO, E A MARGEM QUE PASSA A SER GUARDADA.
//
// O que esta suíte prova, e a ordem é a da gravidade:
//
//   1. A CONCILIAÇÃO DA MARGEM é uma regra só (salva ▸ timbrado ▸ padrão), e o .docx obedece a
//      mesma regra que a tela — senão a régua diria uma margem e o Word sairia com outra.
//   2. O TIMBRADO É LIDO de verdade do .docx: margens, cabeçalho, rodapé e imagens — provado com um
//      .docx montado aqui, não com uma string que "parece" um.
//   3. A PAGINAÇÃO da prévia cabe em mesa (paginarBlocos).
//   4. NADA DISTO TOCA O CORPO: o texto puro e o hash das citações continuam os mesmos — a trava do
//      "li e revisei" não é invalidada em silêncio por esta entrega.
//   5. As ligações de tela e servidor (varredura de código, pelo mecanismo e não pela grafia).
// ============================================================================

const RAIZ = process.cwd();
const ler = (...partes: string[]) => readFileSync(join(RAIZ, ...partes), "utf8");

const SALVAS = { topoMm: 20, direitaMm: 15, baseMm: 20, esquerdaMm: 35 };
const DO_TIMBRADO = { topoMm: 45, direitaMm: 20, baseMm: 30, esquerdaMm: 25 };

// ── 1. A CONCILIAÇÃO ────────────────────────────────────────────────────────────────────────

teste("MUTAÇÃO PRINCIPAL: margem salva vence a do timbrado, que vence a padrão", () => {
  igual(margensDaFolha(SALVAS, DO_TIMBRADO), { margens: SALVAS, origem: "salva" });
  igual(margensDaFolha(null, DO_TIMBRADO), { margens: DO_TIMBRADO, origem: "timbrado" });
  igual(margensDaFolha(null, null), { margens: PAGINA_A4.margens, origem: "padrao" });
});

teste("margem salva com formato estragado não apaga o timbrado — cai para a fonte seguinte", () => {
  for (const lixo of ["30", { topoMm: "x" }, { topoMm: 20, direitaMm: 20, baseMm: 20 }, { topoMm: NaN, direitaMm: 1, baseMm: 1, esquerdaMm: 1 }, []]) {
    igual(margensDaFolha(lixo, DO_TIMBRADO).origem, "timbrado", `${JSON.stringify(lixo)} foi aceito como margem: `);
  }
});

teste("margem vinda de fora é contida na folha: a área de texto nunca fica abaixo do mínimo", () => {
  const absurda = margensValidas({ topoMm: -5, direitaMm: 190, baseMm: 999, esquerdaMm: 180 })!;
  verdade(!!absurda, "margens absurdas mas numéricas deveriam ser contidas, não recusadas");
  verdade(larguraUtilMm(absurda) >= AREA_DE_TEXTO_MINIMA_MM, `sobrou ${larguraUtilMm(absurda)} mm de área de texto`);
  verdade(absurda.topoMm > 0 && absurda.baseMm < PAGINA_A4.alturaMm / 2, `margem vertical fora da folha: ${JSON.stringify(absurda)}`);
});

// ── 2. O TIMBRADO LIDO DO .DOCX ─────────────────────────────────────────────────────────────

const PNG_1X1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const NS = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"`;

function desenho(tipo: "inline" | "anchor", rid: string, cxMm: number, cyMm: number, extra = ""): string {
  const abre = tipo === "anchor" ? `<wp:anchor behindDoc="1" relativeHeight="1">` : `<wp:inline>`;
  return `<w:r><w:drawing>${abre}${extra}<wp:extent cx="${cxMm * 36000}" cy="${cyMm * 36000}"/><a:graphic><a:graphicData><a:blip r:embed="${rid}"/></a:graphicData></a:graphic></wp:${tipo}></w:drawing></w:r>`;
}

/** Um timbrado .docx de verdade (pacote zip), com as partes que o Word escreveria. */
function timbradoDeTeste(): Buffer {
  const zip = new PizZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/></Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0"?><w:document ${NS}><w:body><w:p/>` +
      // Uma seção ANTERIOR, com outra margem — é a última que vale para a peça.
      `<w:p><w:pPr><w:sectPr><w:pgMar w:top="100" w:right="100" w:bottom="100" w:left="100"/></w:sectPr></w:pPr></w:p>` +
      `<w:sectPr><w:headerReference w:type="first" r:id="rIdH0"/><w:headerReference w:type="default" r:id="rIdH1"/><w:footerReference w:type="default" r:id="rIdF1"/>` +
      `<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="${mmParaTwips(45)}" w:right="${mmParaTwips(20)}" w:bottom="${mmParaTwips(30)}" w:left="${mmParaTwips(25)}" w:header="${mmParaTwips(10)}" w:footer="${mmParaTwips(8)}" w:gutter="0"/><w:titlePg/></w:sectPr>` +
      `</w:body></w:document>`,
  );
  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rIdH0" Type="header" Target="header0.xml"/><Relationship Id="rIdH1" Type="header" Target="header1.xml"/><Relationship Id="rIdF1" Type="footer" Target="footer1.xml"/></Relationships>`,
  );
  zip.file("word/header0.xml", `<w:hdr ${NS}><w:p><w:r><w:t>CABEÇALHO DA PRIMEIRA — não é o padrão</w:t></w:r></w:p></w:hdr>`);
  zip.file(
    "word/header1.xml",
    `<w:hdr ${NS}><w:p><w:pPr><w:jc w:val="center"/></w:pPr>${desenho("inline", "rIdLogo", 40, 15)}<w:r><w:t xml:space="preserve">Rodarte &amp; Prado </w:t></w:r><w:r><w:t>Advogados</w:t></w:r></w:p>` +
      `<w:p>${desenho("anchor", "rIdFundo", 210, 297, `<wp:positionH relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>${5 * 36000}</wp:posOffset></wp:positionV>`)}</w:p>` +
      `<w:p>${desenho("inline", "rIdEmf", 10, 10)}</w:p></w:hdr>`,
  );
  zip.file(
    "word/_rels/header1.xml.rels",
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rIdLogo" Type="image" Target="media/logo.png"/><Relationship Id="rIdFundo" Type="image" Target="media/fundo.png"/><Relationship Id="rIdEmf" Type="image" Target="media/selo.emf"/></Relationships>`,
  );
  zip.file("word/media/logo.png", PNG_1X1);
  zip.file("word/media/fundo.png", PNG_1X1);
  zip.file("word/media/selo.emf", Buffer.from("emf"));
  zip.file("word/footer1.xml", `<w:ftr ${NS}><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:t>Av. Goiás, 100 — Goiânia</w:t></w:r></w:p></w:ftr>`);
  return zip.generate({ type: "nodebuffer" });
}

const LIDO = lerTimbradoDocx(timbradoDeTeste());

teste("o timbrado dá as margens da ÚLTIMA seção, em mm, e a distância do cabeçalho e do rodapé", () => {
  igual(LIDO.margens, DO_TIMBRADO, "margens lidas do <w:pgMar>: ");
  igual(LIDO.cabecalhoMm, 10);
  igual(LIDO.rodapeMm, 8);
});

teste("o cabeçalho lido é o PADRÃO (não o da primeira página), com texto, alinhamento e imagem", () => {
  const [p] = LIDO.cabecalho.paragrafos;
  verdade(!!p, "nenhum parágrafo lido do cabeçalho");
  igual(p.texto, "Rodarte & Prado Advogados", "texto (entidades desfeitas, trechos juntados): ");
  igual(p.alinhamento, "center");
  igual(p.imagens.length, 1, "a logo em linha: ");
  igual([p.imagens[0].larguraMm, p.imagens[0].alturaMm], [40, 15], "tamanho da logo vindo do <wp:extent>: ");
  verdade(p.imagens[0].src.startsWith("data:image/png;base64,"), "a logo não virou data: URL de PNG");
  verdade(!LIDO.cabecalho.paragrafos.some((q) => q.texto.includes("PRIMEIRA")), "leu o cabeçalho da primeira página no lugar do padrão");
});

teste("imagem ancorada vira posição na folha, e 'atrás do texto' é respeitado", () => {
  igual(LIDO.cabecalho.ancoradas.length, 1);
  const [fundo] = LIDO.cabecalho.ancoradas;
  igual([fundo.esquerdaMm, fundo.topoMm, fundo.larguraMm, fundo.alturaMm, fundo.atrasDoTexto], [0, 5, 210, 297, true]);
});

teste("o rodapé é lido com o alinhamento dele", () => {
  igual(LIDO.rodape.paragrafos.map((p) => [p.texto, p.alinhamento]), [["Av. Goiás, 100 — Goiânia", "right"]]);
});

teste("o que a prévia não desenha vira AVISO — nunca omissão calada", () => {
  verdade(LIDO.avisos.some((a) => /EMF/.test(a)), `a imagem EMF sumiu sem aviso (avisos: ${LIDO.avisos.join(" | ")})`);
  verdade(LIDO.avisos.some((a) => /primeira página/i.test(a)), "o cabeçalho diferente na primeira página sumiu sem aviso");
});

teste("arquivo que não é .docx não derruba a tela: vira aviso e folha sem timbrado", () => {
  const r = lerTimbradoDocx(Buffer.from("isto não é um zip"));
  igual(r.margens, null);
  verdade(r.avisos.length > 0, "arquivo inválido sem aviso");
});

// ── 1b. O .DOCX OBEDECE A MESMA CONCILIAÇÃO ─────────────────────────────────────────────────

const dados = { notaObrigatoriaTexto: "NOTA\nlinha", notaRiscos: [], corpoMinuta: "Corpo.\n\nNestes termos,\npede deferimento.", tituloPeca: "Petição" };
const meta = { confirmadoPorNome: "Adv", confirmadoPorOab: "1", confirmadoEm: new Date(0), sessaoId: "s" };
const documentoDe = (b: Buffer) => new PizZip(b).file("word/document.xml")!.asText();
const pgMarFinal = (xml: string) => {
  const i = xml.lastIndexOf("<w:sectPr");
  return /<w:pgMar\b[^>]*>/.exec(xml.slice(i))?.[0] ?? "";
};
const valor = (tag: string, nome: string) => Number(new RegExp(`\\s${nome}="(\\d+)"`).exec(tag)?.[1]);

teste("sem timbrado: o Word sai com a margem SALVA; sem margem salva, com a padrão de sempre", () => {
  const comSalva = pgMarFinal(documentoDe(montarPeticaoWord(dados, meta, null, SALVAS)));
  igual([valor(comSalva, "w:top"), valor(comSalva, "w:right"), valor(comSalva, "w:bottom"), valor(comSalva, "w:left")],
    [mmParaTwips(20), mmParaTwips(15), mmParaTwips(20), mmParaTwips(35)], "margem salva no .docx sem timbrado: ");
  const semSalva = pgMarFinal(documentoDe(montarPeticaoWord(dados, meta, null, null)));
  igual(valor(semSalva, "w:left"), mmParaTwips(PAGINA_A4.margens.esquerdaMm), "sem margem salva o .docx mudou de margem: ");
});

teste("com timbrado e margem salva: troca SÓ as quatro margens da última seção, e preserva cabeçalho e rodapé", () => {
  const xml = documentoDe(montarPeticaoWord(dados, meta, timbradoDeTeste(), SALVAS));
  const tag = pgMarFinal(xml);
  igual(valor(tag, "w:left"), mmParaTwips(35), "margem esquerda salva: ");
  igual(valor(tag, "w:top"), mmParaTwips(20), "margem de topo salva: ");
  igual(valor(tag, "w:header"), mmParaTwips(10), "a distância do cabeçalho do timbrado foi perdida: ");
  verdade(xml.includes('r:id="rIdH1"') && xml.includes('r:id="rIdF1"'), "o cabeçalho/rodapé do timbrado saiu da seção");
  verdade(xml.includes('<w:pgMar w:top="100" w:right="100"'), "a seção ANTERIOR do timbrado foi alterada — só a última vale para a peça");
});

teste("com timbrado e SEM margem salva: a margem do timbrado sai intocada (comportamento de antes)", () => {
  const tag = pgMarFinal(documentoDe(montarPeticaoWord(dados, meta, timbradoDeTeste(), null)));
  igual([valor(tag, "w:top"), valor(tag, "w:left")], [mmParaTwips(45), mmParaTwips(25)]);
});

teste("trocar margens numa seção sem <w:pgMar> acrescenta um, sem estragar o resto", () => {
  const xml = `<w:document><w:body><w:p/><w:sectPr><w:pgSz w:w="1"/></w:sectPr></w:body></w:document>`;
  const novo = trocarMargensDaUltimaSecao(xml, SALVAS);
  verdade(/<w:sectPr><w:pgMar w:top="\d+"/.test(novo), `não acrescentou o pgMar: ${novo}`);
  verdade(novo.includes('<w:pgSz w:w="1"/>'), "o resto da seção foi perdido");
});

// ── 3. A PAGINAÇÃO ──────────────────────────────────────────────────────────────────────────

teste("paginarBlocos: o que cabe fica, o que não cabe abre a folha seguinte", () => {
  igual(paginarBlocos([{ topo: 0, altura: 40 }, { topo: 40, altura: 40 }], 100), [[0, 1]]);
  igual(paginarBlocos([{ topo: 0, altura: 60 }, { topo: 60, altura: 60 }, { topo: 120, altura: 30 }], 100), [[0], [1, 2]]);
});

teste("paginarBlocos: bloco mais alto que a folha fica sozinho — não some e não trava", () => {
  igual(paginarBlocos([{ topo: 0, altura: 10 }, { topo: 10, altura: 500 }, { topo: 510, altura: 10 }], 100), [[0], [1], [2]]);
  igual(paginarBlocos([], 100), []);
  igual(paginarBlocos([{ topo: 0, altura: 10 }], 0), [[0]], "capacidade zero não pode perder conteúdo: ");
});

// ── 4. O CORPO NÃO MUDA ─────────────────────────────────────────────────────────────────────

teste("O HASH DAS CITAÇÕES NÃO MUDOU: mesmos valores calculados na base (origin/main d8c383f)", () => {
  // Valores gerados com o código de origin/main ANTES desta entrega. Se um deles mudar, toda
  // confirmação "li e revisei" já dada seria invalidada em silêncio.
  const html = `<p style="text-align: justify">Conforme o <strong>STJ</strong>, "a responsabilidade civil do Estado é objetiva" (REsp 1.234.567/SP).</p><ul><li>Primeiro</li><li>Segundo</li></ul>`;
  const texto = textoPuroDaMinutaHtml(sanitizarMinutaHtml(html));
  igual(texto, 'Conforme o STJ, "a responsabilidade civil do Estado é objetiva" (REsp 1.234.567/SP).\n\nPrimeiro\nSegundo');
  igual(hashDeTexto(normalizarTextoCitacao(texto)), "cd447f3ffd4bbc7a7b1dd0e3744219f45475917483e31a7f452613b123af6b49");
  igual(hashDeTexto(normalizarTextoCitacao('"a responsabilidade civil do Estado é objetiva"')), "9f0ab5e9ad9e4f93189c66d2ec1432bec8c768ca25d988705f872243172a0fa3");
});

const ACOES = ler("lib", "actions", "peticionamento.ts");

teste("salvar margem NÃO escreve no corpo nem nas citações — e reconfere o escritório", () => {
  const corpo = corpoDaFuncao(ACOES, "salvarMargensDaMinuta");
  verdade(corpo.length > 100 && corpo.length < 1500, `corpoDaFuncao não achou salvarMargensDaMinuta direito (${corpo.length})`);
  verdade(!/minutaTexto|minutaFormatadaHtml|peticionamentoCitacao|sincronizarCitacoes/.test(corpo),
    "gravar a margem passou a mexer no corpo ou nas citações — margem não muda uma palavra da peça");
  verdade(corpo.includes("exigirAcessoAba()"), "salvarMargensDaMinuta sem a trava de acesso à aba");
  verdade(/carregarSessaoOuFalhar\(\s*sessaoId\s*,\s*user\.officeId\s*\)/.test(corpo), "salvarMargensDaMinuta não reconfere a sessão contra o escritório de quem pediu");
  verdade(/where:\s*\{[^}]*officeId:\s*user\.officeId/.test(corpo), "a gravação da margem não carrega o officeId no where");
  verdade(/margensValidas\(\s*margens\s*\)/.test(corpo), "a margem que chega do navegador é gravada sem validação");
});

// ── 5. AS LIGAÇÕES ──────────────────────────────────────────────────────────────────────────

teste("a exportação usa o MESMO download do timbrado e a margem salva, validada", () => {
  const exp = corpoDaFuncao(ACOES, "confirmarExportacao");
  verdade(/timbradoDoEscritorio\(\s*user\.officeId\s*\)/.test(exp), "a exportação baixa o timbrado por outro caminho que não o da prévia");
  const chamada = exp.slice(exp.indexOf("montarPeticaoWord("));
  verdade(/margensValidas\(\s*sessao\.minutaMargensMm\s*\)/.test(chamada.slice(0, 2500)), "a margem salva não chega ao montarPeticaoWord — a régua e o Word discordariam");
});

teste("a página abre a régua e a prévia com a margem conciliada e o timbrado do escritório de quem está logado", () => {
  const pagina = codigoDe(ler("app", "peticionamento", "[id]", "minuta", "page.tsx"));
  verdade(/timbradoDoEscritorio\(\s*user\.officeId\s*\)/.test(pagina), "a página não lê o timbrado do escritório de quem está logado");
  verdade(/margensDaFolha\(\s*sessao\.minutaMargensMm/.test(pagina), "a página não concilia a margem pela regra única");
  verdade(/margensIniciais=\{\s*margens\s*\}/.test(pagina), "a margem conciliada não chega à tela");
});

teste("a prévia é AO VIVO: recebe o mesmo estado que a folha de edição emite a cada tecla", () => {
  const cliente = codigoDe(ler("components", "peticionamento", "MinutaClient.tsx"));
  verdade(/onMudou=\{\s*setCorpo\s*\}/.test(cliente), "a folha de edição deixou de emitir para o estado `corpo`");
  const tag = cliente.slice(cliente.indexOf("<PreviaDaFolha"), cliente.indexOf("/>", cliente.indexOf("<PreviaDaFolha")));
  verdade(/html=\{\s*corpo\s*\}/.test(tag), "a prévia não recebe o `corpo` vivo — ela mostraria o texto de quando a tela abriu");
  verdade(/margens=\{\s*margens\s*\}/.test(tag), "a prévia não acompanha a margem arrastada na régua");
  verdade(/onMargensMudaram=\{\s*setMargens\s*\}/.test(cliente), "a régua não avisa a tela quando a margem muda");
  verdade(/salvarMargensDaMinuta\(\s*sessaoId\s*,\s*margens\s*\)/.test(cliente), "a margem arrastada não é gravada");
});

teste("os três botões pedidos existem e fazem o que dizem", () => {
  const cliente = codigoDe(ler("components", "peticionamento", "MinutaClient.tsx"));
  verdade(/Mostrar prévia/.test(cliente) && /Esconder prévia/.test(cliente), "falta o botão de mostrar/esconder a prévia");
  verdade(/setPreviaAberta\(\s*\(v\)\s*=>\s*!v\s*\)/.test(cliente), "o botão de prévia não alterna o estado");
  verdade(/Visualizar impressão/.test(cliente), "falta o botão de visualizar impressão");
  const previa = codigoDe(ler("components", "peticionamento", "PreviaDaFolha.tsx"));
  verdade(/window\.print\(\)/.test(previa), "visualizar impressão não abre a impressão");
  verdade(/createPortal\(/.test(previa), "as folhas de impressão não saem do chassi — a impressão seria cortada na primeira folha");
});

teste("a prévia desenha o corpo SANEADO — o mesmo saneamento do servidor", () => {
  const fonte = ler("components", "peticionamento", "PreviaDaFolha.tsx");
  verdade(/sanitizarMinutaHtml\(\s*htmlAdiado\s*\)/.test(fonte), "o HTML do corpo entra na prévia sem passar por sanitizarMinutaHtml");
  // Todo dangerouslySetInnerHTML tem a revisão registrada logo acima (regra de .eslintrc: react/no-danger).
  const linhas = fonte.split("\n");
  const usos = linhas.map((l, i) => (l.includes("dangerouslySetInnerHTML") ? i : -1)).filter((i) => i >= 0);
  verdade(usos.length >= 1, "a varredura não achou dangerouslySetInnerHTML — ela está lendo o arquivo certo?");
  for (const i of usos) {
    verdade(/eslint-disable-next-line react\/no-danger -- \S/.test(linhas[i - 1]), `dangerouslySetInnerHTML na linha ${i + 1} sem a justificativa revisada logo acima`);
  }
});

teste("a coluna nova é anulável e diz por que nulo é estado legítimo", () => {
  const schema = ler("prisma", "schema.prisma");
  verdade(/^\s*minutaMargensMm\s+Json\?\s*$/m.test(schema), "minutaMargensMm não é Json? (anulável)");
  const antes = schema.slice(Math.max(0, schema.indexOf("minutaMargensMm") - 900), schema.indexOf("minutaMargensMm"));
  verdade(/NULO É ESTADO LEGÍTIMO/.test(antes), "o comentário da coluna não diz por que nulo é legítimo");
});

teste("o CSS novo da prévia só usa tokens — nenhum hex cru", () => {
  const css = ler("app", "peticionamento", "peticionamento.css");
  const trecho = css.slice(css.indexOf("ETAPA B DO EDITOR — A PRÉVIA"));
  verdade(trecho.length > 500, "não achei o bloco de CSS da prévia");
  verdade(!/#[0-9a-fA-F]{3,8}\b/.test(trecho), "o CSS da prévia ganhou cor crua");
});

resumo("Peticionamento — etapa B: prévia no papel timbrado e margem guardada");
