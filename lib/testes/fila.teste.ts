import { teste, igual, verdade, resumo } from "./executar";
import {
  montarFila,
  proximoDaFila,
  paraQuemVai,
  filaDoGatilho,
  dentroDoExpediente,
  agoraNoEscritorio,
  type PessoaDaFila,
} from "@/lib/filaDeTransferencia";

// ============================================================================
// A FILA E O RELÓGIO.
//
// Errar aqui manda a conversa de um cliente para a pessoa errada, ou para ninguém — e é um
// defeito que funciona nas três primeiras vezes e some na quarta, quando a volta fecha. É por
// isso que a volta inteira é testada, e não só "o próximo".
//
// O EXPEDIENTE É TESTADO COM FUSO DE VERDADE. O servidor roda em UTC; "08:00" comparado com a
// hora UTC faria o expediente de Goiânia começar às cinco da manhã. O sintoma seria "o lead da
// manhã não foi repassado", que não aponta para o relógio de jeito nenhum.
// ============================================================================

let n = 0;
function pessoa(over: Partial<PessoaDaFila> = {}): PessoaDaFila {
  n += 1;
  return {
    id: `p${n}`,
    nome: `Pessoa ${n}`,
    papel: "Advogado",
    ativo: true,
    isAdmin: true,
    recebeTransferencia: true,
    criadoEm: new Date(2026, 0, n),
    ...over,
  };
}

// ── Quem entra ───────────────────────────────────────────────────────────────────────────────

teste("só entra quem está marcado, ativo e com o papel certo", () => {
  const todos = [
    pessoa({ id: "a", papel: "Advogado" }),
    pessoa({ id: "b", papel: "Advogado", recebeTransferencia: false }),
    pessoa({ id: "c", papel: "Advogado", ativo: false }),
    pessoa({ id: "d", papel: "Estagiário" }),
    pessoa({ id: "e", papel: "Sócio" }),
  ];
  igual(montarFila(todos, "ADVOGADOS").map((p) => p.id), ["a", "e"], "sócio é advogado do escritório: ");
});

teste("os dois nomes do papel de recepção convivem", () => {
  // O rótulo mudou; quem já estava cadastrado continua com o valor antigo no banco. Aceitar os
  // dois evita uma migração de dados cujo único desfecho ruim é a recepção sumir da fila.
  const todos = [
    pessoa({ id: "velha", papel: "Recepcionista" }),
    pessoa({ id: "nova", papel: "Recepcionista/Secretária" }),
    pessoa({ id: "semAcento", papel: "recepcionista/secretaria" }),
    pessoa({ id: "advogado", papel: "Advogado" }),
  ];
  igual(montarFila(todos, "RECEPCAO").map((p) => p.id), ["velha", "nova", "semAcento"]);
});

teste("a ordem é a de cadastro, não a do banco", () => {
  const fila = montarFila(
    [
      pessoa({ id: "terceiro", criadoEm: new Date(2026, 5, 1) }),
      pessoa({ id: "primeiro", criadoEm: new Date(2026, 0, 1) }),
      pessoa({ id: "segundo", criadoEm: new Date(2026, 2, 1) }),
    ],
    "ADVOGADOS",
  );
  igual(fila.map((p) => p.id), ["primeiro", "segundo", "terceiro"]);
});

// ── O rodízio ────────────────────────────────────────────────────────────────────────────────

teste("o rodízio dá a volta inteira e recomeça", () => {
  const fila = [pessoa({ id: "a" }), pessoa({ id: "b" }), pessoa({ id: "c" })];
  let ultimo: string | null = null;
  const ordem: string[] = [];
  for (let i = 0; i < 7; i++) {
    const escolhido: PessoaDaFila = proximoDaFila(fila, ultimo)!;
    ordem.push(escolhido.id);
    ultimo = escolhido.id;
  }
  // A quarta volta ao começo: é aqui que uma cascata disfarçada de rodízio apareceria.
  igual(ordem, ["a", "b", "c", "a", "b", "c", "a"]);
});

teste("quem entra depois vai para o FIM, e não fura a fila", () => {
  const fila = montarFila(
    [
      pessoa({ id: "a", criadoEm: new Date(2026, 0, 1) }),
      pessoa({ id: "b", criadoEm: new Date(2026, 0, 2) }),
      pessoa({ id: "novo", criadoEm: new Date(2026, 8, 19) }),
    ],
    "ADVOGADOS",
  );
  igual(proximoDaFila(fila, "a")?.id, "b", "depois de a vem b, não o novo: ");
  igual(proximoDaFila(fila, "b")?.id, "novo", "e só então o novo: ");
});

teste("se quem recebeu por último saiu da fila, recomeça do princípio", () => {
  // Desmarcado, desativado ou com o papel trocado desde a última vez. Não dá para achar a
  // posição dele — e a resposta certa é começar do começo, nunca não entregar a ninguém.
  const fila = [pessoa({ id: "a" }), pessoa({ id: "b" })];
  igual(proximoDaFila(fila, "sumiu")?.id, "a");
});

teste("fila vazia não devolve ninguém", () => {
  igual(proximoDaFila([], "a"), null);
});

// ── O roteamento ─────────────────────────────────────────────────────────────────────────────

teste("o gatilho decide a fila, e não o agente", () => {
  igual(filaDoGatilho("RISCO"), "ADVOGADOS", "risco: ");
  igual(filaDoGatilho("PEDIDO"), "ADVOGADOS", "pediu advogado: ");
  igual(filaDoGatilho("ROTEIRO"), "ADVOGADOS", "triagem concluída: ");
  igual(filaDoGatilho("FORA_DO_ESCOPO"), "RECEPCAO", "fora do escopo: ");
  igual(filaDoGatilho("TETO"), "RECEPCAO", "estourou o teto: ");
});

const SEM_CURSOR = { ultimoAdvogadoId: null, ultimaRecepcaoId: null };

teste("genérico sem recepção cadastrada cai nos advogados", () => {
  const r = paraQuemVai([pessoa({ id: "adv", papel: "Advogado" })], "TETO", SEM_CURSOR);
  verdade(r.pessoa !== null, "tinha que achar alguém");
  igual(r.pessoa?.id, "adv");
  igual((r as { fila: string }).fila, "ADVOGADOS");
});

teste("triado SEM advogado NÃO cai na recepção", () => {
  // A reserva só existe num sentido. Entregar caso já triado a quem não pode dar andamento é
  // pior do que segurá-lo e avisar que ninguém está marcado.
  const r = paraQuemVai([pessoa({ id: "rec", papel: "Recepcionista/Secretária" })], "ROTEIRO", SEM_CURSOR);
  igual(r.pessoa, null);
  verdade((r as { motivo: string }).motivo.includes("advogado"), "o motivo tem que dizer que faltou advogado");
});

teste("a campanha pode mandar a fila, e ela vence o gatilho", () => {
  const pessoas = [pessoa({ id: "adv", papel: "Advogado" }), pessoa({ id: "rec", papel: "Recepcionista" })];
  igual(paraQuemVai(pessoas, "ROTEIRO", SEM_CURSOR, "RECEPCAO").pessoa?.id, "rec", "campanha manda na recepção: ");
  igual(paraQuemVai(pessoas, "TETO", SEM_CURSOR, "ADVOGADOS").pessoa?.id, "adv", "campanha manda no advogado: ");
});

teste("ninguém marcado: não entrega, e diz por quê", () => {
  const r = paraQuemVai([pessoa({ id: "x", recebeTransferencia: false })], "TETO", SEM_CURSOR);
  igual(r.pessoa, null);
  verdade((r as { motivo: string }).motivo.length > 10, "o motivo tem que ser legível");
});

teste("as duas filas andam com cursores separados", () => {
  const pessoas = [
    pessoa({ id: "a1", papel: "Advogado", criadoEm: new Date(2026, 0, 1) }),
    pessoa({ id: "a2", papel: "Advogado", criadoEm: new Date(2026, 0, 2) }),
    pessoa({ id: "r1", papel: "Recepcionista", criadoEm: new Date(2026, 0, 3) }),
    pessoa({ id: "r2", papel: "Recepcionista", criadoEm: new Date(2026, 0, 4) }),
  ];
  const cursores = { ultimoAdvogadoId: "a1", ultimaRecepcaoId: "r2" };
  igual(paraQuemVai(pessoas, "ROTEIRO", cursores).pessoa?.id, "a2", "advogados: ");
  // A recepção deu a volta; o cursor dos advogados não pode interferir.
  igual(paraQuemVai(pessoas, "TETO", cursores).pessoa?.id, "r1", "recepção: ");
});

// ── O expediente, com fuso de verdade ────────────────────────────────────────────────────────

const GOIANIA = { dias: "1,2,3,4,5", inicio: "08:00", fim: "18:00", fuso: "America/Sao_Paulo" };

teste("o expediente é lido no fuso do escritório, não em UTC", () => {
  // 19/09/2026 é um sábado; uso a quinta 17/09 para os testes de hora.
  // 12:00 UTC = 09:00 em Brasília → dentro. 09:00 UTC = 06:00 → fora.
  verdade(dentroDoExpediente(GOIANIA, new Date("2026-09-17T12:00:00Z")), "09h de Brasília é expediente");
  verdade(!dentroDoExpediente(GOIANIA, new Date("2026-09-17T09:00:00Z")), "06h de Brasília NÃO é expediente");
  // Se o código comparasse em UTC, 09:00Z passaria por "09:00 local" e este caso falharia.
});

teste("a conversão de fuso devolve o dia e a hora certos", () => {
  const r = agoraNoEscritorio(new Date("2026-09-17T12:00:00Z"), "America/Sao_Paulo");
  igual(r.diaDaSemana, 4, "quinta-feira: ");
  igual(r.minutos, 9 * 60, "09:00: ");
  // Rio Branco é UTC-5: as mesmas 12:00Z são 07:00 lá, ainda fora do expediente.
  igual(agoraNoEscritorio(new Date("2026-09-17T12:00:00Z"), "America/Rio_Branco").minutos, 7 * 60, "Acre: ");
});

teste("fim de semana está fora, e o sábado do escritório pode ser ligado", () => {
  const sabado = new Date("2026-09-19T15:00:00Z"); // 12:00 em Brasília
  verdade(!dentroDoExpediente(GOIANIA, sabado), "sábado fora por padrão");
  verdade(dentroDoExpediente({ ...GOIANIA, dias: "1,2,3,4,5,6" }, sabado), "com sábado marcado, dentro");
});

teste("as bordas do expediente", () => {
  const as8 = new Date("2026-09-17T11:00:00Z"); // 08:00
  const as18 = new Date("2026-09-17T21:00:00Z"); // 18:00
  verdade(dentroDoExpediente(GOIANIA, as8), "08:00 em ponto está DENTRO");
  verdade(!dentroDoExpediente(GOIANIA, as18), "18:00 em ponto está FORA — o expediente acabou");
});

teste("fuso escrito errado não para o relógio", () => {
  // Um campo de texto torto não pode fazer a transferência deixar de acontecer.
  verdade(
    dentroDoExpediente({ ...GOIANIA, fuso: "Fuso/Inexistente" }, new Date("2026-09-17T12:00:00Z")),
    "cai no padrão de Brasília em vez de lançar",
  );
});

void resumo("fila");
