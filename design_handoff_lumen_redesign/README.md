# Handoff: redesenho do Lúmen (site + app)

Pacote de implementação para o Claude Code. Escrito em 19 de agosto de 2026, a partir da
leitura do repositório `rodartepradoadvogados/Lumen` (branch `main`) e do
`docs/DESIGN-SYSTEM.md` (manual da marca v2).

## Overview

O Lúmen é um SaaS de gestão jurídica em Next.js (App Router). Esta entrega adequa o produto
inteiro — casca, painel, integrações, publicações, comunicados, privacidade, PWA e site
público — ao sistema visual **Modernist**, preservando a logomarca e as cores de marca da
Lúmen (ouro `#c9962f`, vinho `#7d1330`, grafite).

As sete decisões que este pacote implementa:

1. **Uma casca só.** Os modos de visualização Régua e Bancada deixam de existir; sobra uma
   casca única (rail com rótulo + guias + paleta de comando ⌘K).
2. **O dia primeiro.** O Painel passa a ter hierarquia: uma fila do dia em ordem de
   urgência, com ação na linha; números e funil recuam para a lateral.
3. **Conexões vira página.** Integrações, chaves, webhooks e log de execução saem da aba
   longa de Configurações para uma página com vocabulário único.
4. **Um comunicado por dia.** Resumo diário no horário escolhido pelo usuário, com exceção
   explícita e curta para prazo de hoje e audiência em menos de 24h.
5. **Privacidade visível.** Máscara por padrão, break-glass com motivo obrigatório, acesso
   do suporte com escopo e prazo, e trilha de auditoria consultável em tela.
6. **PWA de cinco telas.** O `/m` deixa de espelhar o desktop.
7. **Site público de produto.** Landing do SaaS para outros escritórios, no Modernist.

## About the Design Files

Os arquivos `.dc.html` deste pacote (não incluídos no repositório — ver nota abaixo) são
**referências de design feitas em HTML** — protótipos que mostram aparência e comportamento
pretendidos. **Não são código de produção e não devem ser copiados para o repositório.** A
tarefa é **recriar esses desenhos no ambiente que já existe no Lúmen**: Next.js 14 App
Router, React Server Components, Tailwind CSS com os tokens semânticos de
`app/globals.css`, Prisma, lucide-react. Use os padrões estabelecidos do repositório
(`components/ui.tsx`, `SectionPanel`, `ModalShell`, server actions em `lib/actions/`), nunca
HTML solto.

Arquivos do pacote original (mockups/wireframes — mantidos fora do repositório por
instrução explícita, só como referência visual durante a implementação):

| Arquivo | O que é |
| --- | --- |
| `Lumen Wireframes.dc.html` | Dez wireframes de estrutura (low-fi) — casca, painel, conexões, publicações, comunicados, LGPD, PWA |
| `Lumen Deck.dc.html` | Apresentação de 20 slides: diagnóstico, marca e sistema, telas, caminho |

## Fidelity

**Mista, e a distinção importa:**

- Os **wireframes** (`Lumen Wireframes.dc.html`) são **low-fi**. Valem pela estrutura,
  hierarquia e fluxo. Não copie cores nem medidas deles.
- Os **mockups dentro do deck** (slides 8, 12–17) são **hi-fi**: cor, tipografia, régua e
  espaçamento são os finais. São a referência visual.
- Os **valores canônicos** estão em `01-tokens-e-tema.md`. Se um mockup e o documento de
  tokens divergirem, **o documento vence**.

## Decisão de marca aplicada neste repositório

Documento 01 apresenta duas leituras (A — Modernist com ouro e vinho; B — Modernist puro,
vermelho `#ec3013`). **A decisão do dono do projeto para esta implementação foi o modelo
B**: onde qualquer documento deste pacote descreve o modelo A, o modelo B vale no lugar. Ver
a nota no topo de `01-tokens-e-tema.md` e o registro correspondente em
`docs/DESIGN-SYSTEM.md`.

## Documentos

Leia nesta ordem:

| # | Documento | Escopo |
| --- | --- | --- |
| 01 | `01-tokens-e-tema.md` | Cor, tipografia, raio, régua, sombra. Mudanças em `globals.css` e `tailwind.config.ts` |
| 02 | `02-casca-e-navegacao.md` | Casca única, rail, guias, ⌘K, remoção do ViewMode |
| 03 | `03-painel.md` | Painel do dia |
| 04 | `04-conexoes.md` | Gateway, DJEN, DATAJUD, Drive/OneDrive/Dropbox, WhatsApp, API keys, MCP, webhooks, log |
| 05 | `05-publicacoes.md` | Triagem de publicações |
| 06 | `06-comunicados.md` | Digest diário, exceções, templates com variáveis, schema |
| 07 | `07-privacidade-lgpd.md` | Máscaras, break-glass, suporte, auditoria, pedido do titular |
| 08 | `08-pwa.md` | Cinco telas, manifest, push |
| 09 | `09-site-saas.md` | Site público de produto |
| 10 | `10-plano-de-execucao.md` | Quatro fases, PRs, checklist de aceite |
| — | `PROMPT-CLAUDE-CODE.md` | Prompt de orientação para abrir a sessão |

## Assets

- **Logomarca:** `components/LumenMark.tsx` já existe no repositório e **não muda** — nem
  geometria, nem cor. É a única peça que carrega ouro e vinho de forma fixa,
  independente do tema.
- **Ícones:** lucide-react, já instalado. Traço 1.9, tamanho 17px na casca.
- **Fonte:** Archivo via `next/font/google`, já configurada. Nenhuma fonte nova.
- **Fotografia:** nenhuma imagem nova é necessária no app. O site público (09) pede
  fotografias em preto e branco puro — o escritório fornece; até lá, use os
  placeholders descritos lá.

## Files

Os arquivos de design deste pacote, e no repositório os pontos de partida:
`app/globals.css`, `tailwind.config.ts`, `components/AppShell.tsx`,
`components/NavRail.tsx`, `components/SectionPanel.tsx`, `lib/navSections.ts`,
`app/(app)/painel/page.tsx`, `app/(app)/configuracoes/page.tsx`,
`app/(app)/publicacoes/page.tsx`, `app/m/`, `app/page.tsx`, `docs/DESIGN-SYSTEM.md`.
