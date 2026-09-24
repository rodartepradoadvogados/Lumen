import { readFileSync } from "node:fs";
import { teste, verdade, resumo, codigoDe } from "./executar";

// ============================================================================
// DOCUMENTO CLICÁVEL NO TRILHO (F5.5, item 6) — "link para abrir mesmo na barra da direita na
// conversa, pois, para abrir qualquer documento, foto, áudio, é necessário sair do Lúmen". O
// defeito era a lista de anexos ser texto puro — sem link nenhum — dentro de
// TrilhoDoAtendimento.tsx; os dois lugares que hospedam o trilho (ficha clássica e Central)
// também precisavam passar `driveUrl` para o componente poder montar o link.
// ============================================================================

teste("cada documento do trilho é um link para o driveUrl, aberto em nova aba", () => {
  const fonte = codigoDe(readFileSync("components/atendimento/TrilhoDoAtendimento.tsx", "utf8"));
  verdade(fonte.includes("href={doc.driveUrl}"), "o documento não é mais um link para o driveUrl");
  verdade(fonte.includes('target="_blank"'), "o link do documento parou de abrir em nova aba");
});

teste("as duas telas que hospedam o trilho passam driveUrl para cada anexo", () => {
  for (const caminho of ["app/(app)/atendimento/[id]/page.tsx", "app/atendimento-central/page.tsx"]) {
    const fonte = readFileSync(caminho, "utf8");
    verdade(
      fonte.includes("driveUrl: att.driveUrl"),
      `${caminho} parou de repassar driveUrl para TrilhoDoAtendimento`,
    );
  }
});

resumo("documento clicável no trilho (F5.5)");
