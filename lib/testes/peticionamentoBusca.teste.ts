import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";
import {
  TIPOS_DE_BUSCA,
  SUBTIPOS_DE_ASSESSORIA,
  LIMITE_DE_RESULTADOS,
  MINIMO_DE_CARACTERES,
  ehTipoDeBuscaConhecido,
  ehSubtipoConhecido,
  normalizarTermo,
  termoEhBuscavel,
  subtipoEfetivo,
  tipoVinculoDaBusca,
  naturezaSugeridaPelaBusca,
} from "@/lib/peticionamentoBusca";
import { NATUREZAS_DE_PROCEDIMENTO } from "@/lib/peticionamentoNatureza";

// A BUSCA DE CONTEXTO (pedido do dono, 22/09/2026, item 3: "Falta uma barra de pesquisa […] ao
// invés de ficar navegando em uma lista imensa de processos") e a COMPATIBILIZAÇÃO com a
// natureza do procedimento (item 4).
//
// Duas metades, e as duas precisam de prova:
//   · a TAXONOMIA (módulo puro): que tipo existe, o que cada um vira de vínculo, o que a segunda
//     pergunta da assessoria significa;
//   · a CONSULTA (camada de IO): que ela roda no SERVIDOR, com officeId dentro do `where` de cada
//     uma, com teto de linhas, e que o termo filtra no banco — nunca um `.filter()` depois. Esta
//     metade é varredura de código, pelo mesmo motivo de lib/testes/peticionamentoIsolamento.teste.ts
//     (não há prisma falso nesta casa, e inventar um só para este arquivo esconderia mais do que
//     provaria). É TAMBÉM a metade que a casa costuma deixar sem teste — o módulo puro fica
//     verde e a rota que vaza é a que ninguém olhou.

const RAIZ = process.cwd();
const FONTE = readFileSync(join(RAIZ, "lib", "actions", "peticionamento.ts"), "utf8");
const CORPO_DA_BUSCA = codigoDe(corpoDaFuncao(FONTE, "buscarContextoParaVincular"));

// ── TAXONOMIA ────────────────────────────────────────────────────────────────────────────────

teste("os cinco tipos que o dono pediu existem, e cada um aponta para o que é vinculável de verdade", () => {
  igual(
    TIPOS_DE_BUSCA.map((t) => t.chave),
    ["processo-judicial", "processo-administrativo", "caso", "atendimento", "assessoria"],
  );
  igual(
    TIPOS_DE_BUSCA.map((t) => t.tipoVinculo),
    ["case", "case", "case", "attendance", "assessoria"],
  );
});

teste("todo tipo e todo subtipo carregam rótulo E explicação — filtro sem explicação obriga a adivinhar o que ele faz", () => {
  for (const o of [...TIPOS_DE_BUSCA, ...SUBTIPOS_DE_ASSESSORIA]) {
    verdade(o.rotulo.length > 2, `rótulo vazio em "${o.chave}"`);
    verdade(o.explicacao.length > 10, `explicação vazia em "${o.chave}" — a tela mostra este texto`);
  }
});

teste('a segunda pergunta da assessoria é a do dono: "processo vinculado, licitação, demanda"', () => {
  const chaves = SUBTIPOS_DE_ASSESSORIA.map((s) => s.chave);
  for (const esperada of ["processo-vinculado", "licitacao", "demanda"]) {
    verdade(chaves.includes(esperada as (typeof chaves)[number]), `a segunda pergunta perdeu "${esperada}"`);
  }
  // "A própria assessoria" continua na lista porque vincular a assessoria em si já existia antes
  // desta entrega — tirá-la seria perder uma capacidade a pretexto de acrescentar outra.
  verdade(chaves[0] === "assessoria", "a opção de vincular a própria assessoria deveria ser a primeira/padrão");
});

teste("licitação e demanda vinculam a ASSESSORIA dona — é o que a sessão sabe guardar", () => {
  igual(tipoVinculoDaBusca("assessoria", "licitacao"), "assessoria");
  igual(tipoVinculoDaBusca("assessoria", "demanda"), "assessoria");
  // Processo vinculado é o único subtipo que muda o tipo de vínculo: ele é um Case.
  igual(tipoVinculoDaBusca("assessoria", "processo-vinculado"), "case");
});

teste("subtipo só existe dentro de assessoria — estado velho da tela nunca chega ao banco", () => {
  igual(subtipoEfetivo("processo-judicial", "licitacao"), null);
  igual(subtipoEfetivo("atendimento", "demanda"), null);
  igual(tipoVinculoDaBusca("processo-judicial", "licitacao"), "case");
});

teste("subtipo desconhecido ou ausente dentro de assessoria cai na busca padrão, nunca em erro", () => {
  igual(subtipoEfetivo("assessoria", null), "assessoria");
  igual(subtipoEfetivo("assessoria", "inventado"), "assessoria");
});

teste("tipo desconhecido é recusado — a tela manda string, e string vinda do cliente não é contrato", () => {
  verdade(ehTipoDeBuscaConhecido("caso"), '"caso" deveria ser conhecido');
  verdade(!ehTipoDeBuscaConhecido("processo"), '"processo" não existe na lista e não pode passar');
  verdade(!ehTipoDeBuscaConhecido(null), "null não é tipo conhecido");
  verdade(!ehSubtipoConhecido("parecer"), '"parecer" não é a chave (a chave é "demanda", o nome que a tela de Assessoria usa)');
});

teste("termo: normaliza espaço e decide quando já dá para filtrar", () => {
  igual(normalizarTermo("  souza   lima "), "souza lima");
  igual(normalizarTermo(null), "");
  verdade(!termoEhBuscavel("a"), "uma letra casaria com quase tudo — não é busca, é a lista imensa de novo");
  verdade(termoEhBuscavel("so"), `${MINIMO_DE_CARACTERES} caracteres deveriam bastar`);
  verdade(!termoEhBuscavel("  "), "só espaço não é termo");
});

// ── COMPATIBILIZAÇÃO COM A NATUREZA (item 4) ─────────────────────────────────────────────────

teste("a sugestão de natureza vem da caixa de seleção — a pergunta que ele já respondeu, nunca uma segunda vez", () => {
  igual(naturezaSugeridaPelaBusca("processo-judicial", null), "processo judicial");
  igual(naturezaSugeridaPelaBusca("processo-administrativo", null), "processo administrativo");
  igual(naturezaSugeridaPelaBusca("caso", null), "extrajudicial");
  igual(naturezaSugeridaPelaBusca("atendimento", null), "extrajudicial");
  igual(naturezaSugeridaPelaBusca("assessoria", "assessoria"), "consultivo");
  igual(naturezaSugeridaPelaBusca("assessoria", "demanda"), "consultivo");
  igual(naturezaSugeridaPelaBusca("assessoria", "licitacao"), "processo administrativo");
});

teste("processo dentro de assessoria NÃO sugere natureza — pode ser judicial ou administrativo, e chutar seria pior", () => {
  igual(naturezaSugeridaPelaBusca("assessoria", "processo-vinculado"), null);
});

teste("toda sugestão é uma das quatro naturezas da especificação §8 — nunca um valor novo inventado aqui", () => {
  for (const t of TIPOS_DE_BUSCA) {
    for (const s of SUBTIPOS_DE_ASSESSORIA) {
      const sugerida = naturezaSugeridaPelaBusca(t.chave, s.chave);
      if (sugerida === null) continue;
      verdade((NATUREZAS_DE_PROCEDIMENTO as readonly string[]).includes(sugerida), `"${sugerida}" não é uma natureza conhecida (tipo ${t.chave}/${s.chave})`);
    }
  }
});

// ── A CONSULTA (camada de IO) ────────────────────────────────────────────────────────────────

teste("a varredura enxerga a ação de busca — corpo vazio passaria verde sem provar nada", () => {
  verdade(CORPO_DA_BUSCA.length > 1200, `corpoDaFuncao("buscarContextoParaVincular") devolveu ${CORPO_DA_BUSCA.length} caracteres — varredura cega`);
});

teste("TRAVA: a busca rejeita tipo desconhecido ANTES de tocar o banco", () => {
  const posValidacao = CORPO_DA_BUSCA.indexOf("ehTipoDeBuscaConhecido");
  verdade(posValidacao >= 0, "a ação deixou de validar o tipo vindo do cliente");
  const posPrimeiraConsulta = CORPO_DA_BUSCA.search(/prisma\.(case|attendance|assessoria|licitacao|parecer)\./);
  verdade(posPrimeiraConsulta >= 0, "a varredura não achou consulta nenhuma — está cega");
  verdade(posValidacao < posPrimeiraConsulta, "a validação do tipo precisa vir antes da primeira consulta");
});

teste("TRAVA: TODA consulta da busca carrega `officeId` e um teto de linhas", () => {
  const chamadas = [...CORPO_DA_BUSCA.matchAll(/prisma\.(case|attendance|assessoria|licitacao|parecer)\.findMany\(/g)];
  verdade(chamadas.length >= 5, `só ${chamadas.length} consulta(s) encontrada(s) — a busca cobre cinco caminhos (processo, atendimento, assessoria, licitação, demanda)`);
  for (const m of chamadas) {
    // Delimita o argumento da PRÓPRIA chamada contando parênteses/chaves — janela de N
    // caracteres escorrega para a consulta vizinha e encontra nela o officeId que esta perdeu
    // (é o defeito que lib/testes/peticionamentoIsolamento.teste.ts documenta por extenso).
    const abre = m.index! + m[0].length - 1;
    let profundidade = 0;
    let trecho = "";
    for (let i = abre; i < CORPO_DA_BUSCA.length; i++) {
      const ch = CORPO_DA_BUSCA[i];
      if (ch === "(" || ch === "{" || ch === "[") profundidade++;
      else if (ch === ")" || ch === "}" || ch === "]") {
        profundidade--;
        if (profundidade === 0) {
          trecho = CORPO_DA_BUSCA.slice(abre, i + 1);
          break;
        }
      }
    }
    verdade(trecho.length > 40, `não deu para delimitar o argumento de prisma.${m[1]}.findMany — varredura cega`);
    // ACHADO DE MUTAÇÃO (22/09/2026): a primeira versão desta suíte checava `contains` no corpo
    // INTEIRO da ação. Tirar o filtro de termo do `where` de UMA das cinco consultas — a de
    // atendimento — passou VERDE, porque as outras quatro ainda tinham `contains` em algum lugar
    // do mesmo corpo. O defeito instalado era exatamente o que esta entrega existe para matar:
    // aquele tipo voltava a listar "os mais recentes" e ignorava o que o advogado digitou. A
    // exigência passou a ser POR CONSULTA, dentro do argumento dela.
    verdade(/filtradoPorTermo/.test(trecho) && /contem/.test(trecho),
      `prisma.${m[1]}.findMany ignora o termo digitado — este tipo de busca voltou a ser uma lista, não uma busca: ${trecho.slice(0, 160).replace(/\s+/g, " ")}`);
    verdade(/where:\s*\{\s*(id:[^}]*?)?officeId/.test(trecho) || /\bofficeId\b/.test(trecho.slice(0, trecho.indexOf("select") >= 0 ? trecho.indexOf("select") : trecho.length)),
      `prisma.${m[1]}.findMany sem officeId no where: ${trecho.slice(0, 160).replace(/\s+/g, " ")}`);
    verdade(/take:/.test(trecho), `prisma.${m[1]}.findMany sem \`take\` — sem teto, a busca volta a carregar a lista imensa que o dono pediu para acabar`);
  }
});

teste("TRAVA: o termo filtra no BANCO (contains no where), nunca no JavaScript depois da consulta", () => {
  verdade(CORPO_DA_BUSCA.includes("contains"), "o termo deixou de ir para o `where` — filtrar depois significa ter carregado tudo antes");
  verdade(CORPO_DA_BUSCA.includes('mode: "insensitive"'), "a busca voltou a ser sensível a maiúsculas — procurar 'souza' não acharia 'Souza'");
  // Um `.filter(...)` sobre o termo seria a volta do defeito. O único filter legítimo aqui é o de
  // deduplicação por id (licitações da mesma empresa apontam para a mesma assessoria).
  const filtros = [...CORPO_DA_BUSCA.matchAll(/\.filter\(/g)];
  for (const f of filtros) {
    const janela = CORPO_DA_BUSCA.slice(f.index!, f.index! + 160);
    verdade(!/termo|contains|toLowerCase/.test(janela), `filtro por termo no cliente: ${janela.slice(0, 120).replace(/\s+/g, " ")}`);
  }
});

teste("TRAVA: a trava de cliente continua sendo aplicada sobre o resultado da busca", () => {
  verdade(CORPO_DA_BUSCA.includes("avaliarCandidatos"), "a busca deixou de avaliar a trava de cliente — item de outro cliente voltaria marcável");
  verdade(CORPO_DA_BUSCA.includes("motivoBloqueio"), "o motivo do bloqueio sumiu do resultado — o item some da busca sem explicação");
});

teste("TRAVA: a tela de contexto não recebe mais a lista inteira do escritório", () => {
  const pagina = codigoDe(readFileSync(join(RAIZ, "app", "peticionamento", "[id]", "contexto", "page.tsx"), "utf8"));
  verdade(pagina.length > 200, "varredura cega na página de contexto");
  verdade(!pagina.includes("buscarCandidatosDeContexto"), "a página voltou a carregar todos os candidatos de uma vez — é exatamente o que o dono pediu para acabar");
  verdade(pagina.includes("obterVinculosDaSessao"), "a página deveria carregar só o que já está vinculado");
  const antiga = codigoDe(corpoDaFuncao(FONTE, "buscarCandidatosDeContexto"));
  verdade(antiga.length === 0, "a ação que carregava 200+200+200 linhas continua no arquivo — deixá-la viva é deixar o caminho antigo aberto");
});

teste("o teto de resultados é pequeno o bastante para caber na tela, e a tela avisa quando trunca", () => {
  verdade(LIMITE_DE_RESULTADOS > 0 && LIMITE_DE_RESULTADOS <= 50, `teto de ${LIMITE_DE_RESULTADOS} não é um teto útil`);
  verdade(CORPO_DA_BUSCA.includes("truncado"), "a ação deixou de dizer que há mais resultados — a tela fingiria que acabou");
  const tela = codigoDe(readFileSync(join(RAIZ, "components", "peticionamento", "ContextoClient.tsx"), "utf8"));
  verdade(tela.includes("truncado"), "a tela não usa o aviso de truncamento");
});

resumo("Peticionamento — busca de contexto por tipo (item 3) e compatibilização da natureza (item 4)");
