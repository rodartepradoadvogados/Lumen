# 10 — Plano de execução

## Ordem, e por quê

| Fase | Escopo | Documentos | Por que primeiro |
| --- | --- | --- | --- |
| **01** | Tokens + casca única + painel | 01, 02, 03 | É o que todo mundo vê todo dia; sem os tokens, tudo depois nasce errado |
| **02** | Conexões + log de execução | 04 | Corta o suporte por telefone |
| **03** | Comunicados + templates | 06 | Resolve a dor declarada do aviso repetido |
| **04** | Privacidade + trilha + PWA + site | 07, 08, 09, 05 | Exige as três primeiras de pé |

Publicações (05) pode entrar na fase 02 se houver folga — não depende de nada da 02.

## PRs sugeridos

Um PR por item. Português na mensagem, com causa raiz / impacto / correção, como o
histórico do repositório já faz.

**Fase 01**
1. `tokens: aplica a paleta Modernist com ouro e vinho` — `globals.css`,
   `tailwind.config.ts`, `docs/DESIGN-SYSTEM.md`. Sem mudança de layout. É o PR que mais
   arquivos toca e o que menos risco tem; faça-o sozinho e mergeie antes dos outros.
2. `raio zero e régua de 2px` — varredura de `rounded-*` e `border` em `components/**`
3. `casca: remove os modos Régua e Bancada` — `AppShell`, `ViewModeProvider`,
   `TopMenuBar`, `SubTabsBar`, `SectionPanel`, `NavModeToggle`
4. `rail de 76px com rótulo permanente` — `NavRail`
5. `guias assumem o cluster de ações` — `GuiasBar`, `TopBarActions`
6. `paleta de comando ⌘K` — `GlobalSearch`
7. `painel: o dia primeiro` — `app/(app)/painel/page.tsx`

**Fase 02**
8. `schema: IntegrationRun` (sozinho — mudança de schema isolada)
9. `conexoes: catálogo, estado e detalhe` — rota nova
10. `conexoes: DJEN e DATAJUD com frequência e log`
11. `conexoes: gateway, armazenamento, e-mail, WhatsApp`
12. `conexoes: API keys e servidores MCP`
13. `configuracoes: remove a aba Modelos & Integrações`
14. `publicacoes: triagem com teclado`

**Fase 03**
15. `schema: NotificationPreference, NotificationOutbox, EmailTemplate`
16. `comunicados: resumo diário e exceções`
17. `comunicados: outbox e cron de agrupamento`
18. `comunicados: editor de template com prévia`

**Fase 04**
19. `schema: AuditEvent, DataSubjectRequest`
20. `privacidade: máscara padrão em lib/mask.ts`
21. `privacidade: break-glass com motivo e expiração`
22. `privacidade: trilha e pedido do titular`
23. `pwa: cinco telas`
24. `pwa: push diário`
25. `site: landing do SaaS no Modernist`

## Gate técnico antes de cada merge

Definido em `CLAUDE.md` na raiz do repositório. **Não é negociável:**

```bash
rm -rf .next && npx tsc --noEmit -p .
npx eslint <arquivos alterados>
npx next build
```

O projeto usa `prisma db push` puro (sem `prisma/migrations` versionada) e o build da
Vercel roda `prisma db push` em produção antes de virar o tráfego — então mudança de
schema é segura de mergear sozinha, desde que o gate passe. Mesmo assim: **um PR por
mudança de schema**, nunca junto de UI.

## Varreduras que fecham a migração

Rode e zere cada uma antes de considerar a fase 01 concluída:

```bash
grep -rn "#[0-9a-fA-F]\{3,6\}" app components        # hex literal
grep -rn "navy-\|gold-\|bordo-\|cream-\|magenta-" app components
grep -rn "font-serif" app components
grep -rn "rounded-" app components                     # só rounded-full sobrevive
grep -rn "viewMode\|bancada\|regua" app components lib
grep -rn "shadow-" app components                      # só menu, modal, card arrastado
grep -rn "text-white" app components                   # sobre --acao, use --acao-tx
```

## Aceite geral

- [ ] As sete varreduras acima retornam vazio (exceto as exceções nomeadas)
- [ ] `docs/DESIGN-SYSTEM.md` atualizado — nenhuma seção contradiz `01-tokens-e-tema.md`
- [ ] Manhã e Noite verificados em todas as telas novas
- [ ] Contraste: texto corrido ≥ 4.5:1; chrome e texto grande ≥ 3:1
- [ ] Navegação por teclado completa na triagem de publicações e na paleta ⌘K
- [ ] Nenhum `localStorage` órfão (`lumen:viewMode`, `lumen:sectionPanelCollapsed`)
