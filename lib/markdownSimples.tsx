import type { ReactNode } from "react";

// Renderizador do subconjunto de markdown que o corpo da matéria pode conter.
//
// POR QUE ISTO EXISTE: `prisma/schema.prisma` diz, no próprio campo, que `content` "pode ser
// markdown simples" — e o robô de conteúdo é um projeto EXTERNO, que escreve o que quiser dentro
// desse contrato. O renderizador antigo fazia `content.split(/\n+/).map(p => <p>{p}</p>)`: qualquer
// `## Título`, `- item` ou `**negrito**` que chegasse aparecia na tela com os sinais crus, e
// `app/globals.css` mantinha um sistema tipográfico completo para `.artigo h2`, `.artigo h3`,
// `.artigo ul`, `.artigo li`, `.artigo blockquote`, `.artigo strong` e `.artigo a` que NENHUMA
// matéria podia acionar. Eram regras mortas por construção.
//
// Se o robô escrever texto corrido puro, o resultado é idêntico ao de antes — parágrafo por bloco.
// O ganho aparece no dia em que ele usar a estrutura que o schema já autoriza.
//
// SEM `dangerouslySetInnerHTML`. O corpo vem de um sistema externo e passa por revisão humana
// (BlogReviewManager), mas "revisado" não é "sanitizado": tudo aqui vira elemento React, o texto
// é sempre escapado pelo próprio React, e link só passa com esquema http/https — `javascript:` e
// `data:` são descartados e viram texto simples.

const ESQUEMAS_PERMITIDOS = ["http:", "https:", "mailto:"];

function linkSeguro(url: string): string | null {
  try {
    const u = new URL(url, "https://lumen.example");
    return ESQUEMAS_PERMITIDOS.includes(u.protocol) ? url : null;
  } catch {
    return null;
  }
}

// Inline: **negrito**, *itálico*, _itálico_ e [texto](url). Uma passada só, da esquerda para a
// direita, sem recursão — negrito dentro de link ou link dentro de negrito não são suportados de
// propósito: é texto jurídico corrido, não documentação.
//
// O alvo da URL aceita UM nível de parênteses aninhados. Não é preciosismo: com `[^)\s]+`, um
// endereço que contenha parêntese fecha o casamento no primeiro `)` e o segundo sobra no texto —
// `[aqui](javascript:alert(1))` saía na tela como "aqui)." O teste de mesa deste arquivo pegou
// exatamente isso.
const ALVO = String.raw`\((?:[^()\s]|\([^()\s]*\))+\)`;
const INLINE = new RegExp(`(\\*\\*[^*\\n]+\\*\\*|\\*[^*\\n]+\\*|_[^_\\n]+_|\\[[^\\]\\n]+\\]${ALVO})`, "g");
const LINK = new RegExp(`^\\[([^\\]]+)\\]\\(((?:[^()\\s]|\\([^()\\s]*\\))+)\\)$`);

function comInline(texto: string, chave: string): ReactNode[] {
  const partes = texto.split(INLINE).filter((p) => p !== "" && p !== undefined);
  return partes.map((parte, i) => {
    const k = `${chave}-${i}`;
    if (parte.startsWith("**") && parte.endsWith("**")) {
      return <strong key={k}>{parte.slice(2, -2)}</strong>;
    }
    if ((parte.startsWith("*") && parte.endsWith("*")) || (parte.startsWith("_") && parte.endsWith("_"))) {
      return <em key={k}>{parte.slice(1, -1)}</em>;
    }
    const link = parte.match(LINK);
    if (link) {
      const href = linkSeguro(link[2]);
      if (!href) return link[1];
      // Link para dentro do próprio Lúmen (`/processos/abc`) navega na mesma aba. Abrir uma aba
      // nova para ir de uma tela do sistema a outra é comportamento de link externo, e deixa o
      // navegador do advogado cheio de abas do mesmo sistema ao fim do dia.
      const interno = href.startsWith("/") && !href.startsWith("//");
      return (
        <a key={k} href={href} {...(interno ? {} : { target: "_blank", rel: "noopener noreferrer" })}>
          {link[1]}
        </a>
      );
    }
    return parte;
  });
}

type Bloco =
  | { tipo: "p" | "h2" | "h3" | "citacao"; linhas: string[] }
  | { tipo: "lista"; ordenada: boolean; itens: string[] }
  | { tipo: "tabela"; celulas: string[][] };

// Uma linha de tabela em markdown: `| a | b |`. A borda da esquerda é obrigatória aqui de
// propósito — sem ela, qualquer frase que contenha uma barra vertical viraria tabela.
const LINHA_DE_TABELA = /^\|.*\|?\s*$/;
// A linha de separação (`|---|:--:|`) não é dado: é a marca de que a linha de cima é o cabeçalho.
const SEPARADOR_DE_TABELA = /^\|[\s:|-]+\|?\s*$/;

// `| a | b |` → ["a", "b"]. As bordas viram células vazias no split e por isso são retiradas.
function celulasDaLinha(linha: string): string[] {
  const corpo = linha.replace(/^\|/, "").replace(/\|\s*$/, "");
  return corpo.split("|").map((c) => c.trim());
}

// Agrupa as linhas em blocos. Linha em branco fecha o bloco corrente — que é exatamente o que o
// `split(/\n+/)` antigo fazia, só que agora sabendo o que cada bloco é.
function emBlocos(bruto: string): Bloco[] {
  const blocos: Bloco[] = [];
  let atual: Bloco | null = null;
  const fecha = () => {
    if (atual) blocos.push(atual);
    atual = null;
  };

  for (const linhaBruta of bruto.replace(/\r\n/g, "\n").split("\n")) {
    const linha = linhaBruta.trim();
    if (!linha) {
      fecha();
      continue;
    }
    // TABELA. O agente responde em tabela sempre que a pergunta tem mais de uma coluna de
    // resposta ("processos com publicação nos últimos 5 dias, com data e advogado"), e sem isto
    // as linhas caíam todas dentro de um parágrafo só: a tela mostrava uma parede de barras
    // verticais. Foi o que apareceu na primeira consulta real de verdade útil.
    if (LINHA_DE_TABELA.test(linha) && linha.includes("|", 1)) {
      if (SEPARADOR_DE_TABELA.test(linha)) {
        // A separação só faz sentido logo depois do cabeçalho; solta, é lixo e some.
        if (atual && atual.tipo === "tabela") continue;
      }
      if (!atual || atual.tipo !== "tabela") {
        fecha();
        atual = { tipo: "tabela", celulas: [] };
      }
      atual.celulas.push(celulasDaLinha(linha));
      continue;
    }

    const titulo3 = linha.match(/^###\s+(.*)$/);
    const titulo2 = linha.match(/^##\s+(.*)$/);
    const citacao = linha.match(/^>\s?(.*)$/);
    const marcador = linha.match(/^[-*•]\s+(.*)$/);
    const numerado = linha.match(/^\d+[.)]\s+(.*)$/);

    if (titulo2 || titulo3) {
      fecha();
      blocos.push({ tipo: titulo2 ? "h2" : "h3", linhas: [(titulo2 ?? titulo3)![1]] });
      continue;
    }
    if (marcador || numerado) {
      const ordenada = Boolean(numerado);
      if (!atual || atual.tipo !== "lista" || atual.ordenada !== ordenada) {
        fecha();
        atual = { tipo: "lista", ordenada, itens: [] };
      }
      atual.itens.push((marcador ?? numerado)![1]);
      continue;
    }
    if (citacao) {
      if (!atual || atual.tipo !== "citacao") {
        fecha();
        atual = { tipo: "citacao", linhas: [] };
      }
      atual.linhas.push(citacao[1]);
      continue;
    }
    if (!atual || atual.tipo !== "p") {
      fecha();
      atual = { tipo: "p", linhas: [] };
    }
    atual.linhas.push(linha);
  }
  fecha();
  return blocos;
}

export function renderizarMarkdownSimples(bruto: string): ReactNode[] {
  return emBlocos(bruto).map((bloco, i) => {
    const k = `b${i}`;
    if (bloco.tipo === "tabela") {
      const [cabecalho, ...corpo] = bloco.celulas;
      if (!cabecalho) return null;
      // A rolagem lateral fica NESTA caixa, e não na página: dentro de um balão de conversa de
      // 320px, uma tabela de cinco colunas não cabe de jeito nenhum, e empurrar a página inteira
      // para o lado seria trocar um problema por outro pior.
      return (
        <div key={k} className="md-tabela">
          <table>
            <thead>
              <tr>
                {cabecalho.map((c, j) => (
                  <th key={`${k}-h${j}`}>{comInline(c, `${k}-h${j}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {corpo.map((linha, i2) => (
                <tr key={`${k}-r${i2}`}>
                  {cabecalho.map((_, j) => (
                    <td key={`${k}-r${i2}c${j}`}>{comInline(linha[j] ?? "", `${k}-r${i2}c${j}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    if (bloco.tipo === "lista") {
      const itens = bloco.itens.map((item, j) => <li key={`${k}-${j}`}>{comInline(item, `${k}-${j}`)}</li>);
      return bloco.ordenada ? <ol key={k}>{itens}</ol> : <ul key={k}>{itens}</ul>;
    }
    const texto = bloco.linhas.join(" ");
    if (bloco.tipo === "h2") return <h2 key={k}>{comInline(texto, k)}</h2>;
    if (bloco.tipo === "h3") return <h3 key={k}>{comInline(texto, k)}</h3>;
    if (bloco.tipo === "citacao") return <blockquote key={k}>{comInline(texto, k)}</blockquote>;
    return <p key={k}>{comInline(texto, k)}</p>;
  });
}

// Tempo de leitura a partir da contagem real de palavras — 200 palavras por minuto, que é a
// média conservadora para texto em português com termo técnico. Nunca "0 min".
//
// Isto não é enfeite: em modo de leitura, saber quanto custa entrar num texto é a informação que
// decide se o leitor entra. O blog tem "Notícia curta" e "Análise aprofundada" como rótulo, mas o
// rótulo é uma promessa do robô, e os minutos são o texto que está ali.
export function minutosDeLeitura(texto: string): number {
  const palavras = texto.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(palavras / 200));
}
