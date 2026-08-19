# 09 — Site público

Arquivos: `app/page.tsx`, `app/homepage.module.css`,
`components/HomepageHeroCarousel.tsx`, `components/HomepageLoginCard.tsx`,
`components/HomepageReveal.tsx`, `app/blog/`.

## Posicionamento

O site passa a vender o **Lúmen como SaaS de gestão jurídica para outros escritórios**.
Não é mais a homepage do escritório Rodarte Prado. O blog jurídico continua, como prova de
competência e canal de busca orgânica.

> Este documento é uma **especificação escrita**, não um mockup — o site não foi desenhado
> nesta rodada. A referência visual é o template `Landing` do sistema Modernist. Se quiser
> o mockup antes de implementar, peça.

## Estrutura da página

Uma página, seções separadas por régua de 2px, tudo alinhado à esquerda. Sem centralizar
título nem copy (regra do Modernist).

1. **Barra** — logomarca + "LÚMEN" (letter-spacing `.16em`), links Produto · Preço ·
   Blog · Entrar, e "Começar" (botão primário, rótulo alinhado à esquerda)
2. **Hero regrado** — título de display em Archivo 800, uma frase de subtítulo com no
   máximo 40 caracteres por linha, e duas ações. Sem carrossel: o
   `HomepageHeroCarousel` sai. Sem gradiente, sem textura.
3. **Linha de números** — quatro células de largura igual, separadas por régua vertical:
   processos monitorados, tribunais integrados, publicações triadas por dia, tempo médio
   de triagem. **Só números que o escritório possa comprovar.**
4. **Linhas de recurso** — cinco blocos, cada um com kicker, título, dois parágrafos e uma
   figura. Nesta ordem, que é a ordem do valor percebido:
   1. Publicações que chegam triadas (DJEN + DATAJUD)
   2. O dia na frente (painel + agenda + prazos com feriado)
   3. Peticionamento com o timbrado do escritório
   4. Financeiro que fecha (DRE, livro caixa, conciliação)
   5. Sigilo auditável (máscara, break-glass, trilha) — é diferencial de venda
5. **Fotografia** — uma imagem em preto e branco puro, através do wrapper `.grayscale`.
   Escritório real, não banco de imagens. Até haver foto, use `image-slot.js` com o
   texto do que deve entrar.
6. **Preço** — três colunas de largura igual, régua de 2px no topo de cada. Rótulo do
   plano, preço em Archivo 800, o que inclui em lista com marcador quadrado.
7. **Fecho em pôster** — o único lugar do site onde a cor corre como campo: bloco cheio em
   `--marca` (`#c9962f`) com tipografia de display em `#16191d` e uma ação. No Modernist
   puro (versão B) esse campo seria vermelho; na versão A é ouro.
8. **Rodapé** — colunas de links, CNPJ, política de privacidade, contato.

## Conformidade

- **LGPD:** aviso de cookies com escolha real (não "aceitar tudo" apenas), link para
  `app/privacidade/`, e um endereço de encarregado de dados
- **Provas OAB:** o site vende software, mas a marca é de um escritório — nada de promessa
  de resultado nem captação de clientela; texto revisado por advogado antes do deploy
- `app/sitemap.ts` e `app/robots.ts` já existem: inclua as rotas novas

## Aceite

- [ ] Nenhum título ou copy centralizado
- [ ] Nenhum canto arredondado, nenhum gradiente, nenhuma textura
- [ ] Fotografia em preto e branco puro
- [ ] Aviso de cookies com escolha real
- [ ] Lighthouse: performance e acessibilidade ≥ 90 em mobile
