import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo } from "./executar";
import { montarNomeacao, montarNomeArquivoWhatsapp, ehNomeDeMidiaDoWhatsapp, RAIZ_SUFIXO, PASTA_MAE_PADRAO, type RaizKey } from "@/lib/driveNaming";
import { montarNomeArquivoPeticao } from "@/lib/peticionamentoNomeArquivo";
import { assistantTools } from "@/lib/assistantTools";

// ══════════════════════════════════════════════════════════════════════════════════════════
// A SKILL DE PLATAFORMA — nenhum escritório dentro dela, e nenhuma divergência com o código.
//
// A skill que deu origem a esta era de UM escritório: citava o nome dele e trazia o caminho da
// máquina do dono. Instalada num segundo escritório, ela mandaria o agente salvar arquivo numa
// pasta que não existe, com o nome de outra banca em cima — e nada na tela explicaria por quê.
//
// ESTA SUÍTE FALHA SE A SKILL GANHAR: nome de escritório, caminho de máquina, ou qualquer outro
// dado identificável (endereço, inscrição, contato, comarca, tribunal, processo, domínio).
//
// APRENDENDO COM O ERRO DA IRMÃ. lib/testes/peticionamentoPromptSemDadoDeEscritorio.teste.ts
// proibia a SIGLA de tribunal e deixava passar o NOME POR EXTENSO — o estrago é o mesmo e maior.
// Aqui os padrões vêm em pares (sigla e extenso, caminho de Windows e caminho de Unix), e cada
// padrão tem um exemplo que o exercita: uma lista furada, ou vazia por engano, faria toda a suíte
// passar verde provando zero coisa.
//
// E A SEGUNDA METADE, tão importante quanto: a skill NÃO PODE DIVERGIR DE lib/driveNaming.ts, que
// é quem implementa o padrão de verdade. Onde o código e a skill discordassem, quem manda é o
// código — então o que a skill afirma sobre nome de pasta e nome de arquivo é conferido contra as
// funções de verdade, nunca contra um texto copiado.
// ══════════════════════════════════════════════════════════════════════════════════════════

const CAMINHO_DA_SKILL = join(process.cwd(), "servidor-hermes", "skills", "lumen-padrao-de-arquivos", "SKILL.md");
const SKILL = readFileSync(CAMINHO_DA_SKILL, "utf8");

// ── 1. NENHUM DADO IDENTIFICÁVEL ─────────────────────────────────────────────────────────────

/**
 * Cada padrão é uma FORMA de um dado identificável aparecer — não um nome numa lista negra. Lista
 * de nomes só pega quem alguém já lembrou de proibir; o próximo a vazar é sempre o que faltava.
 */
const PADROES_PROIBIDOS: [string, RegExp][] = [
  // ── Caminho de máquina, nas duas famílias. A skill original trazia um caminho de Windows; um
  // caminho de Unix escrito no lugar dele seria exatamente o mesmo defeito com outra barra.
  ["caminho de máquina com letra de unidade", /\b[A-Za-z]:\\/],
  ["pasta local de sincronização do Drive", /\b(Meu Drive|My Drive)\b/i],
  ["caminho de máquina em Unix", /(^|[\s"'`(])\/(home|Users|root|mnt|media|var|opt|tmp)\//m],
  ["qualquer caminho com contrabarra", /\\[A-Za-zÀ-ÿ0-9 ]/],
  // ── Identificação de pessoa, banca ou juízo.
  ["inscrição de advogado (OAB)", /\bOAB\b/i],
  ["número seguido de sigla de UF", /\b\d{2,6}\s*\/\s*[A-Z]{2}\b/],
  ["CEP", /\bCEP\b|\b\d{5}-\d{3}\b/],
  ["e-mail", /[\w.+-]+@[\w-]+\.[a-z]{2,}/i],
  ["telefone", /\(\d{2}\)\s*9?\d{4,5}-\d{4}/],
  ["CPF ou CNPJ", /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/],
  ["número de processo (padrão CNJ)", /\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/],
  ["sigla de tribunal", /\bTJ-?[A-Z]{2}\b|\bTR[TF]-?\d{1,2}\b|\bST[JF]\b/],
  // O par do achado da revisão da suíte irmã: a sigla estava proibida, o nome por extenso não.
  ["tribunal nomeado por extenso", /\bTribunal\s+(de\s+Justi[çc]a|Regional|Superior|de\s+Contas)\b/i],
  ["corte ou seção nomeada", /\b(Supremo\s+Tribunal|Superior\s+Tribunal|C[âa]mara\s+C[íi]vel|Turma\s+Recursal)\b/i],
  ["comarca, vara ou juízo com nome próprio", /\b(Comarca|Vara|Ju[íi]zo|Foro)\s+(de|da|do)\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/],
  ["endereço com nome próprio", /\b(Rua|Avenida|Av\.|Alameda|Pra[çc]a|Edif[íi]cio|Sala|Bairro)\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/],
  ["site, domínio ou link", /https?:\/\/|\bwww\.|\.com\.br\b|\.adv\.br\b/i],
  ["nome próprio de escritório/cidade que já circula nesta base", /\b(rodarte|prado|goi[âa]nia|goi[áa]s|advogados associados|sociedade de advogados)\b/i],
  // Um escritório nomeado de qualquer outra forma: "Escritório <Nome Próprio>", "Banca <Nome>".
  ["escritório nomeado", /\b(Escrit[óo]rio|Banca|Sociedade)\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-zá-ÿ]+/],
];

function achaDadoProibido(texto: string): string | null {
  for (const [nome, padrao] of PADROES_PROIBIDOS) {
    const achado = texto.match(padrao);
    if (achado) return `${nome} → "${achado[0]}"`;
  }
  return null;
}

teste("HARD GATE: a skill não tem nome de escritório, caminho de máquina nem dado identificável", () => {
  verdade(SKILL.length > 3_000, `a skill saiu com ${SKILL.length} caracteres — varredura cega`);
  const achado = achaDadoProibido(SKILL);
  verdade(
    achado === null,
    `a skill de PLATAFORMA embute dado identificável: ${achado} — instalada em outro escritório, ela manda o agente salvar no lugar de outra banca`,
  );
});

teste("a varredura de fato falha na presença de cada padrão — prova negativa, não só positiva", () => {
  const exemplos = [
    "salve em H:\\Meu Drive\\Pasta",
    "a pasta Meu Drive do computador",
    "salve em /home/usuario/pasta",
    "caminho\\pasta",
    "inscrito na OAB",
    "12345/GO",
    "CEP 74000-000",
    "contato@exemplo.adv.br",
    "(62) 99999-0000",
    "CNPJ 12.345.678/0001-99",
    "Processo nº 1234567-89.2026.8.09.0051",
    "distribuído ao TJGO",
    "Enderece ao Tribunal de Justiça do Estado de Minas Gerais",
    "julgado pela Câmara Cível competente",
    "Comarca de Goiânia",
    "Rua Exemplo, 100",
    "https://exemplo.com.br",
    "Rodarte Prado Advogados",
    "Escritório Exemplo",
  ];
  igual(exemplos.length, PADROES_PROIBIDOS.length, "cada padrão proibido precisa de um exemplo que o exercite: ");
  exemplos.forEach((exemplo, i) => {
    const [nome, padrao] = PADROES_PROIBIDOS[i];
    verdade(padrao.test(exemplo), `o padrão "${nome}" não pegou o exemplo "${exemplo}" — está cego`);
    verdade(achaDadoProibido(exemplo) !== null, `achaDadoProibido não acusou "${exemplo}"`);
  });
  // Falso positivo: o texto legítimo da skill não pode ser acusado por nenhum padrão.
  verdade(
    achaDadoProibido("Consulte a ferramenta antes de salvar e use a pasta que ela devolver.") === null,
    "falso positivo: instrução legítima acusada como dado identificável",
  );
});

// ── 2. O NOME DO ESCRITÓRIO E A PASTA VÊM DA FERRAMENTA ──────────────────────────────────────

teste("a skill manda CONSULTAR a ferramenta, e a ferramenta existe com esse nome", () => {
  const nome = "consultar_perfil_do_escritorio";
  verdade(SKILL.includes(nome), "a skill não nomeia a ferramenta que o agente deve chamar");
  verdade(
    assistantTools.some((t) => t.spec.name === nome),
    `a skill manda chamar "${nome}", que não está registrada em assistantTools — instrução para uma ferramenta inexistente`,
  );
});

teste("a skill diz que o nome é o do ESCRITÓRIO CONTRATANTE, e proíbe presumir", () => {
  verdade(/escrit[óo]rio contratante/i.test(SKILL), "a skill não diz que o nome é o do escritório contratante");
  verdade(/n[ãa]o presuma|nunca presuma/i.test(SKILL), "a skill não proíbe presumir");
  verdade(/CONSULTE/i.test(SKILL), "a skill não manda consultar antes de salvar");
});

teste("a skill trata escritório SEM armazenamento conectado como situação normal", () => {
  verdade(/n[ãa]o houver armazenamento conectado|n[ãa]o estiver conectado|n[ãa]o est[áa] conectado/i.test(SKILL), "a skill não fala do escritório sem armazenamento conectado");
  verdade(/normal/i.test(SKILL), "a skill não diz que isso é situação normal — o agente vai tratar como erro");
  verdade(/(nunca|n[ãa]o)\s+invente/i.test(SKILL), "a skill não proíbe inventar caminho quando não há pasta");
});

// ── 3. NENHUM NOME DE PASTA ESCRITO À MÃO ────────────────────────────────────────────────────

teste("HARD GATE: a skill não carimba o nome PADRÃO de nenhuma pasta do produto", () => {
  // Os nomes padrão são só o DEFAULT de quem nunca configurou nada (lib/driveNaming.ts). Escrevê-los
  // na skill carimba a estrutura de um escritório na instalação de todos — que é a versão sutil do
  // mesmo defeito do caminho de máquina.
  const padrao = montarNomeacao(null, null);
  verdade(padrao.todasAsRaizes.length >= 9, `esperava as raízes do produto, achei ${padrao.todasAsRaizes.length}`);
  for (const nome of padrao.todasAsRaizes) {
    verdade(!SKILL.includes(nome), `a skill tem o nome de pasta padrão "${nome}" escrito à mão`);
  }
  verdade(!SKILL.includes(`${PASTA_MAE_PADRAO}/`), `a skill tem um caminho começando por "${PASTA_MAE_PADRAO}/"`);
});

teste("a skill cobre as CINCO raízes de destino — pelo nome de FUNÇÃO que o código usa", () => {
  // O par do caso acima: proibir o nome prefixado só serve se a skill ainda disser ONDE cada coisa
  // vai. O texto é conferido contra RAIZ_SUFIXO, e não contra uma lista escrita aqui: renomear uma
  // raiz no código passa a falhar isto, em vez de deixar a skill envelhecer em silêncio.
  for (const chave of ["processos", "casos", "atendimentos", "assessoria", "peticionamento"] as RaizKey[]) {
    verdade(SKILL.includes(RAIZ_SUFIXO[chave]), `a skill não diz o que vai para a raiz "${chave}" (${RAIZ_SUFIXO[chave]})`);
  }
});

// ── 4. SKILL × driveNaming.ts: OS DOIS NÃO PODEM DIVERGIR ────────────────────────────────────

/** Os blocos de código da skill — onde o padrão é ENSINADO, e não só mencionado de passagem. */
function blocosDeCodigo(texto: string): string[] {
  return texto.split("```").filter((_, i) => i % 2 === 1);
}

teste("o padrão de nome de arquivo da skill é o que o CÓDIGO produz — conferido contra a função", () => {
  // O PADRÃO TEM DE ESTAR NO CORPO, NÃO SÓ NO FRONTMATTER — achado de uma mutação verde desta
  // entrega: a mutação trocou o padrão dentro do bloco de código por "NOME_LIVRE.extensão" e a
  // varredura continuou verde, porque a frase `description:` do frontmatter ainda citava o padrão
  // certo. A skill passava a ensinar uma coisa e a se anunciar como outra.
  const blocos = blocosDeCodigo(SKILL);
  verdade(blocos.length > 0, "a skill não tem bloco de código nenhum — onde está o padrão ensinado?");
  verdade(
    blocos.some((b) => b.includes("[aaaa_mm_dd]_CATEGORIA")),
    "nenhum bloco de código da skill ENSINA o padrão [aaaa_mm_dd]_CATEGORIA (citá-lo no frontmatter não basta)",
  );
  verdade(SKILL.includes("[aaaa_mm_dd]_CATEGORIA"), "a skill perdeu o padrão [aaaa_mm_dd]_CATEGORIA");
  // Os dois exemplos da skill são gerados AQUI pela função de verdade. Se alguém mudar a regra de
  // normalização da categoria (acento, espaço, maiúscula), os exemplos da skill param de casar e
  // este caso falha — em vez de a skill continuar ensinando um padrão que o Lúmen não usa mais.
  const vinteDeAgosto = new Date(2026, 7, 20);
  const exemplos = [
    montarNomeArquivoPeticao({ dataGeracao: vinteDeAgosto, tipoPeca: "Parecer", tipoPecaOutro: null }),
    montarNomeArquivoPeticao({ dataGeracao: vinteDeAgosto, tipoPeca: "Embargos de Declaração", tipoPecaOutro: null }),
  ];
  igual(exemplos, ["2026_08_20_PARECER.docx", "2026_08_20_EMBARGOS_DE_DECLARACAO.docx"], "a função de nome mudou de comportamento: ");
  for (const exemplo of exemplos) {
    verdade(SKILL.includes(exemplo), `a skill não traz o exemplo "${exemplo}" que a função de verdade produz — os dois divergiram`);
  }
});

teste("a exceção da mídia do WhatsApp existe na skill e bate com o reconhecedor do código", () => {
  // O Lúmen guarda mídia do WhatsApp na RAIZ da pasta do atendimento, sem subpasta de categoria, e
  // tem um reconhecedor para o auditor de pastas não acusá-la (ehNomeDeMidiaDoWhatsapp). Uma skill
  // que mandasse o agente arquivá-la por categoria brigaria com o auditor todo dia.
  verdade(/WHATSAPP/.test(SKILL), "a skill não fala da mídia recebida pelo WhatsApp");
  verdade(/raiz da pasta do atendimento/i.test(SKILL), "a skill não diz que a mídia fica na raiz da pasta do atendimento");
  const nomeReal = montarNomeArquivoWhatsapp({ recebidoEm: new Date(2026, 7, 20), mimeType: "image/jpeg", waMessageId: "exemplo" });
  verdade(ehNomeDeMidiaDoWhatsapp(nomeReal), `o reconhecedor do código não aceita "${nomeReal}" — o padrão mudou`);
  // A forma que a skill descreve tem de casar com o nome de verdade, token a token.
  const [, , , canal, resto] = nomeReal.split(/[_.]/);
  igual(canal, "WHATSAPP", "o canal deixou de ser WHATSAPP no nome do arquivo: ");
  verdade(resto.startsWith("IMG-"), `o tipo/resto mudou de forma: "${resto}"`);
});

teste("a categoria continua sendo SUBPASTA, e a lista de categorias NÃO está escrita na skill", () => {
  verdade(/subpasta/i.test(SKILL), "a skill perdeu a regra de categoria como subpasta");
  // A taxonomia é por escritório (tipos nativos + OfficeDocumentType): escrevê-la na skill a
  // deixaria velha no dia seguinte e cega para os tipos que cada escritório cria.
  verdade(/categorias/i.test(SKILL), "a skill não manda buscar a lista de categorias");
  const sinaisDeListaColada = ["Petição Interlocutória", "Substabelecimento", "TRCT", "Habeas Corpus"];
  for (const sinal of sinaisDeListaColada) {
    verdade(!SKILL.includes(sinal), `a skill voltou a colar a taxonomia de categorias ("${sinal}") em vez de consultá-la`);
  }
});

teste("a skill tem frontmatter com nome e descrição", () => {
  verdade(SKILL.startsWith("---\n"), "a skill não começa com frontmatter");
  const fim = SKILL.indexOf("\n---", 4);
  verdade(fim > 0, "o frontmatter da skill não fecha");
  const frontmatter = SKILL.slice(4, fim);
  verdade(/^name:\s*lumen-padrao-de-arquivos\s*$/m.test(frontmatter), "o frontmatter não nomeia a skill");
  verdade(/^description:\s*\S/m.test(frontmatter), "o frontmatter não descreve quando usar a skill");
  verdade(achaDadoProibido(frontmatter) === null, `o frontmatter da skill embute dado identificável: ${achaDadoProibido(frontmatter)}`);
});

resumo("Skill de plataforma — sem escritório dentro, e alinhada ao driveNaming");
