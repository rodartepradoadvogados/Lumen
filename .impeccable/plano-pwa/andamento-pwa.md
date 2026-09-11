# Andamento do plano de redesign — PWA mobile (`app/m/*`)

> **Instrução permanente:** mesma convenção de `plano-adequacao/`, `plano-dinamismo/`,
> `plano-redesign/` (site) e `plano-portal/` — ler este arquivo inteiro antes de qualquer rodada,
> acrescentar bloco novo ao final, nunca reescrever um já registrado.

**Origem:** adiado explicitamente na sessão do `plano-portal/` (Rodada 6, 2026-09-11) — pedido do
dono do projeto na mesma mensagem que encerrou o portal, tratado como plano próprio.

**Escopo desta rodada:** casca do PWA (`app/m/layout.tsx`, `components/mobile/MobileBottomNav.tsx`)
+ Painel (`app/m/page.tsx`) + tela de processo aberto (`app/m/processos/[id]/page.tsx`). Fora
desta rodada: as demais ~34 rotas de `app/m/*` (herdam token por token, sem trabalho dedicado),
`painel-mestre` e o site público (continuam adiados desde o `plano-portal/`).

---

## Origem — sessão de `grilling` (`mattpocock-skills:grilling`)

**Data:** 2026-09-11. Duas rodadas de perguntas antes de propor qualquer coisa visual:

**Rodada 1:**
1. **Motivo:** mesma raiz do portal — visual pode melhorar, não é bug nem pedido de cliente.
2. **Escopo:** casca + Painel + tela de processo aberto (recorte do dono do projeto, diferente
   da sugestão inicial que incluía Financeiro).
3. **Direção visual:** reaproveitar o mesmo sistema já aprovado e em produção no portal — nenhuma
   cor nova.
4. **Fronteira:** o trabalho de acessibilidade/mecânico já feito (`.impeccable/plano-adequacao/`)
   fica intocado — esta rodada é só atmosfera.

**Rodada 2** (depois de eu levantar os fatos: `/m` tem tema próprio e independente do portor,
padrão hoje é Manhã; não tem nenhuma customização de fonte/raio/cor de sistema ainda; já passou
pela rodada de acessibilidade; 37 rotas no total):
1. **Padrão de tema:** **continua Manhã** (claro) — diferente do portal. O PWA é usado por
   qualquer pessoa em qualquer situação de luz, não só pela equipe interna 8h/dia. Noite fica
   disponível com a mesma qualidade, não é o padrão de ninguém. (Esclarecido numa pergunta de
   desambiguação — a primeira resposta "sim" foi ambígua entre as duas opções apresentadas.)
2. **Indicador "ao vivo":** sim, replicar o mesmo glow reservado do portal na Central de Alertas
   do Painel, quando houver pendência.

**Validação do protótipo (2026-09-11):** artefato publicado
(https://claude.ai/code/artifact/7441ec3a-2f80-49a7-b2fe-b89f3e8ff44e) — casca + Painel + processo
aberto clicáveis, alternador Manhã/Noite funcional dentro do "telefone". **Aprovado.** Feedback
adicional do dono do projeto sobre os ícones-placeholder do protótipo (emoji, ex.: 🔔): "o ícone
do sino amarelo eu gostei. mantenha. de modo geral, os ícones que você usou no modelo podem ser
mantidos". Esclarecido em pergunta de desambiguação (emoji de verdade no código vs. só o estilo/
escolha do ícone): **emoji de verdade, mas só quando há pendência de verdade naquele ícone** — do
jeito que era (ícone de linha lucide-react) quando não há. Aplicado nos dois únicos lugares desta
rodada onde um ícone já carregava contador de pendência: sino do cabeçalho e calendário da aba
Agenda na barra inferior — não é troca geral de sistema de ícone.

---

## Rodada 1 — P1 implementado (fundação: tema Noite próprio, raio, glow, emoji condicional)

**Data:** 2026-09-11 · **Sessão:** mesma sessão do `grilling` e do protótipo, a pedido do dono do
projeto ("comece").

### O que foi feito

- **`app/globals.css`**: novo bloco `.mobile-shell`/`.mobile-shell.mobile-dark`, mesmos valores de
  cor do `.portal-shell` (dark) — nenhuma cor nova. Diferente do portal (que redefine tudo na
  base porque o padrão dele é escuro), aqui só a variante `.mobile-dark` precisou de definição
  completa: sem ela, `.mobile-shell` sozinho herda `:root` normalmente, exatamente como o PWA já
  se comportava antes desta rodada. `--concluido-glow` precisou de um valor também na Manhã
  (`.mobile-shell` sem `.mobile-dark`) — essa variável não existia em `:root`/`.dark` fora do
  escopo do Portal Noturno, e o `.live-dot` do Painel precisa dela nos dois temas. Raio 2px por
  seletor descendente (`.mobile-shell.mobile-dark .rounded-lg` e irmãos), igual ao portal,
  escopado só à Noite (na Manhã o PWA continua na escala de 4/6/10px de sempre).
- **`app/m/layout.tsx`**: `THEME_INIT_SCRIPT` reescrito — não alterna mais a classe global `.dark`
  em `<html>` (compartilhada com o site público), agora só ADICIONA `.mobile-dark` a
  `#mobile-shell` (nó próprio, sem risco de herdar o script do site). Sino do cabeçalho vira emoji
  🔔 só quando `totalAlerts > 0`; sem pendência, continua o ícone de linha `Bell` de sempre.
- **`components/mobile/MobileThemeToggle.tsx`**: `cycle()` agora alterna `.mobile-dark` em
  `#mobile-shell` em vez de `.dark` em `document.documentElement`.
- **`app/m/page.tsx`**: `.live-dot` ao lado do rótulo "Central de Alertas", só quando
  `totalAlerts > 0` — mesmo paralelo do portal com publicações não lidas.
- **`components/mobile/MobileBottomNav.tsx`**: ícone da aba Agenda vira emoji 📅 só quando
  `badgeCount > 0` (mesma regra do sino) — as outras quatro abas não têm contador, ficam como
  estavam.
- **`app/m/processos/[id]/page.tsx`**: **nenhuma edição precisou** — a tela de processo aberto já
  usa só tokens (`Card`, `--regua`, `--marca-tx`, `rounded-full` nas pílulas de aba) e herda cor/
  tema/raio automaticamente de `.mobile-shell`, mesmo efeito colateral já documentado no portal
  (P3→P4/P5). Confirma o recorte de escopo da Rodada 2 sem trabalho extra.
- **`DESIGN.md`**: nova seção "PWA Noturno — escopo `app/m/*`", registrando as 4 diferenças
  deliberadas do Portal Noturno (padrão continua claro, raio só na Noite, glow nos dois temas,
  emoji condicional restrito a ícones que já carregavam contador) — feito no mesmo PR da
  implementação.

### Pendente desta rodada

- Verificação técnica local (`tsc`/`eslint`/`next build`) e merge ainda não executados nesta
  entrada — ver próxima rodada/commit para o resultado do gate e o número do PR.
