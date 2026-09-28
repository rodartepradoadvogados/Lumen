import { teste, igual, verdade, resumo } from "./executar";
import { avaliarCandidatos, validarNovoVinculo, ehSessaoAvulsa, type ItemDeContexto } from "@/lib/peticionamentoContexto";

// A TRAVA DE CLIENTE — hard gate de sigilo profissional (especificação §8). Metade dos testes
// desta suíte mira diretamente este hard gate, por pedido explícito do escritório.

const maria: ItemDeContexto = { id: "p1", tipo: "case", clienteId: "cli-maria", clienteNome: "Maria Aparecida Souza Lima" };
const construtora: ItemDeContexto = { id: "p2", tipo: "case", clienteId: "cli-construtora", clienteNome: "Construtora Serra Dourada Ltda." };
const semCliente: ItemDeContexto = { id: "p3", tipo: "attendance", clienteId: null, clienteNome: null };

teste("sem cliente travado ainda: item com cliente identificado fica liberado", () => {
  const [r] = avaliarCandidatos([maria], null);
  igual(r.bloqueado, false);
});

teste("sem cliente travado ainda: item SEM cliente identificado fica bloqueado (fail-closed)", () => {
  const [r] = avaliarCandidatos([semCliente], null);
  igual(r.bloqueado, true);
  verdade(!!r.motivoBloqueio, "deveria ter motivo de bloqueio");
});

teste("HARD GATE: cliente travado — item do MESMO cliente libera", () => {
  const [r] = avaliarCandidatos([maria], "cli-maria");
  igual(r.bloqueado, false);
});

teste("HARD GATE: cliente travado — item de cliente DIFERENTE bloqueia sempre", () => {
  const [r] = avaliarCandidatos([construtora], "cli-maria");
  igual(r.bloqueado, true);
  verdade(r.motivoBloqueio!.includes("Construtora Serra Dourada"), "motivo deve nomear o cliente do item bloqueado");
  verdade(r.motivoBloqueio!.includes("não é permitido"), "motivo deve deixar claro que é proibido, não sugestão");
});

teste("HARD GATE: validarNovoVinculo recusa cliente diferente do já travado", () => {
  const resultado = validarNovoVinculo({ id: "cli-maria", nome: "Maria Aparecida Souza Lima" }, construtora);
  igual(resultado.ok, false);
  if (!resultado.ok) verdade(resultado.erro.includes("diferente"), "erro deve explicar o motivo");
});

teste("HARD GATE: validarNovoVinculo aceita o mesmo cliente já travado", () => {
  const resultado = validarNovoVinculo({ id: "cli-maria", nome: "Maria Aparecida Souza Lima" }, maria);
  igual(resultado.ok, true);
});

teste("HARD GATE: validarNovoVinculo recusa item sem cliente identificado, mesmo sem trava ainda", () => {
  const resultado = validarNovoVinculo(null, semCliente);
  igual(resultado.ok, false);
});

teste("validarNovoVinculo aceita o primeiro vínculo de uma sessão nova (sem trava ainda)", () => {
  const resultado = validarNovoVinculo(null, maria);
  igual(resultado.ok, true);
  if (resultado.ok) igual(resultado.clienteId, "cli-maria");
});

teste("sessão avulsa: nenhum vínculo é válida por definição de produto", () => {
  igual(ehSessaoAvulsa({ caseIds: [], attendanceIds: [], assessoriaIds: [] }), true);
  igual(ehSessaoAvulsa({ caseIds: ["a"], attendanceIds: [], assessoriaIds: [] }), false);
});

resumo("Peticionamento — trava de cliente");
