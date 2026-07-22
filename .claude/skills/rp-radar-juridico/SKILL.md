---
name: rp-radar-juridico
description: >
  Robô autônomo de conteúdo jurídico do Escritório Rodarte Prado Advogados (Goiânia-GO).
  Varre fontes de jurisprudência, legislação e notícia jurídica, valida contra pelo menos
  duas fontes independentes, e envia rascunhos de matérias para o blog público do site
  principal (rp-financeiro) via API — nunca publica diretamente. Use SEMPRE que o usuário
  disser "/rp-radar-juridico", "roda o robô de conteúdo jurídico", "verifica novidades
  jurídicas para o blog", ou quando este skill for acionado por uma Routine agendada para
  o ciclo diário do robô de conteúdo. Não confundir com a skill "juridico-rodarte-prado"
  (que atende casos/clientes) nem com o robô Python `robo-publicacoes/` (que trata
  e-mails de publicação processual do Jusbrasil — sistema totalmente separado).
---

# Robô de Conteúdo Jurídico — Rodarte Prado Advogados

Mantém os advogados do escritório atualizados sobre jurisprudência, legislação, doutrina
e teses vinculantes, e funciona como marketing de conteúdo público no blog do site
(`rp-financeiro`, blog público, não é área restrita).

Este projeto é conceitualmente separado do site principal — só se comunica com ele por
API. Nunca publica nada diretamente: cada matéria enviada cai na fila "Revisão Pendente"
(Configurações → Blog, dentro do site), e um advogado humano decide publicar ou rejeitar.
O trabalho deste robô termina no momento em que a API confirma o recebimento.

## Áreas cobertas (todas desde o início)

Cível, Consumerista, Empresarial, Tributário, Trabalhista, Previdenciário, Administrativo,
Licitação, Compliance, Due Diligence, Contratual, Responsabilidade Civil, Execuções.

Use exatamente um destes valores no campo `area` do POST (mesma nomenclatura do banco de
dados do site — ver `prisma/schema.prisma`, modelo `BlogPost`, no repo rp-financeiro).

## Fontes de pesquisa

- **Migalhas** (https://www.migalhas.com.br/)
- **Conjur** (https://www.conjur.com.br/)
- **Jusbrasil** — só a seção de notícias/artigos (https://www.jusbrasil.com.br/noticias/).
  NUNCA mexer com e-mails de publicação processual do Jusbrasil — isso é um sistema
  totalmente separado (`robo-publicacoes/` no repo rp-financeiro, robô Python na Railway,
  monitorando processos específicos) e já está resolvido; este skill não tem relação com
  ele.
- **Sites oficiais dos tribunais**: STF, STJ, TST, TSE, tribunais superiores em geral,
  TJs, TRFs, TRTs — priorizar a fonte oficial (acórdão publicado, informativo de
  jurisprudência) sempre que uma notícia de terceiro mencionar uma decisão.
- **Doutrina** (pasta do Google Drive do escritório, "DOUTRINA",
  id `1u_JPcjN-GMByA5_bQ_5FtYJaO-2r5ZnN`): **desligada por decisão do usuário por ora**
  (2026-07-20) — a Routine agendada não carrega o conector do Google Drive, então não
  tente `search_files`/`read_file_content` nela; não é um erro nem precisa avisar o
  usuário toda vez. Redija matérias ANALISE com base nas fontes oficiais/jurisprudência
  já cobertas acima, sem a doutrina. Se o usuário conectar o Drive à Routine no futuro e
  pedir para reativar, volte a consultar essa pasta para aprofundamento em ANALISE.

## Fluxo de trabalho (cada ciclo)

1. **Checar o que já foi enviado antes** (evita duplicata — este robô roda em sessões
   efêmeras, sem estado local persistente entre execuções):

   ```
   curl -s https://rp-financeiro-xi.vercel.app/api/blog/draft?days=30 \
     -H "Authorization: Bearer $BLOG_ROBOT_SECRET"
   ```

   Isso devolve `{"posts": [{"title", "area", "type", "sources", "status", "createdAt"}, ...]}`
   dos últimos 30 dias, em qualquer status (inclusive REJEITADO — não reenviar algo que um
   advogado já recusou). Compare candidatos a matéria contra esses títulos/fontes antes de
   redigir qualquer coisa nova.

2. **Varrer as fontes** listadas acima em busca de novidades. Não é preciso esgotar todas
   as fontes a cada ciclo — foco em: decisões de tribunais superiores, mudanças
   legislativas, teses vinculantes (repetitivos, súmulas, IRDR, ADIs/ADCs relevantes), e
   notícias jurídicas de impacto para as áreas cobertas.

3. **Meta: 3 matérias por dia.** O objetivo de cada ciclo diário é encontrar e publicar
   cerca de **3 matérias** (somando NOTICIA + ANALISE, em qualquer combinação das áreas
   cobertas). Para chegar lá, varra várias das fontes/áreas listadas antes de decidir que
   não há pauta — não pare na primeira notícia encontrada nem se limite a uma área só.
   Dito isso, a meta NUNCA justifica forçar conteúdo fraco ou inventar fundamentação só
   para bater o número: se depois de uma varredura razoável houver menos de 3 pautas
   que passem na validação do passo 4, publique só as que passarem (pode ser 0, 1, 2 —
   está tudo bem). Nunca sacrifique a validação de fontes em nome da meta numérica.

4. **Validar cada candidato contra pelo menos duas fontes independentes, sendo
   OBRIGATORIAMENTE uma delas um portal/notícia jurídica (Migalhas, Conjur ou
   Jusbrasil-notícias) e a outra o site oficial do tribunal envolvido (STF, STJ, TST,
   TSE, TJ, TRF, TRT conforme o caso — acórdão publicado, informativo de jurisprudência,
   súmula, etc.)** antes de dar como confirmado:
   - Se a matéria não envolver diretamente uma decisão de tribunal (ex.: mudança
     legislativa, notícia doutrinária), use duas fontes independentes quaisquer da lista
     de fontes, mas priorize sempre a fonte oficial (texto de lei, portal do
     Diário Oficial) quando existir.
   - Se não for possível confirmar a mesma pauta em uma fonte oficial de tribunal (só
     achou em um portal de notícia, por exemplo), **não publique** — descarte a pauta
     neste ciclo em vez de compor a matéria com fonte única ou duas fontes do mesmo tipo.
   - Se as fontes se complementam sem conflito, pode compor o texto normalmente.
   - Se houver divergência real entre fontes sobre o mesmo fato/decisão, sinalize a
     divergência explicitamente no corpo da matéria (não descarte a pauta, mas deixe claro
     o que é incerto).
   - Nunca afirme tese jurídica como verdade absoluta sem apoiar em fonte oficial real
     (decisão publicada, texto de lei, doutrina reconhecida). Nunca invente fundamentação
     jurídica, número de processo, ementa ou citação. Se não conseguir confirmar um dado
     específico, omita-o ou marque como não confirmado — não estime nem arredonde fatos
     jurídicos.

5. **Redigir no formato adequado:**
   - **NOTICIA** (`type: "NOTICIA"`): novidade do dia a dia, formato curto e objetivo —
     resumo de 1-3 parágrafos, direto ao ponto.
   - **ANALISE** (`type: "ANALISE"`): mudança de lei, tese vinculante, ou decisão relevante
     de tribunal superior — texto mais aprofundado explicando o que mudou, por que importa,
     e o impacto prático em cada área do direito afetada. Aqui vale a pena checar a pasta
     DOUTRINA para embasamento adicional.
   - Título objetivo, sem sensacionalismo. `summary` é um resumo curto (1-2 frases) do
     `content` completo.
   - **NUNCA** inclua imagem — o campo de imagem não existe no payload deste endpoint e
     não deve ser mencionado; a seleção de imagem é feita manualmente pelo escritório
     depois, dentro do site. Não tente gerar, buscar ou sugerir imagens.

6. **Publicar via API** (envia para a fila de revisão, não publica direto):

   ```bash
   curl -X POST https://rp-financeiro-xi.vercel.app/api/blog/draft \
     -H "Authorization: Bearer $BLOG_ROBOT_SECRET" \
     -H "Content-Type: application/json" \
     -d '{
           "title": "...",
           "area": "...",
           "type": "NOTICIA",
           "summary": "...",
           "content": "...",
           "sources": ["https://...", "https://..."]
         }'
   ```

   Resposta de sucesso: `{"id": "...", "slug": "...", "status": "AGUARDANDO_REVISAO"}`
   (HTTP 201). Isso é sucesso — a matéria foi recebida na fila. `sources` deve sempre
   conter URLs reais das fontes efetivamente usadas para validar a matéria (mínimo duas,
   quando possível).

   Se a resposta for 401, o `BLOG_ROBOT_SECRET` está ausente/errado — pare e avise o
   usuário na próxima interação direta (não adivinhe nem tente outro valor).

   Se a resposta for **409** (`{"error": "provável duplicata...", "conflictingPost": {...}}`),
   o próprio servidor detectou que já existe uma matéria com título normalizado igual ou
   com alguma fonte em comum nos últimos 60 dias — é uma segunda camada de proteção contra
   duplicata, além da checagem por GET do passo 1. Não insista tentando reenviar a mesma
   pauta reescrita; trate como "já coberta" e siga para a próxima pauta (ou encerre o
   ciclo, se não houver mais nenhuma).

7. Repita o passo 5-6 para cada pauta relevante encontrada no ciclo (pode ser zero, uma,
   ou várias).

## Regras importantes

- Nunca reproduza texto de fonte verbatim — sempre parafraseie, com pequenas citações
  entre aspas quando necessário (ex.: trecho de ementa).
- Sempre cite as fontes usadas no campo `sources` — nunca deixe vazio se a matéria cita
  fatos específicos.
- Nunca publique diretamente no site — o único canal é o POST acima; a aprovação humana
  acontece inteiramente dentro do site principal (Configurações → Blog → Revisão
  Pendente).
- `BLOG_ROBOT_SECRET` deve estar disponível como variável de ambiente na sessão. Se não
  estiver, e o valor não tiver sido embutido no prompt de disparo da Routine, pare e peça
  ao usuário.
- Este skill não lê nem escreve nada no repositório `rp-financeiro` — comunica-se
  exclusivamente pela API pública `/api/blog/draft` (GET para checar duplicatas, POST para
  enviar rascunho).
