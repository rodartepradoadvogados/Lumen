# Andamento da implementação — Gauntlet 2026-09

> **Instrução permanente (leia antes de qualquer ação no roteiro):**
> Sempre que for solicitada uma ação no `2026-09-roteiro-de-implementacao.md`, **leia este documento primeiro** para saber o que já foi feito. Ao final de cada etapa, **atualize este documento acrescentando abaixo** o que foi realizado — **nunca sobrescreva** o texto do que já foi realizado e aqui está documentado. Este arquivo é o histórico acumulativo do loop de trabalho; cada rodada adiciona um bloco novo, não edita os anteriores.

---

## Rodada 1 — seção 3, item 1 · G05 (primeira parte)

**Data:** 2026-09-07 · **Branch:** `fix/g05-sessao-membro-desativado` · **PR:** [#140](https://github.com/rodartepradoadvogados/Lumen/pull/140)

### O que foi feito

- **Correção de código (primeira parte do G05, conforme a ficha "Passo a passo" e "Cuidados"):** em `lib/currentUser.ts`, dentro de `getCurrentUser`, depois do `findUnique` e antes de qualquer lógica de "atuar como escritório" / suporte, foi adicionado o gate:

  ```ts
  if (!realUser.active) return null;
  ```

  O gate foi colocado **dentro de `getCurrentUser`** (e não só nos layouts) porque os layouts checam `user.active` mas **não rodam antes de Server Action nem de Route Handler** — um membro desativado continuaria agindo via POST direto (ex.: `GET /api/admin/export-office`). Devolver `null` fecha os 228 call sites de uma vez, já que todo o app trata `null` como sessão inválida. A reativação não é afetada: `toggleUserActive` lê/escreve o `User` diretamente via Prisma, sem passar por `getCurrentUser`.

- **`npx tsc --noEmit -p .`**: passa limpo.
- **`npx eslint` nos arquivos alterados**: passa limpo.

### O que NÃO foi feito nesta rodada (fica para a "segunda parte", PR separado)

Conforme o "Cuidados" da ficha — não misturar com mudança de schema:

- Campo `sessionEpoch` / `sessionsValidFrom` em `User` (schema Prisma).
- Inclusão do epoch como claim no JWT e conferência em `verifySession` (`lib/auth.ts`).
- Incremento do epoch em `toggleUserActive`, na troca de senha e no logout de todos os aparelhos.
- Redução da expiração do JWT (hoje 30 dias em `lib/auth.ts:21`).

### Bloqueio de build local (ambiental, Windows — NÃO relacionado ao G05)

`npx next build` falha **localmente no Windows** com `TypeError: Invalid URL` em `fileURLToPath`, dentro do bundle compilado de `@vercel/og` (`node_modules/next/dist/compiled/@vercel/og/index.node.js`), ao pré-renderizar os 4 ícones do PWA (`/icon`, `/apple-icon`, `/icon-192`, `/icon-512`).

Confirmado que **não é fonte** (`lib/pwaIcon.tsx` não usa fonte nem `import.meta.url`) e **não é o G05** (os ícones já existiam no commit `ca3bdc7` e deployaram em produção). É limitação conhecida do `@vercel/og`/Satori em Windows. O gate de produção (build da Vercel, Linux) **não é afetado** e passa normalmente — os ícones já estão em produção hoje.

Por causa disso, o merge local não foi feito por mim: o gate do CLAUDE.md exige `npx next build` completo, e ele não fecha em Windows. A verificação autoritativa é o build Linux (preview/produção da Vercel).

## Rodada 2 — seção 3, item 2 · G11

**Data:** 2026-09-08 · **Branch:** `feat/gauntlet-fase1-itens2-5`

### O que foi feito

- **Correção de código (G11, conforme a ficha):** em `lib/actions/deletion.ts`, as exclusões de série recorrente (tanto `PAYABLE` quanto `RECEIVABLE`) foram ajustadas. Antes, elas verificavam apenas se o status era diferente de "PAGO", o que permitia a exclusão de contas com pagamentos/recebimentos parciais (que deletava em cascata o `FinancePayment` e afetava o caixa e a DRE). Agora, o filtro utiliza a presença de pagamentos vinculados para decidir:
  ```ts
  const siblings = await prisma.payable.findMany({ where: { recurringExpenseId, officeId }, include: { payments: true } });
  // ...
  const idsParaExcluir = (includePago ? alvo : alvo.filter((s) => s.payments.length === 0)).map((s) => s.id);
  ```
  O mesmo foi feito para `RECEIVABLE`.
- Caixa correspondente no documento de roteiro (`docs/gauntlet/2026-09-roteiro-de-implementacao.md`) foi marcada como feita `[x]`.
- **`npx tsc --noEmit -p .`**: passa limpo.
- **`npx eslint` nos arquivos alterados**: passa limpo.

## Rodada 3 — seção 3, item 3 · G34

**Data:** 2026-09-08 · **Branch:** `feat/gauntlet-fase1-item3-g34`

### O que foi feito

- **Verificação do código (G34, conforme a ficha):** Foi constatado que a correção exigida pelo G34 **já estava implementada** na base de código.
  - No arquivo `components/DeleteEntityButton.tsx`, já existe a lógica que verifica `requiresConfirmation` e exibe o aviso na tela: `A operação envolve a exclusão de X pagamento(s)/recebimento(s) já baixado(s)... Você tem certeza absoluta...`.
  - No arquivo `lib/actions/deletion.ts`, a criação do `auditEvent.create({ kind: "EXCLUSAO", ... })` já está presente em diversos pontos dentro das transações de exclusão, guardando o histórico de quem apagou e os valores.
- Caixa correspondente no documento de roteiro (`docs/gauntlet/2026-09-roteiro-de-implementacao.md`) foi marcada como feita `[x]`.
- Nenhuma alteração foi necessária no código.

