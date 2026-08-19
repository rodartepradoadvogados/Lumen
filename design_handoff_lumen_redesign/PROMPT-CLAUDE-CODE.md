# Prompt de orientação — Claude Code

Cole o texto abaixo como primeira mensagem da sessão, com esta pasta
(`design_handoff_lumen_redesign/`) acessível na raiz do repositório.

---

Você vai implementar o redesenho completo do Lúmen — site e app — no repositório
`rodartepradoadvogados/Lumen`, branch `main`.

**Leia primeiro, nesta ordem, antes de escrever qualquer linha:**

1. `CLAUDE.md` na raiz — as regras de merge e o gate técnico deste projeto
2. `design_handoff_lumen_redesign/README.md` — o mapa da entrega
3. `design_handoff_lumen_redesign/01-tokens-e-tema.md` — a fonte única de verdade de cor,
   tipografia, raio e régua
4. `design_handoff_lumen_redesign/10-plano-de-execucao.md` — a ordem dos PRs
5. `docs/DESIGN-SYSTEM.md` — o manual atual, que você vai **atualizar**, não descartar

Depois leia o documento da fase em que estiver trabalhando (02 a 09).

**O que a entrega é.** Os arquivos `.dc.html` da pasta de handoff são referências de
design em HTML: wireframes de estrutura (low-fi) e mockups de tela (hi-fi). **Não copie
esse HTML para o repositório.** Recrie os desenhos no ambiente que já existe: Next.js 14
App Router, React Server Components, Tailwind com os tokens semânticos de
`app/globals.css`, Prisma, lucide-react, e os componentes que o repositório já tem
(`components/ui.tsx`, `ModalShell`, `InternalTabsBar`, server actions em `lib/actions/`).

**Regras que não se quebram:**

- Nenhum hex literal em `app/**` ou `components/**`. Toda cor vem de `globals.css` ou da
  escala do `tailwind.config.ts`. Um `#` nesses diretórios é bug de revisão.
- Raio zero em toda superfície de interface. Só `rounded-full` sobrevive, e só em avatar e
  badge de contagem.
- Régua faz o trabalho da sombra: 2px `--regua-forte` separa seções, 1px `--regua` separa
  itens de lista. Sombra só em menu suspenso, modal e card arrastado.
- Rótulo de botão alinhado à esquerda, nunca centralizado.
- `--acao-tx` sobre `--acao`, nunca `text-white` cravado.
- Ouro (`--marca`) é marca e estado ativo. Nunca fundo de botão.
- A logomarca (`components/LumenMark.tsx`) **não muda** — nem geometria, nem cor.
- Se um mockup e o documento 01 divergirem, o documento 01 vence.

**Como trabalhar:**

- Um PR por item da lista do documento 10, na ordem dada. Mudança de schema em PR próprio,
  nunca junto de UI.
- Antes de cada merge, rode o gate completo do `CLAUDE.md`:
  `rm -rf .next && npx tsc --noEmit -p .`, `npx eslint` nos arquivos alterados, e
  `npx next build`. O projeto usa `prisma db push` puro; não crie pasta de migrations.
- Mensagens de commit e de PR em português, com causa raiz, impacto e correção.
- Você tem autorização permanente do dono do projeto para mergear seus próprios PRs quando
  o gate passar limpo, inclusive mudanças em `prisma/schema.prisma`. Avise depois o que
  fez; não pergunte antes.
- No fim de cada fase, rode as varreduras do documento 10 e reporte o resultado.
- Verifique cada tela nos dois temas, Manhã e Noite.

**Onde perguntar em vez de decidir:** se um documento não cobre um caso (um estado de erro
que não está descrito, um campo que não existe no schema, uma permissão ambígua),
**pergunte**. Não invente um hex, uma medida ou uma regra de permissão. A resposta certa
para "de que cor isso fica?" quando não está nos documentos é perguntar.

**Comece pela fase 01, PR 1** (`tokens: aplica a paleta Modernist com ouro e vinho`): só
`app/globals.css`, `tailwind.config.ts` e `docs/DESIGN-SYSTEM.md`, sem mudança de layout.
Mostre o diff dos tokens antes de seguir para o PR 2.
