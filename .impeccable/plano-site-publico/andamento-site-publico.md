# Andamento do plano de redesign — home pública (`app/page.tsx`)

> **Instrução permanente:** mesma convenção de `plano-adequacao/`, `plano-portal/`, `plano-pwa/`
> e `plano-painel-mestre/` — ler este arquivo inteiro antes de qualquer rodada, acrescentar bloco
> novo ao final, nunca reescrever um já registrado.

**Origem:** pedido direto do dono do projeto, depois do Painel da Empresa concluído — "painel
mestre e site público" como próximos itens. A home pública já tinha uma tentativa de redesign
(`.impeccable/plano-redesign/`, "pulso"), pesquisada e prototipada mas **descartada** durante o
grilling do portal — por timing, não por direção errada.

---

## Origem — sessão de `grilling` (`mattpocock-skills:grilling`)

**Data:** 2026-09-12. Fatos levantados antes de perguntar: home (`app/page.tsx`, ~459 linhas) já
passou por acessibilidade/mecânica (`plano-adequacao`) mas nunca por atmosfera; `plano-redesign/`
("pulso") já tinha pesquisa de concorrentes (AdvBox/Astrea/Projuris) e proposta (hero assimétrico,
"ledger vivo") nunca implementada nem validada.

**Rodada 1:**
1. **Motivo**: mesma raiz das outras rodadas (visual pode melhorar), sem queixa específica.
2. **Relação com o sistema Dracula/raio 2px** (Portal/PWA/Painel da Empresa): primeira resposta
   minha recomendada foi "fica distinta" — **corrigida pelo dono do projeto**: "TEM relação...
   use a mesma ideia, mas pensando no marketing e sem precisar ser igual". Esclarecido em
   pergunta de desambiguação: **só o raio quase reto (2px) e a contenção geométrica** — sem tema
   escuro, Bordô Editorial/identidade clara continuam intocados.
3. **Ponto de partida**: retomar "pulso" (hero assimétrico, "ledger vivo", pesquisa de
   concorrentes já validada), não começar do zero.
4. **Escopo**: a home inteira (hero → recursos → preço → fecho).

**Validação do protótipo (2026-09-12)**: artefato publicado
(https://claude.ai/code/artifact/a3cd1275-8b3b-4f9a-b91b-bc7834a974d4) — 3 rodadas de ajuste:
1. Primeira versão aprovada com ressalva: "gostei só achei muito geométrico. As partes sem
   imagens precisam ser preenchidas de alguma forma" — corrigido com textura granulada
   (`GrainOverlay`, mesma peça do Painel do produto), halo bordô radial (mesmo motivo do Painel),
   grade de pontos atrás do número, e os 5 diagramas de recurso ganharam densidade real (badges,
   preenchimento, ícones) em vez de contorno fino vazio.
2. Segunda rodada de ajustes mecânicos: nome do escritório fora do rodapé do protótipo (não
   existia no rodapé real, só no mockup), texto "ATRASADOS" ajustado pra não extrapolar a caixa,
   e um bug real encontrado — o CSS de inversão esquerda/direita das linhas de recurso tinha os
   valores de `order` trocados (Painel e Financeiro não estavam invertendo de verdade).
3. **Aprovado.**

---

## Rodada 1 — P1 implementado

**Data:** 2026-09-12 · **Sessão:** mesma sessão do `grilling` e do protótipo, a pedido do dono do
projeto ("implemente").

### O que foi feito

- **Hero assimétrico**: grid 2 colunas (texto + "ledger vivo" — painel com 3 linhas simuladas da
  fila de Publicações, rótulos/ações reais: DJEN/DATAJUD, "Gerar Prazo"/"Marcar Audiência"/
  "Delegar", indicador "ao vivo" pulsando com `motion-reduce:animate-none`). Halo bordô radial +
  `GrainOverlay` (componente já existente, reaproveitado, não recriado) preenchem o campo antes
  vazio — feedback do protótipo.
- **Painel de número consolidado**: as antigas seções 3 (grid de 4 estatísticas, 3 em branco) e 5
  (faixa grafite separada com "93") viraram uma seção só, com grade de pontos + grão atrás do
  número. `const STATS` (não mais usada) removida.
- **Peso desigual nos recursos**: `FEATURES` ganhou o campo `pilar` (`true` em Publicações e
  Sigilo, `false` nos outros 3) — título maior, padding maior, fundo `bg-acao-bg` só nesses dois.
- **Diagramas de recurso reescritos** (`FeatureDiagram`): muito mais densos (badges de fonte,
  texto simulado em várias larguras, ícones, botões preenchidos) — todos os `fill-*`/`stroke-*`
  continuam classes Tailwind **literais completas** (nunca `` `fill-${variavel}` ``, que o
  scanner do Tailwind não consegue detectar em produção — armadilha real encontrada e corrigida
  nesta própria rodada, antes do build).
- **Raio 2px**: botões (`btnPrimary`/`btnSecondary`), cartões de plano, painel "ledger vivo",
  molduras dos diagramas de recurso, CTA do fecho — a home já era 100% quadrada, a mudança é a
  intenção declarada de alinhamento com o resto do produto (Portal/PWA/Painel da Empresa).
- **Fecho em pôster** ganhou o mesmo tratamento de halo + grão do hero.
- `DESIGN.md` atualizado com a seção "Home pública — escopo app/page.tsx", registrando a
  diferença deliberada (sem tema escuro, só raio 2px) em relação às 3 áreas internas.
- Verificação técnica local (`tsc --noEmit`, `eslint`, `next build`) — ver resultado e PR na
  entrada seguinte deste arquivo.

### Pendente desta rodada

- Verificação visual real (abrir a home no navegador, testar responsivo e `prefers-reduced-motion`)
  ainda não feita nesta sessão — recomendado antes de considerar a rodada encerrada, mesma
  disciplina que pegou o bug da Manhã do PWA (PR #174) só depois do teste real.
