# Obsidian ligado ao Lúmen — passo a passo

O que isso monta: uma pasta no seu computador com uma nota por Cliente, Processo, Assessoria e
Atendimento do SEU escritório, ligadas entre si por links (o Obsidian mostra isso como um grafo
de conexões), mais um resumo financeiro mensal — tudo atualizado sozinho, todo dia. Documentos
(petições, contratos...) nunca são copiados: cada nota só tem um link pro arquivo original no
Google Drive/OneDrive/Dropbox, exatamente como já é no Lúmen hoje.

**O que NÃO entra nessa pasta, de propósito:** nenhuma senha, nenhuma chave de API, nenhum
segredo de configuração (isso fica só na Vercel — ver `docs/obsidian/vault-templates/00-Sistema/Configuracoes.md`,
que lista só os NOMES). E o código-fonte fica numa pasta separada, fora do vault — ver Parte 4.

**Regra que não é opcional:** a pasta do vault (a que você vai criar no Passo 2) **nunca pode
sincronizar pra nuvem** — nem Obsidian Sync, nem iCloud, nem Google Drive, nem Dropbox, nem
OneDrive. Ela guarda dado real de cliente (nome, valor de causa, financeiro). Fica só no seu
computador.

---

## Parte 1 — Preparar a pasta do código (se ainda não tiver)

Se você já tem `C:\Users\jairo\lumen` da vez que rodamos os scripts de auditoria, pule pra
Parte 2. Se não tiver, abra o Prompt de Comando e rode:

```
cd C:\Users\jairo
git clone https://github.com/rodartepradoadvogados/lumen.git
cd lumen
npm install
```

## Parte 2 — Criar a pasta do vault

Escolha um lugar SÓ SEU, fora de qualquer pasta de nuvem (não dentro de OneDrive/Google Drive/
Dropbox). Exemplo: `C:\Obsidian\Lumen`. No Prompt de Comando:

```
mkdir C:\Obsidian\Lumen
```

## Parte 3 — Achar o ID do seu escritório

Na pasta do código (`C:\Users\jairo\lumen`), com o `.env` já configurado (o mesmo de antes, com
`DATABASE_URL`):

```
cd C:\Users\jairo\lumen
set NODE_OPTIONS=-r dotenv/config
npx tsx scripts/listar-escritorios.ts
```

Vai imprimir uma lista com id, nome e slug de cada escritório. Copie o **id** da linha do
**Rodarte Prado Advogados** (o seu, marcado como "(interno)").

## Parte 4 — Adicionar as duas novas linhas no `.env`

Digite (sem apertar Enter ainda):

```
echo OBSIDIAN_OFFICE_ID="
```

Cole o id que você copiou no Passo 3, depois digite o final e aperte Enter:

```
">> .env
```

(repare o `>>` com dois sinais — isso ACRESCENTA a linha no arquivo, sem apagar o que já tinha.
Um `>` só, como usamos antes, teria apagado a `DATABASE_URL` que já estava lá.)

Agora a segunda linha, mesmo esquema:

```
echo OBSIDIAN_VAULT_DIR="C:\Obsidian\Lumen">> .env
```

Confira com `type .env` — devem aparecer 3 linhas: `DATABASE_URL`, `OBSIDIAN_OFFICE_ID` e
`OBSIDIAN_VAULT_DIR`.

## Parte 5 — Rodar a exportação uma vez, manualmente, pra testar

Ainda em `C:\Users\jairo\lumen`:

```
npx tsx scripts/exportar-obsidian.ts
```

Deve imprimir quantos clientes/processos/assessorias/atendimentos foram exportados, e terminar
com "Pronto. Nada foi alterado no banco". Confira em `C:\Obsidian\Lumen\Lumen` — deve ter
aparecido uma pasta `02-Clientes`, `03-Processos` etc., cheia de arquivos `.md`.

## Parte 6 — Copiar os documentos de referência (uma vez só)

Copie a pasta `docs\obsidian\vault-templates\00-Sistema` (de dentro de `C:\Users\jairo\lumen`)
pra dentro de `C:\Obsidian\Lumen\Lumen\00-Sistema`. Pelo Prompt de Comando:

```
xcopy "C:\Users\jairo\lumen\docs\obsidian\vault-templates\00-Sistema" "C:\Obsidian\Lumen\Lumen\00-Sistema\" /E /I
```

## Parte 7 — Abrir no Obsidian

1. Abra o Obsidian (baixe em obsidian.md se ainda não tiver — é gratuito para uso pessoal).
2. Na tela inicial, clique em **"Open folder as vault"**.
3. Selecione a pasta `C:\Obsidian\Lumen`.
4. Pronto — no painel da esquerda você vê as pastas (`00-Sistema`, `02-Clientes`,
   `03-Processos`...). Clique em qualquer nota; os links azuis `[[assim]]` levam a outras notas.
5. Pra ver o mapa de conexões: menu da esquerda → ícone de grafo (parece uma teia) → "Graph view".

**Opcional, pra consultar por filtro** (ex.: "todo processo com status ATIVO"): Configurações →
Community plugins → desligar "Restricted mode" → Browse → buscar **"Dataview"** → Install →
Enable. Depois disso dá pra escrever, em qualquer nota, um bloco assim:

````
```dataview
table status, natureza from "Lumen/03-Processos" where status = "ATIVO"
```
````

## Parte 8 — Deixar tudo automático (código atualizado + dados exportados todo dia)

Crie um arquivo `atualizar-obsidian.bat` na pasta do código:

```
cd C:\Users\jairo\lumen
notepad atualizar-obsidian.bat
```

Confirme "Sim" para criar o arquivo novo. Cole exatamente isto dentro:

```bat
@echo off
cd /d C:\Users\jairo\lumen
git pull
set NODE_OPTIONS=-r dotenv/config
npx tsx scripts/exportar-obsidian.ts
```

Salve (Ctrl+S) e feche o Bloco de Notas. Agora agende esse arquivo pra rodar sozinho todo dia às
6h da manhã — na mesma janela do Prompt de Comando:

```
schtasks /create /tn "Lumen - Atualizar Obsidian" /tr "C:\Users\jairo\lumen\atualizar-obsidian.bat" /sc daily /st 06:00
```

Pronto: todo dia, sozinho, o código é atualizado (`git pull`) e as notas do Obsidian são
regeneradas com o dado mais recente do seu escritório. Se quiser forçar uma atualização na hora,
sem esperar o horário agendado, é só rodar `atualizar-obsidian.bat` direto (dois cliques nele, ou
`C:\Users\jairo\lumen\atualizar-obsidian.bat` no Prompt de Comando).

---

## E pra "questionar código" e "descobrir coisas novas"?

Isso não passa pelo Obsidian — é conversar comigo (Claude) numa sessão apontada pro repositório
`rodartepradoadvogados/lumen`, do jeito que fizemos esta semana inteira. Eu leio o código
diretamente; o Obsidian é só pra VOCÊ consultar dado e navegar conexões sem precisar abrir o
sistema ou me chamar pra cada pergunta simples.

## Se algo der errado

Mesma regra de sempre: copia a mensagem de erro exata (ou print) e me manda.
