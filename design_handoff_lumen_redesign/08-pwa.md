# 08 — PWA

Referência: slide 17 do deck; wireframe `1j`. Pasta: `app/m/`.

## O problema

O `/m` espelha hoje o desktop quase inteiro: financeiro com sete sub-rotas, relatórios,
configurações, assessoria. No corredor do fórum, isso é peso morto.

## Cinco telas, e só

| Aba | Rota | O que faz |
| --- | --- | --- |
| **Publ.** | `/m/publicacoes` | Publicações do dia, filete por fonte, toque abre o teor |
| **Agenda** | `/m/agenda` | Hoje e amanhã, filete pelo tipo de tarefa |
| **+** (central) | `/m/atendimento/novo` | Novo atendimento: três campos |
| **Processo** | `/m/processos` | Busca e linha do tempo |
| **R$** | `/m/financeiro` | Resumo do mês, três números |

**O que sai de `/m`:** `relatorios`, `configuracoes`, `assessoria`, `contatos`, `kanban`,
e as sub-rotas de `financeiro` (`contas-a-pagar`, `contas-a-receber`, `despesas`, `dre`,
`fluxo-de-caixa`, `livro-caixa`, `receitas`, `relatorios`). `/m/mais` e `/m/perfil`
sobrevivem como menu do avatar, não como aba.

## Regras de interface móvel

- Barra de abas fixa, altura **76px**, borda superior 2px `--regua-forte`, raio 0
- Ação central "+": quadrado de 52px em `--acao`, texto `--acao-tx`
- **Alvo de toque mínimo 44px** em qualquer elemento acionável
- Corpo 15px; nada abaixo de 13px
- Cartões: filete de 2px no topo (ou na esquerda quando indica severidade/fonte), sem
  borda em volta, sem sombra
- Sem gesto de swipe destrutivo — arquivar exige toque em botão

## Novo atendimento — a tela que justifica o PWA

Três campos (Nome, Telefone, Assunto), ditado opcional no Assunto
(`SpeechRecognition`, com degradação silenciosa onde não existir), e um botão de 52px
"Salvar atendimento". Salva e volta. Qualificação, funil e vínculo com processo ficam para
o desktop.

## Push

- Web Push com VAPID; `app/manifest.ts` já existe
- **Um push por dia**, no horário do documento 06, mais as exceções marcadas
- `components/AppBadgeSync.tsx` continua sincronizando o badge do ícone
- iOS: só funciona com o app instalado na tela de início — mostre o convite de instalação
  uma vez, e nunca mais

## Aceite

- [ ] As cinco abas cobrem todo o `/m`; nenhuma rota removida ficou acessível
- [ ] Nenhum alvo de toque menor que 44px
- [ ] Um push por dia, e prazo de hoje furando a fila
- [ ] Novo atendimento salva com três campos preenchidos
