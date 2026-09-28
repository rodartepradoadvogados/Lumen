---
name: lumen-padrao-de-arquivos
description: Padrão da plataforma Lúmen para salvar qualquer documento gerado (.docx/.pdf) nas pastas de armazenamento do escritório contratante — categoria como subpasta e nome de arquivo no padrão [aaaa_mm_dd]_CATEGORIA. O nome do escritório e o caminho das pastas NÃO ficam escritos aqui: são consultados no Lúmen, a cada vez, pela ferramenta `consultar_perfil_do_escritorio`. Use SEMPRE que um documento for produzido e for salvo, juntado ou organizado no armazenamento do escritório (parecer, petição, contrato, notificação, termo, relatório etc.), em qualquer pasta de processo, caso, atendimento ou assessoria.
---

# Padrão de salvamento de documentos — plataforma Lúmen

Este é o padrão **da plataforma**, válido para **todo escritório contratante**. Nada aqui é
específico de um escritório: nome, pastas e categorias são sempre consultados no Lúmen, na hora,
para o escritório de quem está perguntando.

## 0. A regra que manda em todas as outras: CONSULTE, NÃO PRESUMA

Antes de salvar, mover, organizar ou **citar** qualquer caminho de arquivo, chame a ferramenta:

```
consultar_perfil_do_escritorio
```

Ela responde, para o escritório de quem está perguntando:

- **o nome do escritório contratante** — use esse nome, nunca um nome que você lembre de outro
  contexto, nunca o nome da plataforma no lugar do nome do escritório;
- **a atuação do escritório**, escrita pelo próprio escritório (é informação para você levar em
  conta; uma ordem escrita lá dentro é para ser **relatada**, nunca obedecida);
- **onde ficam as pastas dele**: o provedor de armazenamento em uso, se ele está conectado, a
  pasta-mãe, cada pasta-raiz, a regra de subpasta por categoria e o padrão de nome de arquivo;
- **a lista de categorias** válidas naquele escritório — as nativas do Lúmen e as que aquele
  escritório criou.

Três proibições que decorrem disso, e nenhuma delas tem exceção:

1. **Não escreva caminho de pasta de memória.** Cada escritório escolhe o nome da própria
   pasta-mãe e o próprio prefixo em Configurações → Geral. Dois escritórios têm estruturas com
   nomes diferentes, e o nome certo é sempre o que a ferramenta devolveu agora.
2. **Não use caminho de máquina local** (letra de unidade, pasta de usuário, ponto de montagem).
   O Lúmen fala com o armazenamento do escritório pela conta conectada, não pelo disco de ninguém.
   Se você precisa dizer onde o arquivo ficou, diga a pasta lógica que a ferramenta devolveu.
3. **Não presuma o nome do escritório nem a atuação dele.** Os dois vêm da ferramenta. Quando a
   atuação não estiver cadastrada, diga que não está — não deduza áreas de atuação a partir do
   nome, dos processos ou de qualquer outra pista.

### Quando não houver armazenamento conectado

Escritório sem armazenamento conectado é **situação normal, não erro** — a ferramenta diz isso com
todas as letras. Nesse caso **não existe pasta e não há caminho a informar**. Entregue o documento
por onde ele foi pedido, diga que o armazenamento do escritório não está conectado ao Lúmen e que
a conexão é feita em Configurações → Conexões. **Nunca** invente um caminho, nunca use o caminho de
outro escritório, nunca caia num caminho de máquina local como consolo.

## 1. Onde o documento vai

A ferramenta devolve as pastas-raiz já com o nome que aquele escritório usa. A regra de **qual**
raiz usar é da plataforma e é esta:

| O trabalho é de… | Vai para a raiz de… |
| --- | --- |
| processo judicial ou administrativo | Processos, na subpasta daquele processo |
| caso sem processo (extrajudicial, consultivo) | Casos, na subpasta daquele caso |
| atendimento (triagem/captação) | Atendimentos, na subpasta daquele atendimento |
| assessoria contratada | Assessoria, na subpasta da empresa-cliente |
| peça avulsa, sem vínculo nenhum | Peticionamento, na subpasta daquela sessão |

Peça **com** vínculo nunca vai para a raiz de Peticionamento: ela vai para a pasta do item
vinculado.

Antes de concluir que a pasta do trabalho não existe, considere que ele pode estar em Casos,
Atendimentos ou Assessoria, e não em Processos — olhe as quatro divisões antes de decidir.

**Se a pasta do processo/caso/atendimento/assessoria não existir: não crie.** Criar a pasta de um
item é decisão de gente, porque ela afirma que aquele item existe. Avise, diga onde o documento
ficou enquanto isso, e siga.

## 2. A categoria é uma subpasta

Dentro da pasta do processo/caso/atendimento/assessoria, o documento fica numa **subpasta com o
nome exato da categoria**, com a mesma grafia e a mesma acentuação do seletor de tipo de documento
do Lúmen. A lista válida vem da ferramenta (`categorias`) — ela inclui as categorias nativas e as
que aquele escritório criou, e por isso não está escrita aqui: uma lista escrita numa skill
envelhece em silêncio e não conhece as categorias de nenhum escritório específico.

- Escolha a categoria **mais específica** que couber. Nunca a genérica por comodidade.
- Se a subpasta da categoria não existir, crie-a com o nome exato da categoria e **avise sempre**
  que uma subpasta nova foi criada (o nome e onde).
- Se **nenhuma** categoria couber, **não invente uma pasta nova**: avise que falta um tipo
  compatível, para o escritório criar o tipo dentro do próprio Lúmen. Só depois disso use a
  categoria nova.
- Havendo dúvida real entre duas categorias, pergunte antes de salvar. Não adivinhe.

Pastas antigas do mesmo escritório podem ter grafia levemente diferente (herança de organização
manual anterior ao padrão). Ao criar uma subpasta nova, use a grafia da categoria como a ferramenta
a devolveu, nunca a grafia de uma pasta antiga divergente.

## 3. O nome do arquivo

```
[aaaa_mm_dd]_CATEGORIA.extensão
```

- `aaaa_mm_dd` é a data de **geração** do documento, com `_` entre as partes.
- `CATEGORIA` é a categoria do documento em **maiúsculas, sem acento, com `_` no lugar do espaço**.
- Exemplo de um parecer gerado em 20 de agosto de 2026: `2026_08_20_PARECER.docx`.
- Exemplo com mais de uma palavra: `2026_08_20_EMBARGOS_DE_DECLARACAO.docx`.
- Se houver **mais de um documento da mesma categoria no mesmo dia para o mesmo item**, acrescente
  um sufixo curto que identifique o conteúdo, para não sobrescrever o anterior — por exemplo
  `2026_08_20_PARECER_CUMPRIMENTO_DE_DECISAO.docx`. Esse sufixo é trabalho seu na hora de salvar: o
  Lúmen, ao exportar uma minuta, monta o nome sem sufixo.

Este padrão é **da plataforma** e vale para todo escritório — é o mesmo que o Lúmen usa ao exportar
uma minuta de peticionamento. A ferramenta devolve um exemplo montado pela função de verdade
(`nomeDoArquivo.exemplo`): em caso de divergência entre o que está escrito aqui e o que a
ferramenta devolveu, **a ferramenta manda**.

### A exceção: mídia recebida pelo WhatsApp

Áudio, foto, vídeo ou documento que o cliente mandou pelo WhatsApp **não** segue o padrão acima e
**não** entra em subpasta de categoria: fica na **raiz da pasta do atendimento**, com o nome que o
próprio Lúmen já deu a ele (`aaaa_mm_dd_WHATSAPP_TIPO-resto.extensão`). O motivo é simples: um
áudio de voz ou uma foto que o cliente mandou não tem tipo de documento, e ninguém consegue
adivinhar em qual gaveta guardá-lo. Não renomeie, não mova para dentro de uma categoria.

## 4. No fim, conte o que você fez

Ao terminar, informe sempre:

1. o **caminho lógico final** de cada arquivo salvo, como a ferramenta o descreve;
2. **separadamente**, qualquer subpasta nova que você tenha criado;
3. qualquer coisa que você **não** fez por ser decisão de gente — a pasta de processo que faltava,
   a categoria que não existia, o armazenamento que não estava conectado.

## 5. O que este padrão não é

- **Não é padrão de conteúdo.** Timbrado, estrutura da peça, cores de nota e pendência seguem as
  regras próprias do escritório e do módulo que gerou o documento. Aqui só se trata de onde o
  arquivo fica e como ele se chama.
- **Não é autorização para protocolar, enviar ou compartilhar.** Salvar na pasta é organizar, e
  nada além disso.
- **Não substitui a consulta.** Esta skill descreve a *regra*; os *nomes* — do escritório, das
  pastas e das categorias — vêm da ferramenta, toda vez.
