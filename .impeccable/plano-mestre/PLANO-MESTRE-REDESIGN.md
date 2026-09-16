# Lúmen — Plano Mestre de Redesign

**Documento operacional.** Qualquer agente que abrir este arquivo deve conseguir, só com ele, saber
onde o trabalho parou, o que fazer em seguida, como fazer e como registrar o que fez. Se você chegou
aqui sem contexto: leia as seções 0 a 3, olhe o **Bloco de Estado** logo abaixo, e vá para a fase
indicada.

---

## ▣ BLOCO DE ESTADO — leia isto primeiro

| Campo | Valor |
|---|---|
| **Fase atual** | **F5 concluída · P0-CONTRASTE fechado (PR #209)**. Próxima: P0-OPACIDADE, depois F4 (módulos restantes do Portal) |
| **Próximo passo concreto** | **P0-OPACIDADE** (seção 10-B): 145 classes `/NN` sobre cor de token não geram regra nenhuma — bordas viram `gray-200` fixo. Os 34 anéis de foco já caíram no PR #209 (eram **azuis**). Depois F4: os módulos restantes do Portal |
| **Superfície-âncora da direção visual** | Portal/SaaS (`app/(app)/*`) — contrato gravado em `.impeccable/surfaces/app-app.md`, seed `2cac85b3`, candidato 4 de 7 |
| **Comandos executados** | 15 dos 24 fluxos (`context`, `init`, `critique`, `shape`, `new-work`, `colorize`, `typeset`, `layout`, `extract`, `distill`, `clarify`, `adapt`, `audit`, `bolder`, `animate`) + 3 scripts de apoio (`detect`, `concept-seed`, `surface-brief`). `audit` já rodou no site público (PR #203); falta nas outras 4 superfícies — ver seção 10 |
| **Superfícies redesenhadas** | Portal: casca, `/painel`, `/processos/[id]`, `/publicacoes` e `/alertas` — as quatro telas de uso diário. As 5 superfícies já estão no mundo novo de cor, tipo e raio (fundação F3) |
| **Última atualização** | 2026-09-16 · Claude (sessão `session_01QkwT3jkWwpUJLEQcdNbS2C`) |
| **Bloqueios abertos** | Nenhum. Pendências: (a) **conferência visual pelo dono** — cada rodada de conferência dele achou defeito que o gate técnico não pegou; (b) `audit` do Portal, PWA e Painel Mestre (o do site já foi feito) → F8; (c) dos 10 defeitos reais do diagnóstico, **5 já caíram** (o rail fixo, o `text-white` do Painel Mestre, o `var(--sf)` inexistente, o halo, e o token de ouro ausente) |

---

## 0. Como usar este documento

1. **Leia o Bloco de Estado** acima. Ele diz a fase e o próximo passo.
2. **Leia as seções 1 (protocolo), 2 (estado verificado) e 3 (decisões do dono).** A seção 3 é a que
   mais evita retrabalho: são decisões já tomadas pelo dono do produto, algumas contraintuitivas.
3. **Vá para a fase indicada** na seção 6 e execute o que está escrito lá.
4. **Ao terminar qualquer bloco de trabalho, atualize este documento** — como fazer isso está na
   seção 12. Um trabalho feito e não registrado aqui será refeito por outro agente.

Este plano **não substitui** a skill. Os comandos e suas regras vivem em
`.claude/skills/impeccable/` — este documento diz *o quê, onde, em que ordem e por quê*; a skill diz
*como*.

---

## 1. Protocolo de trabalho — regras invioláveis

**Antes de qualquer coisa, uma vez por sessão:**

```bash
cd <raiz do repositório lumen>
sh .claude/skills/impeccable/scripts/impeccable context
```

Rode **uma vez só** e siga as diretivas que ele imprimir. Se ele falhar, a própria skill manda enviar
uma mensagem separada antes da próxima chamada de ferramenta — *"Context loading did not run; I'll
read the existing project context directly"* — e seguir lendo PRODUCT.md e DESIGN.md sem inventar
contexto. Falha do launcher **não** bloqueia planejamento nem edição.

**Regras que a skill impõe e que este plano adota literalmente:**

| Regra | Onde está escrito | Consequência prática aqui |
|---|---|---|
| Ler `reference/craft-floor.md` **imediatamente antes de qualquer edição de UI**, inclusive refinamento pequeno | SKILL.md §Setup passo 3 | Não é opcional. Mas **não** carregue em trabalho só de planejamento |
| Ler `reference/operate.md` em superfície de produto | SKILL.md §Modes | Obrigatório para Portal, PWA e Painel Mestre |
| O mundo visual é decidido **uma vez** | `new-work.md` §3 | A rodada de direção roda só na superfície-âncora. As outras 4 herdam. Repetir o torneio 5× é erro |
| Tudo desemboca em `polish` | 13 arquivos de referência | Nenhuma superfície é considerada pronta sem o `polish` final |
| `critique` grava snapshot; `polish` consome e fecha | `critique.md` / `polish.md` | Use `impeccable critique-storage latest` e `... close` |
| Nunca reparar drift como efeito colateral | SKILL.md §final | Achado `CONTEXT_STALE` é **reportado**, não corrigido, salvo se o dono pedir |
| Verificar em passes limitados, não em loop | SKILL.md §Core principles | Construa tudo → inspecione uma vez em lote → corrija tudo → no máximo mais uma confirmação → pare |

**Sub-agentes disponíveis** (`.claude/agents/impeccable-*.md`), a serem usados nos gatilhos certos:
`asset-producer` (rasters/comps), `documenter` (reescreve DESIGN.md **no fim** de um `new-work`),
`finish-reviewer` (roda **fresco**, sem herdar a conversa do build, depois da 2ª rodada de inspeção;
devolve `disposition: recapture|rebuild|fix|ship` e o pai reporta o verbo **literalmente**), e
`manual-edit-applier` (só dentro do `live`).

---

## 2. Estado verificado do projeto — 2026-09-16

**Produto:** Lúmen, SaaS jurídico multi-inquilino. Next.js 14 App Router · Prisma/Postgres (Neon) ·
Vercel · isolamento por `officeId` · `prisma db push` puro (sem migrações versionadas).

**Impeccable:** v4.3.1 instalada em `.claude/skills/impeccable/`. Launcher **funciona** neste
ambiente (binário em `~/.impeccable/bin/0.1.5/`). `impeccable help` lista **24 comandos**.

**Artefatos do Impeccable, hoje:**

| Artefato | Estado |
|---|---|
| `PRODUCT.md` | ✅ **Criado em 2026-09-16** pelo `init` (não existia — existia só na máquina Windows do dono, nunca commitado) |
| `DESIGN.md` | Existe, 484 linhas, descreve o mundo visual **atual** ("O Arquivo Vivo", bordô `#8a2f42`, Inter). Vira **anti-referência** neste redesign |
| `.impeccable/design.json` | Existe, `schemaVersion 2`, espelho legível por máquina do DESIGN.md |
| `.impeccable/config.json` | ✅ **Criado em 2026-09-16**: `buildPath: "code"` |
| `.impeccable/live/config.json` | Existe e completo (Next.js App Router, `cspChecked: true`) — `live` já configurado |
| Surface briefs | ❌ Não existem. Nenhum *direction contract* foi gravado até hoje |
| `.impeccable/critique/` | 2 snapshots de 2026-09-10 — servem de **linha de base** (ver abaixo) |

**Linha de base medida (2026-09-10), para comparar no fim:**

- Site público: **19/32 (59%)** — veredito: *"a especificidade vive inteiramente nas palavras, não na
  composição"*; esqueleto de template B2B SaaS.
- PWA: **23/40 (58%)** — veredito: *"o redesign não foi realizado além da camada de navegação"*.

**Trabalho anterior (7 planos em `.impeccable/plano-*`):** adequação (concluída, PRs #144-#166),
portal noturno (concluído, PRs #167-#172), PWA (concluído, PRs #173-#174), painel mestre (concluído,
PR #176), site público (implementado no PR #178 — **nunca verificado visualmente**), redesign "pulso"
(descartado), dinamismo D1-D8 (**escrito, nunca mostrado ao dono, nunca implementado**).

**Dívidas registradas que este plano herda:**

1. `--tx-3` reprova WCAG AA (~2,6-2,9:1) — estava congelado esperando decisão do dono. **Desbloqueado
   em 2026-09-16.**
2. Seis classes de input duplicadas no desktop (`.fin-input`, `.cfg-input`, `.fp-input`, `.pr-input`,
   `.doc-input`, `.lic-input`), com raio 5px fora de escala. Candidatas ao `extract`.
3. Piso de 13px do PWA não tem regra checável — risco de regressão silenciosa.
4. `--ouro-acento` não está redefinido em `.mobile-shell` — quebra se algum componente mobile usar.
5. A home pública (PR #178) nunca passou por verificação visual real no navegador.

---

## 3. Decisões do dono — o que não pode ser atropelado

**Tomadas nesta sessão (2026-09-16):**

| # | Decisão | Efeito no plano |
|---|---|---|
| D-01 | **Redesign completo**, não refinamento. Pode trocar cor de marca, tipografia e temas | O visual atual é **evidência e anti-referência**. `new-work` nível "criar ou substituir o mundo". Nunca "meio-termo polindo o visual descartado" |
| D-02 | **Os dois temas precisam ficar impecáveis**; o padrão de cada superfície continua como está (Portal e Painel Mestre escuros; PWA e site claros) | Não unificar os 4 mecanismos de tema num só. O trabalho é qualidade nos dois lados, não padronização de qual abre primeiro |
| D-03 | Depois da fundação, **SaaS/portal primeiro** | Define a ordem de F4 a F7 e a escolha da superfície-âncora |
| D-04 | Usuário prioritário no desempate: **o advogado dono/sócio** | Visão geral, confiança e controle antes de densidade e atalho |
| D-05 | Diferenciais: **documentos no Drive do próprio cliente** + **assessoria empresarial de primeira classe** | São os dois eixos que o site público precisa provar |
| D-06 | **Não existe prova social real** — sem depoimento, sem número comprovável, sem foto. Só capturas do produto | Proibido inventar depoimento, logo de cliente ou número de tração |
| D-07 | **WCAG AA como piso**, com autorização explícita para mexer nos tokens de texto que reprovam, mesmo mudando o visual | Desbloqueia a dívida do `--tx-3` |
| D-08 | **Construir com código + mockup HTML clicável** para aprovação prévia | `buildPath: "code"`. Nenhuma superfície vai para produção sem o dono ver antes |

**Decisões anteriores que continuam valendo até ele dizer o contrário:**

| # | Decisão | Origem |
|---|---|---|
| D-09 | Preço "recomendado" é configurável no Painel Mestre, **nunca fixo no código** | Requisito dele, já no schema |
| D-10 | "Mais detalhes" no atendimento é **botão com destaque real**, não texto discreto | Validação de 2026-09-10 |
| D-11 | Emoji condicional no PWA (🔔/📅 **só quando há pendência de verdade**) | *"o ícone do sino amarelo eu gostei. mantenha."* |
| D-12 | Financeiro Lúmen **não** ganha DRE/Fluxo de Caixa; Assinaturas é sub-aba, não página | Decisão de escopo do Painel Mestre |
| D-13 | Geometria pura, sozinha, ele **já rejeitou**: *"gostei só achei muito geométrico. As partes sem imagens precisam ser preenchidas de alguma forma"* | A resposta aceita foi textura/densidade, **não** foto nem ilustração decorativa |

**Histórico de reprovação que o plano existe para não repetir:**

> Em 2026-09-11 a tipografia Barlow/Barlow Condensed foi implementada em 5 telas e **só então**
> mostrada. Resposta do dono: **"Vamos regressar à Tipografia anterior, INTER. Essa não ficou boa."**
> Custou um PR de reversão inteiro. **Por isso D-08 existe: nada de tipografia, cor ou layout novo
> chega implementado antes de ser visto.**

Um segundo caso: a Manhã do PWA subiu quebrada e **ele** descobriu testando (*"só tem o tema
noite"*). Lição registrada: **todo shell de tema precisa ser auto-contido**, e o gate técnico não
pega o que o olho pega.

---

## 4. Escopo — 5 superfícies, 99 rotas, ~98 sub-telas, ~60 modais-tela

| Superfície | Modo Impeccable | Rotas | Sub-telas de aba | Modais/gavetas-tela | Impressão | Tema padrão | Casca |
|---|---|---|---|---|---|---|---|
| **Site público** | Persuade | 8 | ~7 | 2 | — | Claro | sem casca |
| **Blog** | Read | 2 | 1 | 0 | — | Claro (Lora) | `blog/layout.tsx` |
| **SaaS / Portal** | Operate | 42 (+2 redirects) | ~55 | ~35 | 4 | **Escuro** | `.portal-shell` |
| **Painel Mestre** | Operate | 10 | 7 | 3 | — | **Escuro** | `.painel-mestre-shell` |
| **PWA mobile** | Operate | 37 (+2 redirects) | ~28 | ~20 | — | Claro | `.mobile-shell` |
| **Total** | — | **99** | **~98** | **~60** | **4** | 4 temas independentes | — |

O inventário completo, rota por rota, com nome humano, abas e modais de cada tela, está em
**`.impeccable/plano-mestre/inventario-telas.md`**. Ele é a lista de verificação de cobertura: nenhuma
superfície é dada como concluída sem que todas as suas linhas tenham sido vistas.

**Telas de maior densidade (atacar primeiro dentro de cada superfície):** `/processos/[id]` (9 abas)
· `/assessoria/[id]` (7 abas) · `/relatorios` (6 seções) · `/configuracoes` (6 seções + 3 sub-abas) ·
`/painel-mestre/[officeId]` (5 abas) · `/publicacoes` (4 chips).

**Armadilhas estruturais já mapeadas:**

- `/peticionar` e `/reuniao/[id]` são autenticadas mas ficam **fora** da casca do portal — herdam o
  tema claro do site. Descontinuidade visual real hoje.
- As 4 folhas de impressão não têm `@media print` global; o comportamento vem de
  `components/relatorios/FolhaImprimivel.tsx`.
- Telas-substitutas de bloqueio (`ModuleDisabledNotice`, `AccessRestrictedNotice`,
  `OfficeSuspendedNotice`) ocupam a tela inteira e precisam entrar no redesign.

---

## 5. Estratégia — por que esta ordem

O produto tem 99 rotas e 4 temas. Redesenhar tela a tela seria caro e incoerente. A tese deste plano
é: **decidir pouco e cedo, aplicar muito e depois.**

1. **O mundo visual se decide uma vez, na superfície mais difícil.** A âncora é o **Portal**, não o
   site público — porque Operate é onde as restrições são mais duras (densidade, escaneabilidade,
   estado, 8h/dia). Uma direção que sobrevive ao Portal se estende com folga ao site; o contrário não
   é verdade. Isso também é o que a própria skill manda (`new-work` §3: seção/tela dentro de
   superfície estabelecida **herda** o mundo).

2. **A fundação vem antes das telas.** Tipografia, cor, contraste e ritmo são resolvidos nos tokens e
   nos 4 shells de tema — não em 99 arquivos. É o único jeito de a queixa de "fonte, modo claro,
   detalhes coloridos, hierarquia" ser resolvida de uma vez.

3. **Diagnóstico antes de direção.** Não dá para saber o que substituir sem medir o que existe. F1
   produz nota por superfície; no fim, F9 compara com a mesma régua.

4. **Nada implementado antes de visto** (D-08). Cada superfície tem um mockup clicável aprovado antes
   do código.

5. **Movimento por último.** Animação sobre um layout que ainda vai mudar é trabalho jogado fora.

---

## 6. As fases

### F0 — Fundação de contexto ✅ CONCLUÍDA (2026-09-16)

| Passo | Comando | Estado |
|---|---|---|
| Carregar contexto | `impeccable context` | ✅ rodado; diretivas `NO_PRODUCT_MD`, `BUILD_INIT_REQUIRED`, `EXISTING_VISUAL_SYSTEM` capturadas |
| Verdade de produto | **`init`** | ✅ `PRODUCT.md` criado com entrevista do dono |
| Caminho de construção | (passo 5 do `init`) | ✅ `.impeccable/config.json` → `buildPath: "code"` |
| Live mode | (passo 5 do `init`) | ✅ já configurado, deixado intocado |

### F1 — Diagnóstico completo ◀ **VOCÊ ESTÁ AQUI**

**Objetivo:** medir o que existe, em todas as superfícies, antes de decidir o que substituir.

| Passo | Comando | Alvo | Saída |
|---|---|---|---|
| 1 | **`document`** (responder **refresh**) | projeto | Congela o mundo atual como referência/anti-referência. A skill manda isso explicitamente: *"Before a large redesign, to capture the current state as a reference"*. ⚠️ Ele **pergunta** refresh/overwrite/merge — nunca sobrescreva em silêncio |
| 2 | **`critique`** × 5 | uma por superfície | Snapshot em `.impeccable/critique/`. Compare site e PWA com a linha de base de 2026-09-10 (19/32 e 23/40) |
| 3 | **`audit`** × 5 | uma por superfície | a11y, performance, theming, responsivo. Não corrige nada — só documenta |
| 4 | consolidar | — | `.impeccable/plano-mestre/diagnostico/<superficie>.md` com P0-P3 |

**Cobertura de "todas as telas":** o `critique` não roda 99 vezes. Rode por **arquétipo** — lista,
ficha com abas, formulário, hub, folha de impressão, modal-tela — citando nominalmente as 6 telas de
maior densidade da seção 4, e marcando no inventário cada rota coberta pelo arquétipo dela.

**Critério de conclusão:** os 5 relatórios existem, todas as rotas do inventário estão marcadas, e as
notas foram registradas na seção 10.

### F2 — A direção visual (decidida uma vez)

**Objetivo:** escolher o mundo visual novo, com o dono, antes de qualquer código de produção.

| Passo | Comando | Detalhe |
|---|---|---|
| 1 | **`shape`** | Brief confirmado do Portal (superfície-âncora). Não escreve código nem contrato |
| 2 | **`new-work`** nível *criar ou substituir o mundo* | Mecanismo em 1 frase → rut da categoria → **7 sistemas visuais** do mundo cultural da audiência, em ≥3 famílias materiais → direções completas → `impeccable concept-seed --scope direction` (**contrato: sem substituto, sem pular**) → 1 direção comprometida + challengers + IMPECCABLE'S PICK + re-roll |
| 3 | Mockup | HTML clicável com as 2 telas mais densas do Portal (`/painel` e `/processos/[id]`), **nos dois temas** (D-02) |
| 4 | Aprovação do dono | Obrigatória (D-08). Registrar textualmente na seção 11 |
| 5 | Contrato | `impeccable surface-brief write` com o `## Direction contract` (THESIS, OWN-WORLD, STORY, FIRST VIEWPORT, FORM, FINISH) |

**Regras que valem aqui e em nenhum outro lugar:** durante uma rodada de direção aberta, as palavras
*bolder* e *safer* significam **registros de re-roll**, não os comandos `bolder`/`harden`.

**Entradas obrigatórias para a conversa de direção:**
- O que o dono **já rejeitou**: geometria pura sozinha (D-13), Barlow.
- O que ele **já aprovou e nunca foi questionado**: raio quase reto (2px), contenção geométrica,
  textura/grão como resposta ao vazio.
- O único feedback dele sobre modo claro: *"tema claro pode ser tudo um pouco mais escuro, como se
  fosse um misto entre o claro e o escuro, sem perder a harmonia das cores"* — hoje aplicado **só** ao
  Painel Mestre (`#b3aebc`). Levar isso como hipótese forte para as outras 3 superfícies.
- O que evitar, pesquisado em 2026-09-11: o padrão AdvBox/Astrea/Projuris (azul corporativo,
  carrossel de depoimento, parede de números, grade de 4 ícones, tabela comparativa).

**Critério de conclusão:** direction contract gravado + mockup aprovado por escrito.

### F3 — Fundação do sistema (tokens e temas)

**Objetivo:** aplicar o mundo novo onde ele alcança 99 rotas de uma vez.

| Comando | Alvo |
|---|---|
| **`colorize`** | Papéis de cor (canvas, superfície, texto, ação/foco/seleção, borda, semântica) nos 4 shells. Em Operate a cor codifica ação/estado, nunca decora |
| **`typeset`** | Escala de papéis fixa em `rem` (Operate não usa `clamp`), medida 45-75ch, fallback métrico, carregamento |
| **`layout`** | Ritmo, densidade e hierarquia no nível do sistema |
| **`extract`** | Consolidar as 6 classes de input duplicadas (dívida #2) e o que mais o diagnóstico apontar |

**Não negociável nesta fase:** `--tx-3` e qualquer token de texto que reprove em AA são corrigidos
(D-07). Os 4 shells continuam auto-contidos — nenhum herda `.dark` de outro (lição do PR #174).

**Critério de conclusão:** 1 PR de fundação verificado nas 5 superfícies, nos 2 temas, sem regressão.

### F4 — Portal / SaaS (42 rotas) — a superfície-âncora

Ordem por módulo: **Painel e Agenda** → **Jurídico** (Processos, Assessoria) → **Comunicação**
(Publicações, Atendimento, Contatos) → **Financeiro** → **Gestão** (Relatórios, Configurações,
Conexões, Perfil) → **as 4 folhas de impressão** → **`/peticionar` e `/reuniao/[id]`** (hoje órfãs da
casca).

Comandos por bloco: **`layout`** · **`distill`** (densidade: nunca card dentro de card, 1 ação
primária) · **`clarify`** (⚠️ perguntar antes de mudar termo jurídico — ver Terminologia no
PRODUCT.md) · **`onboard`** (estados vazios e primeiro uso) · **`harden`**.

Leitura obrigatória: `operate.md`. Fecha com **`polish`** e uma rodada de `finish-reviewer`.

### F5 — Site público + Blog

| Comando | Por quê |
|---|---|
| **`bolder`** | A única superfície onde ele cabe. O veredito da crítica foi que a composição é template genérico |
| **`animate`** | **Os 8 itens D1-D8 já estão escritos** em `.impeccable/plano-dinamismo/roteiro-dinamismo.md` e nunca foram mostrados ao dono. Leve-os para validação antes de inventar outros |
| **`delight`** | Personalidade em momentos que merecem |
| **`clarify`** | Copy de conversão, sem prova social inventada (D-06) |
| **`quieter`** | Só se o `bolder` passar do ponto |

Blog é **Read**, não Persuade: estrutura para compreensão primeiro.

### F6 — PWA mobile (37 rotas)

**`adapt`** é o protagonista (contexto: rua, fórum, luz forte, uma mão). Depois **`layout`**,
**`harden`**, **`onboard`**. Preservar: piso de 13px, alvo de toque de 44px, emoji condicional
(D-11). Corrigir a dívida #4 (`--ouro-acento` ausente no `.mobile-shell`).

### F7 — Painel Mestre (10 rotas)

Herda tudo. **`layout`** + **`distill`** + **`clarify`**. A queixa original dele aqui
(*"navegabilidade difícil, pouco aproveitamento de espaço"*) já foi resolvida uma vez com layout
largo + abas reais; manter esse padrão.

### F8 — Movimento, robustez e acabamento

| Comando | Aplicação |
|---|---|
| **`animate`** | Em Operate: feedback, estado, continuidade. **Proibido** sequência orquestrada de carregamento de página |
| **`delight`** | Em Operate: concentrar em primeiro uso, conclusão, recuperação e maestria |
| **`overdrive`** | Em Operate **não é partícula, é façanha**: tabela de 100k linhas a 60fps, busca que filtra sem flicker, diálogo que morfa do botão. Exige propor 2-3 direções e obter escolha do dono antes de escrever código |
| **`harden`** | Texto extremo, 1000+ itens, falha de rede, 400/401/403/404/500, overflow |
| **`optimize`** | Medir antes e depois. Não otimizar o que não está lento |
| **`audit`** 2ª rodada | Comparar com F1 |
| **`polish`** | Por superfície. Fecha os snapshots de `critique` |
| **`critique`** 2ª rodada | Comparar nota com a linha de base |
| **`live`** | **Opcional e presencial** — exige servidor de dev, navegador e o dono clicando. Nunca no caminho crítico |

### F9 — Consolidação

- **`documenter`** (sub-agente) reescreve `DESIGN.md` + `.impeccable/design.json` a partir do que foi
  construído — **não** do que foi planejado. Mundo novo exige tokens, não só prosa.
- **`extract`** final para o drift que apareceu entre superfícies.
- `/impeccable hooks on` para o detector automático.
- `/impeccable doctor` para relatório final de drift.
- Atualizar este documento (seção 12) e arquivar os 7 planos antigos como histórico.

---

## 7. Matriz — os 24 comandos e onde cada um entra

| # | Comando | Fase | Superfície(s) | Observação |
|---|---|---|---|---|
| 1 | `/impeccable` | todas | — | Roteador. Sem argumento, apresenta menu; nunca auto-executa |
| 2 | `init` | **F0 ✅** | projeto | Uma vez por projeto. Já feito |
| 3 | `document` | F1, F9 | projeto | F1 em *refresh* (anti-referência); F9 pelo `documenter` |
| 4 | `shape` | F2 | Portal | Brief confirmado, sem código |
| 5 | `craft` | — | — | **Alias depreciado** de new-work. Não usar; registrado por completude |
| 6 | `critique` | F1, F8 | 5 | Linha de base e comparação final |
| 7 | `audit` | F1, F8 | 5 | Técnico, não corrige |
| 8 | `colorize` | F3, F4-F7 | sistema + telas | Em Operate: codifica, não decora |
| 9 | `typeset` | F3 | sistema | Escala fixa em rem |
| 10 | `layout` | F3, F4-F7 | sistema + 5 | O grosso da queixa de hierarquia |
| 11 | `extract` | F3, F9 | sistema | Inputs duplicados, drift |
| 12 | `distill` | F4, F7 | Portal, Painel | Densidade do produto |
| 13 | `clarify` | F4, F5, F6, F7 | 5 | ⚠️ termo jurídico só com consulta |
| 14 | `onboard` | F4, F6 | Portal, PWA | Estados vazios, primeiro uso |
| 15 | `adapt` | F6, F8 | PWA + 5 | Protagonista do mobile |
| 16 | `bolder` | F5 | Site, Blog | **Só aqui** — em Operate ele briga com "earned familiarity" |
| 17 | `quieter` | F5, sob demanda | qualquer | Se algo passar do ponto |
| 18 | `animate` | F5, F8 | 5 | D1-D8 já escritos, nunca validados |
| 19 | `delight` | F5, F8 | 5 | Em Operate: momentos, não decoração |
| 20 | `overdrive` | F8 | Portal, Site | Em Operate = performance; exige 2-3 direções e escolha do dono |
| 21 | `harden` | F4, F6, F8 | 5 | Produção de verdade |
| 22 | `optimize` | F8 | 5 | Medir antes e depois |
| 23 | `polish` | F4-F8 | 5 | **Todo caminho termina aqui** |
| 24 | `live` | F8 | qualquer | Opcional, presencial, fora do caminho crítico |

**Verbos de manutenção** (`/impeccable <verbo>`, não contam como comandos): `doctor` (relatório de
drift — F9), `hooks` (detector automático — F9), `pin`/`unpin` (atalhos), `context` (boot de sessão).

---

## 8. Protocolo de entrega

O `CLAUDE.md` deste repositório dá **autorização permanente** para o Claude mergear os próprios PRs,
sem aprovação manual, desde que a verificação local passe limpa. Não há CI — a verificação **é** o
gate.

```bash
git fetch origin main -q && git log -1 --oneline origin/main   # nunca assumir checkout atualizado
git checkout -b <branch-descritiva>
# ... trabalho ...
rm -rf .next && npx tsc --noEmit -p .
npx eslint <arquivos alterados>
npx next build
git commit   # mensagem em português: causa raiz, impacto, correção
git push -u origin <branch>
# abrir PR, aguardar status, mergear, confirmar deploy, sincronizar main
```

Regras: commit e PR em **português**; avisar o dono depois do merge (não pedir permissão antes);
**um PR por bloco de trabalho**, nunca um PR gigante por fase.

---

## 9. Limitações do ambiente (para o agente não perder tempo)

| Limitação | Consequência |
|---|---|
| **Sem acesso ao banco Neon** a partir do sandbox | `npx next build` **sempre** falha em `/blog` com `PrismaClientInitializationError`. As 119 páginas restantes compilam. **Isso é ambiental, não regressão** — já provado stashando tudo e reproduzindo em `main` limpo |
| Servidor de dev sem dados | `npm run dev` sobe, mas telas que consultam o banco quebram. Screenshot com dado real só na máquina do dono |
| `live` precisa de 3 coisas ao mesmo tempo | Servidor de dev + navegador controlável + uma pessoa clicando. Tratar como etapa presencial |
| Verificação visual real | O dono **testa de verdade** e já pegou dois defeitos que o gate técnico não pegou. Peça a verificação dele antes de dar uma superfície como pronta |

---

## 10. Registro de progresso

Legenda: ⬜ pendente · 🔄 em andamento · ✅ concluído · ⏭️ pulado (com motivo)

| Fase | Bloco | Comandos | Estado | PR | Data | Nota |
|---|---|---|---|---|---|---|
| F0 | Contexto e verdade de produto | `context`, `init` | ✅ | — | 2026-09-16 | `PRODUCT.md` e `config.json` criados |
| F1 | Congelar mundo atual | `document` (refresh) | ⏭️ | — | 2026-09-16 | **Pulado com motivo:** os 4 relatórios de diagnóstico congelam o mundo atual com muito mais detalhe do que um refresh do DESIGN.md, e o DESIGN.md é reescrito do zero em F9. Para não deixar ficção no lugar, o DESIGN.md ganhou um aviso no topo apontando a rampa real medida |
| F1 | Diagnóstico mecânico (5 superfícies) | `detect` | ✅ | #186 | 2026-09-16 | 1.078 achados · 263 arquivos · **93% é tipografia**; 73% mora em `components/**` |
| F1 | Diagnóstico site público + blog | `critique` | ✅ | #186 | 2026-09-16 | Os 2 diferenciais do produto **não estão na landing**; blog é beco sem saída |
| F1 | Diagnóstico Portal | `critique` | ✅ | #186 | 2026-09-16 | Rail = mapa do banco; 6 ícones → 5 destinos; nada entre 15px e 24px |
| F1 | Diagnóstico PWA + Painel Mestre | `critique` | ✅ | #186 | 2026-09-16 | Piso de 13px vaza por componente compartilhado; `text-white` invisível no claro |
| F1 | Consolidação e cobertura | — | ✅ | #186 | 2026-09-16 | `diagnostico/README.md` + seção 7 do inventário: **99 rotas cobertas** |
| F5 | **`audit` do site público** | `audit` | ✅ | #203 | 2026-09-16 | **Primeira passagem própria de `audit` do projeto.** Nota 12/20. Achado central: oito campos de formulário sem `<label>` em toda a superfície pública |
| F1 | `audit` das outras 4 superfícies | `audit` | ⬜ | — | — | **NÃO foi rodado.** As críticas cobriram contraste, tema, responsivo e um achado de desempenho, mas de forma incidental — não houve passagem dedicada de a11y/performance/theming/responsivo. Rodar junto com F8, quando houver navegador e banco |
| F2 | Brief do Portal | `shape` | ✅ | #187 | 2026-09-16 | Contrato de direção em `.impeccable/surfaces/app-app.md`, seis blocos + seed |
| F2 | Rodada de direção | `new-work`, `concept-seed` | ✅ | #187 | 2026-09-16 | Seed `2cac85b3`, designado 4 de 7 → **“Guias”**. 2 competitivos, 4 declinados, 6 elevações nomeadas |
| F2 | Mockup clicável | — | ✅ | #187 | 2026-09-16 | 5 telas do Portal + 4 do app, dois temas, contraste medido. Pedido do dono ampliou o escopo (o plano previa 2 telas) |
| F2 | **Aprovação do dono** | — | ✅ | — | 2026-09-16 | **"Aprovada a direção."** Gate fechado |
| F3 | Rampa tipográfica | `typeset` | ✅ | #190 | 2026-09-16 | 6 paradas em rem, piso de 12px; **1.064 tamanhos arbitrários migrados** em 250 arquivos; escala do Tailwind reapontada; regra de lint |
| F3 | Paleta e temas | `colorize` | ✅ | #190 | 2026-09-16 | 66 tokens × 8 cascas, **todas auto-contidas** — o vazamento de 9 a 14 tokens por casca acabou. Rail deixa de ser grafite fixo |
| F3 | Raio e ritmo | `layout` | ✅ | #190 | 2026-09-16 | Raio único de 2px; 9 dos 22 defeitos agudos corrigidos no markup; halo decorativo morto |
| F3 | Classe de campo única | `extract` | ✅ | #190 | 2026-09-16 | **23 classes de input** duplicadas (não 6) viraram uma; 39 definições locais e 36 blocos `<style>` vazios removidos |
| F3 | DESIGN.md legível por máquina | — | ✅ | #190 | 2026-09-16 | Cabeçalho reescrito a partir do construído — sem isso o detector media contra um alvo morto |
| F3b | **Conferência do dono** | — | ✅ | — | 2026-09-16 | Derrubou a paleta creme (*"impressão de coisa velha"*) e expôs dois defeitos meus: o rail que nunca retematizou e o `text-white` cravado |
| F3b | Segunda rodada de paleta | `colorize` | ✅ | #191 | 2026-09-16 | 3 propostas × 2 telas × 2 temas. Escolhida a **Ardósia** (cinza-pedra frio). Bordô volta como ação; **nenhuma faixa é vermelha** |
| F3b | O rail passa a retematizar | `colorize` | ✅ | #191 | 2026-09-16 | Tokens `--gaveta*` próprios. A escala `grafite` do Tailwind era **hex cravado** — repontar só a variável CSS não fazia nada |
| F3b | Fim do `text-white` cravado | `harden` | ✅ | #191 | 2026-09-16 | 98 linhas em 11 arquivos do Painel Mestre + aside de Configurações + campos com fundo sempre escuro |
| F4a | Casca — o rail vira mapa | `layout`, `clarify` | ✅ | #192 | 2026-09-16 | 6 ícones → 5 destinos, estado invisível, 2 ícones acesos, hub órfão, 250ms de atraso. **Contagem deixa de ser vermelha; Agenda = hoje + atrasados** (pedidos do dono) |
| F4b | Casca — o layout para de se mexer | `layout` | ✅ | #193 | 2026-09-16 | 10 larguras → **1**, numa classe só. Fade de página e cascata de lista removidos. Barra de abas com altura estável. O mesmo atraso de 250ms que restava na barra de abas |
| F4c | Portal — `/painel` | `distill`, `clarify` | ✅ | #194 | 2026-09-16 | **A tarja de risco do escritório.** Saudação, halo e grão fora; "Minhas atrasadas" vira "do escritório"; medidores em régua; "O dia" para de somar vencido com futuro |
| F4c | Rótulo sobre fundo de risco | `harden` | ✅ | #194 | 2026-09-16 | **19 arquivos** com rótulo claro cravado sobre cor de risco — invisíveis no tema escuro. Regra de lint impede a volta |
| F4d | Alertas — número e reciprocidade | `clarify` | ✅ | #195 | 2026-09-16 | Classe de Tailwind inexistente escondia o número no app (23 usos, a maioria antiga); `/alertas` passa a mostrar de que é feito o número; alerta de delegação ganha o outro lado |
| F4e | Central de Alertas quebrada | `harden` | ✅ | #196 | 2026-09-16 | Duas cópias do mapa de tipos + acesso sem guarda. Virou fonte única tipada: esquecer um tipo agora é erro de compilação. Pastilha volta a ser bordô (pedido do dono) |
| F4f | Portal — `/processos/[id]` | `distill`, `layout` | ✅ | #197 | 2026-09-16 | Faixa "pendente neste processo" em todas as abas, sem consulta nova; guias numeradas com o chanfro do sistema; natureza vira identidade neutra; excluir separado por filete |
| F4g | Os 13 filetes laterais | `extract`, `polish` | ✅ | #198 | 2026-09-16 | 9 eram recado avulso e viraram régua no topo, num componente `Aviso` só; 3 ficam **declarados no código**, porque ali o filete codifica severidade, estado ou seleção da linha. **Detector: 1.078 → 3** |
| F4h | Reorganizar anexos do Drive | `clarify` | ✅ | #199 | 2026-09-16 | **Não removido**: reorganizar MOVE arquivo fora de lugar, reconciliar não move nada. Tela agrupada por registro, com número, tribunal e cliente |
| F4i | **Fim do vermelho** | `colorize` | ✅ | #200 | 2026-09-16 | Uma família quente só (bordô), diferenciada por TRATAMENTO. **210 cores cruas do Tailwind** migradas para token, com lint que impede a volta |
| F4j | **A largura volta** | `adapt`, `layout` | ✅ | #201 | 2026-09-16 | **Correção de regressão minha:** F4b matou o deslize capando tudo em 1440px centralizado, e num monitor largo isso desperdiçava metade da tela. O quadro passa a OCUPAR a largura — igualmente estável, porque a regra é constante. Densidade vira assunto de coluna |
| F4 | Portal — Jurídico: `/assessoria/[id]` | `distill`, `layout` | ⬜ | — | — | identidade e métrica no mesmo tamanho: h1 e 4 KPIs todos em 24px bold |
| F4 | Portal — Comunicação | idem | ⬜ | — | — | atendimento, funil, contatos |
| F4 | Portal — Financeiro | idem | ⬜ | — | — | — |
| F4 | Portal — Gestão | idem | ⬜ | — | — | configurações, relatórios, produtividade |
| F4 | Portal — impressão e telas órfãs | `layout`, `adapt` | ⬜ | — | — | `/peticionar`, `/reuniao/[id]` |
| F5a | Site — os P1 do `audit` | `harden`, `adapt`, `clarify`, `typeset`, `layout` | ✅ | #203 | 2026-09-16 | 9 rótulos de formulário, `h1` no login, alternador de tema público, caminho do blog para o produto, `.artigo` no lugar da classe inexistente, grade de preço |
| F5b | Site — os dois diferenciais | `bolder` | ✅ | #204 | 2026-09-16 | A custódia no Drive ocupa a manchete e é **demonstrada**, não descrita; Assessoria vira o único pilar dos recursos; a copy que contradizia o posicionamento saiu |
| F5c | Site — movimento | `animate` | ✅ | #205 | 2026-09-16 | Movimento 7 · arquivar (a sequência focal única: a árvore do Drive se arquiva sozinha), 8 · avisar, 9 · abrir menu; rolagem suave escopada ao site (D7 do roteiro de dinamismo); retorno de interação nos 5 estilos de botão/link, que não tinham **nenhuma** transição. D1 morto, D3 recusado, D2/D4/D5/D6/D8 pendentes de validação — ver `plano-dinamismo/roteiro-dinamismo.md` §Reconciliação |
| F5d | Site — os 5 itens de movimento aprovados | `animate` | ✅ | #206 | 2026-09-16 | D2+D8 (cabeçalho cliente: seção ativa por régua, régua do rodapé reage à rolagem), D4 (Movimento 10 — os 5 diagramas demonstram o próprio mecanismo), D5 (cartão de preço responde pela régua, não levantando), D6 (seta do fecho) |
| F5e | Site — as quatro telas de sessão | `distill`, `clarify` | ✅ | #207 | 2026-09-16 | Casca única (`components/site/TelaSessao.tsx`) + guia de sessão. `/cadastro` perde o fundo grafite e ganha marca e saída; `/escolher` ganha o `h1` que não tinha; `/redefinir-senha` troca "Link inválido" por um erro que diz o que fazer; `/login` ganha o caminho do cadastro, que não existia |
| F5f | Blog | `layout`, `typeset`, `clarify` | ✅ | #208 | 2026-09-16 | Renderizador de markdown simples (as regras de `.artigo h2/ul/blockquote/strong` eram letra morta: o corpo virava sempre `<p>`); a ÁREA do direito passa a aparecer; tempo de leitura real; fontes por domínio; "Continuar lendo"; um cabeçalho só; teste de mesa com 24 casos (`npm run testar`) |
| F6 | PWA | `adapt`, `layout`, `harden`, `onboard` | ⬜ | — | — | — |
| F7 | Painel Mestre | `layout`, `distill`, `clarify` | ⬜ | — | — | — |
| F8 | Movimento e robustez | `animate`, `delight`, `overdrive`, `harden`, `optimize` | ⬜ | — | — | — |
| F8 | Verificação final | `audit`, `critique`, `polish` | ⬜ | — | — | comparar com F1 |
| F9 | Consolidação | `documenter`, `extract`, `hooks`, `doctor` | ⬜ | — | — | reescreve DESIGN.md |

---

## 10-B. Achados abertos — medidos, não corrigidos

### ~~P0-CONTRASTE~~ · RESOLVIDO no PR #209 · `text-acao` como texto reprovava WCAG AA no tema escuro

`--acao` é o bordô FIXO da marca (`#8a2f42` nos dois temas). Como **fundo** de botão ele é correto,
com `--acao-tx` por cima. Como **texto** sobre uma superfície que retematiza, ele mede:

| Primeiro plano | Fundo | Contraste | AA (4,5:1) |
|---|---|---|---|
| `--acao` `#8a2f42` | ficha escura `#212529` | **1,88:1** | ✗ |
| `--acao` `#8a2f42` | papel escuro `#181b1f` | **2,11:1** | ✗ |
| `--acao` `#8a2f42` | `--acao-bg` escuro `#371c20` | **1,90:1** | ✗ |
| `--marca-tx` | ficha escura | 5,58:1 | ✓ |
| `--marca-tx` | papel escuro | 6,25:1 | ✓ |
| `--acao` / `--marca-tx` | ficha clara `#ffffff` | 8,18:1 | ✓ |

**Alcance final corrigido: 284 substituições em 113 arquivos** — 131 de texto, 29 de hover, 56 de
borda, 34 de anel de foco, mais 18 `border-marca`, 1 `ring-marca` e 1 `fill-marca` numa segunda
varredura. Fechado por regra de lint. Verificação: 40 pares (8 cascas × 5 superfícies) recalculados,
**zero reprovando**, e as colunas do tema claro idênticas antes e depois — a troca não muda um pixel
do claro, porque `--marca-tx` vale exatamente `#8a2f42` ali.

**Não foram tocados, de propósito:** 24 `border-acao` que são a borda do próprio botão bordô (têm
`bg-acao` na mesma linha), 2 `text-acao` em `<input type="checkbox">` — ali `text-*` pinta o
PREENCHIMENTO do controle, o marcador por cima é branco, e o par é fixo e aprova nos dois temas —
e as utilitárias `accent-*`, pelo mesmo motivo. As duas exceções de checkbox carregam
`eslint-disable-next-line` com o motivo escrito ao lado.

**De quem é o erro:** meu. A fundação F3 verificou `--acao` como **fundo**, com `--acao-tx` por
cima, e nunca o verificou como **primeiro plano**. A troca é `text-acao` → `text-marca-tx`, e é
segura por construção no tema claro (`--marca-tx` vale `#8a2f42` ali, exatamente o mesmo valor):
nenhum pixel do tema claro muda. O cuidado fica com as ocorrências sobre superfície FIXA (grafite),
onde o certo é `rail-marca` — essas precisam ser separadas à mão, não por substituição cega.
Corrigido só no blog (PR #208); o resto é a próxima passada.

### P0-OPACIDADE · 145 classes com `/NN` sobre cor de token não geram regra nenhuma

Descoberto ao fechar o P0-CONTRASTE, e é mais antigo e mais grave que ele.

As cores do sistema são declaradas em `tailwind.config.ts` como texto simples — `"var(--marca-tx)"`.
O Tailwind só sabe aplicar modificador de opacidade a uma cor que traga o marcador `<alpha-value>`.
Sem ele, **a classe com `/NN` não gera regra alguma**, e o elemento cai no padrão do Tailwind.

Medido no navegador, com o CSS de produção:

| Escrito no código | O que o navegador aplica |
|---|---|
| `focus:ring-marca-tx/40` | `rgba(59, 130, 246, 0.5)` — **o azul padrão do Tailwind** |
| `focus:ring-marca-tx` | `rgb(138, 47, 66)` — o bordô, correto |
| `border-marca-tx/40` | `rgb(229, 231, 235)` — **cinza fixo**, que não retematiza |
| `border-marca-tx` | `rgb(138, 47, 66)` — correto |

Ou seja: **o anel de foco do produto inteiro era azul**, num produto que não tem azul em lugar
nenhum, e toda borda com opacidade era o cinza `gray-200` do Tailwind, igual nos dois temas.

Corrigido no PR #209: **os 34 anéis de foco**, por serem caminho de teclado e quebra de marca
visível, e por a correção ser mecânica (`ring-x/NN` → `ring-x`).

**Restam 145**, que precisam de um token sólido escolhido por família, não de substituição cega:

| Família | Quantas | Substituto provável |
|---|---|---|
| `border-marca-tx/25\|30\|40\|50` | 24 | `border-marca-tx` |
| `border-urgente/20\|25\|30` | 21 | `border-campo-risco-linha` (é exatamente "urgente suave", e retematiza) |
| `text-tx/55\|75\|80\|85` | 19 | `text-tx-2` / `text-tx-3` — a rampa de tinta já existe |
| `bg-urgente\|aviso\|concluido/10\|15` | 20 | `bg-*-bg`, que já são rgba(...,.14) |
| `border-aviso/25\|30\|40` | 12 | a criar, ou `border-aviso` |
| `border\|bg\|text-fonte-pje/NN` | 16 | idem |
| resto | 33 | caso a caso |

Alternativa estrutural, mais cara: dar aos 66 tokens um par em canais (`--marca-tx-rgb: 138 47 66`)
e declarar no config como `rgb(var(--marca-tx-rgb) / <alpha-value>)`. Resolve a família inteira e
permite opacidade de verdade, ao custo de duplicar 66 tokens em 8 cascas. **Decisão do dono.**

---

### P1-EMAIL · a superfície que ninguém olhou neste redesenho

O detector nunca foi rodado em `lib/`. Rodado agora: **36 achados**, todos concentrados em
`lib/email.ts`, `lib/emailTemplateRender.ts`, `lib/defaultOfficeData.ts` e `lib/pwaIcon.tsx` — 90
cores literais, 54 tamanhos de fonte literais, 23 famílias tipográficas.

Em e-mail, cor e fonte literais são **obrigatórias** (cliente de e-mail não lê variável CSS nem
Tailwind), então o detector está tecnicamente errado nesses arquivos. A pergunta que ele levanta,
porém, é legítima e não foi feita ainda: **os e-mails transacionais ainda estão na paleta velha?**
É a voz do produto dentro da caixa de entrada do cliente, e nenhuma fase deste plano olhou para ela.
Vai para F8.

---

## 11. Log de decisões (append-only — nunca editar linha antiga)

| Data | Quem | Decisão | Onde nasceu |
|---|---|---|---|
| 2026-09-16 | Dono | Redesign completo; pode trocar cor de marca, tipografia e temas | Entrevista de abertura |
| 2026-09-16 | Dono | Os dois temas impecáveis; padrão de cada superfície mantido | Entrevista de abertura |
| 2026-09-16 | Dono | SaaS/portal primeiro depois da fundação | Entrevista de abertura |
| 2026-09-16 | Dono | Usuário prioritário no desempate: advogado dono/sócio | `init` rodada 1 |
| 2026-09-16 | Dono | Diferenciais: Drive do próprio cliente + assessoria de primeira classe | `init` rodada 1 |
| 2026-09-16 | Dono | Sem prova social real; só capturas do produto | `init` rodada 1 |
| 2026-09-16 | Dono | WCAG AA como piso, com autorização para mexer em tokens de texto | `init` rodada 1 |
| 2026-09-16 | Dono | `buildPath: code` — mockup clicável antes do código | `init` passo 5 |
| 2026-09-16 | Claude | Superfície-âncora da direção = Portal, não site público | Seção 5, tese 1 |
| 2026-09-16 | Dono | Seguir sem interferência até a proposta completa; criticar e corrigir o próprio resultado a cada etapa | Mensagem durante F1 |
| 2026-09-16 | Dono | A proposta final é artefato HTML clicável com várias telas do SaaS **e** do app mobile | Mensagem durante F1 |
| 2026-09-16 | Claude | Direção designada pelo sorteio = candidato 4, “Guias” (arquivo de cartório). Seed `2cac85b3` | `concept-seed --scope direction --mode operate` |
| 2026-09-16 | Claude | Conflito filete × arredondamento resolvido em favor do **filete**; raio de 2px | F2, resolve os 22 `warning` do detector |
| 2026-09-16 | Claude | Rampa de 6 paradas com piso de 12px, garantida por lint e não por convenção | F2, a partir do achado nº 1 do diagnóstico |
| 2026-09-16 | Dono | **Direção "Guias" aprovada.** Seguir para a próxima etapa | Mensagem após a proposta |
| 2026-09-16 | Claude | O mapeamento da rampa sai da medição, não do gosto: abaixo de 12px vira etiqueta; 12,5 a 16 vira corpo. 13px era o app (43 arquivos), 10-11px era o portal | F3, codemod |
| 2026-09-16 | Claude | Os nomes de token antigos viram apelido dos novos, em vez de dois sistemas convivendo. É o que faz as 99 rotas entrarem no mundo novo sem editar 250 arquivos | F3, `colorize` |
| 2026-09-16 | Dono | **Paleta creme recusada** — "impressão de coisa velha". O tema claro não pode ter fundo bege | Conferência do F3 em produção |
| 2026-09-16 | Dono | **Paleta Ardósia escolhida** (cinza-pedra frio), entre três propostas | Segunda rodada de cor |
| 2026-09-16 | Dono | **Nenhuma faixa de seção é vermelha.** O tijolo sai, o anil entra. O vermelho existe só para risco; o bordô, só para ação | Segunda rodada de cor |
| 2026-09-16 | Claude | O rail é superfície própria com tokens próprios, e não a escala `grafite`. A escala `grafite` fica literal, só para os blocos sempre escuros do site público | F3b, a partir do defeito que o dono viu |
| 2026-09-16 | Dono | O número de notificação não é vermelho: contagem não é risco | Conferência do F3b |
| 2026-09-16 | Dono | O número da Agenda reflete só compromisso do dia + atrasados | Conferência do F3b |
| 2026-09-16 | Claude | A largura da tela mora numa classe só (`.tela`), nunca no arquivo de rota. Medida de leitura estreita é do conteúdo, nunca do quadro | F4b |
| 2026-09-16 | Dono | **Nenhum vermelho vivo no produto.** Tudo na família do bordô, e mais suave em área grande | Conferência do F4 em produção |
| 2026-09-16 | Dono | Peticionar preenchido; "+ Novo" em bordô translúcido, para se distinguirem | Conferência do F4 |
| 2026-09-16 | Claude | Ação e risco compartilham o matiz e se distinguem por TRATAMENTO: só a ação é preenchida; risco é texto e filete. Ação destrutiva é bordô profundo, mais a palavra | F4i, `colorize` |
| 2026-09-16 | Dono | O quadro não pode ser capado e centralizado: num monitor largo isso é espaço vazio inútil | Conferência do F4 em produção |
| 2026-09-16 | Claude | Estabilidade de layout vem de REGRA CONSTANTE, não de largura pequena. O quadro ocupa a largura em toda tela densa; medida de leitura é da coluna, nunca da página | F4j, `adapt` + `layout` |

---

## 12. Como atualizar este documento (obrigatório)

Ao terminar **qualquer** bloco de trabalho, antes de encerrar:

1. **Bloco de Estado (topo):** atualize fase atual, próximo passo concreto, contagem de comandos e
   superfícies, data e quem atualizou.
2. **Seção 10:** mude o estado da linha (⬜ → 🔄 → ✅), preencha PR, data e uma nota curta do que foi
   decidido ou descoberto. Se pulou algo, use ⏭️ **e escreva o motivo** — pulo sem motivo registrado
   vira retrabalho.
3. **Seção 11:** se o dono decidiu qualquer coisa, acrescente uma linha nova. **Nunca edite linha
   antiga** — o valor deste log é ser histórico, não estado.
4. **Seção 2:** se uma dívida foi resolvida ou uma nova apareceu, ajuste a lista.
5. **Commit** junto com o trabalho, com mensagem em português:
   `atualiza plano mestre de redesign — <fase>: <o que mudou>`.

Se você **descobrir que este plano está errado** — a skill mudou, uma decisão do dono contradiz uma
fase, uma superfície não existe mais — **corrija o plano e registre a correção na seção 11**. Um plano
desatualizado é pior que nenhum, porque é obedecido.

---

*Criado em 2026-09-16 · Impeccable v4.3.1 · `buildPath: code` · 5 superfícies · 99 rotas · 24 comandos.*
