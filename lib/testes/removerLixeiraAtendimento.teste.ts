import { readFileSync } from "node:fs";
import { teste, verdade, resumo, codigoDe } from "./executar";

// ============================================================================
// SEM LIXEIRA NO ATENDIMENTO (F5.5, item 2) — "tirar lixeira de excluir, pois a ação de perder o
// cliente e arquivar já cobrem tudo, e é um risco perder a conversa". Três lugares tinham que
// perder a capacidade junto, não só o botão da tela: as DUAS telas que ofereciam o botão, e o
// próprio backend de exclusão (lib/actions/deletion.ts) — sem o terceiro, uma chamada direta à
// Server Action (ela é um endereço HTTP, ver o comentário de cabeçalho de
// lib/actions/attendance.ts) ainda apagaria a conversa.
// ============================================================================

teste("o backend de exclusão não conhece mais ATTENDANCE", () => {
  const fonte = codigoDe(readFileSync("lib/actions/deletion.ts", "utf8"));
  verdade(!fonte.includes('"ATTENDANCE"'), 'lib/actions/deletion.ts ainda tem "ATTENDANCE" em algum lugar do código');
});

teste("o botão de excluir não tem ATTENDANCE na lista de tipos que aceita", () => {
  const fonte = codigoDe(readFileSync("components/DeleteEntityButton.tsx", "utf8"));
  verdade(!fonte.includes('"ATTENDANCE"'), "DeleteEntityButton.tsx ainda aceita ATTENDANCE como entityType");
});

teste("a lista de atendimentos não oferece mais o botão de excluir", () => {
  const fonte = readFileSync("app/(app)/atendimento/page.tsx", "utf8");
  verdade(!fonte.includes("DeleteEntityButton"), "a lista de atendimentos ainda importa/usa DeleteEntityButton");
});

teste("a ficha do atendimento não oferece mais o botão de excluir O ATENDIMENTO", () => {
  const fonte = readFileSync("app/(app)/atendimento/[id]/page.tsx", "utf8");
  // NÃO testa ausência total de "DeleteEntityButton" — a ficha ainda usa o componente para
  // excluir TAREFAS vinculadas (entityType="TASK"), que é outra entidade e continua com lixeira.
  // O que não pode mais existir é a combinação com entityType="ATTENDANCE".
  verdade(!fonte.includes('entityType="ATTENDANCE"'), "a ficha do atendimento ainda oferece excluir o atendimento");
  verdade(fonte.includes('entityType="TASK"'), "a exclusão de tarefa sumiu junto — não deveria (regra é só sobre ATTENDANCE)");
});

// ── O PEDIDO ÓRFÃO ──────────────────────────────────────────────────────────────────────────
//
// Tirar ATTENDANCE da lista deixou um buraco atrás: `performDelete` é uma escada de
// `if (entityType === ...)`, e um tipo que nenhum degrau reconhece atravessava a escada e caía no
// `return { warning }` do fim — devolvendo SUCESSO sem apagar nada. Um DeletionRequest PENDENTE
// de ATTENDANCE, gravado antes desta entrega, ainda existe no banco: aprová-lo marcaria "aprovada"
// e não apagaria coisa nenhuma, e quem aprovou acreditaria que apagou.

teste("tipo que performDelete não apaga devolve ERRO, nunca sucesso silencioso", () => {
  const fonte = codigoDe(readFileSync("lib/actions/deletion.ts", "utf8"));
  const i = fonte.indexOf("async function performDelete(");
  verdade(i >= 0, "performDelete não existe mais — o teste está lendo o arquivo errado");
  const cabeca = fonte.slice(i, i + 1600);
  verdade(
    /TIPOS_QUE_ESTA_FUNCAO_APAGA/.test(cabeca) && /!TIPOS_QUE_ESTA_FUNCAO_APAGA\.includes\(entityType\)/.test(cabeca),
    "performDelete perdeu a guarda de tipo desconhecido — tipo órfão volta a devolver sucesso sem apagar",
  );
  const iGuarda = cabeca.search(/if\s*\(\s*!TIPOS_QUE_ESTA_FUNCAO_APAGA/);
  const iPrimeiroIf = cabeca.indexOf('if (entityType === "TASK")');
  verdade(iGuarda >= 0 && iPrimeiroIf > iGuarda, "a guarda não vem ANTES da escada de tipos — calcular não é obedecer");
  verdade(/return\s*\{\s*\n?\s*error/.test(cabeca.slice(iGuarda)), "a guarda não devolve erro");
});

teste("ATTENDANCE NÃO está entre os tipos que performDelete apaga", () => {
  const fonte = codigoDe(readFileSync("lib/actions/deletion.ts", "utf8"));
  const m = fonte.match(/const TIPOS_QUE_ESTA_FUNCAO_APAGA = \[([^\]]*)\]/);
  verdade(Boolean(m), "não achei a lista de tipos");
  verdade(!/ATTENDANCE/.test(m![1]), "ATTENDANCE voltou para a lista — a lixeira do atendimento ressuscitou pelo backend");
});


resumo("sem lixeira no atendimento (F5.5)");
