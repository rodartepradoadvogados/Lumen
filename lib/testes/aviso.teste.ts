import { teste, igual, verdade, resumo } from "./executar";
import {
  montarAvisoDeLead,
  partirEmMensagens,
  resumoCurto,
  pareceTelefone,
  linkDoWhatsapp,
  deveExplicarAoColega,
  INTERVALO_DA_FRASE_MS,
  type DadosDoAviso,
} from "@/lib/avisoDeLead";

// ============================================================================
// O AVISO AO ADVOGADO.
//
// Duas coisas aqui não podem falhar nunca:
//
//   1. O TEXTO NÃO PODE SUMIR. O resumo é partido em várias mensagens para caber no WhatsApp, e
//      "partir" é onde se perde texto sem ninguém notar — o advogado leria um relato incompleto
//      achando que é o relato inteiro. Por isso o teste remonta as partes e compara com o
//      original, em vez de só conferir o tamanho de cada uma.
//
//   2. OS LINKS FICAM NO TOPO, e o do Lúmen antes do WhatsApp do cliente. Quem fala com o cliente
//      antes de ler a conversa pergunta o que o cliente já respondeu.
// ============================================================================

function dados(over: Partial<DadosDoAviso> = {}): DadosDoAviso {
  return {
    nomeDoCliente: "Maria Silva",
    telefoneDoLead: "5562981283481",
    gatilho: "ROTEIRO",
    campanha: "Erro médico",
    anuncio: null,
    falasDoCliente: ["minha cesárea foi em março", "o hospital não me deu o prontuário"],
    documentos: [
      { nome: "Prontuário", obrigatorio: true },
      { nome: "Negativa do plano", obrigatorio: false },
    ],
    anexos: [],
    linkNoLumen: "https://app.lumen.adv.br/atendimento/abc123",
    ...over,
  };
}

// ── Os links ─────────────────────────────────────────────────────────────────────────────────

teste("o link do Lúmen vem antes do link do WhatsApp do cliente", () => {
  const texto = montarAvisoDeLead(dados());
  const noLumen = texto.indexOf("https://app.lumen.adv.br/atendimento/abc123");
  const noWhatsapp = texto.indexOf("https://wa.me/");
  verdade(noLumen > -1, "o link do Lúmen não apareceu");
  verdade(noWhatsapp > -1, "o link do WhatsApp não apareceu");
  verdade(noLumen < noWhatsapp, "o link do WhatsApp veio antes do link do Lúmen");
});

teste("os dois links ficam no começo, antes do resumo", () => {
  const texto = montarAvisoDeLead(dados());
  verdade(texto.indexOf("https://wa.me/") < texto.indexOf("CONTOU"), "o resumo veio antes dos links");
});

teste("o link do WhatsApp leva só dígitos, sem texto pronto", () => {
  igual(linkDoWhatsapp("+55 (62) 98128-3481"), "https://wa.me/5562981283481");
  verdade(!linkDoWhatsapp("5562981283481").includes("?text="), "o link veio com mensagem pronta");
});

// ── O conteúdo ───────────────────────────────────────────────────────────────────────────────

teste("as falas do cliente vão inteiras e na ordem", () => {
  const fala = "eu tive uma cesárea em março de 2026 e desde então sinto dor; " + "x".repeat(400);
  const texto = montarAvisoDeLead(dados({ falasDoCliente: ["primeira", fala] }));
  verdade(texto.includes("1. primeira"), "a primeira fala sumiu");
  verdade(texto.includes(`2. ${fala}`), "a segunda fala foi cortada");
});

teste("o documento obrigatório é marcado como tal, e o opcional não", () => {
  const texto = montarAvisoDeLead(dados());
  verdade(texto.includes("• Prontuário — obrigatório"), "o obrigatório não foi marcado");
  verdade(texto.includes("• Negativa do plano"), "o opcional sumiu");
  verdade(!texto.includes("• Negativa do plano — obrigatório"), "o opcional foi marcado como obrigatório");
});

teste("o motivo é escrito para quem lê, e não com o código do gatilho", () => {
  const texto = montarAvisoDeLead(dados({ gatilho: "TETO" }));
  verdade(!texto.includes("TETO"), "o código do gatilho vazou para o texto");
  verdade(texto.includes("passou do limite de mensagens"), "o motivo não foi explicado");
});

teste("sem campanha, sem documentos e sem anexos, o aviso não cria seções vazias", () => {
  const texto = montarAvisoDeLead(dados({ campanha: null, documentos: [], anexos: [] }));
  verdade(!texto.includes("DOCUMENTOS"), "criou seção de documentos vazia");
  verdade(!texto.includes("ANEXADOS"), "criou seção de anexos vazia");
  verdade(texto.includes("a triagem terminou."), "o motivo sumiu junto");
});

teste("cliente sem nome de perfil não vira cabeçalho com o próprio telefone", () => {
  const texto = montarAvisoDeLead(dados({ nomeDoCliente: "5562981283481" }));
  verdade(texto.includes("*O QUE O CLIENTE CONTOU*"), "o número virou nome no cabeçalho");
  verdade(texto.startsWith("*Lead novo para você*\n"), "o número foi colado no título");
  verdade(texto.includes("fale com o cliente:"), "o número virou nome na linha do link");
});

teste("pareceTelefone separa nome de número, inclusive formatado", () => {
  igual(pareceTelefone("Maria Silva"), false);
  igual(pareceTelefone("5562981283481"), true);
  igual(pareceTelefone("+55 (62) 98128-3481"), true);
  igual(pareceTelefone(""), true);
  igual(pareceTelefone("Ana 2"), false);
});

teste("o resumo curto do push cabe numa linha e diz o essencial", () => {
  const curto = resumoCurto(dados());
  igual(curto, "Maria Silva — a triagem terminou · Erro médico.");
  verdade(!curto.includes("\n"), "o resumo do push tem quebra de linha");
});

// ── Partir sem perder ────────────────────────────────────────────────────────────────────────

/** Remonta as partes desfazendo exatamente o que `partirEmMensagens` acrescentou. */
function remontar(partes: string[]): string {
  if (partes.length === 1) return partes[0];
  return partes.map((p) => p.replace(/\n\n\(\d+\/\d+\)$/, "")).join("\n");
}

/**
 * Prova mais fraca, para o caso em que uma linha só é maior que uma mensagem inteira: ali a
 * quebra cai NO MEIO da linha, então remontar com "\n" não pode devolver o original — as fatias
 * viram linhas separadas. O que ainda tem de valer, e é o que importa, é que nenhum CARACTERE se
 * perdeu e a ordem não mudou.
 */
function mesmoConteudo(partes: string[], original: string): boolean {
  const semQuebras = (t: string) => t.replace(/\n/g, "");
  return semQuebras(remontar(partes)) === semQuebras(original);
}

teste("texto curto sai numa mensagem só, sem marcador", () => {
  const partes = partirEmMensagens("linha um\nlinha dois", 3500);
  igual(partes.length, 1);
  verdade(!partes[0].includes("(1/1)"), "marcou parte única");
});

teste("partir não perde uma linha sequer", () => {
  const texto = Array.from({ length: 300 }, (_, i) => `${i + 1}. relato do cliente sobre o caso dele`).join("\n");
  const partes = partirEmMensagens(texto, 400);
  verdade(partes.length > 1, "não partiu um texto que precisava ser partido");
  igual(remontar(partes), texto, "o texto remontado não bate com o original: ");
});

teste("nenhuma parte estoura o limite", () => {
  const texto = Array.from({ length: 300 }, (_, i) => `${i + 1}. relato do cliente sobre o caso dele`).join("\n");
  for (const p of partirEmMensagens(texto, 400)) {
    verdade(p.length <= 400, `parte de ${p.length} caracteres passou do limite de 400`);
  }
});

teste("uma linha sozinha maior que o limite é fatiada, e nenhum caractere se perde", () => {
  const texto = "cabeçalho\n" + "abcde".repeat(400) + "\nrodapé";
  const partes = partirEmMensagens(texto, 400);
  verdade(partes.length > 1, "não partiu");
  verdade(mesmoConteudo(partes, texto), "a linha gigante perdeu pedaço ou trocou a ordem");
  verdade(remontar(partes).startsWith("cabeçalho\n"), "o cabeçalho não ficou no começo");
  verdade(remontar(partes).endsWith("\nrodapé"), "o rodapé não ficou no fim");
  for (const p of partes) verdade(p.length <= 400, `parte de ${p.length} passou do limite`);
});

teste("os marcadores contam o total certo", () => {
  const texto = Array.from({ length: 50 }, (_, i) => `linha ${i}`).join("\n");
  const partes = partirEmMensagens(texto, 100);
  partes.forEach((p, i) => {
    verdade(p.endsWith(`(${i + 1}/${partes.length})`), `parte ${i + 1} sem o marcador certo: ${p.slice(-12)}`);
  });
});

teste("o aviso inteiro de uma conversa longa cabe partido, com os links na primeira parte", () => {
  const falas = Array.from({ length: 80 }, (_, i) => `mensagem ${i + 1} do cliente, com algum detalhe do caso`);
  const partes = partirEmMensagens(montarAvisoDeLead(dados({ falasDoCliente: falas })));
  verdade(partes.length > 1, "a conversa longa não foi partida");
  verdade(partes[0].includes("https://app.lumen.adv.br/atendimento/abc123"), "o link do Lúmen não está na primeira parte");
  verdade(partes[0].includes("https://wa.me/"), "o link do cliente não está na primeira parte");
});

// ── A frase ao colega ────────────────────────────────────────────────────────────────────────

teste("o colega que nunca recebeu a frase recebe", () => {
  igual(deveExplicarAoColega(null, new Date(2026, 8, 19, 10)), true);
  igual(deveExplicarAoColega(undefined, new Date(2026, 8, 19, 10)), true);
});

teste("o colega que acabou de receber não recebe de novo", () => {
  const agora = new Date(2026, 8, 19, 10);
  igual(deveExplicarAoColega(new Date(agora.getTime() - 60_000), agora), false);
  igual(deveExplicarAoColega(new Date(agora.getTime() - INTERVALO_DA_FRASE_MS + 1000), agora), false);
});

teste("passadas 24 horas, a explicação volta", () => {
  const agora = new Date(2026, 8, 19, 10);
  igual(deveExplicarAoColega(new Date(agora.getTime() - INTERVALO_DA_FRASE_MS), agora), true);
  igual(deveExplicarAoColega(new Date(2026, 2, 1), agora), true);
});

resumo("Aviso ao advogado");
