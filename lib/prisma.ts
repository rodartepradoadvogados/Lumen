import { PrismaClient, type Prisma } from "@prisma/client";
import { isMaskedSupportRequest } from "@/lib/supportContext";
import { maskReadResult } from "@/lib/supportMaskingApply";

// Ponto ÚNICO de interceptação do "Vidro Fosco".
//
// Existem ~1.042 chamadas prisma.<model>.<op> em 164 arquivos. Mascarar tela a tela seria
// inviável e — pior — daria a impressão de estar completo enquanto vazasse na primeira tela
// nova que alguém escrevesse. Uma extensão de client resolve isso de uma vez: toda leitura,
// venha de onde vier (Server Component, Server Action, route handler, ou código escrito amanhã
// por quem nunca ouviu falar deste arquivo), passa por aqui.

// Só operações de LEITURA. Escrita não é mascarada de propósito: mascarar o retorno de um
// create/update faria a tela exibir o dado redigido como se fosse o que acabou de ser gravado,
// o que confunde mais do que protege (o dado de entrada já era conhecido de quem escreveu). O
// freio de escrita do suporte é outro: lib/currentUser.ts deixou de forçar isAdmin.
const READ_OPERATIONS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "aggregate",
  "groupBy",
]);

// Fábrica ÚNICA de client no projeto. É exportada para que os pontos de entrada de linha de
// comando (prisma/seed.ts, scripts/migrate-from-legacy.ts), que precisam de uma conexão própria,
// construam exatamente o mesmo formato de client do app em vez de um `new PrismaClient()` cru —
// senão os tipos divergem (client estendido não é atribuível a PrismaClient) e, pior, passaria a
// existir mais de um formato de client circulando pelo código.
//
// Fora de requisição a extensão é um no-op: isMaskedSupportRequest() devolve false porque
// cookies() lança sem escopo de requisição (verificado sob tsx). Ou seja, seed e migração
// continuam vendo dado cru, como devem.
export function createPrismaClient(options?: Prisma.PrismaClientOptions) {
  const base = new PrismaClient(
    options ?? { log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"] }
  );

  return base.$extends({
    name: "vidro-fosco",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const result = await query(args);
          if (!READ_OPERATIONS.has(operation)) return result;
          // Checagem de cookie, síncrona e sem ida ao banco (ver lib/supportContext.ts). Para
          // o usuário comum, isso é o custo total da funcionalidade.
          if (!isMaskedSupportRequest()) return result;
          return maskReadResult(model, result);
        },
      },
    },
  });
}

// O client do app NÃO é mais um `PrismaClient` puro: $extends devolve um tipo próprio, sem
// $on/$use. Quem precisar anotar "recebo o client da aplicação" deve usar este tipo em vez de
// `PrismaClient` — senão o TypeScript reclama de $on/$use faltando.
export type AppPrismaClient = ReturnType<typeof createPrismaClient>;

// O client de dentro de um $transaction(async (tx) => ...). É o AppPrismaClient menos os
// métodos que não fazem sentido dentro de uma transação — exatamente o que o Prisma chama de
// ITXClientDenyList. Use este tipo (e não AppPrismaClient) em helpers que aceitam tanto o client
// normal quanto um `tx`: como ele tem MENOS métodos, o client completo também é atribuível a
// ele, então um único parâmetro cobre os dois casos.
export type AppPrismaTx = Omit<
  AppPrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

const globalForPrisma = global as unknown as { prisma: AppPrismaClient };

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
