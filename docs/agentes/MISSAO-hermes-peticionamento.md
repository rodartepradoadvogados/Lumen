# MISSÃO: Hermes, dupla validação de jurisprudência (Parte 1) e redação das matérias do blog (Parte 2)

> **Destinatário:** **Hermes**, agente de peticionamento do Lúmen (perfil `peticionamento-lumen`).
> **Quem enviou:** o dono do escritório. Ele não vai consultar outra fonte: **você** o guia nos
> passos que dependem dele.
>
> Documento escrito em 25/09/2026. A partir de agora, as duas regras abaixo são **requisito** de
> toda minuta, não recomendação.

---

## 1. As duas regras

### Regra 1: número CNJ completo e válido
**Julgado sem número único completo no padrão CNJ não é citado.**
- Formato: `NNNNNNN-DD.AAAA.J.TR.OOOO` (20 dígitos).
- `DD` é dígito verificador (ISO 7064 MOD 97-10). Confira antes de citar:
  `(NNNNNNN AAAA J TR OOOO DD, como um número só) mod 97 == 1`.
  Exemplos válidos: `0001234-85.2023.5.18.0001`, `1001234-68.2021.8.26.0000`,
  `5012345-88.2024.8.09.0051`. Exemplo inválido: `0001234-56.2023.5.18.0001`.
- Acórdão de tribunal superior **também** é processo. "REsp 1.234.567/SP" sozinho **não basta**:
  localize o número único na página oficial do julgado.
- **Súmula, tema repetitivo/repercussão geral e enunciado** não são processos e não têm número
  CNJ. Cite pela espécie + número + órgão, sempre com a dupla validação da Regra 2.
- Não achou o número completo e válido? **Não cite.** Descreva a tese sem número.

### Regra 2: dupla validação com os dois links
Cada precedente precisa de **duas fontes independentes, as duas efetivamente lidas**:
1. **Oficial:** a página do tribunal (domínio `*.jus.br`) ou, para legislação, o texto oficial
   (Planalto / Diário Oficial).
2. **Secundária independente:** domínio diferente e **não** `*.jus.br` (ex.: Conjur, Migalhas,
   Jusbrasil).

- Resultado de busca (snippet) **não é fonte**. Só vale página lida.
- Só a oficial, sem secundária → **não cite** (o Lúmen passa a bloquear a aprovação).
- Só a secundária → tratada como inexistente.
- As duas divergem na tese → não cite como consolidado; explique a divergência em `###RISCOS###`.

### Formato obrigatório da resposta
Em `###JURISPRUDENCIA###`, uma linha por precedente, **sempre com as duas URLs lidas, oficial
primeiro**:
```
<texto do precedente, com o número CNJ completo> || <url oficial lida> || <url secundária lida>
```
Linha sem as duas URLs **será bloqueada** na aprovação da minuta.

---

## 2. Como pesquisar: ferramentas do Lúmen com Firecrawl

O Lúmen ganha duas ferramentas no seu MCP (`lumen-ferramentas`, escopo peticionamento):

| Ferramenta | Entrada | Para quê |
|---|---|---|
| `pesquisar_jurisprudencia` | `consulta` (obrigatória), `dominio` (opcional, ex.: `stj.jus.br`), `limite` (1-5) | **Achar** a página oficial e a secundária. Devolve `{titulo, url, descricao, oficial}`. |
| `ler_fonte_juridica` | `url` (https) | **Ler** a página (HTML ou PDF). Devolve `{url, titulo, oficial, numerosCnj:[{numero, valido}], markdown}`. |

**Procedimento para cada precedente candidato:**
1. `pesquisar_jurisprudencia` com a tese + tribunal (use `dominio` para forçar o site oficial).
2. `ler_fonte_juridica` na página **oficial**. Confira: a tese está lá? Há um número em
   `numerosCnj` com `valido: true` correspondente ao julgado?
3. `pesquisar_jurisprudencia` sem `dominio` (ou com `conjur.com.br` / `migalhas.com.br` /
   `jusbrasil.com.br`) para a secundária. Depois `ler_fonte_juridica` nela.
4. A tese e o número batem nas duas? Cite, com as duas URLs no formato acima. Qualquer item
   falhou? Não cite: tese sem número.

Seus toolsets próprios (`web`, `search`) continuam disponíveis como apoio. Mas a **prova** da
validação é a leitura feita pelas ferramentas do Lúmen, que fica registrada.

---

## 3. Primeira coisa a fazer: verificar e guiar o dono 🛑

**Passo 1: as ferramentas já existem?** Liste as ferramentas do MCP do Lúmen (`tools/list`).
- **Aparecem** `pesquisar_jurisprudencia` e `ler_fonte_juridica` → siga para o Passo 2.
- **Não aparecem** → diga ao dono:
  > "As ferramentas de pesquisa com Firecrawl ainda não estão no Lúmen. Elas são implementadas
  > pelo Robô de conteúdo jurídico (Etapa 5 da missão dele, `docs/agentes/MISSAO-robo-juridico.md`).
  > Enquanto isso, aplico as duas regras com minhas próprias ferramentas de busca, lendo as páginas.
  > Me avise quando o PR dele estiver em produção."

  Até lá, **aplique as Regras 1 e 2 mesmo assim**, lendo as páginas com seus toolsets.

**Passo 2: teste de funcionamento.** Faça uma chamada de teste:
`ler_fonte_juridica` numa página oficial pública de jurisprudência.
- Se vier "a pesquisa web do Lúmen não está configurada", diga ao dono:
  > "Falta a chave do Firecrawl na Vercel. Vercel → projeto lumen → Settings → Environment
  > Variables → confira `FIRECRAWL_API_KEY` (Production) → Deployments → Redeploy do último deploy
  > de produção. Me avise quando terminar."

**Passo 3: skill atualizada.** Confirme com o dono se a skill `pesquisa-jurisprudencia` do seu
servidor já é a versão nova (atualizada pelo Robô jurídico no repositório e publicada pelo dono
seguindo o `servidor-hermes/LEIA-ME.md`). Se não for, guie:
> "Publique no meu servidor a versão atual de `servidor-hermes/skills/pesquisa-jurisprudencia/`,
> do repositório do Lúmen, seguindo o LEIA-ME do servidor-hermes. Depois me avise."

**Passo 4: petição de teste com o dono.** Proponha:
> "Vamos testar: gere no Lúmen uma petição curta que precise de um precedente. Eu vou citar só
> julgados com número CNJ válido e os dois links. Na tela de aprovação, confira se cada citação
> mostra 'confirmada no oficial e na fonte secundária'. Depois tente aprovar uma minuta com uma
> citação sem link secundário: o Lúmen deve **bloquear**."

**Passo 5: confirmação.** Com o teste ok, diga ao dono: "Dupla validação ativa. A partir de agora
toda minuta segue as Regras 1 e 2."

---

## 4. Se algo falhar
- Ferramenta devolve erro de tempo: tente uma vez com `limite` menor. Persistindo, use seus
  toolsets e informe no resultado da minuta que a validação foi feita fora do Lúmen.
- Página oficial não abre: o precedente **não é citado**. Nunca preencha número "de memória".
- Qualquer dúvida sobre as regras: prevalece "não citar" sobre "citar sem prova".


---

# Parte 2: redação das matérias do blog do Lúmen (etapa final)

> **Quando vale:** só depois que o Robô de conteúdo jurídico concluir a **Etapa 6** da missão dele
> (`docs/agentes/MISSAO-robo-juridico.md`) e o dono criar o perfil **`materias-lumen`** no seu
> servidor. Até lá, a Parte 1 é a única ativa.

## 2.1 Como vai funcionar
- Uma vez por dia (06:00, Brasília), o Lúmen faz sozinho a varredura e a **dupla validação**
  das fontes pelo Firecrawl.
- Para cada pauta validada, o Lúmen chama **você**, no perfil `materias-lumen` (que usa o seu
  modelo via OpenRouter), entregando: as regras, as áreas permitidas e o **texto das fontes já
  lidas**.
- Você **redige** e devolve a matéria. O Lúmen confere e grava como **rascunho**, em
  Configurações → Blog → Revisão Pendente. **Quem publica é sempre um advogado.**

## 2.2 Regras de redação (inegociáveis)
- **Use só o que está no texto das fontes recebidas.** Nenhum fato, número de processo, ementa,
  data ou citação de fora. Sem certeza, omita.
- Fontes divergentes: diga isso explicitamente no texto.
- **Paráfrase sempre.** Citação literal só curta e entre aspas.
- `type`: `NOTICIA` (1 a 3 parágrafos) ou `ANALISE` (o que mudou, por que importa, impacto
  prático).
- `title` objetivo (≤ 180 caracteres); `summary` com 1 a 2 frases (≤ 400); `content` em markdown
  simples (≤ 12.000): parágrafos, `##`/`###`, listas, negrito, itálico. **Sem imagem.**
- `area`: **exatamente** uma das áreas que o Lúmen enviar na mensagem.
- Linguagem de publicação jurídica séria, sem autopromoção, observando as regras de publicidade da
  advocacia (skill `etica-oab-publicidade`, se estiver no perfil).

## 2.3 Formato de resposta (o Lúmen só aceita isto)
```
###MATERIA_JSON###
{"title": "...", "area": "...", "type": "NOTICIA", "summary": "...", "content": "..."}
###FIM###
```
- Nada antes nem depois dos marcadores.
- JSON inválido, área fora da lista ou campo faltando: o Lúmen **descarta** a matéria.
- Se as fontes não sustentam uma matéria, responda o JSON com `"title": ""`. O Lúmen entende
  como "sem matéria".

## 2.4 Primeira coisa a fazer nesta parte: guiar o dono 🛑
1. Pergunte se o perfil `materias-lumen` já existe no servidor e se a chave do **OpenRouter** está
   no `.env` desse perfil. Para conferir, peça ao dono para rodar no servidor:
   `hermes -p materias-lumen config check` (tudo com ✓).
2. Pergunte se a skill `redacao-materias-blog` foi instalada nesse perfil (o Robô jurídico a
   deixa no repositório, em `servidor-hermes/skills/redacao-materias-blog/`).
3. Quando o dono avisar que ligou `RADAR_JURIDICO_ATIVO=1` na Vercel, diga:
   > "Amanhã, depois das 06:00, confira Configurações → Blog → Revisão Pendente. As matérias com
   > selo Robô foram redigidas por mim a partir das fontes validadas pelo Lúmen. Revise, publique,
   > agende ou rejeite. Rejeições me ajudam: se quiser, me diga o motivo."
