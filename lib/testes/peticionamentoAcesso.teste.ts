import { teste, igual, resumo } from "./executar";
import { podeAcessarAba, podeGerarRascunho, podeAnexar, avaliarExportacao, podeExportar, podeTreinarSkillDoPerfil } from "@/lib/peticionamentoAcesso";

// QUEM PODE (especificação §4) — metade+ destes testes mira os hard gates de permissão:
// recepção nunca entra; só advogado COM OAB exporta; estagiário nunca exporta mesmo tendo
// gerado a minuta inteira.

const advogado = { role: "Advogado", oab: "GO 34.221" };
const advogadoSemOab = { role: "Advogado", oab: "" };
const socio = { role: "Sócio", oab: "GO 11.111", isAdmin: true };
const estagiario = { role: "Estagiário", oab: null };
const financeiro = { role: "Financeiro", oab: null };
const recepcaoNova = { role: "Recepcionista/Secretária", oab: null };
const recepcaoAntiga = { role: "Recepcionista", oab: null };
const desconhecido = { role: "Coordenador", oab: null };

teste("HARD GATE: recepção nunca acessa a aba, nos dois rótulos (novo e antigo)", () => {
  igual(podeAcessarAba(recepcaoNova), false);
  igual(podeAcessarAba(recepcaoAntiga), false);
});

teste("advogado e estagiário acessam a aba", () => {
  igual(podeAcessarAba(advogado), true);
  igual(podeAcessarAba(estagiario), true);
});

teste("papel desconhecido, sem isAdmin, não acessa (fail-closed)", () => {
  igual(podeAcessarAba(desconhecido), false);
  igual(podeAcessarAba(financeiro), false);
});

teste("gerar rascunho: advogado ou estagiário — mesma régua de acessar a aba", () => {
  igual(podeGerarRascunho(advogado), true);
  igual(podeGerarRascunho(estagiario), true);
  igual(podeGerarRascunho(recepcaoNova), false);
});

teste("anexar documento: MESMA régua de gerar — especificação §4 explícita sobre isso", () => {
  igual(podeAnexar(estagiario), podeGerarRascunho(estagiario));
  igual(podeAnexar(advogado), podeGerarRascunho(advogado));
  igual(podeAnexar(recepcaoNova), false);
});

teste("HARD GATE: estagiário NUNCA exporta, mesmo tendo gerado e editado a minuta inteira", () => {
  igual(podeExportar(estagiario), false);
  igual(avaliarExportacao(estagiario).motivo!.includes("Só advogado com OAB"), true);
});

teste("HARD GATE: advogado SEM OAB cadastrada não exporta — a trava é habilitação, não cargo", () => {
  igual(podeExportar(advogadoSemOab), false);
});

teste("HARD GATE: isAdmin sozinho não basta para exportar sem ser advogado", () => {
  igual(podeExportar({ role: "Financeiro", oab: null, isAdmin: true }), false);
});

teste("advogado com OAB, e sócio com OAB, exportam", () => {
  igual(podeExportar(advogado), true);
  igual(podeExportar(socio), true);
});

teste("papel é normalizado (espaço, maiúscula) antes de comparar", () => {
  igual(podeExportar({ role: "  advogado  ", oab: "GO 1" }), true);
  igual(podeAcessarAba({ role: "ESTAGIÁRIO", oab: null }), true);
});

// ── ACHADO REAL, achado em navegador com dado de staging (não hipotético) ────────────────────
// Uma estagiária de verdade, cadastrada como "Estagiária" (feminino — a forma que o próprio
// cadastro de equipe usa; ver lib/testes/equipeFormato.teste.ts, que já testa "Advogada"), ficou
// bloqueada da aba INTEIRA na primeira passada deste módulo, que só reconhecia "Estagiário"
// masculino. Regressão trancada aqui para nunca mais escapar de um teste de mesa.
teste("HARD GATE: concordância de gênero — Advogada/Estagiária (feminino) têm exatamente os mesmos direitos que a forma masculina", () => {
  igual(podeAcessarAba({ role: "Estagiária", oab: null }), true);
  igual(podeGerarRascunho({ role: "Estagiária", oab: null }), true);
  igual(podeAnexar({ role: "Estagiária", oab: null }), true);
  igual(podeExportar({ role: "Estagiária", oab: null }), false); // continua sem poder exportar — só muda o gênero, não o papel
  igual(podeAcessarAba({ role: "Advogada", oab: "GO 1" }), true);
  igual(podeExportar({ role: "Advogada", oab: "GO 1" }), true);
  igual(podeExportar({ role: "Sócia", oab: "GO 1" }), true);
});

teste("treinar/editar skill do perfil: só quem tem isPlatformOwner (Jairo e Rodrigo)", () => {
  igual(podeTreinarSkillDoPerfil({ role: "Advogado", oab: "x", isAdmin: true, isPlatformOwner: false }), false);
  igual(podeTreinarSkillDoPerfil({ role: "Advogado", oab: "x", isPlatformOwner: true }), true);
});

resumo("Peticionamento — controle de acesso");
