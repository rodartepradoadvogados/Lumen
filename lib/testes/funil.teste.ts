import { readFileSync } from "node:fs";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";
import { stageOptions, stageLabels, stageDot, ESTAGIO_DE_ESPERA, ESTAGIOS_DECIDIDOS, podeCairEmAguardando } from "@/lib/funil";

// ============================================================================
// O FUNIL, A COLUNA "AGUARDANDO" E A BOLINHA QUE PISCA.
//
// A confusão que este arquivo existe para impedir é a do dono, dita por ele mesmo: "a bolinha de
// esperando resposta é classificação diferente da coluna Aguardando".
//
//   AGUARDANDO é ESTÁGIO   — alguém (ou o relógio) pôs o card ali. Fica gravado, e só sai quando
//                            alguém tira. Pode estar lá com tudo respondido.
//   ESPERANDO RESPOSTA é FATO — a última mensagem é do cliente. É calculado, some sozinho quando
//                            alguém responde, e vale em QUALQUER coluna, inclusive Fechado.
//
// Se um dia alguém fizer a bolinha depender do estágio (ou o estágio depender da bolinha), a tela
// passa a dizer que "movi o card" é o mesmo que "respondi o cliente". Daí as varreduras no fim.
// ============================================================================

teste("Aguardando fica entre Novo e Qualificação", () => {
  // A ordem das colunas é a ordem da lista, e o dono pediu a coluna nova no topo da lista, entre
  // as duas primeiras. Ordem errada aqui é coluna no lugar errado na tela.
  igual(stageOptions, ["NOVO", "AGUARDANDO", "QUALIFICACAO", "PROPOSTA", "FECHADO", "PERDIDO"]);
  igual(stageLabels.AGUARDANDO, "Aguardando");
});

teste("todo estágio tem rótulo e cor — nenhum aparece como valor cru do banco", () => {
  for (const s of stageOptions) {
    verdade(Boolean(stageLabels[s]), `${s} está sem rótulo`);
    verdade(Boolean(stageDot[s]), `${s} está sem cor`);
    // Cor é variável CSS, nunca hex cravado (DESIGN-SYSTEM.md §0/§16).
    verdade(stageDot[s].startsWith("var(--"), `${s} tem cor cravada: ${stageDot[s]}`);
  }
});

teste("a lista de estágios é uma só no produto inteiro", () => {
  // Estava copiada em três arquivos. Esquecer um significa um estágio que existe no banco e não
  // aparece na tela — sem erro nenhum, só sumindo.
  const relatorios = codigoDe(readFileSync("lib/relatoriosLabels.ts", "utf8"));
  verdade(relatorios.includes('from "@/lib/funil"'), "os relatórios voltaram a ter cópia própria dos estágios");
  verdade(!/const STAGES = \[/.test(relatorios), "os relatórios declararam STAGES de novo");

  const pagina = codigoDe(readFileSync("app/(app)/atendimento/funil/page.tsx", "utf8"));
  verdade(!/const STAGES = \[/.test(pagina), "a Triagem declarou a própria lista de estágios");
  verdade(!/const stageDot/.test(pagina), "a Triagem declarou as próprias cores de estágio");
});

// ── A QUEDA AUTOMÁTICA ──────────────────────────────────────────────────────

teste("quem já decidiu o desfecho não cai em Aguardando", () => {
  // Um lead FECHADO que recebe uma mensagem tardia não volta a pedir atenção comercial: o relógio
  // da conversa continua valendo, mas o funil já acabou para ele.
  igual(podeCairEmAguardando("NOVO"), true);
  igual(podeCairEmAguardando("QUALIFICACAO"), true);
  igual(podeCairEmAguardando("PROPOSTA"), true);
  igual(podeCairEmAguardando("FECHADO"), false);
  igual(podeCairEmAguardando("PERDIDO"), false);
  // E quem já está lá fica onde está — senão o cron reescreveria `stageChangedAt` a cada rodada e
  // o card passaria a mentir sobre há quanto tempo está parado.
  igual(podeCairEmAguardando(ESTAGIO_DE_ESPERA), false);
  igual(ESTAGIOS_DECIDIDOS, ["FECHADO", "PERDIDO"]);
});

teste("o relógio estourado empurra o card para Aguardando, nos dois desfechos", () => {
  // Repassado para a próxima pessoa OU volta fechada: nos dois o prazo passou, e é disso que a
  // coluna fala.
  const repasse = readFileSync("lib/repassarLead.ts", "utf8");
  const empurrar = corpoDaFuncao(repasse, "empurrarParaAguardando");
  verdade(empurrar.length > 0, "empurrarParaAguardando não existe");
  verdade(empurrar.includes("podeCairEmAguardando(lead.stage)"), "empurra sem checar o estágio atual");
  verdade(empurrar.includes("stage: ESTAGIO_DE_ESPERA"), "não grava o estágio novo");

  const tratar = corpoDaFuncao(repasse, "tratarUmLead");
  igual((tratar.match(/empurrarParaAguardando\(lead\)/g) || []).length, 2, "esperado um empurrão em cada desfecho: ");
  // E NÃO no desfecho de quem respondeu: mover o card de quem acabou de ser atendido para uma
  // coluna de "olhe para mim" é o contrário do que aconteceu.
  const atendido = tratar.slice(0, tratar.indexOf("atendido — relógio parado"));
  verdade(!atendido.includes("empurrarParaAguardando"), "quem foi atendido está sendo empurrado para Aguardando");
});

// ── O ARRASTAR ──────────────────────────────────────────────────────────────

teste("Perdido recusa a gravação, não o gesto — e diz por quê", () => {
  // O defeito que este caso trava foi visto no navegador, não no código: enquanto o onDragOver da
  // coluna Perdido saía antes do preventDefault, o navegador não entregava o onDrop. O card voltava
  // sozinho para a coluna de origem e ninguém dizia por quê — e a mensagem que explica a regra
  // ficava no arquivo sem nunca chegar à tela. Recusa silenciosa é pior que recusa nenhuma: a
  // pessoa arrasta de novo, mais forte, achando que não pegou.
  const fonte = codigoDe(readFileSync("components/atendimento/QuadroDoFunil.tsx", "utf8"));
  verdade(/const RECUSA_DE_PERDIDO =[\s\S]{0,200}seletor dentro do card/.test(fonte),
    "a recusa de Perdido parou de explicar o caminho que funciona");
  verdade(/dropEffect = aceitaSoltar \? "move" : "none"/.test(fonte),
    "o cursor deixou de avisar que a coluna não aceita");
  // A EXPLICAÇÃO SAI NO PAIRAR, NÃO NO SOLTAR. Com dropEffect "none" o navegador cancela o gesto e
  // nunca entrega o evento de soltar — mensagem escrita lá é mensagem escrita nunca. Verificado no
  // navegador: a primeira versão recusava certo e não dizia nada.
  const pairar = fonte.slice(fonte.indexOf("onDragOver="), fonte.indexOf("onDragLeave="));
  verdade(pairar.includes("e.preventDefault()"), "o pairar deixou de aceitar o gesto");
  verdade(/if \(!aceitaSoltar\) setErro\(RECUSA_DE_PERDIDO\)/.test(pairar),
    "a recusa voltou a ser muda: a explicação não sai enquanto o card paira");
  // E a coluna fechada não pode se pintar como quem aceita enquanto o card paira sobre ela.
  verdade(fonte.includes("border-dashed border-urgente"), "Perdido se destaca como alvo válido");
  // A guarda no soltar fica: se algum navegador entregar o evento mesmo assim, gravar PERDIDO sem
  // motivo furaria a regra.
  verdade(/ESTAGIOS_DECIDIDOS.includes\(stage\) && stage === "PERDIDO"/.test(fonte),
    "o soltar deixou de recusar Perdido");
});

teste("o seletor dentro do card continua existindo", () => {
  // Quem navega por teclado não arrasta nada. Sem o seletor, o quadro viraria uma tela onde essas
  // pessoas leem e não agem — e é também o único caminho para Perdido, que pede o motivo.
  const fonte = codigoDe(readFileSync("components/atendimento/QuadroDoFunil.tsx", "utf8"));
  // Com fronteira: `includes("<FunnelStageSelect")` passaria verde diante de um
  // `<FunnelStageSelectRemovido`, que é justamente o jeito mais provável de o seletor sumir.
  verdade(/<FunnelStageSelect\s/.test(fonte), "o seletor sumiu do card");
});

// ── A BOLINHA ───────────────────────────────────────────────────────────────

teste("a bolinha é FATO e não depende do estágio, em nenhuma das telas", () => {
  // O erro que arruinaria as duas ideias: fazer a bolinha aparecer porque o card está em
  // Aguardando. Aí a coluna e a bolinha viram a mesma informação dita duas vezes, e a bolinha
  // deixa de avisar sobre os leads das outras colunas — que são a maioria.
  const telas: [string, string][] = [
    ["components/atendimento/QuadroDoFunil.tsx", "card.esperandoResposta"],
    ["components/atendimento/FilaDeEspera.tsx", "bolinha-espera"],
    ["app/(app)/atendimento/[id]/page.tsx", "esperandoResposta"],
    // As duas telas do celular: a lista e a conversa. Se a bolinha existir só no computador, quem
    // atende do celular — que é a maioria fora do escritório — não vê quem está esperando.
    ["components/mobile/MobileAtendimentosCard.tsx", "q.esperandoHa !== null"],
    ["app/m/atendimento/[id]/page.tsx", "ultimaEhDoCliente"],
  ];
  for (const [caminho, marca] of telas) {
    const fonte = codigoDe(readFileSync(caminho, "utf8"));
    verdade(fonte.includes("bolinha-espera"), `${caminho} não mostra a bolinha`);
    verdade(fonte.includes(marca), `${caminho} não usa o fato para decidir a bolinha`);
    verdade(!/bolinha-espera[\s\S]{0,400}AGUARDANDO/.test(fonte), `${caminho} amarrou a bolinha ao estágio Aguardando`);
  }
});

teste('a bolinha usa o MESMO critério em toda tela: a última mensagem é do cliente', () => {
  // Uma segunda definição de "esperando resposta" faria a bolinha do card discordar da fila da
  // primeira guia, na mesma tela.
  for (const caminho of [
    "app/(app)/atendimento/funil/page.tsx",
    "app/(app)/atendimento/[id]/page.tsx",
    "app/m/atendimento/[id]/page.tsx",
  ]) {
    const fonte = codigoDe(readFileSync(caminho, "utf8"));
    verdade(/direction === "IN"/.test(fonte), `${caminho} usa outro critério para "esperando resposta"`);
  }
  const puro = codigoDe(readFileSync("lib/rotulosDaEspera.ts", "utf8"));
  verdade(puro.includes('esperando') || puro.includes("esperandoHa"), "a fila perdeu o conceito de espera");
});

teste("quem desligou movimento continua vendo a bolinha — ela só para de piscar", () => {
  // A informação é a COR e a PRESENÇA; o piscar é reforço, e reforço é o que se abre mão primeiro.
  const css = readFileSync("app/globals.css", "utf8");
  const i = css.indexOf(".bolinha-espera {");
  verdade(i > 0, "a bolinha não existe no CSS");
  const reduzido = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)", i));
  verdade(reduzido.slice(0, 300).includes(".bolinha-espera"), "a bolinha pisca mesmo para quem desligou movimento");
  verdade(reduzido.slice(0, 300).includes("animation: none"), "o movimento não é desligado");
  verdade(!reduzido.slice(0, 300).includes("display: none"), "a bolinha some em vez de só parar de piscar");
});

// ── O AJUDANTE DAS VARREDURAS ───────────────────────────────────────────────

teste("corpoDaFuncao acha o corpo de função que DESESTRUTURA o parâmetro", () => {
  // Defeito encontrado ao revisar a mídia do WhatsApp. A busca pelo fim da função parava no `}`
  // que fecha a desestruturação do parâmetro — que também está na coluna do cabeçalho:
  //
  //     export async function ingestIncomingWhatsapp({
  //       fromNumber, ...
  //     }: IncomingMessage): Promise<...> {
  //
  // O trecho devolvido tinha 137 caracteres e nenhum corpo. Uma varredura que procurasse algo
  // DENTRO da função acusava ausência do que existe; e uma escrita como "não pode conter X"
  // passava VERDE com o defeito instalado — que é o modo de falhar que custa caro.
  const fonte = [
    "export async function comDesestruturacao({",
    "  um,",
    "  dois,",
    "}: Tipo): Promise<void> {",
    "  await fazerAlgo(um, dois);",
    "}",
    "",
    "export function depois(): void {",
    "  naoDeviaAparecer();",
    "}",
  ].join("\n");

  const corpo = corpoDaFuncao(fonte, "comDesestruturacao");
  verdade(corpo.includes("await fazerAlgo"), "o corpo da função desestruturada não foi encontrado");
  verdade(!corpo.includes("naoDeviaAparecer"), "o trecho transbordou para a função seguinte");
});

teste("corpoDaFuncao não transborda em função ANINHADA", () => {
  // O outro jeito de errar, e o primeiro que apareceu nesta sessão: procurar "a próxima função do
  // arquivo" como fim do trecho. Numa função declarada DENTRO de outra, a próxima função de topo
  // está lá embaixo, e o trecho leva junto tudo o que houver no meio — inclusive o JSX de um
  // componente. Aí a varredura acha a palavra procurada no lugar errado e passa verde com o
  // defeito instalado. Os dois casos juntos, este e o de cima, cobrem as duas formas de errar.
  const fonte = [
    "export function DeFora() {",
    "  function interna() {",
    "    somenteIsto();",
    "  }",
    "  return interna;",
    "}",
    "",
    "export function OutraDeTopo() {",
    "  naoDeviaAparecer();",
    "}",
  ].join("\n");

  const corpo = corpoDaFuncao(fonte, "interna");
  verdade(corpo.includes("somenteIsto"), "o corpo da função aninhada não foi encontrado");
  verdade(!corpo.includes("naoDeviaAparecer"), "o trecho transbordou para a função de topo seguinte");
  verdade(!corpo.includes("return interna"), "o trecho passou do fim da função aninhada");
});

resumo("Funil, Aguardando e a bolinha");
