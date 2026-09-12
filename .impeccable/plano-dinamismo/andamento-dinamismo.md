# Andamento do plano de dinamismo — site público (`app/page.tsx`)

> **Instrução permanente (leia antes de qualquer ação neste plano):** antes de trabalhar em
> `roteiro-dinamismo.md`, leia este arquivo inteiro para saber o que já foi feito e o que ainda
> depende de validação do dono do projeto. Ao final de cada rodada, acrescente um bloco novo
> abaixo — nunca sobrescreva um bloco já registrado. Mesma convenção de
> `.impeccable/plano-adequacao/andamento.md`.

**Convenção de status por item:** `pendente` · `aguardando validação visual` (item 🎨 sem
aprovação ainda) · `em andamento` · `concluído (PR #N)` · `bloqueado (motivo)`.

---

## Estado atual por item

| Item | Status |
|---|---|
| D1 · Hero · ticker "ao vivo" | aguardando validação visual |
| D2 · Nav · realce de seção ativa | aguardando validação visual |
| D3 · Números · contagem ao entrar na tela | aguardando validação visual |
| D4 · Diagramas de recurso · animação por mecanismo | aguardando validação visual |
| D5 · Cartões de preço · hover sem sombra | aguardando validação visual |
| D6 · CTA final · microinteração de seta | aguardando validação visual |
| D7 · Âncoras internas · rolagem suave | aguardando validação visual |
| D8 · Cabeçalho · reação ao scroll | aguardando validação visual |

---

## Validação visual

Artifact publicado ("Lúmen mais vivo"):
https://claude.ai/code/artifact/0c00a535-14c5-4df3-a960-b4f852b32da7

Cada um dos 8 itens tem demo interativa ao vivo no próprio artefato (não é mockup estático) —
rodando com os tokens reais de `DESIGN.md` (cor, tipografia, réguas), para avaliar o
comportamento do efeito, não só a ideia.

---

## Rodada 0 — planejamento (`$impeccable bolder /plan`)

**Data:** 2026-09-11 · **Sessão:** pedido direto do dono do projeto — "o site é muito estático,
pouco dinâmico", com instrução explícita de só planejar (`/plan`), apresentar proposta completa
em artefato e registrar em `.impeccable` antes de qualquer implementação.

### O que foi feito

- `impeccable context --target app/page.tsx` rodado para carregar `PRODUCT.md`/`DESIGN.md`
  atualizados antes de propor qualquer mudança.
- `app/page.tsx` lido por completo (459 linhas, 8 seções) para diagnóstico de base: confirmado
  zero componente client, zero animação/`@keyframes`, zero `useEffect`/`useState` — única
  interatividade hoje é `hover:` de cor.
- `roteiro-dinamismo.md` escrito com 8 itens (D1–D8), todos marcados 🎨, cada um seguindo a
  mesma estrutura do roteiro de adequação (onde/o quê/por quê/correção/critério de aceite) e
  ancorado na regra do próprio `DESIGN.md` ("movimento sempre curto, sempre com motivo nomeado —
  nunca decorativo") — nenhum item é efeito genérico; cada um dramatiza um mecanismo real do
  produto (publicação chegando, prazo recalculando, número comprovado contando) ou resolve uma
  necessidade funcional (orientação de seção ativa, rolagem suave).
- Restrição registrada explicitamente no roteiro: nenhuma dependência nova (CSS puro +
  `IntersectionObserver` nativo), alinhado ao princípio de custo mínimo já em `PRODUCT.md`; todo
  item respeita `prefers-reduced-motion` e não causa layout shift.
- Artefato "Lúmen mais vivo" publicado com demo interativa ao vivo dos 8 itens (não mockup
  estático) — usa os tokens reais de `DESIGN.md` (bordô `#8a2f42`, réguas, Inter, raio em três
  paradas) para que o comportamento avaliado seja o mais próximo possível do resultado real.
- Ordem de execução recomendada registrada no roteiro, por risco/esforço (não por posição na
  página): D7 → D2 → D8 → D6 → D5 → D3 → D4 → D1.

### Pendente desta rodada

- **Nenhum código de produto foi alterado** — só planejamento, o roteiro e o artefato de
  validação.
- **Aguardando o dono do projeto validar a direção no artefato** antes de qualquer item D1–D8
  entrar em execução — mesma regra do plano de adequação (item 🎨 não implementa sem aprovação
  registrada aqui).
- Quando a validação chegar (aprovação total, parcial, ou ajuste por item), registrar a decisão
  nesta seção antes de iniciar a Rodada 1 de implementação.

## Nota de encerramento — nunca validado, nunca implementado

**Data:** 2026-09-12. Este roteiro (D1–D8) **nunca foi validado** pelo dono do projeto — a
Rodada 0 acima ficou "aguardando validação" e nenhuma rodada seguinte chegou a acontecer. O
plano que devia incorporá-lo por inteiro (`plano-redesign/`, "pulso") foi descartado antes de
qualquer implementação (ver nota de encerramento em `plano-redesign/andamento-redesign.md`) e,
quando a home pública foi finalmente redesenhada em `plano-site-publico/` (2026-09-12), a sessão
de `grilling` daquela rodada tratou só da camada visual/layout — **nenhum item D1–D8 foi
perguntado, validado ou implementado** nessa passagem (sem contagem animada nos números, sem
realce de seção ao rolar no cabeçalho, sem rolagem suave nas âncoras, sem microinteração no
CTA final — o "ledger vivo" do hero novo tem um ponto pulsando, que cobre parcialmente o
espírito de D1, mas não foi desenhado a partir deste roteiro).

**Este roteiro continua em aberto**, não descartado — se o dono do projeto quiser a camada de
interação/movimento na home pública, é trabalho ainda por fazer, a retomar como rodada própria
(precisaria de validação visual antes de qualquer implementação, mesma regra de sempre). Este
arquivo fica congelado a partir daqui.
