import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Roda TODOS os arquivos `*.teste.*` desta pasta, cada um no seu processo.
//
// Descobrir os arquivos em vez de listá-los: acrescentar um teste passa a ser criar um arquivo,
// e não editar também o package.json. O caminho mais curto para alguém não escrever o teste é ele
// exigir dois passos.
//
// Cada suíte em processo próprio porque elas mexem em variáveis de ambiente (a do agente define
// um AUTH_SECRET de mentira) e uma não pode contaminar a outra.

const aqui = dirname(fileURLToPath(import.meta.url));
const arquivos = readdirSync(aqui)
  .filter((n) => /\.teste\.(ts|tsx)$/.test(n))
  .sort();

if (arquivos.length === 0) {
  console.error("nenhum arquivo de teste encontrado em lib/testes");
  process.exit(1);
}

let falharam = 0;
for (const arquivo of arquivos) {
  const r = spawnSync(
    process.execPath,
    [join(aqui, "..", "..", "node_modules", "tsx", "dist", "cli.mjs"), "--tsconfig", "tsconfig.testes.json", join(aqui, arquivo)],
    { stdio: "inherit", cwd: join(aqui, "..", "..") },
  );
  if (r.status !== 0) falharam++;
}

if (falharam > 0) {
  console.error(`\n${falharam} de ${arquivos.length} suítes falharam.`);
  process.exit(1);
}
console.log(`\n${arquivos.length} suítes, todas passaram.`);
