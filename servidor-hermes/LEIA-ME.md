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
        # O Hermes pode levar dois minutos para responder. Sem isto, o nginx corta antes.
        proxy_read_timeout 150s;
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
| mensagem vazia, ou acima de 8.000 caracteres | `400` |
| corpo acima de 64 KiB | `413` |
| escritório sem perfil provisionado no Hermes | `404` |
| provisionamento pedido numa instalação sem o script | `501` |
| Hermes passou de 110 segundos | `504` |
| resposta boa em `POST /chat` | `200` com `{"resposta": ..., "sessao": ...}` |
| `GET /perfis` | a lista de escritórios provisionados |
| `POST /provisionar` com `{slug, officeId, nome}` | cria o perfil do escritório |
| `POST /desprovisionar` com `{slug}` | remove o perfil |
| `POST /estado` com `{perfis: [...]}` | se cada perfil existe, quanto ocupa, quantas conversas |
| slug fora do formato, `officeId` fora do formato, nome vazio | `400` |

Quatro decisões que valem explicação:

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

**Uma trava que ficou de fora:** o serviço roda como root, porque os perfis do Hermes estão em
`/root/.hermes`. Se um dia esses perfis mudarem para um diretório próprio, vale mudar o `User=` da
unidade junto — é a diferença entre um abuso da ponte alcançar o Hermes e alcançar a máquina.
