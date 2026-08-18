import { PrismaClient, type Prisma } from "@prisma/client";
import { isMaskedSupportRequest, getActingSupportSession } from "@/lib/supportContext";
import { maskReadResult } from "@/lib/supportMaskingApply";

// Ponto ÚNICO de interceptação do "Vidro Fosco".
//
// Existem ~1.042 chamadas prisma.<model>.<op> em 164 arquivos. Mascarar tela a tela seria
// inviável e — pior — daria a impressão de estar completo enquanto vazasse na primeira tela
// nova que alguém escrevesse. Uma extensão de client resolve isso de uma vez: toda leitura,
// venha de onde vier (Server Component, Server Action, route handler, ou código escrito amanhã
// por quem nunca ouviu falar deste arquivo), passa por aqui.

// Só operações de LEITURA. Escrita não é MASCARADA de propósito: mascarar o retorno de um
// create/update faria a tela exibir o dado redigido como se fosse o que acabou de ser gravado,
// o que confunde mais do que protege (o dado de entrada já era conhecido de quem escreveu). O
// freio de escrita do suporte é outro: lib/currentUser.ts deixou de forçar isAdmin. Não mascarar
// não é o mesmo que não REGISTRAR, porém — ver WRITE_OPERATIONS mais abaixo (action: "ESCRITA"),
// achado A33 da revisão gauntlet.
const READ_OPERATIONS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "aggregate",
  "groupBy",
]);

// Escrita durante uma sessão mascarada é PERMITIDA (lib/currentUser.ts só tira isAdmin, não
// bloqueia create/update/delete) — mas até este achado, nenhuma delas era registrada. O
// escritório-cliente não tinha como saber, nem provar, que uma alteração nos seus dados partiu
// do suporte e não da própria equipe (achado A33 da revisão gauntlet). upsert entra porque pode
// ser create OU update dependendo do estado da linha — o escritório precisa saber dos dois.
const WRITE_OPERATIONS = new Set(["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"]);

// Modelos da PRÓPRIA infraestrutura de acesso de suporte — nunca contam como "escrita no
// escritório-cliente". Sem esta exclusão, ENCERRAR uma sessão (AccessAuditLog action: SAIDA,
// gravado com o cookie ainda presente — só é apagado DEPOIS) ou revelar um registro (LEITURA,
// gravado dentro da própria janela mascarada) se autorreferenciariam: cada ENTRADA/SAIDA/LEITURA
// geraria uma ESCRITA extra sobre o próprio AccessAuditLog, ruído em vez de sinal.
const SUPPORT_BOOKKEEPING_MODELS = new Set(["AccessAuditLog", "AccessSession", "AccessRequest", "SupportTicket"]);

function extractAffectedId(args: unknown, result: unknown): string | null {
  if (result && typeof result === "object" && "id" in result) {
    const id = (result as { id?: unknown }).id;
    if (typeof id === "string") return id;
  }
  const where = (args as { where?: { id?: unknown } } | null | undefined)?.where;
  if (where && typeof where.id === "string") return where.id;
  return null;
}

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
          if (READ_OPERATIONS.has(operation)) {
            // Checagem de cookie, síncrona e sem ida ao banco (ver lib/supportContext.ts). Para
            // o usuário comum, isso é o custo total da funcionalidade.
            if (!isMaskedSupportRequest()) return result;
            return maskReadResult(model, result);
          }
          if (WRITE_OPERATIONS.has(operation) && !SUPPORT_BOOKKEEPING_MODELS.has(model) && isMaskedSupportRequest()) {
            const session = getActingSupportSession();
            if (session) {
              const count = result && typeof result === "object" && "count" in result ? (result as { count: unknown }).count : null;
              // `base`, não `query`/o client estendido: grava pelo client CRU, do mesmo jeito
              // que prismaBase existe pro quebra-vidro — senão este próprio create recursaria de
              // volta na extensão (que ignoraria de qualquer forma, por SUPPORT_BOOKKEEPING_
              // MODELS, mas não vale o risco de depender disso). AWAIT (não fire-and-forget): em
              // ambiente serverless a função pode congelar assim que a resposta é enviada, e um
              // registro de auditoria "disparado e esquecido" pode nunca terminar de gravar —
              // mas o catch garante que uma falha aqui nunca derruba nem desfaz a escrita real,
              // que já aconteceu (query(args) já resolveu, acima); é um buraco na auditoria, não
              // motivo para barrar uma escrita legítima.
              await base.accessAuditLog
                .create({
                  data: {
                    officeId: session.officeId,
                    action: "ESCRITA",
                    scopeType: model,
                    scopeId: extractAffectedId(args, result),
                    sessionId: session.sessionId,
                    detail: typeof count === "number" ? `${operation} (count=${count})` : operation,
                  },
                })
                .catch((err) => console.error("vidro-fosco: falha ao registrar escrita durante sessão de suporte", err));
            }
          }
          return result;
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

const globalForPrisma = global as unknown as { prisma: AppPrismaClient; prismaBase: PrismaClient };

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// ---------------------------------------------------------------------------------------------
// `prismaBase` — client BASE, SEM a extensão "Vidro Fosco". USO EXCLUSIVO do fluxo de
// quebra-vidro POR REGISTRO (Fase B): lib/breakGlass.ts, e mais especificamente só a função
// `revelarRegistro` de lá.
//
// QUALQUER outra leitura feita com este client sai SEM máscara, mesmo dentro de uma sessão de
// suporte mascarada — porque é exatamente isso que ele é: o Prisma cru, sem a extensão que
// aplica maskReadResult (ver createPrismaClient acima). Se você chegou aqui pensando em importar
// `prismaBase` de qualquer outro arquivo, pare: use `prisma` (o client mascarado, a exportação
// de cima). Precisar ver o dado real é, por definição, um caso de quebra-vidro — e quebra-vidro
// só existe através de lib/breakGlass.ts, com AccessSession + AccessRequest APROVADO conferidos
// e AccessAuditLog (action: "LEITURA") gravado na mesma transação da leitura, "falha fecha".
//
// Por que um client SEPARADO em vez de reaproveitar o `base` de dentro de createPrismaClient():
// createPrismaClient() é a fábrica usada também por scripts de linha de comando (prisma/seed.ts,
// scripts/migrate-from-legacy.ts) que quase sempre querem SÓ o client mascarado (que fora de
// requisição já é um no-op, ver comentário acima) — não vale a pena mexer nessa fábrica para
// expor o `base` interno dela só para os pouquíssimos chamadores do quebra-vidro. Uma conexão a
// mais no pool é custo aceitável pelo isolamento: fica impossível confundir os dois clients por
// engano, porque são dois objetos exportados com nomes diferentes, não dois estados do mesmo
// objeto.
export const prismaBase: PrismaClient =
  globalForPrisma.prismaBase ||
  new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prismaBase = prismaBase;
