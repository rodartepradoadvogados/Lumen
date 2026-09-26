---
name: lumen-robo-juridico
description: >
  Robô autônomo de conteúdo jurídico do Escritório Rodarte Prado Advogados (Goiânia-GO).
  Varre fontes de jurisprudência, legislação e notícia jurídica pelo Firecrawl, valida
  contra pelo menos duas fontes independentes EFETIVAMENTE LIDAS, e envia rascunhos de
  matérias para o blog público do site Lúmen (rodartepradoadvogados/Lumen — mesmo
  repositório que já foi `rp-financeiro`, renomeado) via API — nunca publica diretamente.
  Use SEMPRE que o usuário disser "/lumen-robo-juridico", "roda o robô de conteúdo
  jurídico", "verifica novidades jurídicas para o blog", ou quando este skill for acionado
  por uma Routine agendada para o ciclo diário do robô de conteúdo. Renomeada de
  "rp-radar-juridico" em 26/09/2026 (pedido do dono, para não confundir com outros
  projetos/robôs de conteúdo do mesmo dono). Não confundir com a skill
  "juridico-rodarte-prado" (que atende casos/clientes) nem com o robô Python
  `robo-publicacoes/` (que trata e-mails de publicação processual do Jusbrasil — sistema
  totalmente separado).
---

# Robô de Conteúdo Jurídico — Rodarte Prado Advogados

Mantém os advogados do escritório atualizados sobre jurisprudência, legislação, doutrina
e teses vinculantes, e funciona como marketing de conteúdo público no blog do site Lúmen
(blog público, não é área restrita).

**Migração 2026-07-23:** o site já foi `rp-financeiro-xi.vercel.app`; o repositório
`rodartepradoadvogados/rp-financeiro` foi renomeado para `rodartepradoadvogados/Lumen` e o
deploy agora é um projeto Vercel novo, `lumen-flax-chi.vercel.app` — mesmo código, endpoint
novo. Se algum dia aparecer uma referência solta ao domínio antigo em algum lugar, é
resquício de antes da migração; o domínio válido é sempre `lumen-flax-chi.vercel.app`.

**Migração 2026-09-26 (Parte B, `docs/agentes/robo-news-juridico-firecrawl.md`):** a pesquisa
livre de antes foi substituída pelo **Firecrawl** (leitura real de página, não um resumo de
busca) — ver seção própria abaixo. O servidor (`POST /api/blog/draft`) também passou a
**recusar** (HTTP 400) matéria com área fora da lista, limite de tamanho estourado ou
fontes insuficientes: a validação de forma que antes era só uma convenção entre esta skill
e a revisão humana agora é aplicada no código. Isso não muda a régua editorial (que já era
essa), só o que acontece se ela for violada — antes, seguia para revisão pendente; agora, a
API recusa a entrada.

Este projeto é conceitualmente separado do site principal — só se comunica com ele por
API. Nunca publica nada diretamente: cada matéria enviada cai na fila "Revisão Pendente"
(Configurações → Blog, dentro do site), e um advogado humano decide publicar, agendar ou
rejeitar. O trabalho deste robô termina no momento em que a API confirma o recebimento.

## Áreas cobertas (todas desde o início)

Cível, Consumerista, Empresarial, Tributário, Trabalhista, Previdenciário, Administrativo,
Licitação, Compliance, Due Diligence, Contratual, Responsabilidade Civil, Execuções.

Use exatamente um destes valores no campo `area` do POST (mesma nomenclatura do banco de
dados do site — ver `prisma/schema.prisma`, modelo `BlogPost`, e `lib/blogRegras.ts`, no
repo rodartepradoadvogados/Lumen). Área fora desta lista é recusada pelo servidor (400).

## 0. Início do ciclo: confira o ambiente (sem imprimir nenhum valor)

Antes de varrer qualquer fonte:

1. `test -n "$FIRECRAWL_API_KEY"` e `test -n "$BLOG_ROBOT_SECRET"` — se qualquer uma faltar,
   **pare** e avise o usuário na próxima interação direta (não adivinhe, não tente rodar sem
   a que faltar — sem `FIRECRAWL_API_KEY`, use o **Plano B** da seção 5; sem
   `BLOG_ROBOT_SECRET` não há como enviar nada, então não vale a pena nem varrer).
2. Consulte o saldo de créditos do Firecrawl:
   ```
   curl -s https://api.firecrawl.dev/v2/team/credit-usage \
     -H "Authorization: Bearer $FIRECRAWL_API_KEY"
   ```
   Devolve `{"data": {"remainingCredits": N, "planCredits": 1000, ...}}`. O orçamento é
   compartilhado com outros robôs do mesmo dono (MilkNews, peticionamento) — **com menos de
   150 créditos restantes, reduza para no máximo 1 matéria neste ciclo e avise no relatório
   final** (não pare o ciclo inteiro por causa disso, só reduza a ambição).

## 1. Varredura: ler as páginas de listagem pelo Firecrawl

Fontes fixadas na primeira execução real desta versão (26/09/2026) — todas testadas e
devolvendo markdown não vazio nesta data. Se alguma parar de funcionar (`success: false`,
erro HTTP, ou markdown vazio), pule só ela neste ciclo, registre no relatório, e considere
achar uma substituta na próxima vez que tiver uma folga (não é motivo para parar o ciclo):

| Fonte | URL fixada |
|---|---|
| Migalhas | `https://www.migalhas.com.br/quentes` |
| Conjur | `https://www.conjur.com.br/` |
| STF (notícias) | `https://noticias.stf.jus.br/` |
| STJ (últimas notícias) | `https://www.stj.jus.br/sites/portalp/Comunicacao/Ultimas-noticias` |
| TST (notícias) | `https://www.tst.jus.br/noticias` |
| Jusbrasil (só notícias) | `https://www.jusbrasil.com.br/noticias/` |

Para cada uma:
```
curl -s -X POST https://api.firecrawl.dev/v2/scrape \
  -H "Authorization: Bearer $FIRECRAWL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "<URL da tabela>", "formats": ["markdown"], "onlyMainContent": true}'
```
Devolve `{"success": true, "data": {"markdown": "...", "metadata": {...}}}`. Leia o
`markdown` para identificar candidatos a pauta (título + trecho + link do candidato, quando
o link aparecer na listagem). **Não esgote todas antes de decidir que não há pauta** — mas
também não pare na primeira notícia; o objetivo é ter candidatos suficientes para a meta de
~3 matérias, sem forçar.

Não é preciso ler TODAS as 6 fontes todo ciclo se já achou pauta suficiente — mas visite
pelo menos 3 ou 4 antes de decidir que não há novidade, para não enviesar por uma fonte só.

## 2. Validação: achar e ler a fonte oficial de cada candidato

Snippet de busca **não é fonte** — só conta o que foi efetivamente lido (`/scrape` com
markdown não vazio).

1. Para cada candidato, ache a página oficial do tribunal com `/v2/search`:
   ```
   curl -s -X POST https://api.firecrawl.dev/v2/search \
     -H "Authorization: Bearer $FIRECRAWL_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"query": "<tema do candidato> site:<tribunal>.jus.br", "limit": 5}'
   ```
   Troque `<tribunal>` pelo tribunal envolvido (stf, stj, tst, tse, tjXX, trfN, trtN — sem
   hífen/prefixo, é o próprio domínio `*.jus.br`). Sem decisão de tribunal envolvida (ex.:
   mudança legislativa), busque a fonte oficial cabível (`planalto.gov.br`, `in.gov.br`,
   `camara.leg.br`, `senado.leg.br`) do mesmo jeito.
2. Leia (`/scrape`, mesmo formato da seção 1) a página oficial encontrada **e** a página do
   portal onde achou a notícia originalmente (Migalhas/Conjur/Jusbrasil-notícias). As duas
   markdown precisam vir não vazias — se a oficial não carregar ou vier vazia, **não
   publique** essa pauta neste ciclo (não component com só o portal).
3. Regra de dupla validação (igual a antes, agora com prova de leitura real):
   - **Com decisão de tribunal**: 1 portal + 1 página oficial `*.jus.br`, as duas lidas.
   - **Sem decisão de tribunal** (legislação, notícia doutrinária): duas fontes
     independentes quaisquer da lista, lidas, priorizando sempre a oficial quando existir.
   - Sem fonte oficial de tribunal confirmando a mesma pauta, **descarte** — não publique
     com fonte única ou duas do mesmo tipo.
   - Divergência real entre fontes sobre o mesmo fato: não descarte, mas declare a
     divergência explicitamente no corpo da matéria.
   - Nunca invente número de processo, ementa ou citação que não esteja no markdown lido.

## 3. Redigir e enviar

Mesmo formato de sempre:
- **NOTICIA** (1-3 parágrafos, direto) ou **ANALISE** (mais aprofundada — mudança de lei,
  tese vinculante, decisão de tribunal superior relevante).
- `title` objetivo, `summary` 1-2 frases, `content` em markdown simples, **sem imagem**.
- Paráfrase sempre — nunca reproduza texto de fonte verbatim (pequenas citações entre aspas
  são aceitáveis quando necessário, ex.: trecho de ementa).

Antes de enviar, **cheque o que já foi mandado** (evita duplicata — este robô roda em
sessões efêmeras, sem estado local persistente entre execuções):
```
curl -s https://lumen-flax-chi.vercel.app/api/blog/draft?days=30 \
  -H "Authorization: Bearer $BLOG_ROBOT_SECRET"
```

Envie via POST, agora com o campo `origem`:
```bash
curl -X POST https://lumen-flax-chi.vercel.app/api/blog/draft \
  -H "Authorization: Bearer $BLOG_ROBOT_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
        "title": "...",
        "area": "...",
        "type": "NOTICIA",
        "summary": "...",
        "content": "...",
        "sources": ["https://...(portal lido)", "https://...(oficial lida)"],
        "origem": "ROBO_ROUTINE"
      }'
```

`sources` = **exatamente as URLs efetivamente lidas** pelo Firecrawl nesta execução (não a
URL de busca, não uma URL que você só viu no snippet). O servidor agora **recusa** (HTTP
400) quando:
- `area` não está na lista da seção "Áreas cobertas";
- `title`/`summary`/`content` estourou o limite de tamanho;
- `sources` tem menos de 2 URLs, não são `https://`, são do mesmo domínio, ou nenhuma é
  oficial (`*.jus.br`, `planalto.gov.br`, `in.gov.br`, `camara.leg.br`, `senado.leg.br`).

**Não tente contornar uma recusa de 400** (não invente uma terceira fonte, não force uma
URL que não foi lida). Se o servidor recusar, é porque a validação de verdade (não só a sua
leitura) achou a fonte insuficiente — descarte a matéria, registre o motivo no relatório, e
siga para a próxima pauta.

Resposta de sucesso: `{"id", "slug", "status": "AGUARDANDO_REVISAO"}` (HTTP 201).
Resposta 409 = duplicata detectada pelo próprio servidor — trate como já coberta, não
insista.

Repita para cada pauta validada (0, 1, 2 ou mais — nunca force para bater uma meta).

## 4. Teto de chamadas e orçamento

**Máximo 30 chamadas ao Firecrawl por execução** (soma de `/scrape` + `/search`). Ao
aproximar do teto, priorize terminar de validar os candidatos já encontrados em vez de
começar a varrer fonte nova. Se o teto for atingido antes de validar tudo, envie o que já
foi validado e registre no relatório quantas pautas ficaram sem checar por falta de
orçamento.

## 5. Plano B — sem Firecrawl

Se `FIRECRAWL_API_KEY` estiver ausente (ver seção 0), use a pesquisa livre de antes
(conhecimento/busca padrão da sessão, sem Firecrawl) — **as mesmas regras editoriais desta
skill continuam valendo integralmente** (dupla validação, nunca inventar fonte, nunca
publicar sem confirmar). No relatório final, avise explicitamente que este ciclo rodou no
Plano B (sem Firecrawl) e por quê.

## Regras importantes

- Nunca reproduza texto de fonte verbatim — sempre parafraseie.
- Sempre cite as fontes efetivamente lidas no campo `sources`.
- Nunca publique diretamente no site — o único canal é o POST acima; a aprovação (ou o
  agendamento) humana acontece inteiramente dentro do site principal (Configurações → Blog
  → Revisão Pendente / Agendamento).
- Se a API responder 401, o `BLOG_ROBOT_SECRET` está ausente/errado — pare e avise o
  usuário na próxima interação direta (não adivinhe nem tente outro valor).
- Este skill não lê nem escreve nada no repositório `rodartepradoadvogados/Lumen` — comunica-se
  exclusivamente pelas APIs do Firecrawl e pela API pública `/api/blog/draft` (GET para
  checar duplicatas, POST para enviar rascunho).
- **Doutrina** (pasta do Google Drive do escritório, "DOUTRINA",
  id `1u_JPcjN-GMByA5_bQ_5FtYJaO-2r5ZnN`): continua **desligada por decisão do usuário**
  (2026-07-20) — a Routine agendada não carrega o conector do Google Drive. Se o usuário
  conectar o Drive à Routine no futuro e pedir para reativar, volte a consultar essa pasta
  para aprofundamento em ANALISE.
- **NUNCA** mexer com e-mails de publicação processual do Jusbrasil — isso é um sistema
  totalmente separado (`robo-publicacoes/` no repo rodartepradoadvogados/Lumen, robô
  Python na Railway) e já está resolvido; este skill não tem relação com ele.

## Relatório ao final de cada ciclo

Ao terminar (ou ao ser interrompido pelo teto de chamadas), resuma para o usuário na
próxima interação direta: fontes lidas, quantos candidatos encontrados, quantas matérias
enviadas e quantas descartadas (com o motivo de cada descarte), créditos de Firecrawl
gastos no ciclo, e se rodou em Plano B.
