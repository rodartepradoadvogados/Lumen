# Como manter C:\Projetos\Lumen sincronizada

## O que eu (Claude) consigo e o que não consigo fazer

Eu trabalho num ambiente remoto, isolado, na nuvem — não tenho nenhum acesso ao seu computador
Windows. Não consigo abrir um terminal aí, não consigo rodar `git pull` na sua máquina, não
consigo criar uma tarefa agendada no seu Windows. Tudo o que eu produzo, eu envio para o GitHub
(`github.com/rodartepradoadvogados/lumen`) através de Pull Requests — e depois que você aprova e
faz merge, a única forma de aquilo chegar em `C:\Projetos\Lumen` é você (ou algo rodando na sua
máquina) puxar do GitHub.

O que eu posso fazer — e fiz — é deixar pronto, dentro do próprio repositório, tudo que reduz
esse trabalho ao mínimo possível: um script que sincroniza com um clique e mostra um resumo do
que mudou, e um arquivo de histórico legível (`docs/status/HISTORICO.md`) que vou mantendo
atualizado a cada entrega relevante.

## Passo 1 — confirmar que a pasta é um clone do repositório

Se `C:\Projetos\Lumen` já foi criada com `git clone`, pule para o Passo 2. Se não tiver certeza,
abra um terminal ali dentro e rode:

```powershell
cd C:\Projetos\Lumen
git remote -v
```

Se aparecer `https://github.com/rodartepradoadvogados/lumen`, está tudo certo. Se der erro
("not a git repository") ou a pasta estiver vazia/incompleta, refaça o clone (guarde o que já
tiver de diferente antes, se houver):

```powershell
cd C:\Projetos
git clone https://github.com/rodartepradoadvogados/lumen.git Lumen
```

## Passo 2 — sincronizar manualmente (sem precisar decorar comando de git)

Depois desta atualização chegar na sua pasta (via `git pull` uma primeira vez), vai existir o
arquivo `scripts\sync-local.ps1`. Para usar:

- **Clique duplo** nele (ou botão direito → "Executar com PowerShell"), ou
- No terminal: `cd C:\Projetos\Lumen` e depois `powershell -ExecutionPolicy Bypass -File scripts\sync-local.ps1`

Ele puxa o que há de novo e mostra a lista de commits — mais rápido que abrir o terminal e
lembrar do `git pull` toda vez.

## Passo 3 (opcional) — automatizar para rodar sozinho

Para não precisar nem clicar: Agendador de Tarefas do Windows, uma vez só.

1. Abra **Agendador de Tarefas** (pesquise no menu Iniciar).
2. **Criar Tarefa Básica** → nome "Sincronizar Lúmen".
3. Gatilho: escolha, por exemplo, "Diariamente" ou "Ao fazer logon" — e em "Configurações
   avançadas" marque "Repetir a cada" 30 minutos, "por" 8 horas, se quiser que rode ao longo do
   dia todo enquanto o computador estiver ligado.
4. Ação: **Iniciar um programa**.
   - Programa/script: `powershell.exe`
   - Argumentos: `-WindowStyle Hidden -ExecutionPolicy Bypass -File "C:\Projetos\Lumen\scripts\sync-local.ps1"`
5. Concluir. A partir daí a pasta se mantém sincronizada sozinha, mesmo sem você abrir nada.

## Onde ver "o que mudou" sem abrir o VS Code

`docs/status/HISTORICO.md` — atualizado por mim a cada entrega relevante, em português, sem
jargão de commit. É o primeiro arquivo para checar depois de sincronizar.
