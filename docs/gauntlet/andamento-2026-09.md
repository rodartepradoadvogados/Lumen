# Andamento da implementação — Gauntlet 2026-09

> **Instrução permanente (leia antes de qualquer ação no roteiro):**
> Sempre que for solicitada uma ação no `2026-09-roteiro-de-implementacao.md`, **leia este documento primeiro** para saber o que já foi feito. Ao final de cada etapa, **atualize este documento acrescentando abaixo** o que foi realizado — **nunca sobrescreva** o texto do que já foi realizado e aqui está documentado. Este arquivo é o histórico acumulativo do loop de trabalho; cada rodada adiciona um bloco novo, não edita os anteriores.

---

## Rodada 1 — seção 3, item 1 · G05 (primeira parte)

**Data:** 2026-09-07 · **Branch:** `fix/g05-sessao-membro-desativado` · **PR:** _a abrir_

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
