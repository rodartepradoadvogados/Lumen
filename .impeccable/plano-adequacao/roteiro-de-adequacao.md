# Roteiro de adequação — achados da crítica Impeccable (site + PWA)

Origem: `$impeccable critique` rodado em 2026-09-10 sobre dois alvos — site público
(`app/page.tsx` + `app/blog`, snapshot `.impeccable/critique/2026-09-10T09-22-18Z__app-page-tsx.md`,
19/32) e app mobile PWA (`app/m`, snapshot `.impeccable/critique/2026-09-10T09-22-28Z__app-m.md`,
23/40).

**Como usar este documento:** é o ROTEIRO — a lista fixa de itens, sua ordem e seu critério de
aceite. Não editar o texto de um item já numerado; se o entendimento de um item mudar depois de
começar a mexer nele, registrar a mudança em `andamento.md`, não aqui. Este arquivo só ganha itens
novos (de uma futura rodada de crítica) no fim da lista correspondente à sua severidade — nunca
reordenar itens já numerados.

**Antes de qualquer rodada de trabalho:** leia `andamento.md` primeiro para saber o que já foi
feito. Ele é o histórico cumulativo — mesma regra do `docs/gauntlet/andamento-2026-09.md` deste
repositório: cada rodada acrescenta um bloco novo, nunca reescreve um bloco anterior.

**Mockups de validação visual:** os itens marcados 🎨 têm uma proposta visual no artifact HTML
publicado (link em `andamento.md`, seção "Validação visual") e uma cópia local em
`.impeccable/plano-adequacao/mockups.html`. Não implementar um item 🎨 antes de o dono do projeto
validar a direção visual correspondente.

---

## P0 — Crítico (compromete confiança/uso agora)

### P0-1 · SITE · Preço ao vivo mostra instrução interna "SUBSTITUIR" 🎨
- **Onde:** `app/page.tsx`, seção 6 (Preço), variável `placeholderBox`/`placeholderTag`, linhas ~99-100 e ~219-220.
- **O quê:** todo plano cujo módulo incluso não tem preço configurado (`calc.modulosSemPreco.length > 0`) renderiza `R$ —/mês` numa caixa com borda tracejada e uma etiqueta "Substituir" — hoje isso é 4 dos 5 planos, ao vivo, para qualquer visitante.
- **Por quê:** "Substituir" é instrução de admin, não copy de cliente; no ponto de maior confiança da página (preço), isso lê como bug.
- **Correção:** quando `semPreco`, esconder o cartão OU trocar por copy neutra de cliente ("Fale com a gente para o valor deste plano"), sem a etiqueta admin nem a moldura tracejada. Resolve junto o P3-1 (token `vinho` reaproveitado) — o novo tratamento não deve usar `--vinho`.
- **Comando sugerido:** `$impeccable harden`
- **Critério de aceite:** nenhum plano visível a um visitante mostra a palavra "Substituir" nem `border-dashed`; um plano sem preço configurado mostra uma chamada de contato ou fica oculto até ter preço.

### P0-2 · SITE · 5 seções de recurso mostram legenda de "captura de tela" em vez de imagem 🎨
- **Onde:** `app/page.tsx`, seção 4 (Linhas de recurso), `FEATURES.map`, div com `<p>Captura de tela — {f.figure}</p>`.
- **O quê:** 100% da seção "veja o produto" é texto descrevendo uma imagem que não existe, para as 5 features (Publicações, Painel, Peticionamento, Financeiro, Sigilo).
- **Por quê:** um comprador de primeira viagem precisa ver o produto antes de confiar caso/dados financeiros a ele; 5 caixas de "sem imagem" seguidas comunicam abandono, não trabalho em progresso.
- **Correção:** até haver fotografia/captura real, substituir por um sistema de diagrama de marca — ilustração abstrata na linguagem visual do sistema (réguas + bordô), uma por feature, não um placeholder de desenvolvedor.
- **Comando sugerido:** `$impeccable adapt`
- **Critério de aceite:** nenhuma seção de recurso mostra a string literal "Captura de tela"; cada uma tem uma peça visual desenhada (mesmo que provisória) no lugar.

### P0-3 · PWA · Aba "R$" abre o hub de 6 sub-rotas que a própria especificação manda remover 🎨
- **Onde:** `app/m/financeiro/page.tsx`.
- **O quê:** a aba financeira do PWA é uma lista de 6 links (Despesas, Receitas, Relatórios Gerenciais, Fluxo de Caixa, DRE, Livro Caixa) — exatamente o "peso morto" que `design_handoff_lumen_redesign/08-pwa.md` diagnostica ("financeiro com sete sub-rotas... isso é peso morto") e manda substituir por "resumo do mês, três números".
- **Por quê:** é a tela que devia responder "como estão minhas contas" num relance; hoje exige escolher entre 6 sub-telas antes de ver qualquer número.
- **Correção:** construir o resumo de 3 números (proposta: saldo em caixa, a vencer hoje, atrasadas) como o conteúdo da própria aba; manter as 6 sub-rotas um toque de distância ("ver detalhes"), não como o corpo inteiro da tela.
- **Comando sugerido:** `$impeccable distill`
- **Critério de aceite:** abrir a aba "R$" mostra 3 números antes de qualquer lista; as 6 sub-rotas continuam acessíveis, mas atrás de um toque.

### P0-4 · PWA · "Novo atendimento" não é o fluxo de 3 campos com ditado que a especificação nomeia como razão de existir do PWA 🎨
- **Onde:** `components/mobile/MobileNewAttendanceForm.tsx`, rota `/m/atendimento/novo`.
- **O quê:** o formulário tem 10+ campos (nome, telefone, e-mail, canal, matéria, prazo de resposta, modo de honorário com 3 variantes, checklist de pendências, upload de anexo). `design_handoff_lumen_redesign/08-pwa.md` especifica 3 campos (Nome/Telefone/Assunto) + ditado opcional (`SpeechRecognition`) + botão salvar — e chama esta tela de "a tela que justifica o PWA". Não há nenhuma chamada a `SpeechRecognition` no repositório.
- **Por quê:** é a tela pensada para uso sob pressão (corredor do fórum); hoje é o formulário mais longo do app mobile.
- **Correção:** caminho padrão com os 3 campos da especificação + botão de microfone (Web Speech API, degradação silenciosa onde não existir) + "Salvar atendimento"; mover honorário/pendências/anexo para trás de um "mais detalhes" (ou deixar só para o desktop, como o próprio documento já prevê: "qualificação, funil e vínculo com processo ficam para o desktop"). **Ajuste pedido pelo dono do projeto (2026-09-10):** o controle de "mais detalhes" precisa ter destaque visual — não pode ser uma nota discreta/apagada fácil de não notar. Tratar como um botão secundário de verdade (mesma régua de `ButtonSecondary`), não como texto auxiliar de rodapé.
- **Comando sugerido:** `$impeccable distill`
- **Critério de aceite:** a tela padrão de "novo atendimento" mostra só Nome/Telefone/Assunto + microfone + Salvar; os demais campos ficam atrás de uma ação explícita de "mais detalhes" com destaque visual suficiente para ser notada (não um texto pequeno/apagado).
- **Addendum ($impeccable audit, 2026-09-10):** o próprio botão "Salvar atendimento" mede ~40-41px de altura (`py-2.5` implícito), abaixo dos 52px que `08-pwa.md` nomeia explicitamente para este botão. Corrigir junto: `h-[52px]` (ou `min-h-[52px]`) explícito, não padding implícito.

### P0-5 · SITE · CTA de fechamento reprova contraste WCAG AA (2,15:1)
- **Onde:** `app/page.tsx:262` — `text-marca` sobre `bg-marca`/fundo escuro na seção "Fecho em pôster"; mesmo padrão em `app/blog/page.tsx:49` (subtítulo "BLOG JURÍDICO" sobre `bg-grafite-800`).
- **O quê:** achado do `$impeccable audit` (não do critique). Contraste medido ao vivo: 2,15:1 (precisa 4,5:1, WCAG 1.4.3). O próprio código já resolve esse mesmo problema corretamente em outro lugar (`app/blog/[slug]/page.tsx:57`, "Voltar ao blog" usa `text-white` em vez de bordô sobre escuro) e o DESIGN.md documenta o token certo para isso: `--rail-marca` (`#c9707f`), criado exatamente para bordô-como-texto sobre superfície fixa escura.
- **Por quê:** é o botão de conversão final da página — praticamente ilegível hoje, não um detalhe estético.
- **Correção:** trocar `text-marca` → `text-acao-tx` (creme, mesmo tom do botão primário do hero) ou `text-rail-marca` nos dois locais.
- **Comando sugerido:** `$impeccable harden`
- **Critério de aceite:** contraste ≥4,5:1 nos dois elementos; nenhum outro uso de `text-marca` sobre fundo `grafite-800`/`bg-marca` escuro sem passar por `--rail-marca`/`--acao-tx`.

---

## P1 — Importante (atrapalha mas tem contorno)

### P1-1 · SITE · Nav do cabeçalho some inteiro no mobile 🎨
- **Onde:** `app/page.tsx`, `<nav className="hidden md:flex">`, linha ~126.
- **O quê:** abaixo do breakpoint `md`, Produto/Preço/Blog/Entrar desaparecem sem nenhum substituto — só logo e "Começar" sobrevivem.
- **Por quê:** um visitante mobile não alcança Preço nem Blog a partir do cabeçalho.
- **Correção:** menu hambúrguer mínimo (ícone Menu/X abrindo um overlay) na mesma linguagem visual (réguas, alinhado à esquerda) do resto do sistema.
- **Comando sugerido:** `$impeccable layout`
- **Critério de aceite:** todo link do nav do desktop (Produto/Preço/Blog/Entrar) é alcançável em viewport mobile.

### P1-2 · PWA · Alvos de toque sistematicamente abaixo do piso de 44px da própria especificação
- **Onde:** `app/m/agenda/page.tsx` (setas de paginação de dia/semana, `h-9 w-9` = 36px, ~linhas 147/163/302/312); `app/m/layout.tsx` (ícones de sino/menu do cabeçalho, `h-8 w-8` = 32px, ~linhas 122/136).
- **O quê:** `design_handoff_lumen_redesign/08-pwa.md` afirma "Alvo de toque mínimo 44px em qualquer elemento acionável" como critério de aceite; medido ao vivo (`getBoundingClientRect`), os itens acima ficam em 32-36px.
- **Por quê:** são controles usados repetidamente com uma mão só, num contexto de pressa/interrupção — exatamente onde um alvo pequeno demais causa mais erro de toque.
- **Correção:** elevar para `h-11 w-11` (44px), mantendo o ícone visualmente do mesmo tamanho dentro da área de toque maior.
- **Comando sugerido:** `$impeccable harden`
- **Critério de aceite:** nenhum elemento acionável do `/m` mede menos que 44×44px.

### P1-3 · PWA · Texto abaixo do piso de 13px da especificação é a norma, não a exceção
- **Onde:** achado do detector (`impeccable detect`), 121 ocorrências em 40 arquivos sob `app/m/` e `components/mobile/`; confirmado ao vivo em `components/mobile/MobileBottomNav.tsx` (rótulos das abas, 10px), badge "99+" (9px), nome do escritório no cabeçalho (10px).
- **O quê:** `08-pwa.md`: "Corpo 15px; nada abaixo de 13px." Hoje 10-11px é o padrão em rótulo/badge/metadado por todo o `/m`.
- **Por quê:** texto pequeno demais numa tela usada com o braço estendido, possivelmente sob luz forte de corredor.
- **Correção:** elevar o piso para 13px em qualquer texto que carregue informação (rótulo, badge, metadado); reservar tamanho menor só para decoração pura, se sobrar algum caso.
- **Comando sugerido:** `$impeccable typeset`
- **Critério de aceite:** `impeccable detect` sobre `app/m` e `components/mobile` não reporta mais `design-system-font-size` abaixo de 13px para texto informativo.
- **Addendum ($impeccable audit, 2026-09-10):** o achado do detector (121 ocorrências) só cobre valor arbitrário (`text-[11px]` etc.) — a classe padrão do Tailwind `text-xs` (12px) **não é pega pelo detector** (ele é calibrado contra a escala global do DESIGN.md, que aceita 12px, não contra o piso de 13px específico do `08-pwa.md`) e aparece **266 vezes em 71 arquivos** de `app/m`/`components/mobile` — uma ordem de grandeza maior que o achado original. Ao corrigir este item, varrer `text-xs` manualmente também, não só o output do detector; e considerar registrar essa exceção de piso como regra própria em algum lugar checável no futuro (não é um `$impeccable detect` genérico que vai pegar isso de novo).

### P1-7 · PWA · Rótulo de formulário sem associação programática (`htmlFor`/`id`) — sistêmico
- **Onde:** praticamente todo `components/mobile/*Form*.tsx` (`MobileNewAttendanceForm.tsx`, `MobileNewTaskForm.tsx`, `MobileNewPayableForm.tsx`, `MobileNewReceivableForm.tsx`, `MobileSettleForm.tsx`, `MobileLancarHonorariosForm.tsx` etc.) — `grep -r htmlFor components/mobile` retorna 1 única ocorrência (`MobileNovaAnotacaoForm.tsx`), em dezenas de arquivos com formulário.
- **O quê:** achado do `$impeccable audit`. `<label>` visual sem `htmlFor`/`id` correspondente — leitor de tela não anuncia o nome do campo.
- **Por quê:** afeta todo fluxo de criar/editar do PWA, não um formulário isolado.
- **Correção:** parear `<label htmlFor={id}>` com `id={id}` no controle, em todo formulário mobile.
- **Comando sugerido:** `$impeccable harden`
- **Critério de aceite:** todo `<label>` em `components/mobile/` tem `htmlFor` apontando para um `id` real no controle correspondente.
- **WCAG:** 1.3.1 (Info and Relationships), 4.1.2 (Name, Role, Value).

### P1-8 · PWA · Erro de validação não é anunciado a tecnologia assistiva
- **Onde:** `components/mobile/MobileNewAttendanceForm.tsx:375` (`{error && <p ...>{error}</p>}`, sem `role="alert"`/`aria-live`) e o mesmo padrão nos demais formulários mobile de criar/editar.
- **O quê:** achado do `$impeccable audit`. Erro aparece visualmente mas não é anunciado a quem usa leitor de tela.
- **Correção:** `role="alert"` (ou região `aria-live="assertive"`) no parágrafo de erro.
- **Comando sugerido:** `$impeccable harden`
- **Critério de aceite:** erro de validação é anunciado por leitor de tela no momento em que aparece.
- **WCAG:** 3.3.1 (Error Identification), 4.1.3 (Status Messages).

### P1-9 · SITE · Nav/rodapé com alvo de toque abaixo do mínimo em todos os links de texto
- **Onde:** `app/page.tsx:127-130` (nav Produto/Preço/Blog/Entrar, medido 20px de altura), `app/page.tsx:280-301` (links do rodapé, 17px), `app/blog/[slug]/page.tsx:57` (Voltar ao blog).
- **O quê:** achado do `$impeccable audit`. Nenhum desses `<a>` tem padding vertical — a área clicável é só a altura da linha de texto.
- **Correção:** adicionar `py-2` (ou equivalente) para alcançar ao menos 24px (idealmente 44px) de altura de toque.
- **Comando sugerido:** `$impeccable adapt`
- **Critério de aceite:** todo link de texto do nav/rodapé mede pelo menos 24×24px.
- **WCAG:** 2.5.8 Target Size (Minimum), AA.

### P1-10 · SITE · Hierarquia de heading pula de h1 para h3
- **Onde:** `app/page.tsx:142` (`<h1>`) → `app/page.tsx:175` (`<h3>` por feature) sem `<h2>` intermediário até a seção de preço (`app/page.tsx:207`).
- **O quê:** achado do `$impeccable audit` — mesma família do achado `skipped-heading` já visto na crítica de UX (backlog), agora com localização exata.
- **Correção:** promover o título de cada feature a `<h2>`, ou inserir um `<h2>` de seção visualmente oculto acima do bloco de recursos.
- **Comando sugerido:** `$impeccable harden`
- **Critério de aceite:** nenhum nível de heading é pulado entre `<h1>` e o primeiro `<h2>` de conteúdo.
- **WCAG:** 1.3.1 (Info and Relationships).

---

## P2 — Moderado (ajuste na próxima passada)

### P2-1 · SITE · Decisão de preço com 5 opções simultâneas, nenhuma recomendada 🎨
- **Onde:** `app/page.tsx`, seção 6 (Preço), `plans.map`.
- **O quê:** 5 cartões de plano visualmente idênticos, 4 deles sem preço (ver P0-1) — excede a diretriz de carga cognitiva de ≤4 opções visíveis num ponto de decisão, sem nenhum âncora de "este é o mais comum".
- **Correção:** destacar um plano com o token `acao-light` (já reservado no DESIGN.md para uma ação secundária-mas-de-marca) e um rótulo "Recomendado". **Requisito adicional pedido pelo dono do projeto (2026-09-10):** qual plano é "o recomendado" não pode ficar fixo no código — criar um local claro em Painel Mestre (junto de onde os planos já são administrados, `app/painel-mestre/precos/`) para o operador da plataforma trocar o plano recomendado quando quiser, sem precisar de deploy. Implementar sem perguntar de novo; só informar depois de feito.
- **Comando sugerido:** `$impeccable clarify`
- **Critério de aceite:** um plano tem tratamento visual distinto de "recomendado"; nenhum novo token de cor é introduzido; existe um controle em Painel Mestre → Preços que decide qual plano recebe esse destaque, sem exigir mudança de código para trocar.

### P2-2 · PWA · Menu "+" e checklist de pendências excedem 4 opções visíveis num único ponto de decisão 🎨
- **Onde:** `components/mobile/MobileNewEntitySheet.tsx` (9 opções: 4 Cadastro + 5 Compromisso, grid único); `components/mobile/MobileNewAttendanceForm.tsx`, seção "Solicitar ao lead" (6 caixas de checklist num grupo só).
- **Correção:** destacar "Atendimento" como item maior acima do grid secundário (é o item que a especificação já trata como o de maior valor); recolher o checklist de pendências atrás de um toggle "adicionar pendência".
- **Comando sugerido:** `$impeccable clarify`
- **Critério de aceite:** o menu "+" tem um item primário visualmente distinto dos demais; o checklist de pendências não aparece expandido por padrão.

### P2-3 · SITE · Consulta do blog sem paginação/limite
- **Onde:** `app/blog/page.tsx:29-34` — `prisma.blogPost.findMany` sem `take`/cursor.
- **O quê:** achado do `$impeccable audit`. Todo post publicado é buscado e renderizado numa página só, sem limite — custo cresce sem teto à medida que o robô de conteúdo jurídico publica continuamente.
- **Correção:** paginação por `take`/cursor, ou scroll infinito com tamanho de página razoável.
- **Comando sugerido:** `$impeccable optimize`

### P2-4 · SITE · Imagens do blog sem lazy-loading
- **Onde:** `app/blog/page.tsx:70`, `app/blog/[slug]/page.tsx:66` — `<img>` sem `loading`/`width`/`height` (bypass deliberado de `next/image`, `eslint-disable-next-line @next/next/no-img-element`).
- **Correção:** no mínimo `loading="lazy" decoding="async"`; considerar voltar a `next/image` com loader remoto configurado, se o bypass foi só para evitar configurar domínio.
- **Comando sugerido:** `$impeccable optimize`

### P2-5 · SITE · As 3 rotas públicas são `force-dynamic`, sem cache
- **Onde:** `app/page.tsx:39`, `app/blog/page.tsx:7`, `app/blog/[slug]/page.tsx:8`.
- **O quê:** achado do `$impeccable audit`. Toda visita anônima refaz uma ida ao banco ao vivo para conteúdo (preço, posts) que muda no máximo algumas vezes por dia — exatamente a parte mais cacheável e de maior tráfego do app, hoje a única sem cache de borda possível.
- **Correção:** separar a checagem de sessão (precisa ficar dinâmica) do conteúdo de marketing (candidato a `revalidate`/ISR), ou mover a checagem de sessão para middleware para o corpo da página poder ser cacheado.
- **Comando sugerido:** `$impeccable optimize`

### P2-6 · SITE · Banner de cookies sem papel ARIA/região viva
- **Onde:** `components/site/CookieConsent.tsx:26-52`.
- **O quê:** achado do `$impeccable audit`. Banner aparece via mudança de estado client-side sem `role="region"`/`role="dialog"` nem `aria-live` — leitor de tela não é avisado que um elemento interativo novo apareceu.
- **Correção:** `role="region" aria-label="Aviso de cookies"` no contêiner; considerar `aria-live="polite"` dado que aparece depois da hidratação.
- **Comando sugerido:** `$impeccable harden`
- **WCAG:** 4.1.3 (Status Messages).

### P2-7 · PWA · Lista de publicações sem paginação/virtualização em escala de até 3000 linhas
- **Onde:** `app/m/publicacoes/page.tsx:45-50` (`prisma.publication.findMany(..., take: 3000)`), renderizado por completo em `groups.map` sem janelamento.
- **O quê:** achado do `$impeccable audit`. O próprio comentário do código descreve o `take: 3000` como "rede de segurança, não corte de exibição" — no pior caso, até 3000 linhas são buscadas e potencialmente renderizadas sem virtualização num aparelho móvel. Nenhuma lib de virtualização (`react-window`/`react-virtual`) está instalada.
- **Correção:** paginar ou virtualizar (renderizar só os primeiros N grupos + "carregar mais") quando a contagem de não lidas passar de um limite.
- **Comando sugerido:** `$impeccable optimize`

### P2-8 · PWA · Casca do `/m` sem `max-width` — full-bleed em qualquer largura
- **Onde:** `app/m/layout.tsx` (`<main className="pb-20 min-h-screen">`) e `components/mobile/MobileBottomNav.tsx:42` (`inset-x-0`), sem limite superior em lugar algum da árvore de layout.
- **O quê:** achado do `$impeccable audit`. Um administrador de plataforma acessando `/m` num tablet ou navegador desktop recebe formulário/lista/barra de abas esticados full-bleed, sem limite.
- **Correção:** envolver o conteúdo da casca num `max-w-md mx-auto` (ou similar); deixar só cabeçalho/nav fixos com largura total, se isso for intencional.
- **Comando sugerido:** `$impeccable layout`

---

## P3 — Polimento (sem impacto real de usuário; fazer se sobrar tempo)

### P3-1 · SITE · Token `vinho` (só ação destrutiva) reaproveitado para "preço pendente"
- **Onde:** `app/page.tsx`, `placeholderBox`/`placeholderTag` (`border-atencao`/`text-atencao`, que resolve para `--vinho`).
- **Nota:** resolvido junto com P0-1 — não precisa de rodada própria se P0-1 já eliminar a moldura tracejada por completo.
- **Comando sugerido:** `$impeccable colorize`
- **Critério de aceite:** nenhum elemento não-destrutivo usa `--vinho`/`text-atencao`/`border-atencao`.
- **Confirmado independentemente pelo `$impeccable audit`** (mesmo achado, mesma correção).

### P3-2 · SITE · Escala tipográfica própria, desconectada da escala do DESIGN.md (19 ocorrências)
- **Onde:** achado do detector (`impeccable detect`, ambos critique e audit bateram no mesmo resultado): `app/page.tsx` (10/11/13/15/26/30px em várias linhas), `app/blog/page.tsx` e `app/blog/[slug]/page.tsx` (11/15px).
- **O quê:** o site público roda sua própria escala ad hoc, sem nenhum comentário reconhecendo isso como exceção deliberada — ao contrário da exceção de fonte serifada do blog (`app/blog/layout.tsx:4-16`), que é documentada.
- **Correção:** encaixar título/rótulo na escala 24/16/14/12px do DESIGN.md onde fizer sentido, ou documentar formalmente uma exceção de escala do site de marketing (do mesmo jeito que a exceção Lora do blog já é documentada).
- **Comando sugerido:** `$impeccable typeset`

### P3-3 · SITE · Valor de superfície escura não documentado e `black` cru
- **Onde:** `app/page.tsx:191` (`bg-grafite-900`, `#0f1216`, mais escuro que a única superfície escura fixa documentada, Ardósia Noturna `#16191d`/grafite-800) e `app/page.tsx:262` (`hover:bg-black`, `#000` cru, não é token do DESIGN.md).
- **Correção:** usar `bg-grafite-800` de forma consistente; trocar `hover:bg-black` por `hover:bg-grafite-900` ou outro valor de token.
- **Comando sugerido:** `$impeccable colorize`

### P3-4 · PWA · Bloco `.mobile-input` duplicado em 8 arquivos, com raio fora da escala (5px)
- **Onde:** mesmo bloco `<style jsx global>{ .mobile-input { border-radius: 0.3125rem; ... } }` copiado em `app/m/financeiro/despesas/page.tsx:134`, `receitas/page.tsx:155`, `components/mobile/MobileLancarHonorariosForm.tsx:751`, `MobileLicitacaoDetail.tsx:265`, `MobileNewPayableForm.tsx:300`, `MobileNewReceivableForm.tsx:170`, `MobileNewTaskForm.tsx:189`, `MobileSettleForm.tsx:183`.
- **O quê:** achado do `$impeccable audit`. 5px fica entre os tokens `sm` (4px) e `md` (6px) do DESIGN.md — e está duplicado 8 vezes, tendendo a divergir ainda mais com o tempo.
- **Correção:** extrair para uma única classe compartilhada usando `rounded-md` (6px, o token documentado).
- **Comando sugerido:** `$impeccable distill`

### P3-5 · PWA · Filete de fonte da publicação em 4px, especificação pede 2px
- **Onde:** `app/m/publicacoes/page.tsx:97` — `border-l-4` (4px).
- **O quê:** achado do `$impeccable audit`. `08-pwa.md` especifica "filete de 2px no topo (ou na esquerda quando indica severidade/fonte)" — o uso à esquerda para indicar fonte é sancionado pela própria especificação, mas a largura usada (4px) não bate com o valor documentado (2px). É este elemento que o detector sinaliza como `side-tab` (aviso) — o achado é real, mas a causa exata é "largura errada", não "padrão proibido".
- **Correção:** trocar para `border-l-2` para bater com o filete documentado.
- **Comando sugerido:** `$impeccable colorize`

---

## Backlog — achados menores da crítica (sem severidade P0-P3, registrar mas não agendar sozinho)

- SITE: contraste `text-tx-3` (~2,6-2,9:1) abaixo de WCAG AA 4.5:1 em várias legendas/rodapé — auditar quando/se um padrão formal de acessibilidade for definido (`PRODUCT.md` registra que isso ainda está em aberto).
- SITE: `skipped-heading` real (h1→h3 e h2→h4) — corrigir a hierarquia de heading sem mudar o visual.
- SITE: rodapé "Produto" omite o link Blog que existe no header.
- SITE: comentário desatualizado em `app/page.tsx` (linhas 18-24) ainda cita "vermelho #ec3013"; os tokens já são bordô — corrigir o comentário na próxima vez que o arquivo for tocado.
- PWA: achado `dark-glow` (`#ffba00`) não corresponde a nenhum hex do repositório — falso positivo confirmado (ver `andamento.md`), não agir.
- Fora do escopo desta crítica, mas observado durante a sessão: fricção real relatada pelo usuário no fluxo de login/`/escolher` — candidato a uma crítica dedicada futura (`$impeccable critique app/login` + `app/escolher`).
- PWA (`$impeccable audit`): estrutura de cartão-dentro-de-cartão em `components/mobile/MobilePublicationCard.tsx:139` (item aninhado dentro do grupo expandido, dentro do filete de fonte de `app/m/publicacoes/page.tsx:97`, dentro do `<Card>` da página) — confirma em código os "387 anti-padrões" que a crítica de UX já tinha achado ao vivo nessa tela. Achatar para um único contêiner com borda por grupo quando o item P3-5 acima for resolvido; sem item de severidade próprio porque é a mesma causa raiz do achado de UX já registrado.
- SITE (`$impeccable audit`): `13px` em `app/page.tsx:161` etc. sinalizado pelo detector como "fora da escala do DESIGN.md" é, na verdade, o piso mínimo que o próprio `08-pwa.md` define para o `/m` — achado informativo do detector sobre o site, sem ação (o site não segue a regra de piso do PWA, e não precisa seguir).

---

## Ordem de execução recomendada

Atualizada após a rodada de `$impeccable audit` (2026-09-10) — os 6 novos itens (P0-5, P1-7 a
P1-10, P2-3 a P2-8, P3-2 a P3-5) entram na ordem global por criticidade, junto com os 10 da
crítica de UX original:

1. **P0** — P0-1 → P0-2 → P0-3 → P0-4 → P0-5 (site primeiro por serem mais rápidos/visíveis; PWA
   depois; P0-5 por último por ser a mais mecânica dos cinco — troca de classe, sem decisão de
   produto)
2. **P1** — P1-1 → P1-2 → P1-3 → P1-7 → P1-8 → P1-9 → P1-10 (mecânicos de acessibilidade/toque
   do site e do PWA agrupados; nenhum exige mockup)
3. **P2** — P2-1 → P2-2 → P2-3 → P2-4 → P2-5 → P2-6 → P2-7 → P2-8
4. **P3** — P3-1 → P3-2 → P3-3 → P3-4 → P3-5
5. Backlog, oportunisticamente

Itens 🎨 aguardam (ou já receberam — ver `andamento.md`) validação visual do dono do projeto
antes de entrar em execução. Os itens vindos do `$impeccable audit` são todos mecânicos/técnicos
(sem ambiguidade visual) e podem ser implementados assim que alcançados na ordem acima, sem
esperar mockup.
