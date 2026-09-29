import { createHash } from "node:crypto";

// Só no servidor (usa o `crypto` do Node): o aparelho nunca calcula isto. Fica fora de
// lib/envioDeMensagem.ts justamente para esse arquivo poder ir para o navegador.
export function hashDoTexto(texto: string): string {
  return createHash("sha256").update(texto, "utf8").digest("hex");
}
