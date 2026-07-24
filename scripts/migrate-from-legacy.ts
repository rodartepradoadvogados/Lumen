/**
 * Migra os dados do site legado (rp-financeiro) para um Office do Lúmen — versão de linha de
 * comando. A lógica de fato mora em lib/legacyMigration.ts (compartilhada com a rota HTTP em
 * app/api/admin/migrate-legacy/route.ts, para quando só há acesso a um navegador).
 *
 * Uso:
 *   SOURCE_DATABASE_URL="postgresql://.../rp_financeiro_prod" \
 *   DATABASE_URL="postgresql://.../lumen_prod" \
 *   TARGET_OFFICE_SLUG="rodarte-prado-advogados" \
 *   npx tsx scripts/migrate-from-legacy.ts
 *
 * Variáveis opcionais:
 *   TARGET_OFFICE_NAME (default "Rodarte Prado Advogados")
 *   TARGET_OFFICE_SLUG (default "rodarte-prado-advogados")
 */

import { PrismaClient } from "@prisma/client";
import { migrarDadosLegado } from "../lib/legacyMigration";

const SOURCE_URL = process.env.SOURCE_DATABASE_URL;
const DEST_URL = process.env.DATABASE_URL;

if (!SOURCE_URL) {
  console.error("Defina SOURCE_DATABASE_URL (banco do rp-financeiro, só leitura).");
  process.exit(1);
}
if (!DEST_URL) {
  console.error("Defina DATABASE_URL (banco do Lúmen, destino).");
  process.exit(1);
}

async function main() {
  const destDb = new PrismaClient({ datasources: { db: { url: DEST_URL } } });
  try {
    const result = await migrarDadosLegado({
      sourceUrl: SOURCE_URL!,
      destDb,
      officeSlug: process.env.TARGET_OFFICE_SLUG || "rodarte-prado-advogados",
      officeName: process.env.TARGET_OFFICE_NAME || "Rodarte Prado Advogados",
    });
    result.lines.forEach((line) => console.log(line));
  } finally {
    await destDb.$disconnect();
  }
}

main().catch((err) => {
  console.error("\nFALHOU:", err instanceof Error ? err.message : err);
  process.exit(1);
});
