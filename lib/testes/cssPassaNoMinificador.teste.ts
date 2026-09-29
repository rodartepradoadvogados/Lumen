import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { teste, verdade, resumo } from "./executar";

// O build de produção da Vercel passa o CSS por cssnano-simple, que RECUSA CSS malformado ("Expected a
// pseudo-class or pseudo-element") e derruba o deploy inteiro. O `tsc` e o `eslint` não olham CSS. Foi assim
// que um comentário restaurado pela metade (sem o "/*") quebrou o build. Aqui o mesmo caminho: o Tailwind gera
// o CSS e o minificador do Next tem de aceitá-lo.

teste("O CSS gerado passa pelo minificador do Next (o mesmo do build de produção)", () => {
  const dir = mkdtempSync(join(tmpdir(), "css-"));
  const saida = join(dir, "saida.css");
  execFileSync("npx", ["tailwindcss", "-i", "app/globals.css", "-o", saida], { cwd: process.cwd(), stdio: "pipe" });
  const css = readFileSync(saida, "utf8");
  const script = `
    const c = require("next/dist/compiled/cssnano-simple");
    const postcss = require("postcss");
    postcss([c()]).process(require("fs").readFileSync(process.argv[1], "utf8"), { from: undefined })
      .then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
  `;
  let ok = true;
  let motivo = "";
  try {
    execFileSync(process.execPath, ["-e", script, saida], { cwd: process.cwd(), stdio: "pipe" });
  } catch (e) {
    ok = false;
    motivo = String((e as { stderr?: Buffer }).stderr ?? e);
  }
  verdade(css.length > 1000, "o Tailwind não gerou CSS");
  verdade(ok, `o minificador recusou o CSS: ${motivo.trim()}`);
});

resumo("CSS: o minificador de produção aceita o CSS gerado");
