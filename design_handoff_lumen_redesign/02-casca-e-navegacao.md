# 02 — Casca e navegação

Referência visual: slide 12 do deck; wireframe `1c`.

## O que sai

O produto tem hoje **duas cascas** decididas por `components/ViewModeProvider.tsx`
(`localStorage` `lumen:viewMode` = `"regua"` | `"bancada"`). As duas saem e sobra uma.

Remover:

- `components/ViewModeProvider.tsx` e todo `useViewMode()`
- `components/TopMenuBar.tsx`, `components/SubTabsBar.tsx`
- `components/SectionPanel.tsx` (o painel de 190px — sua função migra para abas de página)
- `components/NavModeToggle.tsx` e o bloco "MODO DE VISUALIZAÇÃO" do menu do avatar
  (`components/TeamMonitorPanel.tsx`) — o bloco "TEMA" (Manhã/Noite) **fica**
- `components/SiteBackgroundLayer.tsx` e `.brand-texture`
- a chave `lumen:sectionPanelCollapsed` do `localStorage`
- a chave `lumen:viewMode` — apague-a no primeiro carregamento após o deploy (migração
  silenciosa; nada a perguntar ao usuário)

O que **fica**: `components/TabsProvider.tsx` e as guias de duplo clique (é o recurso mais
usado do produto), `components/GuiasBar.tsx`, `components/AppShell.tsx` (reescrito),
`components/NavRail.tsx` (alterado), `components/GlobalSearch.tsx` (vira a paleta).

## A casca única

Três faixas, de fora para dentro:

```
┌─────────┬──────────────────────────────────────────────┐
│  rail   │  guias (30px, só quando há guia aberta)      │
│  76px   ├──────────────────────────────────────────────┤
│         │  conteúdo da página                          │
└─────────┴──────────────────────────────────────────────┘
```

A antiga `TopBar` de 42px deixa de existir como faixa própria: busca, Peticionar, Novo,
Timesheet, Alertas e avatar moram **na faixa de guias**, à direita (o cluster de
`components/TopBarActions.tsx` reaproveitado).

### Rail — `components/NavRail.tsx`

| Propriedade | Valor |
| --- | --- |
| Largura | **76px** (era 62px) |
| Fundo | `#16191d` nos dois temas |
| Itens | Painel + as 5 seções de `lib/navSections.ts` + Ajustes no pé |
| Ícone | lucide 17px, traço 1.9 |
| **Rótulo** | **8px, sempre visível** (é o que resolve "onde estou") |
| Item inativo | ícone e rótulo `#9aa3ad`, hover `rgba(255,255,255,.05)` |
| Item ativo | fundo `#2d2b2b`, texto `#ffffff`, **filete esquerdo 4px `--marca`** |
| Raio | 0 |
| Badge de contagem | fundo `--vinho`, texto branco, 9px, círculo |
| Logomarca | `LumenMark size={38}` no topo, link para `/painel` |

O filete ativo passa de 3px para 4px porque o rail ficou mais largo. O duplo clique
continua abrindo aba (mecanismo de `clickTimers` atual, sem mudança).

### Faixa de guias — `components/GuiasBar.tsx`

Altura **30px**, fundo `--sf-superficie`, borda inferior 2px `--regua-forte`. Muda de
fundo escuro para superfície clara: ela agora carrega também as ações, e uma ilha clara
sobre fundo escuro era remendo do modo Bancada.

- Guia ativa: fundo `--sf-apoio`, texto `--tx`, peso 800, **filete inferior 3px `--acao`**
- Guia inativa: texto `--tx-2`, filete transparente
- Largura máxima 210px com reticências; raio 0
- Primeira guia é sempre "Principal" (a view do próprio Next), não fechável
- À direita, na mesma faixa: campo ⌘K, Peticionar (primário), Novo, Timesheet, Alertas, avatar

### Painel de seção → abas de página

O painel de 190px sai. Os itens de cada seção (`lib/navSections.ts`) passam a ser
**abas horizontais dentro da página**, com o padrão que já existe em
`components/InternalTabsBar.tsx`: peso 800 quando ativa, filete inferior 2px `--acao`,
inativa `--tx-2`. Clicar num ícone do rail navega para `section.items[0].href`, como já faz.

`lib/navSections.ts` **não muda de forma** — só ganha um item novo na seção `gestao`:
`{ href: "/conexoes", label: "Conexões", adminOnly: true }` (ver documento 04).

### Paleta de comando ⌘K

Nova, construída sobre `components/GlobalSearch.tsx`.

- Atalhos: `⌘K` / `Ctrl+K`; `Esc` fecha; `↑↓` navega; `Enter` executa
- Campo no topo, 34px, borda 2px `--regua-forte`, raio 0
- Suspenso: 440px de largura, fundo `--sf-superficie`, borda 2px `--tx`, sombra de menu
- Grupos, nesta ordem, com rótulo em 8px caixa alta `.12em` `--tx-3`:
  1. **Processos** (busca em `processNumber`, `title`, partes)
  2. **Clientes**
  3. **Ações** — "Peticionar em…", "Lançar honorário para…", "Novo atendimento",
     "Nova tarefa em…", "Ir para Conexões"
  4. **Navegação** — as rotas de `navSections`
- Item ativo: fundo `--sf-apoio`, sem filete
- Digitar um número de processo (com ou sem máscara) casa direto com o processo
- Duplo `Enter` num resultado abre em guia nova, coerente com o resto do produto

### Responsivo

- ≥ 1024px: casca completa
- 768–1023px: rail colapsa para 56px sem rótulo, guias mantidas
- < 768px: redireciona para `/m` (comportamento atual do `middleware.ts` — confirme e
  mantenha)

## Aceite

- [ ] Nenhuma referência a `viewMode`, `regua`, `bancada` no repositório
- [ ] `⌘K` abre em qualquer rota autenticada e encontra processo por número
- [ ] O rótulo do rail está legível no Manhã e no Noite
- [ ] Duplo clique em item do rail continua abrindo guia, e a guia sobrevive à navegação
- [ ] Nenhum `border-radius` diferente de 0 na casca
