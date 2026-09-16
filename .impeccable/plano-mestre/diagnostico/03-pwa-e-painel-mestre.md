# F1 · Diagnóstico — PWA (`app/m/**`) + Painel Mestre (`app/painel-mestre/**`)

**Modo:** Operate (ambas) · **PWA: 27 rotas · Painel Mestre: 10 rotas**
**Tema padrão:** PWA claro · Painel Mestre escuro
**Data:** 2026-09-16 · Crítica por leitura de código (sem navegador — ver ⚠️ DEGRADED em `00-mecanico.md`)

> **Veredito em uma frase:** as duas superfícies têm a mesma doença em espelho — **o PWA fez o
> trabalho de piso tipográfico à mão e o perde nos componentes compartilhados; o Painel Mestre fez o
> trabalho de layout numa tela só e não o replicou nas outras nove.** Em ambas, o que existe de bom é
> local e não virou regra.

---

# Parte A · PWA (`app/m/**`)

## P0

### P0-A1 · O piso de 13px é real dentro do `app/m`, e vaza pelos componentes compartilhados

Dentro de `app/m/**` + `components/mobile/**` a disciplina é exemplar: **391 ocorrências de
`text-[13px]` e zero `text-xs`**. Alguém aplicou o piso à mão, tela por tela.

O piso quebra **exatamente onde o PWA importa componente do portal**:

| Arquivo | Linha | Tamanho | Onde aparece no PWA |
|---|---|---|---|
| `components/ui.tsx` | 115 | 11px | `Badge`, usado em telas de processo e agenda |
| `components/CopyButton.tsx` | 39 | 11px | **no próprio número do processo** (`app/m/processos/[id]/page.tsx:302`) |
| `components/anotacoes/AnotacoesPessoaisList.tsx` | 66 | **10px** | lista de anotações |
| `components/EditCaseModal.tsx` | 184, 237 | 11px | edição de caso |

**Nada guarda isso.** `package.json:9` é `next lint` puro — sem regra que proíba `text-xs` ou
`text-[11px]` sob `app/m`. O piso é um acordo tácito de quem escreveu, e todo componente novo
importado do portal o rompe de novo.

> Consequência para F3: o piso tipográfico não pode ser convenção — precisa virar **token + regra de
> lint**, senão volta a vazar no primeiro componente compartilhado.

### P0-A2 · `--tx-3` no tema claro: 2,96:1 — este é o P0 real do modo claro no celular

`--tx-3: #9b9797` sobre `#ffffff` = **2,96:1**. Reprova WCAG AA (4,5:1) e reprova até o piso de
texto grande (3:1). São **41 usos**, a maioria a 13px.

O PWA é a superfície usada **no fórum, na rua, na frente do cliente** — ou seja, sob luz direta, que
é o pior cenário possível para 2,96:1. A queixa "modo claro feio" tem aqui a sua causa material mais
clara de todo o repositório.

Autorizado corrigir por D-07 (WCAG AA como piso da casa).

### P0-A3 · `/m/processos/[id]`: 11 consultas por troca de aba e 720px de pílulas em 416px de tela

`app/m/processos/[id]/page.tsx:87-148` — **toda** troca de aba re-executa as **11 consultas Prisma**
incondicionalmente, mesmo que a aba aberta use uma só. E cada troca **empilha uma entrada no
histórico**: sair da tela exige apertar "voltar" tantas vezes quantas abas foram visitadas.

Geometria: **8 abas ≈ 720px de pílulas** num viewport com ~416px úteis — quase metade fica fora da
vista, sem affordance de rolagem. Altura da pílula **~30px**, abaixo do alvo de toque de 44px que o
resto do PWA respeita (`h-11 w-11` na navegação de dias).

## P1

**P1-A1 · `--ouro-acento` não existe em `.mobile-shell` — e já tem consumidor vivo.**
`app/m/page.tsx:237` passa `accent="ouro"` para o cartão de Assessoria. O token não está declarado
dentro de `.mobile-shell`, então a regra resolve pela cascata — o ouro do cartão **muda conforme o
tema do site público**. É exatamente a classe de bug que o PR #174 corrigiu (o `.mobile-shell`
herdando `.dark`), reaparecendo num token que ficou de fora do fechamento.

**Correção imediata e barata:** declarar `--ouro-acento` dentro de `.mobile-shell`, nos dois temas.

**P1-A2 · Densidade sem escala.** Com piso de 13px e teto pouco acima, o PWA tem o mesmo problema do
portal em versão comprimida: título de cartão, rótulo e corpo convivem num intervalo de 3px. A
hierarquia existe por **peso e cor**, e a cor terciária reprova contraste (P0-A2) — ou seja, metade
do mecanismo de hierarquia está quebrada.

---

# Parte B · Painel Mestre (`app/painel-mestre/**`)

## P0

### P0-B1 · `text-white` fixo quebra o tema claro em ~40% das rotas

`text-white` aparece cravado em `produto`, `cofre`, `confianca` e `equipe`, mais **quatro modais**
alcançáveis a partir de telas já tratadas. No tema claro, o fundo é `#c9c5d1` — branco sobre esse
fundo dá **1,35:1**.

Isso não é "contraste fraco": é **texto invisível**. O tema claro que o dono pediu está quebrado em
quase metade do Painel Mestre, e a quebra atravessa a fronteira das telas "tratadas" pelos modais.

### P0-B2 · `--tx-3: #6b6579` sobre `#c9c5d1` = 3,30:1, a 10px

Reprova AA. E aparece em **todo rótulo de KPI do `LumenStat`** e em **todo cabeçalho de tabela** — ou
seja, justamente no texto que diz *o que* o número significa. O número é legível; o rótulo, não.

### P0-B3 · "Abas reais + layout largo" existe em 1 de 10 telas

`[officeId]` é a única tela com abas de verdade e uso de largura. As outras nove não replicaram o
padrão. `cofre` é o caso extremo: **três tabelas de 5-6 colunas empilhadas verticalmente**, sem abas,
sem divisão, sem uso da largura disponível.

O padrão certo **já foi escrito uma vez**. O trabalho de F3/F4 aqui não é inventar — é **propagar**.

---

## O que MERECE SOBREVIVER

**Do PWA:**

1. **Emoji condicional** (🔔/📅 só quando há pendência real). Sinal, não decoração — mesma disciplina
   de "cor = risco, nunca categoria" do portal.
2. **A prévia do alerta na home do PWA.** Responde "o que corre risco agora?" antes de qualquer
   navegação — é o princípio nº 1 do PRODUCT.md implementado, e o portal **não** faz isso.
3. **Contagens vivas em cada atalho** da home.
4. **A auto-contenção do `.mobile-shell`**, com o comentário que explica *por quê* (dívida do PR
   #174). Manter o comentário: ele é o que impede a regressão.
5. **`MobileNewEntitySheet`** — criação por folha, um só padrão para todas as entidades.
6. **Alvos de toque `h-11 w-11`** na navegação de dias. É o piso de 44px; generalizar para as abas
   (ver P0-A3), não abandonar.

**Do Painel Mestre:**

7. **A tela `[officeId]` inteira** — é o gabarito a replicar nas outras nove.
8. **`LumenUi` como linguagem interna deliberadamente distinta** do produto do cliente. Separar a
   ferramenta da plataforma da ferramenta do escritório é decisão certa; manter a separação no
   redesign.
9. **Trilhos grafite fixos** — decisão consciente de âncora, não descuido.
10. **A construção da rampa `#b3aebc`** — método correto (rampa derivada de uma cor-base), aplicado a
    valores que reprovam contraste. Corrigir os valores, preservar o método.

**De ambas:**

11. **O hábito de registrar *por quê* em comentário de código.** É o que permitiu este diagnóstico
    distinguir decisão de descuido. Regra da casa a partir daqui.

---

## Direção que este diagnóstico impõe às próximas fases

| Achado | Vai para |
|---|---|
| Piso de 13px vaza por componente compartilhado | **F3** — token + regra de lint, não convenção |
| `--tx-3` reprova nos dois temas das duas superfícies | **F3** (`colorize`), com autorização D-07 |
| `--ouro-acento` ausente em `.mobile-shell` | **F3** — fechamento de escopo de tema (quick-fix possível antes) |
| `text-white` cravado no Painel Mestre | **F3** — quick-fix possível antes |
| 11 consultas por troca de aba + histórico empilhado | **F4/F5** — defeito de produto, não de estética |
| 8 abas em 416px, pílula de 30px | **F4** — padrão de navegação por abas no PWA |
| `[officeId]` como gabarito não replicado | **F4** — propagar às 9 telas restantes |
| Inspeção visual real nas duas superfícies | **F8**, na máquina do dono |
