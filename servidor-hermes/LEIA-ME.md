# Ponte entre o Lúmen e o Hermes

O Hermes é um programa de linha de comando, e os perfis dos escritórios ficam no disco do servidor.
O Lúmen roda na Vercel, em contêineres efêmeros onde esse programa não existe. Por isso a chamada
precisa atravessar a rede: o Lúmen pergunta por HTTP, **este serviço** executa o Hermes ali mesmo e
devolve a resposta.

São três arquivos e nenhuma dependência — só o Python 3 que o servidor já tem.

---

## Instalação, passo a passo

Tudo abaixo roda **no servidor onde o Hermes está instalado**, como root.

### 1. Copiar os arquivos

```bash
mkdir -p /opt/lumen/servidor-hermes
# copie servidor.py para /opt/lumen/servidor-hermes/servidor.py
chmod 755 /opt/lumen/servidor-hermes/servidor.py
```

### 2. Criar o segredo

O segredo é a única coisa que separa o Hermes de quem alcançar a porta. Gere um novo, não invente
um à mão, e **não reaproveite** nenhuma senha existente:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

Guarde o que saiu — você vai precisar dele de novo no passo 5. Agora grave:

```bash
printf 'HERMES_TOKEN=%s\n' 'COLE_AQUI_O_SEGREDO' > /etc/lumen-hermes.env
chmod 600 /etc/lumen-hermes.env
```

O `chmod 600` importa: sem ele, qualquer usuário da máquina lê o segredo.

### 3. Subir o serviço

```bash
cp ponte-hermes.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now ponte-hermes
systemctl status ponte-hermes
```

Confira que está de pé:

```bash
curl -s http://127.0.0.1:8787/saude
# {"ok": true, "hermes": true}
```

Se vier `"hermes": false`, o binário não está em `/usr/local/bin/hermes` — ajuste `HERMES_BIN` no
`/etc/lumen-hermes.env` e reinicie.

**A chave do modelo é por perfil.** O Hermes lê o `.env` DO PERFIL, não o global. Para descobrir
qual arquivo é, pergunte a ele:

```bash
hermes -p <perfil> config env-path
hermes -p <perfil> config check      # mostra o que falta, com ✓ e ○
```

Foi por não perguntar isso que uma chave gravada no arquivo global ficou horas sem efeito.

### 4. Abrir para a internet, com TLS

O serviço só escuta em `127.0.0.1`. Quem atende a internet e cuida do certificado é o nginx:

```nginx
server {
    listen 443 ssl;
    server_name hermes.SEUDOMINIO.com.br;

    ssl_certificate     /etc/letsencrypt/live/hermes.SEUDOMINIO.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/hermes.SEUDOMINIO.com.br/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_set_header Host $host;
        # ERA 150s. Um pedido de peticionamento com dezenas de páginas de documento pode levar
        # bem mais que dois minutos, e o nginx cortava no meio — 504 sem explicação nenhuma.
        # 280s fica ACIMA do teto da ponte (HERMES_TIMEOUT_S, 240s) e ABAIXO do teto da Vercel
        # (maxDuration da tela de confirmação, 300s): quem desiste primeiro é sempre o lado que
        # sabe explicar ao advogado o que aconteceu. Se você mudar um destes números, confira a
        # corrente inteira — ela está escrita por extenso no topo de servidor.py.
        proxy_read_timeout 280s;
    }
}
```

> **Não publique a porta 8787 direto.** Sem TLS, o segredo viaja em texto limpo na rede.

### 5. Ligar o Lúmen nele

Na Vercel, em *Settings → Environment Variables*, no ambiente de **Production**:

| variável | valor |
|---|---|
| `HERMES_URL` | `https://hermes.SEUDOMINIO.com.br` |
| `HERMES_TOKEN` | o mesmo segredo do passo 2 |
| `HERMES_PERFIL` | o nome do perfil que existe na máquina (ex.: `atendimento-lumen`) |

A terceira é temporária. O desenho é um perfil por escritório (`lumen-tenant-<slug>`), e é o que o
Lúmen calcula sozinho. Enquanto existir um perfil só, com outro nome, `HERMES_PERFIL` manda. Quando
houver um por escritório, apague a variável e o cálculo automático volta a valer — sem release.

Redeploy, e pronto: a caixa de conversa do portal passa a ser respondida pelo Hermes.

**Enquanto essas duas variáveis não existirem, nada acontece** — o Lúmen nem tenta falar com o
Hermes, e a caixa continua respondendo pelo Claude, como hoje. Não há passo intermediário quebrado.

### 6. Deixar a ponte de pé 24 horas por dia

O `Restart=always` da unidade reinicia a ponte quando o processo **morre**. Ele não tem como saber
que um processo **vivo** parou de atender — uma chamada presa, um socket que não fecha. Para quem
pergunta ao agente, os dois casos são a mesma coisa: não responde.

O vigia cobre o segundo caso. De dois em dois minutos ele pergunta `/saude`; se não vier resposta
em dez segundos, manda reiniciar a ponte.

Um comando de cada vez. Depois de cada um, confira o que está escrito em **"deve aparecer"** antes
de rodar o seguinte.

**6a.** Copie os dois arquivos novos (`ponte-hermes-vigia.service` e `ponte-hermes-vigia.timer`)
para `/etc/systemd/system/`, do mesmo jeito que você copiou os outros.

**6b.** Atualize também a unidade da ponte, que mudou de `Restart=on-failure` para
`Restart=always` — copie `ponte-hermes.service` por cima do que está em `/etc/systemd/system/`.

**6c.**

```bash
systemctl daemon-reload && systemctl restart ponte-hermes && systemctl enable --now ponte-hermes-vigia.timer
```

*Deve aparecer:* uma linha começando com `Created symlink`. Se não aparecer nada, também está
certo — quer dizer que o vigia já estava ligado.

**6d.** Confira que o vigia está agendado:

```bash
systemctl list-timers ponte-hermes-vigia --no-pager
```

*Deve aparecer:* uma linha com `ponte-hermes-vigia.timer` e um horário em `NEXT`, dentro dos
próximos dois minutos.

**6e.** Prove que ele funciona. Derrube a ponte de propósito e espere dois minutos:

```bash
systemctl stop ponte-hermes && sleep 150 && systemctl is-active ponte-hermes
```

*Deve aparecer:* `active`. Ou seja: você derrubou, e a máquina levantou sozinha. Se aparecer
`inactive`, o vigia não está funcionando — mande `journalctl -u ponte-hermes-vigia -n 20` e o
resultado diz o porquê.

O vigia fica marcado como *failed* toda vez que encontra a ponte caída. **Isso é de propósito**: é
o único rastro que conta, depois, que houve uma queda e quando. `systemctl status
ponte-hermes-vigia` mostra a última.

---

## O que este serviço faz, e o que ele recusa

| pedido | resposta |
|---|---|
| `GET /saude` | `200` com o estado, sem exigir segredo (serve para o nginx e para você) |
| qualquer outra rota sem o segredo, ou com o segredo errado | `401` |
| perfil fora do formato (minúsculas, dígitos, `.`, `-`, `_`) | `400` |
| mensagem vazia, ou acima de 200.000 **caracteres** (`PERGUNTA_MAXIMA`) | `400` |
| corpo acima de 512 KiB = 524.288 **bytes** (`CORPO_MAXIMO`) | `413` |
| algum argumento da linha de comando acima do teto do sistema (`TETO_DE_ARGUMENTO_BYTES`) | `400`, com a mesma frase de tamanho |
| escritório sem perfil provisionado no Hermes | `404` |
| provisionamento pedido numa instalação sem o script | `501` |
| binário do `hermes` velho demais, sem `--query-file` | `501`, dizendo para atualizar o binário |
| Hermes passou de 240 segundos (`HERMES_TIMEOUT_S`) | `504` |
| resposta boa em `POST /chat` | `200` com `{"resposta": ..., "sessao": ...}` |
| `POST /chat-async` (mesmo corpo de `/chat`) | `202` com `{"tarefa": "<id>"}`, **na hora** |
| `POST /chat-async` com a memória de tarefas cheia (`HERMES_TAREFAS_MAXIMAS`) | `503`, falado |
| `GET /resultado/<id>` sem o segredo, ou com o errado | `401` — a MESMA autorização de `/chat` |
| `GET /resultado/<id>` em andamento | `200` com `{"estado": "trabalhando"}` |
| `GET /resultado/<id>` pronto | `200` com `{"estado": "pronto", "resposta": ..., "sessao": ...}` — **e a tarefa some da memória** |
| `GET /resultado/<id>` que falhou | `200` com `{"estado": "falhou", "erro": ..., "codigo": ...}` |
| `GET /resultado/<id>` desconhecido (ponte reiniciada, vencido, ou já lido) | `404` com `{"estado": "desconhecida"}` |
| `GET /perfis` | a lista de escritórios provisionados |
| `POST /provisionar` com `{slug, officeId, nome}` | cria o perfil do escritório |
| `POST /desprovisionar` com `{slug}` | remove o perfil |
| `POST /estado` com `{perfis: [...]}` | se cada perfil existe, quanto ocupa, quantas conversas |
| slug fora do formato, `officeId` fora do formato, nome vazio | `400` |

### As variáveis de ambiente desta entrega

Todas têm padrão seguro; nenhuma precisa ser definida para a ponte funcionar.

| variável | padrão | o que faz |
|---|---|---|
| `HERMES_TIMEOUT_S` | `240` | teto do processo do Hermes — **o segundo elo da corrente de tempos** |
| `HERMES_RUN_BUDGET_FOLGA_S` | `25` | folga entre o orçamento do agente e a morte do processo |
| `HERMES_MAX_TURNS` | `60` | teto de iterações de ferramenta por turno (o padrão do binário é 500) |
| `HERMES_TAREFAS_MAXIMAS` | `32` | quantas gerações assíncronas cabem na memória ao mesmo tempo |
| `HERMES_TAREFA_VALIDADE_S` | `1800` | quanto tempo uma tarefa não buscada continua de pé |

O **orçamento do agente não é uma variável**: ele é `HERMES_TIMEOUT_S` menos
`HERMES_RUN_BUDGET_FOLGA_S`, com piso de 30s (a constante `ORCAMENTO_S`, no `servidor.py`). Isso é
de propósito — um segundo número solto voltaria a permitir a combinação que matou uma geração real
em produção: o processo morto antes de o agente sequer ser avisado de que havia prazo.

Cinco decisões que valem explicação:

**`--run-budget`: o agente conclui em vez de morrer.**

O registro da VPS, numa geração real do dono com dois documentos anexados (uma decisão judicial em
PDF e um parecer em DOCX):

```
subprocess.TimeoutExpired: Command '['/usr/local/bin/hermes', '-p', 'peticionamento-lumen',
'chat', ...]' timed out after 240 seconds
BrokenPipeError: [Errno 32] Broken pipe
```

O Hermes passou de 240s **sem terminar** e foi morto no meio da redação. O cano quebrado veio logo
atrás: o Lúmen já havia desistido aos 230s, então quando a ponte tentou responder não havia mais
ninguém do outro lado. O advogado leu `DEMORA: o Hermes não respondeu em 230s`, e todo o trabalho
— e o custo das chamadas de modelo — se perdeu.

`hermes chat --run-budget SEGUNDOS` conserta o que dava para consertar aqui: aos 80% do orçamento o
agente recebe um aviso único para ir concluindo, e os tempos de espera implícitos do provedor
passam a ser limitados ao que sobra, de modo que uma chamada travada não consuma a execução
inteira. Com os padrões de hoje: orçamento de **215s**, aviso aos **172s**, 43s para concluir, e
25s de margem entre o fim do orçamento e a machadada do `subprocess`. Quem termina a execução passa
a ser o agente, e não o sistema operacional.

`--max-turns 60` entra junto e pelo mesmo motivo: o padrão do binário é 500 iterações de chamada de
ferramenta, e uma ferramenta em laço gasta o orçamento **inteiro** sem escrever uma linha — aí o
aviso dos 80% chega a um agente que passou o tempo todo girando, e o que ele entrega é o nada que
ele tem. Sessenta é várias vezes o que uma geração saudável usa, e ainda assim um teto.

**`/chat-async`: a espera sai de dentro da requisição web.**

`--run-budget` faz o agente entregar o que tem dentro do prazo. Mas o prazo em si não tem para onde
crescer: **o teto duro é a Vercel, 300 segundos**, e nenhuma função da plataforma passa disso. Uma
peça a partir de um processo de dezenas de páginas pode legitimamente precisar de mais — limitar o
agente para caber numa requisição HTTP é limitar a *qualidade* do trabalho ao tempo de um cano de
rede.

Por isso a geração deixou de ser "esperar" e passou a ser um trabalho com nome:

```
POST /chat-async   → 202 {"tarefa": "<id>"}          (na hora; o trabalho corre numa thread)
GET  /resultado/id → {"estado": "trabalhando"}       (ainda redigindo)
                   → {"estado": "pronto", ...}       (e a tarefa some da memória)
                   → {"estado": "falhou", ...}       (e a tarefa some da memória)
                   → 404 {"estado": "desconhecida"}  (a ponte reiniciou, venceu, ou já foi lida)
```

`POST /chat` **continua existindo, intacto** — é por ele que o atendimento (a Ana) fala, com o teto
de 105s do lado do Lúmen. Nada desta entrega chega até ele: mesmo corpo, mesmos códigos, mesmas
frases de recusa.

As tarefas vivem **em memória**, com teto de quantidade e validade, e somem depois de lidas. Uma
tarefa pronta guarda uma peça inteira; sem teto, a ponte viraria um vazamento de memória guardando
peças, e esta VPS tem 1,6 GB livres. Com a memória cheia a ponte **recusa** (`503`, falado) em vez
de aceitar e ficar sem memória no meio de três gerações.

> **Se a ponte reiniciar, as tarefas somem.** Isso é estado possível do mundo, não defeito:
> `/resultado/<id>` responde `404 {"estado": "desconhecida"}`, e o Lúmen transforma isso numa
> recusa falada ("a geração se perdeu, tente de novo"). Do lado do Lúmen há ainda uma rede de
> segurança por cron (`/api/cron/minutas-pendentes`, a cada 5 minutos) que colhe a geração de quem
> fechou a aba — é ela que torna verdadeira a frase que a tela mostra ao advogado.

> **O conteúdo nunca vai ao registro.** Nem a pergunta, nem a resposta, nem a credencial: fica o
> tamanho, o perfil e o estado. São dados de cliente de escritório de advocacia passando por aqui.


**A pergunta não viaja pela linha de comando — e o motivo não é elegância.**

Esta é a correção mais importante que este arquivo já recebeu, e ela custou dois dias de
produção. Vale escrever por extenso, porque o número aqui não é redondo por acidente.

O Linux limita o tamanho de **um único argumento** de linha de comando. A constante chama-se
`MAX_ARG_STRLEN`, está em `include/uapi/linux/binfmts.h`, e vale `32 * PAGE_SIZE`. Numa máquina de
página de 4 KiB — todo x86-64, esta VPS inclusive — são **131.072 bytes**, contando o byte nulo do
fim. Não é ajustável por `ulimit`; não é o `ARG_MAX` do `getconf`, que é outro limite (a soma de
tudo, argumentos mais ambiente) e é muito maior. É um teto por argumento, e é duro.

A ponte mandava a pergunta inteira como um argumento: `hermes -p <perfil> chat -q "<pergunta>"`.
Com isso, o teto de 200.000 **caracteres** que este serviço anuncia era **inalcançável**, e por uma
razão de unidade: 131.072 é um limite de **bytes**, e em português com acento o UTF-8 gasta 2 bytes
em cada acento. Na prática o teto real era algo entre **110.000 e 125.000 caracteres** — e nada
dizia isso em lugar nenhum. O registro da VPS, numa geração real:

```
[ponte-hermes] pergunta para peticionamento-lumen (160059 caracteres, nova conversa, ferramentas: nao)
[ponte-hermes] falha ao executar o Hermes: [Errno 7] Argument list too long: '/usr/local/bin/hermes'
```

Nove milésimos de segundo. Nunca chegou ao Hermes. E como o Lúmen aprovava o pedido (a trava dele
é 190.000 caracteres), o que o advogado lia na tela era `500 {"erro": "falha ao executar o
Hermes"}` — pior que o `400` que existia antes, porque um 500 não diz o que fazer.

**O conserto não foi baixar o teto.** `hermes chat` aceita `--query-file PATH`, que lê a pergunta
de um arquivo em vez da linha de comando, e `-` como caminho significa "leia da entrada padrão".
É por aí que a pergunta viaja agora. Fora do `argv`, `MAX_ARG_STRLEN` deixa de ser teto do produto,
e 200.000 caracteres passam a ser alcançáveis de verdade — que é o que o número sempre disse que
era. (`-q` e `--query-file` são mutuamente exclusivos: não se manda os dois.)

Entrada padrão, e não arquivo temporário, por quatro razões, nesta ordem de peso:

1. **sigilo.** A pergunta é dado de cliente de escritório de advocacia. Um arquivo temporário põe a
   peça inteira no disco, ainda que por segundos, onde backup, snapshot da VPS e qualquer outro
   processo da máquina alcançam. A entrada padrão não encosta no disco;
2. **não há o que apagar**, logo não há caminho de erro em que o apagar não aconteça. Com arquivo
   seria preciso um `try/finally` que sobrevivesse ao tempo esgotado e a qualquer exceção — e
   "quase sempre apaga", em dado sigiloso, é o mesmo que "vaza às vezes";
3. **não há nome para colidir.** Esta ponte é `ThreadingHTTPServer`: duas gerações simultâneas são
   o caso normal, não a exceção;
4. **não há permissão para errar.** O arquivo que não existe não precisa de `chmod 600`.

A codificação da entrada é **UTF-8 explícita** (`encoding="utf-8"` no `subprocess.run`), e não a
do ambiente: numa VPS com `LANG=C` o padrão do Python escreveria em ASCII e quebraria no primeiro
"ção".

Sobrou no código uma conferência de tamanho de argumento (`checar_argumentos`), que hoje nunca
dispara. Ela fica **de propósito**: se alguém um dia reintroduzir `-q`, a recusa vem como `400`
falado, com a mesma frase de tamanho que o Lúmen já sabe traduzir, em vez de `[Errno 7]` virando
`500` opaco na tela do advogado.

> **Ao atualizar a ponte, atualize o `hermes` junto.** Um binário velho, sem `--query-file`,
> responde `501` dizendo exatamente isso — em vez de um erro genérico que mandaria você procurar
> defeito na ponte. Para conferir antes: `hermes chat --help | grep query-file`.

**O serviço não sobe sem o segredo.** Nem com um segredo curto (mínimo de 32 caracteres). Uma
ponte sem autenticação não é uma ponte aberta: é um buraco, e falhar na hora de subir é a única
resposta honesta.

**Não existe shell no caminho.** O Hermes é executado com uma *lista* de argumentos, entregue
direto ao sistema operacional. A pergunta do usuário pode conter aspas, `;`, `$(...)` — nada disso
vira comando. (A rota antiga montava a linha de comando como texto e escapava as aspas à mão; isso
funciona até o dia em que não funciona.)

**As portas de provisionamento existem por necessidade, não por conforto.** Um escritório sem
perfil no Hermes tem a caixa de conversa muda, e não há nada que a pessoa possa fazer pela tela.
Por isso `/provisionar` e `/desprovisionar` moram aqui, ao lado do `/chat`: é o mesmo caminho, e
sem elas o assistente só funcionaria para os escritórios que já existiam.

**O registro guarda o tamanho da pergunta, nunca o conteúdo.** São dados de cliente de escritório
de advocacia passando por aqui. `journalctl -u ponte-hermes` mostra quem perguntou para qual perfil
e quando — o suficiente para investigar um problema, sem virar uma segunda cópia das conversas.

---

## As ferramentas: como o agente consulta os dados do escritório

O agente **não tem o banco do Lúmen**, e não deve ter. Quando precisa de um número, ele roda o
programa `lumen-consultar.py`, que pergunta ao Lúmen e devolve a resposta.

O que faz isso funcionar são duas variáveis que a ponte põe no ambiente **de cada execução**:

```
LUMEN_FERRAMENTAS_URL          onde perguntar
LUMEN_FERRAMENTAS_CREDENCIAL   a credencial DAQUELA pergunta
```

**A credencial é da pergunta, não do escritório.** Ela carrega quem perguntou e o que essa pessoa
pode ver, vale cinco minutos, e morre com o processo. Um token fixo por escritório seria mais
simples e estaria errado: bastaria alguém sem acesso ao financeiro pedir ao agente "quanto entrou
este mês" para contornar a regra pela porta dos fundos.

Quem decide o que responder é o **Lúmen**, do outro lado. O agente não tem opinião sobre permissão
— e é justamente isso que torna a regra confiável.

### Instalar

```bash
curl -fsSL -o /opt/lumen/servidor-hermes/lumen-consultar.py \
  https://raw.githubusercontent.com/rodartepradoadvogados/Lumen/main/servidor-hermes/lumen-consultar.py
chmod 755 /opt/lumen/servidor-hermes/lumen-consultar.py
ln -sf /opt/lumen/servidor-hermes/lumen-consultar.py /usr/local/bin/lumen-consultar
```

Depois disso, o perfil do Hermes precisa **saber que essa ferramenta existe** — é instrução no
prompt dele, não configuração da ponte. Algo como:

> Para qualquer pergunta sobre processos, publicações, agenda, atendimentos, clientes ou
> financeiro do escritório, rode `lumen-consultar` no terminal. Sem argumentos ele lista o que é
> possível consultar. Nunca invente números: se a consulta não trouxer, diga que não encontrou.
> Se a resposta for uma recusa de acesso, isso é regra do escritório — não tente outro caminho.

### Conferir

```bash
lumen-consultar          # fora de uma pergunta do Lúmen, deve dizer que não há credencial
```

---

## Manutenção

```bash
systemctl status ponte-hermes         # está de pé?
journalctl -u ponte-hermes -n 50      # o que aconteceu
systemctl restart ponte-hermes        # depois de mudar /etc/lumen-hermes.env
journalctl -u ponte-hermes-vigia -n 20  # quantas vezes ela caiu, e quando
```

**Trocar o segredo:** gere um novo, grave no `/etc/lumen-hermes.env`, reinicie o serviço e
atualize `HERMES_TOKEN` na Vercel. Entre um passo e outro a caixa de conversa cai na reserva
(o Claude) em vez de dar erro — então a troca pode ser feita sem avisar ninguém.

**O TEMPO, e o que já está feito:** `--run-budget` **está ligado** (ver a seção acima), derivado de
`HERMES_TIMEOUT_S`, e a espera saiu de dentro da requisição web (`/chat-async` + `/resultado/<id>`).
Os números da corrente de tempos continuam os da tabela acima e do topo de `servidor.py` — **não
mexa em um sem conferir a corrente inteira**, e lembre que o orçamento do agente é *derivado* do
teto do processo: mudar `HERMES_TIMEOUT_S` move os dois juntos, de propósito.

**Uma trava que ficou de fora:** o serviço roda como root, porque os perfis do Hermes estão em
`/root/.hermes`. Se um dia esses perfis mudarem para um diretório próprio, vale mudar o `User=` da
unidade junto — é a diferença entre um abuso da ponte alcançar o Hermes e alcançar a máquina.
