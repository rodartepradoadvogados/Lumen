import { teste, igual, verdade, resumo } from "./executar";
import { deveResponder, montarPergunta, extrairTransferencia, LIMITES_DUROS } from "@/lib/agenteAtendimento";

// ============================================================================
// QUANDO O ATENDENTE FALA COM UM CLIENTE DE VERDADE.
//
// Mensagem enviada não volta. Por isso a decisão é uma função pura: dá para ler, testar e mostrar
// a alguém — em vez de uma sequência de `if` espalhada por uma rota que ninguém revisa.
//
// Os casos de NÃO responder são mais numerosos que os de responder, e é assim que tem que ser.
// ============================================================================

const ESCRITORIO_OK = { moduloWhatsapp: true, agenteAtivo: true, agenteTodos: true, agenteNumeros: "" };
const CONVERSA_OK = { agenteResponde: true, agenteSilenciadoEm: null, status: "NOVO" };
const NUM = "+5562982490400";

teste("marcado, módulo ligado, ninguém assumiu: responde", () => {
  const v = deveResponder(ESCRITORIO_OK, CONVERSA_OK, NUM);
  igual(v.responde, true, v.motivo + ": ");
});

teste("sem o módulo WhatsApp no plano, não responde", () => {
  const v = deveResponder({ ...ESCRITORIO_OK, moduloWhatsapp: false }, CONVERSA_OK, NUM);
  igual(v.responde, false);
  verdade(v.motivo.includes("módulo"), `motivo devia falar do módulo, veio "${v.motivo}"`);
});

teste("com a chave do escritório desligada, não responde", () => {
  igual(deveResponder({ ...ESCRITORIO_OK, agenteAtivo: false }, CONVERSA_OK, NUM).responde, false);
});

teste("sem a chave DESTA conversa, não responde", () => {
  // É o padrão de toda conversa nova: ninguém começa a ser respondido por máquina sem decisão.
  const v = deveResponder(ESCRITORIO_OK, { ...CONVERSA_OK, agenteResponde: false }, NUM);
  igual(v.responde, false);
  verdade(v.motivo.includes("conversa"), `motivo devia falar da conversa, veio "${v.motivo}"`);
});

teste("depois que uma pessoa assumiu, não responde NEM se a chave for religada", () => {
  // A regra mais importante das cinco. Um cliente que recebe resposta de gente e, na seguinte, de
  // máquina, descobre na hora com o que estava falando — e essa confiança não volta.
  const v = deveResponder(
    ESCRITORIO_OK,
    { agenteResponde: true, agenteSilenciadoEm: new Date("2026-09-19T10:00:00Z"), status: "NOVO" },
    NUM,
  );
  igual(v.responde, false);
  verdade(v.motivo.includes("pessoa"), `motivo devia falar da pessoa, veio "${v.motivo}"`);
});

teste("atendimento arquivado não é respondido", () => {
  igual(deveResponder(ESCRITORIO_OK, { ...CONVERSA_OK, status: "ARQUIVADO" }, NUM).responde, false);
});

teste("número fora da lista não é respondido", () => {
  const escritorio = { ...ESCRITORIO_OK, agenteTodos: false, agenteNumeros: "+5562991539356" };
  igual(deveResponder(escritorio, CONVERSA_OK, NUM).responde, false, "de fora: ");
  igual(deveResponder(escritorio, CONVERSA_OK, "+5562991539356").responde, true, "de dentro: ");
  // Conta antiga chega sem o nono dígito e continua sendo a mesma pessoa.
  igual(deveResponder(escritorio, CONVERSA_OK, "556291539356").responde, true, "sem o nono: ");
});

teste("o silêncio vence a chave, e a chave vence a lista", () => {
  // A ordem das portas importa: cada motivo devolvido tem que ser o da porta mais grave que
  // fechou, senão quem lê a auditoria conserta a coisa errada.
  const tudoRuim = deveResponder(
    { ...ESCRITORIO_OK, agenteTodos: false, agenteNumeros: "" },
    { agenteResponde: false, agenteSilenciadoEm: new Date(), status: "ARQUIVADO" },
    NUM,
  );
  verdade(tudoRuim.motivo.includes("arquivado"), `o arquivamento vem antes, veio "${tudoRuim.motivo}"`);
});

// ── O pedido que vai ao agente ───────────────────────────────────────────────────────────────

const BASE = {
  nomeDoAtendente: "Bia",
  nomeDoEscritorio: "Rodarte Prado Advogados",
  instrucoesDoEscritorio: null,
  nomeDoCliente: "Maria",
  historico: [],
  mensagem: "meu plano negou a cirurgia, o que eu faço?",
};

teste("os limites duros entram MESMO sem treinamento do escritório", () => {
  // O escritório distraído que deixa o campo vazio não pode acabar com um atendente que promete
  // ganho de causa em nome de advogado inscrito na OAB.
  const p = montarPergunta(BASE);
  for (const limite of LIMITES_DUROS) {
    verdade(p.includes(limite), `faltou: ${limite.slice(0, 40)}…`);
  }
});

teste("o treinamento do escritório entra, e os limites vêm ANTES dele", () => {
  const p = montarPergunta({ ...BASE, instrucoesDoEscritorio: "Somos de direito médico. Trate por você." });
  verdade(p.includes("Somos de direito médico"), "o treinamento tem que entrar");
  verdade(
    p.indexOf("O QUE VOCÊ NUNCA FAZ") < p.indexOf("Somos de direito médico"),
    "os limites têm que vir antes do texto do escritório",
  );
  verdade(p.includes("vale o 'NUNCA'"), "tem que dizer qual vence em caso de conflito");
});

teste("o nome do atendente e do escritório aparecem", () => {
  const p = montarPergunta(BASE);
  verdade(p.includes("Você é Bia"), "o atendente se apresenta pelo nome do escritório");
  verdade(p.includes("Rodarte Prado Advogados"), "o escritório aparece");
  verdade(!p.includes("Lúmen"), "o nome do nosso produto NÃO pode aparecer para o cliente");
});

teste("a conversa anterior entra identificada", () => {
  const p = montarPergunta({
    ...BASE,
    historico: [
      { de: "cliente", texto: "bom dia" },
      { de: "escritorio", texto: "bom dia, como posso ajudar?" },
    ],
  });
  verdade(p.includes("Maria: bom dia"), "a fala do cliente vem com o nome dele");
  verdade(p.includes("Bia: bom dia, como posso ajudar?"), "a fala do escritório vem com o nome do atendente");
});

// ── A marca da transferência ─────────────────────────────────────────────────────────────────
//
// O agente termina a mensagem com `[[TRANSFERIR:MOTIVO]]` e o Lúmen retira a marca antes de
// enviar. Vazar isso para o WhatsApp de um cliente é constrangimento puro — e é o tipo de coisa
// que ninguém nota até acontecer com um lead de verdade.

teste("a marca é retirada e o motivo é lido", () => {
  const r = extrairTransferencia("Obrigada! Vou passar para o advogado.\n[[TRANSFERIR:ROTEIRO]]");
  igual(r.gatilho, "ROTEIRO");
  igual(r.texto, "Obrigada! Vou passar para o advogado.");
});

teste("a marca sai de qualquer lugar da mensagem, não só do fim", () => {
  // O agente às vezes a põe no meio. Se só o fim fosse tratado, a marca iria para o cliente.
  const r = extrairTransferencia("Entendi. [[TRANSFERIR:RISCO]] Um advogado vai te retornar.");
  igual(r.gatilho, "RISCO");
  verdade(!r.texto.includes("TRANSFERIR"), `a marca vazou: ${r.texto}`);
  verdade(!r.texto.includes("[["), "não pode sobrar colchete");
});

teste("marca repetida some inteira", () => {
  const r = extrairTransferencia("a [[TRANSFERIR:TETO]] b [[TRANSFERIR:TETO]] c");
  verdade(!r.texto.includes("TRANSFERIR"), `sobrou: ${r.texto}`);
  igual(r.gatilho, "TETO");
});

teste("sem marca, não há transferência", () => {
  const r = extrairTransferencia("Me conta o que aconteceu?");
  igual(r.gatilho, null);
  igual(r.texto, "Me conta o que aconteceu?");
});

teste("motivo desconhecido NÃO transfere, mas a marca some mesmo assim", () => {
  // Transferir com motivo que ninguém reconhece manda o lead para uma fila escolhida por acaso.
  // Mas deixar a marca na tela do cliente seria pior ainda.
  const r = extrairTransferencia("tudo bem [[TRANSFERIR:QUALQUER_COISA]]");
  igual(r.gatilho, null, "não reconhece o motivo: ");
  verdade(!r.texto.includes("TRANSFERIR"), "e ainda assim limpa: ");
});

teste("a marca tolera espaço e minúscula, como o agente vai escrever", () => {
  for (const m of ["[[TRANSFERIR:PEDIDO]]", "[[ transferir : pedido ]]", "[[Transferir:Pedido]]"]) {
    igual(extrairTransferencia(`oi ${m}`).gatilho, "PEDIDO", `${m}: `);
  }
});

teste("o pedido explica ao agente os cinco motivos", () => {
  const p = montarPergunta(BASE);
  for (const g of ["RISCO", "PEDIDO", "ROTEIRO", "FORA_DO_ESCOPO", "TETO"]) {
    verdade(p.includes(`[[TRANSFERIR:${g}]]`), `faltou explicar ${g}`);
  }
  verdade(p.includes("NÃO escolhe a pessoa"), "tem que dizer que ele não escolhe o destinatário");
});

void resumo("atendente");
