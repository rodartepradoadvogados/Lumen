import { teste, igual, verdade, resumo } from "./executar";
import { mesmoNumero, podeResponder, parseEntradaEvolution } from "@/lib/whatsappEvolution";

// ============================================================================
// QUEM O AGENTE PODE RESPONDER — e o nono dígito.
//
// Estes dois assuntos estão no mesmo arquivo porque são o mesmo risco visto de dois lados. A
// lista de quem pode ser atendido só vale se a comparação de números funcionar; e a comparação de
// números no Brasil tem uma armadilha (o nono dígito) cujo sintoma — "o agente ignora o sócio" —
// ninguém liga à causa.
//
// Do outro lado do mesmo risco: responder a quem NÃO devia. Por isso os casos de fechamento
// (desligado, lista vazia) são tantos quanto os de abertura.
// ============================================================================

const FECHADO = { agenteAtivo: false, agenteTodos: false, agenteNumeros: "" };

// ── O nono dígito ────────────────────────────────────────────────────────────────────────────

teste("o mesmo número escrito de jeitos diferentes é o mesmo número", () => {
  verdade(mesmoNumero("+55 62 98128-3481", "5562981283481"), "com máscara");
  verdade(mesmoNumero("+5562981283481", "5562981283481"), "com o mais");
  verdade(mesmoNumero("(62) 98128-3481", "62981283481"), "sem o país, dos dois lados");
});

teste("conta antiga sem o nono dígito continua sendo a mesma pessoa", () => {
  // É assim que o número chega no webhook em contas antigas. Sem isto, o sócio do escritório
  // fica de fora da lista e ninguém descobre por quê.
  verdade(mesmoNumero("+5562981283481", "556281283481"), "cadastrado com 9, chegou sem");
  verdade(mesmoNumero("556281283481", "+5562981283481"), "cadastrado sem 9, chegou com");
});

teste("números diferentes continuam diferentes", () => {
  igual(mesmoNumero("+5562981283481", "+5562982490400"), false, "dois celulares: ");
  igual(mesmoNumero("+5562981283481", "+5561981283481"), false, "outro DDD: ");
  igual(mesmoNumero("+5562981283481", ""), false, "vazio: ");
  igual(mesmoNumero("", ""), false, "dois vazios: ");
  // O corte do nono dígito só vale no formato brasileiro de 13. Um fixo não pode ser mutilado.
  igual(mesmoNumero("556232112233", "55623112233"), false, "fixo não perde dígito: ");
});

// ── A trava ──────────────────────────────────────────────────────────────────────────────────

teste("com o agente desligado, não responde nem a quem está na lista", () => {
  igual(
    podeResponder({ ...FECHADO, agenteNumeros: "+5562981283481", agenteTodos: true }, "+5562981283481"),
    false,
  );
});

teste("ligado e sem lista, não responde a ninguém", () => {
  // O estado inseguro nunca pode ser o resultado de um campo esquecido.
  igual(podeResponder({ agenteAtivo: true, agenteTodos: false, agenteNumeros: "" }, "+5562981283481"), false);
});

teste("ligado, responde só a quem está na lista", () => {
  const regra = { agenteAtivo: true, agenteTodos: false, agenteNumeros: "+5562981283481,+5562982490400" };
  verdade(podeResponder(regra, "+5562981283481"), "primeiro da lista");
  verdade(podeResponder(regra, "5562982490400"), "segundo da lista, sem o mais");
  verdade(podeResponder(regra, "556281283481"), "primeiro da lista, conta antiga sem o nono");
  igual(podeResponder(regra, "+5562999998888"), false, "de fora da lista: ");
});

teste("a lista aceita os separadores que gente de verdade digita", () => {
  for (const lista of [
    "+5562981283481,+5562982490400",
    "+5562981283481, +5562982490400",
    "+5562981283481; +5562982490400",
    "+5562981283481\n+5562982490400",
  ]) {
    const regra = { agenteAtivo: true, agenteTodos: false, agenteNumeros: lista };
    verdade(podeResponder(regra, "+5562982490400"), `separador em ${JSON.stringify(lista)}`);
  }
});

teste("com 'todos' ligado, responde a quem não está na lista", () => {
  verdade(podeResponder({ agenteAtivo: true, agenteTodos: true, agenteNumeros: "" }, "+5562999998888"), "");
});

// ── A porta de entrada ───────────────────────────────────────────────────────────────────────

function evento(extra: Record<string, unknown> = {}, dados: Record<string, unknown> = {}) {
  return {
    event: "messages.upsert",
    instance: "lumen-rodarte-prado",
    data: {
      key: { remoteJid: "5562982490400@s.whatsapp.net", fromMe: false, id: "ABC123" },
      pushName: "Rodrigo",
      message: { conversation: "bom dia, preciso de um advogado" },
      ...dados,
    },
    ...extra,
  };
}

teste("uma mensagem de texto de cliente entra", () => {
  igual(parseEntradaEvolution(evento()), {
    fromNumber: "5562982490400",
    waMessageId: "ABC123",
    text: "bom dia, preciso de um advogado",
    profileName: "Rodrigo",
    phoneNumberId: "lumen-rodarte-prado",
  });
});

teste("mensagem com citação (extendedTextMessage) também entra", () => {
  const r = parseEntradaEvolution(
    evento({}, { message: { extendedTextMessage: { text: "e sobre o processo?" } } }),
  );
  igual(r?.text, "e sobre o processo?");
});

teste("o que NÃO pode virar atendimento não vira", () => {
  // Cada um destes já criou bug em sistema de WhatsApp de alguém.
  igual(parseEntradaEvolution(evento({ event: "messages.update" })), null, "evento de status: ");
  igual(
    parseEntradaEvolution(evento({}, { key: { remoteJid: "556299@s.whatsapp.net", fromMe: true, id: "X" } })),
    null,
    "mensagem do próprio escritório: ",
  );
  igual(
    parseEntradaEvolution(evento({}, { key: { remoteJid: "12345@g.us", fromMe: false, id: "X" } })),
    null,
    "grupo: ",
  );
  igual(parseEntradaEvolution(evento({}, { message: { imageMessage: {} } })), null, "mídia sem texto: ");
  igual(parseEntradaEvolution(evento({}, { message: { conversation: "   " } })), null, "texto em branco: ");
  igual(parseEntradaEvolution(evento({ instance: "" })), null, "sem instância: ");
  igual(parseEntradaEvolution(null), null, "nulo: ");
  igual(parseEntradaEvolution("nada disso"), null, "lixo: ");
});

// ── A origem do anúncio ──────────────────────────────────────────────────────────────────────
//
// Quem clica em "Enviar mensagem" num anúncio do Instagram chega com este bloco na PRIMEIRA
// mensagem, e só nela. É o `sourceUrl` daqui que liga a conversa à campanha cadastrada — perder
// isso na leitura do webhook faria toda conversa de tráfego pago virar conversa natural, e o
// sintoma seria "a campanha não funciona", sem pista de por quê.

function doAnuncio(comContexto: boolean) {
  const extendedTextMessage: Record<string, unknown> = {
    text: "Olá, vi o anúncio sobre negativa de plano de saúde",
  };
  if (comContexto) {
    extendedTextMessage.contextInfo = {
      externalAdReply: {
        sourceUrl: "https://rodarteprado.com.br/plano-negou?fbclid=IwAR123",
        sourceId: "120210000000000",
        title: "Plano negou sua cirurgia?",
      },
    };
  }
  return {
    event: "messages.upsert",
    instance: "lumen-rodarte-prado",
    data: {
      key: { remoteJid: "5562999998888@s.whatsapp.net", fromMe: false, id: "AD1" },
      pushName: "Maria",
      message: { extendedTextMessage },
    },
  };
}

teste("a origem do anúncio é lida da primeira mensagem", () => {
  const r = parseEntradaEvolution(doAnuncio(true));
  igual(r?.anuncio, {
    sourceUrl: "https://rodarteprado.com.br/plano-negou?fbclid=IwAR123",
    sourceId: "120210000000000",
    titulo: "Plano negou sua cirurgia?",
  });
  igual(r?.text, "Olá, vi o anúncio sobre negativa de plano de saúde", "o texto não pode se perder: ");
});

teste("mensagem sem anúncio não inventa origem", () => {
  const r = parseEntradaEvolution(doAnuncio(false));
  igual(r?.anuncio, undefined, "sem contexto de anúncio: ");
  igual(r?.text, "Olá, vi o anúncio sobre negativa de plano de saúde", "e o texto continua lá: ");
});

void resumo("whatsapp");
