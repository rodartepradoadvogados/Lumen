import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";
import {
  faixaDeGeracao,
  fraseDoTempoDeGeracao,
  medianaMs,
  MINIMO_DE_MEDICOES,
} from "@/lib/peticionamentoTempoDeGeracao";
import { duracaoDaGeracaoMs, PRAZO_MAXIMO_DA_GERACAO_MS, TETO_DA_GERACAO_MS } from "@/lib/peticionamentoGeracaoAssincrona";
import { AVISO_DE_MINUTA_JANELA_MS, hrefDaMinutaDaSessao, whereMinutaFalhou, whereMinutaPronta } from "@/lib/alerts";
import { whereMedicoesDoEscritorio } from "@/lib/peticionamentoGeracaoAssincrona";
import { ALERT_KIND_META, ALERTAS_PESSOAIS, metaDoAlerta } from "@/lib/alertKinds";
import { podeAcessarAba } from "@/lib/peticionamentoAcesso";

// ============================================================================================
// O AVISO DA GERAÇÃO, A MEDIÇÃO QUE O SUSTENTA, E O ALERTA QUE FECHA A PROMESSA.
//
// Três pedidos do dono em 23/09/2026, e cada um trouxe uma armadilha própria:
//
//   1. "TEM MUITA COISA QUE É COMPLEXA" — o teto da geração vai a quinze minutos. A armadilha é a
//      corrente de tempos: um elo que sobe sozinho transforma trabalho pago em "geração perdida".
//      As RELAÇÕES estão cobradas em lib/testes/peticionamentoLimiteDaPonte.teste.ts (as duas
//      pernas da corrente) e mais abaixo neste arquivo (o espelho do teto e a ordem com o prazo).
//   2. "O TEMPO MÉDIO DE PRODUÇÃO É DE x A 15 MINUTOS" — a armadilha é o `x`. Ninguém mediu, e
//      número inventado numa tela é o que esta casa mais evita (é o mesmo motivo pelo qual a tela
//      de geração não mostra porcentagem). Então o sistema MEDE, e o que este arquivo cobra é que
//      a frase da tela NUNCA contenha um número que não saiu da medição.
//   3. "APENAS NÃO FECHE ESTA JANELA" — e esta é FALSA neste sistema: o cron termina a minuta com
//      a aba fechada, e há teste guardando essa promessa. Escrevê-la seria pôr na tela uma
//      restrição que o código não impõe. Aqui se cobra o contrário: que a tela diga que pode
//      fechar, e que o código PERMITA fechar sem perguntar nada — porque o pop-up nativo do
//      navegador ("as alterações podem não ser salvas") era exatamente essa restrição, dita pelo
//      nosso próprio código um segundo depois da promessa.
//
// EXERCITADO ONDE DÁ. As contas (duração de uma geração, mediana, faixa, frase) e os `where` dos
// alertas são funções puras de propósito: elas são CHAMADAS aqui, com entradas escolhidas, e o
// resultado é conferido. Varredura prova que o código existe, nunca que funciona — e nesta casa
// uma trava inteira já virou `if (false)` com todas as suítes verdes.
// ============================================================================================

const RAIZ = process.cwd();
const FONTE_ALERTS = readFileSync(join(RAIZ, "lib", "alerts.ts"), "utf8");
const FONTE_TELA = readFileSync(join(RAIZ, "components", "peticionamento", "GerandoClient.tsx"), "utf8");
const FONTE_SAIDA = readFileSync(join(RAIZ, "components", "peticionamento", "SaidaContext.tsx"), "utf8");
const FONTE_PAGINA_MINUTA = readFileSync(join(RAIZ, "app", "peticionamento", "[id]", "minuta", "page.tsx"), "utf8");
const FONTE_ACOES = readFileSync(join(RAIZ, "lib", "actions", "peticionamento.ts"), "utf8");
const FONTE_ALERT_ROW = readFileSync(join(RAIZ, "components", "AlertRow.tsx"), "utf8");
const FONTE_ACOES_ALERTA = readFileSync(join(RAIZ, "lib", "actions", "alerts.ts"), "utf8");
const FONTE_DISMISSIVEL = readFileSync(join(RAIZ, "components", "DismissibleAlertRow.tsx"), "utf8");

const MIN = 60_000;

// ══════════════════════════════════════════════════════════════════════════════════════════
// 1. A MEDIÇÃO DE UMA GERAÇÃO — e os três casos em que ela se recusa a devolver número
// ══════════════════════════════════════════════════════════════════════════════════════════

teste("EXERCITADA: a duração sai do relógio da própria geração, arredondada em milissegundos", () => {
  const inicio = new Date("2026-09-23T10:00:00.000Z");
  igual(duracaoDaGeracaoMs(inicio, new Date("2026-09-23T10:06:30.000Z")), 6.5 * MIN, "6min30 de geração: ");
  igual(duracaoDaGeracaoMs(inicio, new Date("2026-09-23T10:00:00.400Z")), 400, "uma geração de 400ms ainda é uma medição: ");
});

teste("EXERCITADA: sem relógio de início NÃO se chuta duração — o campo fica vazio", () => {
  // O socorro de `updatedAt` existe para decidir PRAZO (errar para o lado de esperar mais), e não
  // pode virar medida: "duração" medida do updatedAt é o tempo até a última escrita na sessão,
  // apresentado ao advogado como tempo de produção.
  igual(duracaoDaGeracaoMs(null, new Date()), null, "sem início não há medição: ");
  igual(duracaoDaGeracaoMs(undefined, new Date()), null, "início ausente não pode virar número: ");
});

teste("EXERCITADA: duração impossível é descartada, não gravada — a mediana não pode ser envenenada", () => {
  const inicio = new Date("2026-09-23T10:00:00.000Z");
  igual(duracaoDaGeracaoMs(inicio, new Date("2026-09-23T09:59:00.000Z")), null, "relógio para trás não é medição: ");
  igual(duracaoDaGeracaoMs(inicio, inicio), null, "zero não é medição: ");
  // Acima do prazo máximo: nenhuma geração legítima passa dali (o Lúmen a teria declarado
  // perdida). Uma sessão plantada, colhida horas depois, empurraria a faixa do escritório para
  // cima — na direção de assustar quem lê.
  const muitoDepois = new Date(inicio.getTime() + PRAZO_MAXIMO_DA_GERACAO_MS + 1);
  igual(duracaoDaGeracaoMs(inicio, muitoDepois), null, "acima do prazo máximo não é medição: ");
  // E o limite é INCLUSIVO até o prazo: uma geração que terminou exatamente no prazo foi medida.
  igual(
    duracaoDaGeracaoMs(inicio, new Date(inicio.getTime() + PRAZO_MAXIMO_DA_GERACAO_MS)),
    PRAZO_MAXIMO_DA_GERACAO_MS,
    "no limite do prazo ainda é medição válida: ",
  );
});

// ══════════════════════════════════════════════════════════════════════════════════════════
// 2. A FAIXA — MEDIANA, E POR QUE NÃO MÉDIA
// ══════════════════════════════════════════════════════════════════════════════════════════

teste("EXERCITADA: a mediana é mediana de verdade — ímpar o do meio, par a média dos dois", () => {
  igual(medianaMs([3, 1, 2]), 2, "ímpar: ");
  igual(medianaMs([10, 2, 4, 8]), 6, "par: ");
  igual(medianaMs([5]), 5, "um só: ");
});

teste("A PROPRIEDADE QUE IMPEDE O NÚMERO INVENTADO: com pouca medição não há piso nenhum", () => {
  for (let n = 0; n < MINIMO_DE_MEDICOES; n++) {
    const faixa = faixaDeGeracao(Array.from({ length: n }, () => 4 * MIN));
    igual(faixa.pisoMin, null, `com ${n} medições a tela não pode dizer piso: `);
    igual(faixa.medicoes, n, "a contagem de medições precisa ser a real: ");
  }
  // E no MÍNIMO exato ele aparece — senão o mínimo seria inalcançável e a tela nunca mediria nada.
  const noMinimo = faixaDeGeracao(Array.from({ length: MINIMO_DE_MEDICOES }, () => 4 * MIN));
  igual(noMinimo.pisoMin, 4, "no mínimo de medições o piso medido precisa aparecer: ");
});

teste("EXERCITADA: medição inválida não conta como medição — nem para o número, nem para o mínimo", () => {
  // Cinco entradas, mas só duas são medição: o resultado tem de ser "não há dado", não uma
  // mediana de duas gerações apresentada como se fossem cinco.
  const faixa = faixaDeGeracao([null, undefined, 0, -5, 4 * MIN, 6 * MIN]);
  igual(faixa.medicoes, 2, "nulo, zero e negativo não são medições: ");
  igual(faixa.pisoMin, null, "com duas medições válidas não há piso: ");
});

teste("O CRITÉRIO É MEDIANA, E A PROVA É UMA MÉDIA QUE DARIA OUTRO NÚMERO", () => {
  // Quatro gerações de 2 minutos e uma de 14 (o processo de dezenas de páginas que o dono quer que
  // o agente leia inteiro). A mediana é 2 min: descreve o caso típico. A média é 4,4 min — mais
  // que o DOBRO do que quatro das cinco gerações levaram, e um número que nenhuma delas viveu.
  const duracoes = [2 * MIN, 2 * MIN, 2 * MIN, 2 * MIN, 14 * MIN];
  const faixa = faixaDeGeracao(duracoes);
  igual(faixa.pisoMin, 2, "o piso precisa ser a MEDIANA das medições: ");
  const mediaMin = Math.round(duracoes.reduce((s, d) => s + d, 0) / duracoes.length / MIN);
  verdade(
    faixa.pisoMin !== mediaMin,
    `o piso (${faixa.pisoMin} min) bateu com a média (${mediaMin} min) neste caso construído justamente para separá-las — a conta virou média, e uma média de cinco medições com um extremo descreve um caso que não aconteceu`,
  );
  // E o extremo não move a mediana: trocar a geração de 14 min por uma de 19 dá o MESMO piso.
  igual(faixaDeGeracao([2 * MIN, 2 * MIN, 2 * MIN, 2 * MIN, 19 * MIN]).pisoMin, 2, "o extremo não pode mover o piso: ");
});

teste("EXERCITADA: o piso nunca alcança o teto — 'de 15 a 15 minutos' não é faixa", () => {
  const noTeto = Array.from({ length: 6 }, () => TETO_DA_GERACAO_MS);
  igual(faixaDeGeracao(noTeto).pisoMin, null, "mediana no teto não pode virar piso: ");
  igual(faixaDeGeracao(noTeto).tetoMin, Math.round(TETO_DA_GERACAO_MS / 60_000), "o teto da faixa vem do teto do sistema: ");
  // Meio minuto medido não pode virar "0 min".
  igual(faixaDeGeracao(Array.from({ length: 5 }, () => 20_000)).pisoMin, 1, "o piso mínimo mostrável é 1 min: ");
});

// ══════════════════════════════════════════════════════════════════════════════════════════
// 3. A FRASE DA TELA — NENHUM NÚMERO QUE NÃO SAIU DA MEDIÇÃO
// ══════════════════════════════════════════════════════════════════════════════════════════

/** Todos os números que aparecem num texto — é assim que se prova que nenhum foi inventado. */
function numerosNaFrase(frase: string): number[] {
  return [...frase.matchAll(/\d+/g)].map((m) => Number(m[0]));
}

teste("A PROPRIEDADE CENTRAL: todo número da frase é um número medido (ou o teto do sistema)", () => {
  const faixa = faixaDeGeracao([3 * MIN, 4 * MIN, 5 * MIN, 6 * MIN, 7 * MIN, 8 * MIN]);
  verdade(faixa.pisoMin !== null, "o caso de teste precisa ter piso, senão não prova nada");
  const frase = fraseDoTempoDeGeracao(faixa);
  const permitidos = new Set([faixa.medicoes, faixa.pisoMin as number, faixa.tetoMin]);
  for (const n of numerosNaFrase(frase)) {
    verdade(
      permitidos.has(n),
      `a frase da tela tem o número ${n}, que não é a mediana medida (${faixa.pisoMin}), nem a quantidade de medições (${faixa.medicoes}), nem o teto do sistema (${faixa.tetoMin}) — é um número inventado na tela do advogado: "${frase}"`,
    );
  }
  // E ela DIZ que é medido: sem isso, faixa medida e faixa chutada ficam indistinguíveis para quem lê.
  verdade(/medido/i.test(frase), `a frase não diz que o número é medido: "${frase}"`);
  verdade(frase.includes(String(faixa.pisoMin)), "a frase precisa mostrar o número medido");
});

teste("A PROPRIEDADE CENTRAL, O OUTRO LADO: sem medição o ÚNICO número da frase é o teto", () => {
  const faixa = faixaDeGeracao([]);
  const frase = fraseDoTempoDeGeracao(faixa);
  igual(numerosNaFrase(frase), [faixa.tetoMin], `sem medição a frase só pode conter o teto — veio "${frase}": `);
  // E ela ADMITE que ainda não há dado, em vez de calar e deixar parecer que o teto é o típico.
  verdade(/ainda não tem|ainda não há/i.test(frase), `a frase sem medição precisa admitir a falta de dado: "${frase}"`);
  // Nada de piso inventado por palavra, também: "poucos minutos", "cerca de", "em média".
  verdade(!/poucos minutos|cerca de|em média|costuma levar/i.test(frase), `a frase sem medição insinuou um piso: "${frase}"`);
});

teste("o teto da frase acompanha o teto do sistema — nunca um número escrito à mão", () => {
  // Move-se o teto e vê-se a frase ir junto. Conferir com o valor de hoje não provaria derivação:
  // um "15" escrito dentro da função passaria igual.
  const comOutroTeto = faixaDeGeracao([2 * MIN, 2 * MIN, 2 * MIN, 2 * MIN, 2 * MIN], 40 * MIN);
  igual(comOutroTeto.tetoMin, 40, "o teto da faixa não seguiu o teto passado: ");
  verdade(fraseDoTempoDeGeracao(comOutroTeto).includes("40"), "a frase não seguiu o teto — o número está escrito à mão dentro dela");
});

// ══════════════════════════════════════════════════════════════════════════════════════════
// 4. A TELA: A PROMESSA VERDADEIRA, E NENHUM MINUTO ESCRITO À MÃO
// ══════════════════════════════════════════════════════════════════════════════════════════

const CODIGO_TELA = codigoDe(FONTE_TELA);

teste("a varredura da tela não está cega", () => {
  verdade(CODIGO_TELA.length > 1_500, `codigoDe(GerandoClient) devolveu ${CODIGO_TELA.length} caracteres`);
});

teste("TRAVA: a tela NÃO escreve 'não feche esta janela' — é restrição que o código não impõe", () => {
  // O pedido do dono trazia essa frase, e ela é FALSA aqui: a rede de segurança por cron
  // (app/api/cron/minutas-pendentes) termina a geração de quem fechou a aba, e há teste guardando
  // essa promessa. Prender o advogado quinze minutos numa tela por nada é o oposto desta entrega.
  verdade(!/não feche|nao feche|não fechar esta|mantenha esta (aba|janela)/i.test(CODIGO_TELA), "a tela voltou a pedir para não fechar a aba/janela");
  verdade(/fechar esta aba/i.test(CODIGO_TELA), "a tela precisa dizer que a aba pode ser fechada — é a diferença que a entrega anterior entregou");
  // E precisa dizer ONDE o aviso chega, senão "pode fechar" vira "descubra sozinho mais tarde".
  verdade(/Central de Alertas/.test(CODIGO_TELA), "a tela não diz que o aviso de conclusão chega na Central de Alertas");
});

teste("TRAVA: nenhum minuto escrito à mão na tela — o tempo vem da faixa medida", () => {
  // Qualquer dígito colado em "min"/"minuto" no CÓDIGO da tela seria um número de tempo que não
  // passou pela medição. O tempo decorrido (`${minutos}min`) é interpolação, não dígito literal.
  const literal = CODIGO_TELA.match(/\d+\s*(?:min\b|minuto)/i);
  verdade(!literal, `a tela tem um tempo escrito à mão ("${literal?.[0]}") — o número tem de vir da medição, não do teclado`);
  verdade(/fraseDoTempoDeGeracao\(/.test(CODIGO_TELA), "a tela deixou de montar a frase pela função que conhece a medição");
  verdade(/faixa/.test(CODIGO_TELA), "a tela não recebe mais a faixa medida");
});

teste("TRAVA: a página da minuta MEDE a faixa no servidor — e só no estado de geração", () => {
  const codigo = codigoDe(FONTE_PAGINA_MINUTA);
  const ini = codigo.indexOf('if (sessao.status === "GERANDO")');
  verdade(ini > 0, "não achei o ramo de GERANDO na página da minuta — varredura cega");
  const ramo = codigo.slice(ini, codigo.indexOf('if (sessao.status === "FALHA_GERACAO"', ini));
  verdade(ramo.length > 300, `o ramo de GERANDO saiu com ${ramo.length} caracteres — varredura cega`);
  verdade(/faixaDeGeracaoDoEscritorio\(/.test(ramo), "o ramo de geração não busca a faixa medida do escritório");
  verdade(/officeId/.test(ramo), "a faixa precisa ser do ESCRITÓRIO da sessão — uma faixa sem corte mediria a casa dos outros");
  verdade(/faixa=\{faixa\}/.test(ramo), "a faixa medida não chega à tela");
});

// ══════════════════════════════════════════════════════════════════════════════════════════
// 5. O DEFEITO CONSERTADO: A TELA PROMETE FECHAR A ABA, E O CÓDIGO DEIXA
// ══════════════════════════════════════════════════════════════════════════════════════════
//
// ACHADO DESTA ENTREGA, lendo o código: `ProvedorDeSaida` instalava um `beforeunload` sempre que a
// sessão tinha trabalho em andamento — e a tela de geração está justamente nesse caso. O advogado
// lia "pode fechar esta aba" e, ao fechar, recebia o diálogo nativo do navegador dizendo que "as
// alterações podem não ser salvas". Está tudo salvo, e a geração continua no servidor: era uma
// frase falsa saída do nosso próprio código, contradizendo a tela um segundo depois.
//
// Fechar a aba nunca quebrou a GERAÇÃO (o cron a termina — isso já tem teste). O que estava
// quebrado era a promessa: uma restrição que o código impunha e a tela negava.

teste("TRAVA: o beforeunload NÃO dispara quando a tela declarou que fechar a aba é seguro", () => {
  const c = codigoDe(FONTE_SAIDA);
  const posListener = c.indexOf('addEventListener("beforeunload"');
  verdade(posListener > 0, "o listener de beforeunload sumiu do SaidaContext — varredura cega");
  // O efeito INTEIRO, ancorado: do `useEffect(` que precede o listener até o fim dele. Uma janela
  // de N caracteres transbordaria para o efeito vizinho (o do popstate), que tem guarda parecida.
  const iniEfeito = c.lastIndexOf("useEffect(", posListener);
  verdade(iniEfeito > 0 && iniEfeito < posListener, "não achei o useEffect que instala o beforeunload");
  const fimEfeito = c.indexOf("}, [", posListener);
  const efeito = c.slice(iniEfeito, c.indexOf("]);", fimEfeito));
  verdade(efeito.length > 150, `o efeito do beforeunload saiu com ${efeito.length} caracteres — varredura cega`);
  verdade(
    /if \(!temTrabalho \|\| fechamentoSeguro\) return;/.test(efeito),
    "a saída antecipada do efeito não considera mais a declaração da tela — o navegador voltaria a perguntar 'as alterações podem não ser salvas' um segundo depois de a tela prometer que pode fechar",
  );
  // E a declaração precisa estar nas DEPENDÊNCIAS: sem isso o efeito não roda de novo quando ela
  // muda, o listener antigo continua instalado, e a correção existe só no código.
  const deps = c.slice(fimEfeito, c.indexOf("]);", fimEfeito));
  verdade(/fechamentoSeguro/.test(deps), `a dependência do efeito não inclui a declaração (${deps.trim()}) — o listener antigo continuaria instalado`);
});

teste("TRAVA: é a TELA DE GERAÇÃO que declara o fechamento seguro, e ela desfaz ao sair", () => {
  verdade(/declararFechamentoSeguro\(true\)/.test(CODIGO_TELA), "a tela de geração não declara que fechar a aba é seguro");
  verdade(
    /return \(\) => declararFechamentoSeguro\(false\)/.test(CODIGO_TELA),
    "a tela não desfaz a declaração ao desmontar — a trava de saída ficaria desligada na tela da minuta pronta, onde há texto editável de verdade",
  );
  // E SÓ esta tela: o provedor não pode nascer com o fechamento seguro ligado.
  verdade(/useState\(false\)/.test(codigoDe(FONTE_SAIDA).slice(codigoDe(FONTE_SAIDA).indexOf("fechamentoSeguro"))) || /const \[fechamentoSeguro, setFechamentoSeguro\] = useState\(false\)/.test(codigoDe(FONTE_SAIDA)),
    "o fechamento seguro precisa nascer DESLIGADO — ligado por padrão apagaria o pop-up de saída de todas as telas");
});

// ══════════════════════════════════════════════════════════════════════════════════════════
// 6. O ALERTA DA CENTRAL — OS DOIS `where`, EXERCITADOS
// ══════════════════════════════════════════════════════════════════════════════════════════

const AGORA = new Date("2026-09-23T12:00:00.000Z");

teste("EXERCITADO: o aviso de minuta pronta é do escritório, da sessão NÃO vista, e recente", () => {
  const w = whereMinutaPronta("escritorio-1", AGORA) as Record<string, unknown>;
  igual(w.officeId, "escritorio-1", "o `where` do alerta perdeu o corte por escritório: ");
  igual(w.status, "GERADA", "o aviso é da minuta GERADA: ");
  igual(w.minutaVistaEm, null, "sem `minutaVistaEm: null` o alerta nunca sumiria sozinho ao abrir a minuta: ");
  const janela = w.geradoEm as { gte: Date };
  igual(
    AGORA.getTime() - janela.gte.getTime(),
    AVISO_DE_MINUTA_JANELA_MS,
    "a janela do aviso não é a constante — sem janela, TODA sessão gerada e nunca reaberta viraria alerta no primeiro deploy: ",
  );
});

teste("EXERCITADO: o aviso de FALHA usa o relógio que a falha tem — `geradoEm` é nulo nela", () => {
  const w = whereMinutaFalhou("escritorio-1", AGORA) as Record<string, unknown>;
  igual(w.officeId, "escritorio-1", "o `where` da falha perdeu o corte por escritório: ");
  igual(w.status, "FALHA_GERACAO", "o aviso de falha procura a sessão que falhou: ");
  igual(w.minutaVistaEm, null, "a falha também some quando alguém a lê: ");
  igual(w.geradoEm, undefined, "a falha não pode ser filtrada por `geradoEm`: uma geração que falhou nunca gerou nada, então o campo é nulo e o aviso ficaria fora da janela para sempre — justamente o aviso que mais importa: ");
  const janela = w.updatedAt as { gte: Date };
  igual(AGORA.getTime() - janela.gte.getTime(), AVISO_DE_MINUTA_JANELA_MS, "a janela da falha não é a constante: ");
});

teste("EXERCITADO: o clique leva à MINUTA daquela sessão — não à lista de rascunhos", () => {
  igual(hrefDaMinutaDaSessao("sessao-abc"), "/peticionamento/sessao-abc/minuta", "o caminho do clique mudou: ");
});

teste("TRAVA: a contagem e a lista usam os MESMOS `where` — o número do sino não pode discordar da gaveta", () => {
  const lista = codigoDe(corpoDaFuncao(FONTE_ALERTS, "getAlerts"));
  const contagem = codigoDe(corpoDaFuncao(FONTE_ALERTS, "getAlertsCount"));
  verdade(lista.length > 3_000, `corpoDaFuncao("getAlerts") devolveu ${lista.length} caracteres — varredura cega`);
  verdade(contagem.length > 2_000, `corpoDaFuncao("getAlertsCount") devolveu ${contagem.length} caracteres — varredura cega`);
  for (const construtor of ["whereMinutaPronta(", "whereMinutaFalhou("]) {
    verdade(lista.includes(construtor), `a lista de alertas não usa ${construtor} — um critério reescrito aqui divergiria da contagem em silêncio`);
    verdade(contagem.includes(construtor), `a contagem de alertas não usa ${construtor} — o sino mostraria um número que a gaveta não confirma`);
  }
  // E os dois avisos entram na SOMA da contagem: contar e não somar é um alerta que aparece na
  // lista e não existe no número.
  for (const parcela of ["minutasProntasCount", "minutasFalhadasCount"]) {
    const ocorrencias = [...contagem.matchAll(new RegExp(parcela, "g"))].length;
    verdade(ocorrencias >= 2, `"${parcela}" aparece ${ocorrencias} vez(es) na contagem — se não entra na soma final, o alerta existe na lista e não no número do sino`);
  }
});

teste("TRAVA: as duas consultas de peticionamento são GATEADAS pelo recorte de acesso", () => {
  for (const nome of ["getAlerts", "getAlertsCount"]) {
    const corpo = codigoDe(corpoDaFuncao(FONTE_ALERTS, nome));
    for (const construtor of ["whereMinutaPronta(", "whereMinutaFalhou("]) {
      const pos = corpo.indexOf(construtor);
      verdade(pos > 0, `${nome} não usa ${construtor}`);
      // O gate tem de estar ANTES da consulta, no mesmo trecho: é o ternário
      // `incluiPeticionamento ? prisma… : Promise.resolve(…)`.
      const antes = corpo.slice(Math.max(0, pos - 260), pos);
      verdade(
        /incluiPeticionamento\s*\?/.test(antes),
        `em ${nome}, a consulta de ${construtor} não está condicionada a incluiPeticionamento — recepção passaria a ver o título de uma peça com o nome do cliente dentro`,
      );
    }
  }
  // E o padrão do parâmetro é FECHADO: quem esquecer de passar esconde o alerta, não o vaza.
  const declaracoes = [...FONTE_ALERTS.matchAll(/incluiPeticionamento: boolean = (\w+),/g)].map((m) => m[1]);
  igual(declaracoes.length, 2, "as duas funções precisam declarar o recorte de peticionamento: ");
  for (const padrao of declaracoes) igual(padrao, "false", "o padrão do recorte de peticionamento precisa ser fail-closed: ");
});

teste("EXERCITADO: a régua do recorte é a MESMA da aba — recepção e financeiro não recebem o aviso", () => {
  // `podeAcessarAba` é a régua que o alerta usa nos chamadores. Aqui ela é exercitada com as
  // pessoas de verdade do escritório, para o recorte não ser "o que a varredura diz que é".
  igual(podeAcessarAba({ role: "Recepcionista/Secretária", oab: null }), false, "recepção não entra na aba, logo não recebe o aviso: ");
  igual(podeAcessarAba({ role: "Financeiro", oab: null }), false, "papel sem acesso à aba não recebe o aviso: ");
  igual(podeAcessarAba({ role: "Advogada", oab: "GO 12345" }), true, "advogada com OAB recebe: ");
  igual(podeAcessarAba({ role: "Estagiária", oab: null }), true, "estagiária usa a aba, logo recebe: ");
  igual(podeAcessarAba({ role: "Desconhecido", oab: null }), false, "papel desconhecido é fail-closed: ");
});

/** Todo arquivo .ts/.tsx de app/, lib/ e components/ — a varredura DERIVA os chamadores do disco. */
function arquivosDeCodigo(): string[] {
  const achados: string[] = [];
  const andar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) {
        if (nome === "node_modules" || nome === "testes") continue;
        andar(caminho);
      } else if (/\.tsx?$/.test(nome)) achados.push(caminho);
    }
  };
  for (const raiz of ["app", "lib", "components"]) andar(join(RAIZ, raiz));
  return achados;
}

/** O trecho de UMA chamada, do `(` que abre ao `)` que o fecha — nunca uma janela de N caracteres. */
function trechoDaChamada(fonte: string, posDoAbre: number): string {
  let profundidade = 0;
  for (let i = posDoAbre; i < fonte.length; i++) {
    const ch = fonte[i];
    if (ch === "(") profundidade++;
    else if (ch === ")") {
      profundidade--;
      if (profundidade === 0) return fonte.slice(posDoAbre, i + 1);
    }
  }
  return fonte.slice(posDoAbre);
}

teste("TRAVA: TODO chamador de getAlerts/getAlertsCount passa o recorte de acesso — derivado do disco", () => {
  // A lista de chamadores NÃO é escrita aqui: ela sai do próprio repositório. Um chamador novo,
  // escrito daqui a três meses sem o recorte, cai em vermelho sozinho — que é a única forma de uma
  // trava de acesso sobreviver ao tempo.
  let conferidos = 0;
  for (const caminho of arquivosDeCodigo()) {
    if (caminho.endsWith(join("lib", "alerts.ts"))) continue; // é onde elas são definidas
    const codigo = codigoDe(readFileSync(caminho, "utf8"));
    for (const m of codigo.matchAll(/getAlerts(?:Count)?\(/g)) {
      const chamada = trechoDaChamada(codigo, m.index! + m[0].length - 1);
      // Chamada sem argumento nenhum é menção em texto/tipo, não chamada de verdade.
      if (chamada.replace(/[()\s]/g, "") === "") continue;
      conferidos++;
      verdade(
        /podeAcessarAba\(/.test(chamada),
        `${caminho.replace(RAIZ + "/", "")} chama ${m[0].slice(0, -1)} sem o recorte de Peticionamento — o padrão é fail-closed, então o alerta ficaria invisível para quem PODE vê-lo (ou, se alguém trocar o padrão, visível para quem não pode): ${chamada.slice(0, 120)}`,
      );
    }
  }
  verdade(conferidos >= 9, `a varredura conferiu só ${conferidos} chamada(s) — havia nove ou mais quando este caso foi escrito, então ela está cega`);
});

teste("TRAVA: o alerta abre em ABA NOVA de verdade — a separação da prioridade 0 não pode cair", () => {
  const lista = codigoDe(corpoDaFuncao(FONTE_ALERTS, "getAlerts"));
  for (const kind of ["MINUTA_PRONTA", "MINUTA_FALHOU"]) {
    const pos = lista.indexOf(`kind: "${kind}"`);
    verdade(pos > 0, `o alerta ${kind} não é montado em getAlerts — varredura cega`);
    const item = lista.slice(pos, pos + 900);
    verdade(/abrirEmNovaAba: true/.test(item), `${kind} não pede aba nova — o clique levaria a aba do LÚMEN para dentro do peticionamento`);
    verdade(/hrefDaMinutaDaSessao\(/.test(item), `${kind} monta o href à mão em vez de usar a função — um href errado manda o advogado a um 404 no meio de um prazo`);
  }
  // E quem RENDERIZA precisa cumprir: âncora de verdade, com noopener.
  const row = codigoDe(FONTE_ALERT_ROW);
  const pos = row.indexOf("alert.abrirEmNovaAba");
  verdade(pos > 0, "AlertRow deixou de tratar abrirEmNovaAba — o alerta cairia no <Link> comum, que troca a tela do Lúmen");
  const ramo = row.slice(pos, pos + 400);
  verdade(/target="_blank"/.test(ramo), 'o ramo de aba nova de AlertRow não usa target="_blank"');
  verdade(/rel="noopener"/.test(ramo), 'falta rel="noopener" no ramo de aba nova — a aba do peticionamento ganharia window.opener para a aba do Lúmen');
  // O sino da barra de topo é a OUTRA porta para o mesmo alerta, e ela tem o mesmo dever.
  verdade(/abrirEmNovaAba/.test(codigoDe(FONTE_ACOES_ALERTA)), "a prévia do sino não carrega abrirEmNovaAba — o clique na gaveta trocaria a tela do Lúmen");
});

teste("os dois avisos têm rótulo e ícone próprios, e são do ESCRITÓRIO — não pessoais", () => {
  for (const kind of ["MINUTA_PRONTA", "MINUTA_FALHOU"] as const) {
    verdade(kind in ALERT_KIND_META, `${kind} não tem rótulo/ícone — a Central cairia no rótulo genérico "Alerta"`);
    const meta = metaDoAlerta(kind);
    verdade(meta.label.length > 3 && meta.label !== "Alerta", `${kind} ficou com rótulo genérico: ${meta.label}`);
    verdade(!ALERTAS_PESSOAIS.has(kind), `${kind} entrou na lista de alertas PESSOAIS — a sessão de peticionamento é do escritório, e a peça pronta é assunto de quem estiver por perto para tocá-la`);
  }
});

teste("DECISÃO: o aviso de minuta NÃO é dispensável por botão — ele some quando a minuta é aberta", () => {
  // A régua da casa está escrita em lib/alerts.ts: o botão "Lido" é para o alerta que NÃO tem ação
  // de resolver. Este tem, e é a melhor possível — abrir o que ficou pronto. Um "Lido" por usuário
  // (AlertDismissal é por userId) esconderia do escritório um alerta que ninguém resolveu, e para
  // quem gera cinco minutas por dia acumularia linhas de dispensa para avisos que iam sumir sozinhos.
  for (const fonte of [FONTE_DISMISSIVEL, FONTE_ACOES_ALERTA]) {
    const c = codigoDe(fonte);
    const ini = c.indexOf("DISMISSIBLE_ALERT_KINDS = new Set([");
    verdade(ini > 0, "não achei a lista de alertas dispensáveis — varredura cega");
    const lista = c.slice(ini, c.indexOf("]);", ini));
    verdade(!/MINUTA_/.test(lista), `um aviso de minuta entrou na lista de dispensáveis: ${lista}`);
  }
});

teste("TRAVA: o que faz o alerta sumir é a MINUTA ABERTA — e nunca a tela de 'gerando'", () => {
  const corpo = codigoDe(corpoDaFuncao(FONTE_ACOES, "marcarDesfechoDaGeracaoComoVisto"));
  verdade(corpo.length > 200, `corpoDaFuncao("marcarDesfechoDaGeracaoComoVisto") devolveu ${corpo.length} caracteres — varredura cega`);
  verdade(/exigirAcessoAba\(/.test(corpo), "a ação não exige acesso à aba");
  const posUpdate = corpo.indexOf("updateMany(");
  verdade(posUpdate > 0, "a marcação precisa ser updateMany condicional — um `update` cru reescreveria a data a cada abertura e tocaria updatedAt, jogando o rascunho para o topo da lista como se alguém o tivesse editado");
  const clausula = corpo.slice(corpo.indexOf("where:", posUpdate), corpo.indexOf("data:", posUpdate));
  verdade(/officeId/.test(clausula), "a escrita perdeu o corte por escritório");
  verdade(/minutaVistaEm: null/.test(clausula), "sem `minutaVistaEm: null` no where, cada abertura reescreve a data e toca `updatedAt`");
  verdade(/status:/.test(clausula) && !/GERANDO/.test(clausula), "o `where` precisa restringir o status ao desfecho (GERADA/EXPORTADA/FALHA_GERACAO) — marcar uma sessão em GERANDO apagaria o alerta antes de ele nascer");

  // E a PÁGINA: chama nos dois ramos finais, e NÃO no ramo de geração em andamento.
  const pagina = codigoDe(FONTE_PAGINA_MINUTA);
  const iniGerando = pagina.indexOf('if (sessao.status === "GERANDO")');
  const iniFalha = pagina.indexOf('if (sessao.status === "FALHA_GERACAO"');
  verdade(iniGerando > 0 && iniFalha > iniGerando, "os ramos da página da minuta mudaram de ordem — varredura cega");
  const ramoGerando = pagina.slice(iniGerando, iniFalha);
  verdade(
    !/marcarDesfechoDaGeracaoComoVisto\(/.test(ramoGerando),
    "a tela de 'gerando' marca o desfecho como visto — o alerta morreria antes de nascer, e o advogado de aba fechada nunca saberia que a peça ficou pronta",
  );
  const depois = pagina.slice(iniFalha);
  const marcacoes = [...depois.matchAll(/marcarDesfechoDaGeracaoComoVisto\(/g)].length;
  verdade(marcacoes >= 2, `os ramos finais marcam o desfecho ${marcacoes} vez(es) — precisam ser dois: a minuta pronta E a falha falada (quem leu o motivo já não precisa do alerta)`);
});

teste("TRAVA: a duração é gravada DENTRO da reivindicação atômica, uma vez só", () => {
  const fonte = readFileSync(join(RAIZ, "lib", "peticionamentoGeracaoAssincrona.ts"), "utf8");
  const gravar = codigoDe(corpoDaFuncao(fonte, "gravarMinutaGerada"));
  verdade(gravar.length > 800, `corpoDaFuncao("gravarMinutaGerada") devolveu ${gravar.length} caracteres — varredura cega`);
  const posUpdate = gravar.indexOf("updateMany(");
  verdade(posUpdate > 0, "a gravação da minuta deixou de ser updateMany");
  const posDuracao = gravar.indexOf("geracaoDuracaoMs:");
  verdade(posDuracao > posUpdate, "a duração não é gravada dentro da reivindicação — um segundo `update` somaria a mesma geração duas vezes na faixa do escritório, e a segunda mediria até a SEGUNDA colheita");
  verdade(/duracaoDaGeracaoMs\(/.test(gravar), "a duração deixou de passar pela função que descarta medição impossível — uma subtração crua gravaria número negativo e sessão plantada");
  // E o instante é UM só: dois `new Date()` dariam duas verdades para a mesma geração.
  const ocorrencias = [...gravar.matchAll(/new Date\(\)/g)].length;
  igual(ocorrencias, 1, "a gravação da minuta usa mais de um `new Date()` — `geradoEm` e a duração têm de sair do MESMO instante: ");
});


// ══════════════════════════════════════════════════════════════════════════════════════════
// ACHADO DA REVISÃO — O CORTE DA OUTRA CONSULTA NÃO ESTAVA COBERTO.
//
// Esta entrega exercitou o `where` do ALERTA (`whereMinutaPronta`), inclusive o `officeId` dele.
// A consulta das MEDIÇÕES nasceu com o filtro embutido na chamada, e o `officeId` dela não foi
// exercitado por ninguém. Tirei o `officeId` de lá e as 29 asserções ficaram VERDES.
//
// O estrago não é vazamento de dado de processo — é a tela AFIRMAR uma coisa falsa. Sem o corte,
// a mediana passa a ser a da PLATAFORMA INTEIRA e aparece embaixo da frase que promete "medido
// nas gerações deste escritório, não estimado". Numa entrega cujo ponto inteiro é não inventar
// número, um número errado com selo de MEDIDO é pior do que número nenhum.
//
// A correção seguiu o padrão que a própria entrega criou: o filtro virou função exportada, para
// poder ser EXERCITADA em vez de só varrida.
// ══════════════════════════════════════════════════════════════════════════════════════════

teste("TRAVA: a mediana só olha as gerações DESTE escritório", () => {
  const w = whereMedicoesDoEscritorio("escritorio-1") as Record<string, unknown>;
  igual(w.officeId, "escritorio-1",
    "a consulta das medições perdeu o corte por escritório — a mediana viraria a da plataforma inteira, exibida sob a frase que promete que o número é deste escritório");
});

teste("TRAVA: a mediana só conta geração que de fato terminou e foi medida", () => {
  const w = whereMedicoesDoEscritorio("escritorio-1") as Record<string, unknown>;
  // Sem o filtro de duração não-nula, uma sessão sem medição entraria como se fosse dado.
  igual(w.geracaoDuracaoMs, { not: null },
    "a consulta parou de exigir duração medida — sessão sem medição entraria na conta");
  // E o estado: uma geração que FALHOU não tem tempo típico nenhum a contribuir.
  const status = w.status as { in?: string[] } | undefined;
  verdade(Array.isArray(status?.in), "o filtro de estado sumiu da consulta das medições");
  verdade(!status!.in!.includes("FALHA_GERACAO") && !status!.in!.includes("GERANDO"),
    `a mediana passou a contar geração não concluída: ${JSON.stringify(status)}`);
  verdade(status!.in!.includes("GERADA"),
    "a mediana deixou de contar a geração recém-concluída, que é a medição mais representativa que existe");
});

resumo("Peticionamento — o aviso da geração, a medição do tempo e o alerta da Central");
