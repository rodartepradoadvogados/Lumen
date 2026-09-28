import { readFileSync } from "node:fs";
import { teste, verdade, resumo, corpoDaFuncao, codigoDe } from "./executar";

// ============================================================================
// O POP-UP "QUEM É ESTA PESSOA" (F5.5, item 5) — os três caminhos que
// components/atendimento/DefinirNomeDoLead.tsx oferece (nome à mão, contato existente, novo
// cliente) só aparecem quando o nome ainda é o temporário, e os três atualizam o cadastro do
// atendimento (nunca só o cadastro novo) — ver lib/actions/contatoDoAtendimento.ts.
// ============================================================================

const fonteContato = readFileSync("lib/actions/contatoDoAtendimento.ts", "utf8");

teste("cadastrarContatoDoAtendimento usa o nome digitado no pop-up, não o nome temporário do atendimento", () => {
  const corpo = corpoDaFuncao(fonteContato, "cadastrarContatoDoAtendimento");
  verdade(corpo.length > 0, "cadastrarContatoDoAtendimento não foi encontrada");
  verdade(
    corpo.includes("nomeOverride?.trim() || a.clientName.trim()"),
    "a função voltou a usar só a.clientName, sem dar prioridade ao nome digitado no pop-up",
  );
});

teste("cadastrar um contato corrige o nome do PRÓPRIO atendimento quando ele ainda era temporário", () => {
  const corpo = corpoDaFuncao(fonteContato, "cadastrarContatoDoAtendimento");
  verdade(
    corpo.includes("nomeEhTemporario(a.clientName)"),
    "a função parou de conferir se o nome do atendimento ainda era temporário antes de corrigi-lo",
  );
});

teste("definirNomeDoLead e vincularAtendimentoAoCliente existem e reconferem o escritório", () => {
  const corpoNome = corpoDaFuncao(fonteContato, "definirNomeDoLead");
  const corpoVinculo = corpoDaFuncao(fonteContato, "vincularAtendimentoAoCliente");
  verdade(corpoNome.length > 0, "definirNomeDoLead não foi encontrada");
  verdade(corpoVinculo.length > 0, "vincularAtendimentoAoCliente não foi encontrada");
  verdade(corpoNome.includes("officeId: viewer.officeId, ...filtroDoAtendimento"), "definirNomeDoLead não reconfere o recorte por dono");
  verdade(corpoVinculo.includes("officeId: viewer.officeId, ...filtroDoAtendimento"), "vincularAtendimentoAoCliente não reconfere o recorte por dono");
});

teste("o pop-up só aparece quando o número é desconhecido E o nome ainda é temporário", () => {
  const fonte = codigoDe(readFileSync("components/atendimento/QuemEEsteNumero.tsx", "utf8"));
  verdade(
    fonte.includes("nomeEhTemporario(nomeAtual) && <DefinirNomeDoLead"),
    "QuemEEsteNumero parou de condicionar o pop-up ao nome ainda ser temporário",
  );
});

resumo("pop-up de nome do lead (F5.5)");
