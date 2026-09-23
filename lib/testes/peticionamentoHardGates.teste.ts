import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";

// ============================================================================
// VARREDURA — os hard gates da aba de Peticionamento, provados por LEITURA DO CÓDIGO, não por
// confiança em prompt. Segue a mesma disciplina de lib/testes/seteFerramentas.teste.ts: usa
// `codigoDe` (remove comentário, que citaria a trava e passaria verde sozinho) e
// `corpoDaFuncao` (isola só a função, não transborda pra vizinha) — e confere que
// `corpoDaFuncao` de fato achou algo antes de confiar no resultado.
// ============================================================================

const RAIZ = process.cwd();
const FONTE_ACOES = readFileSync(join(RAIZ, "lib", "actions", "peticionamento.ts"), "utf8");
const FONTE_LAYOUT = readFileSync(join(RAIZ, "app", "peticionamento", "layout.tsx"), "utf8");
const FONTE_PROMPT = readFileSync(join(RAIZ, "lib", "peticionamentoPrompt.ts"), "utf8");
const FONTE_DOCX = readFileSync(join(RAIZ, "lib", "peticionamentoDocx.ts"), "utf8");
// `sincronizarCitacoes` SAIU de lib/actions/peticionamento.ts nesta entrega. Não foi arrumação:
// a gravação da minuta passou a poder acontecer no CRON, fora de qualquer requisição do
// advogado, e aquele arquivo é `"use server"` — exportar de lá teria transformado uma função que
// recebe `officeId` por parâmetro numa Server Action chamável do navegador.
const FONTE_CITACOES = readFileSync(join(RAIZ, "lib", "peticionamentoCitacoesSync.ts"), "utf8");

// ── Nunca protocolar (especificação §3) ─────────────────────────────────────────────────────

teste("HARD GATE: nenhum arquivo da feature menciona protocolar/enviar ao tribunal/PJe automaticamente", () => {
  const arquivos = ["lib/actions/peticionamento.ts", "lib/peticionamentoPrompt.ts", "lib/peticionamentoDocx.ts", "lib/hermesPonte.ts"];
  const proibidos = /protocolarautomaticamente|enviaraotribunal|enviarpje|submeterprocesso/i;
  for (const rel of arquivos) {
    const codigo = codigoDe(readFileSync(join(RAIZ, rel), "utf8")).replace(/\s+/g, "").toLowerCase();
    verdade(!proibidos.test(codigo), `${rel} não deveria conter nenhuma rotina de protocolo automático`);
  }
});

teste("HARD GATE: o prompt ao Hermes reforça, em texto, que protocolar é sempre ato humano", () => {
  verdade(FONTE_PROMPT.includes("protocolada por você"), "o prompt deveria deixar explícito que o agente nunca protocola");
});

// ── Acesso à aba (recepção nunca entra) ──────────────────────────────────────────────────────

teste("HARD GATE: o layout da aba inteira chama podeAcessarAba antes de liberar qualquer página", () => {
  const corpo = corpoDaFuncao(FONTE_LAYOUT, "PeticionamentoLayout");
  verdade(corpo.length > 100, "corpoDaFuncao não encontrou PeticionamentoLayout — a varredura não está lendo certo");
  verdade(corpo.includes("podeAcessarAba("), "layout deveria checar podeAcessarAba antes de renderizar children");
});

teste("HARD GATE: toda Server Action de peticionamento passa por exigirAcessoAba antes de tocar o banco", () => {
  // Cada função exportada precisa citar exigirAcessoAba() dentro do PRÓPRIO corpo — procurado
  // função por função, não a mera presença da string no arquivo inteiro (que um helper
  // interno chamado uma vez satisfaria mesmo se outra ação esquecesse de chamá-lo).
  const nomes = Array.from(FONTE_ACOES.matchAll(/export async function (\w+)\(/g)).map((m) => m[1]);
  verdade(nomes.length >= 15, `só ${nomes.length} ações encontradas — a varredura não está lendo certo`);
  const semTrava: string[] = [];
  for (const nome of nomes) {
    const corpo = corpoDaFuncao(FONTE_ACOES, nome);
    if (corpo.length < 20) {
      semTrava.push(`${nome} (corpoDaFuncao não achou nada)`);
      continue;
    }
    if (!codigoDe(corpo).includes("exigirAcessoAba(")) semTrava.push(nome);
  }
  igual(semTrava, [], "ações SEM a checagem de acesso: ");
});

// ── O mínimo (fatos + pedidos) trava a geração de verdade ────────────────────────────────────

teste("HARD GATE: confirmarTriagemEGerar recusa gerar sem o mínimo, ANTES de chamar o Hermes", () => {
  const corpo = codigoDe(corpoDaFuncao(FONTE_ACOES, "confirmarTriagemEGerar"));
  verdade(corpo.length > 200, "corpoDaFuncao não encontrou confirmarTriagemEGerar");
  const idxProntidao = corpo.indexOf("avaliarProntidao(");
  const idxHermes = corpo.indexOf("perguntarAoHermesComPerfil(");
  verdade(idxProntidao !== -1, "deveria chamar avaliarProntidao");
  verdade(idxHermes !== -1, "deveria chamar perguntarAoHermesComPerfil");
  verdade(idxProntidao < idxHermes, "a checagem de mínimo precisa vir ANTES da chamada ao Hermes, não depois");
});

// ── Fecho garantido em dois pontos (defesa em profundidade) ──────────────────────────────────

// ══════════════════════════════════════════════════════════════════════════════════════════
// ADAPTADOS NA ENTREGA DA GERAÇÃO ASSÍNCRONA — e a adaptação vale explicação.
//
// Os dois casos abaixo nomeavam a FUNÇÃO onde a trava morava (`confirmarTriagemEGerar`). Quando a
// geração saiu de dentro da requisição web, a gravação da minuta mudou de casa: hoje ela é uma
// função só (`gravarMinutaGerada`, em lib/peticionamentoGeracaoAssincrona.ts) usada pelos TRÊS
// caminhos — a tela, o cron e o síncrono de compatibilidade. Os dois casos ficaram vermelhos sem
// que uma vírgula da regra tivesse mudado: o nome da função era uma amarra, não a regra.
//
// A REGRA DE VERDADE é outra, e é ela que passou a ser cobrada: **quem grava `minutaTexto` no
// banco garante o fecho, e quem grava `notaRiscos` filtra antes** — onde quer que esteja, e
// inclusive num lugar NOVO, criado amanhã, que ninguém lembrou de acrescentar a uma lista aqui.
// A varredura DERIVA as funções a partir das próprias gravações, exatamente como
// lib/testes/peticionamentoIsolamento.teste.ts deriva as ações a partir do arquivo.
// ══════════════════════════════════════════════════════════════════════════════════════════

/** Os arquivos onde uma gravação de minuta pode morar — a busca varre todos. */
const ARQUIVOS_QUE_GRAVAM = [
  "lib/actions/peticionamento.ts",
  "lib/peticionamentoGeracaoAssincrona.ts",
  "lib/peticionamentoCitacoesSync.ts",
];

/**
 * O bloco `data: { ... }` que começa em `de`, com as chaves balanceadas.
 *
 * BALANCEADO, e não "até a próxima chave": um `data` de Prisma tem objetos aninhados, e uma busca
 * ingênua pararia no primeiro `}` interno — devolvendo um pedaço em que a trava procurada pode
 * simplesmente não estar, e fazendo a varredura passar verde por não enxergar.
 */
function blocoBalanceado(codigo: string, de: number): string {
  let profundidade = 0;
  for (let i = de; i < codigo.length; i++) {
    if (codigo[i] === "{") profundidade++;
    else if (codigo[i] === "}") {
      profundidade--;
      if (profundidade === 0) return codigo.slice(de, i + 1);
    }
  }
  return codigo.slice(de);
}

/**
 * Toda função que ESCREVE `campo` num `data:` de Prisma, com o corpo dela já isolado.
 *
 * SÓ ESCRITA, nunca leitura: a primeira versão desta varredura procurava `campo:` no arquivo
 * inteiro e encontrava `minutaTexto: sessao.minutaTexto` dentro de um `select` — acusando uma
 * função que só LÊ de não garantir o fecho. É o mesmo gênero de cegueira que `codigoDe` e
 * `corpoDaFuncao` existem para evitar: a varredura precisa olhar exatamente para o que ela diz
 * que olha.
 *
 * Sem lista escrita à mão: um lugar NOVO que grave a minuta cai em vermelho sozinho.
 */
function funcoesQueGravam(campo: string): { onde: string; corpo: string }[] {
  const achados: { onde: string; corpo: string }[] = [];
  for (const rel of ARQUIVOS_QUE_GRAVAM) {
    const fonte = readFileSync(join(RAIZ, rel), "utf8");
    const codigo = codigoDe(fonte);
    let de = 0;
    for (;;) {
      const pos = codigo.indexOf("data: {", de);
      if (pos < 0) break;
      de = pos + 1;
      const bloco = blocoBalanceado(codigo, codigo.indexOf("{", pos));
      if (!new RegExp(`(^|[\\s,{])${campo}\\s*:`).test(bloco)) continue;
      const antes = codigo.slice(0, pos);
      const cab = antes.lastIndexOf("function ");
      if (cab < 0) continue;
      const nome = antes.slice(cab + "function ".length).match(/^(\w+)/)?.[1] ?? codigo.slice(cab + "function ".length).match(/^(\w+)/)?.[1];
      if (!nome) continue;
      const corpo = codigoDe(corpoDaFuncao(fonte, nome));
      if (corpo.length > 200 && !achados.some((a) => a.onde === `${rel}:${nome}`)) achados.push({ onde: `${rel}:${nome}`, corpo });
    }
  }
  return achados;
}

teste("a varredura acha as gravações de minuta — uma lista vazia passaria verde sem provar nada", () => {
  const gravamMinuta = funcoesQueGravam("minutaTexto");
  verdade(gravamMinuta.length >= 1, `nenhuma função gravando minutaTexto encontrada em ${ARQUIVOS_QUE_GRAVAM.join(", ")}`);
  const gravamRiscos = funcoesQueGravam("notaRiscos");
  verdade(gravamRiscos.length >= 1, "nenhuma função gravando notaRiscos encontrada");
});

teste("HARD GATE: TODA função que grava a minuta garante o fecho — e a edição e a exportação reconferem", () => {
  for (const { onde, corpo } of funcoesQueGravam("minutaTexto")) {
    verdade(corpo.includes("garantirFecho("), `${onde} grava minutaTexto sem garantir o fecho — o fecho é garantido por CÓDIGO, nunca confiado ao modelo`);
  }
  // Defesa em profundidade: as duas reconferências continuam nomeadas, porque elas NÃO gravam
  // `minutaTexto` no mesmo lugar (a exportação lê o que já está gravado) e sairiam da derivação.
  const edicao = codigoDe(corpoDaFuncao(FONTE_ACOES, "atualizarCorpoDaMinuta"));
  const exportacao = codigoDe(corpoDaFuncao(FONTE_ACOES, "confirmarExportacao"));
  verdade(edicao.length > 200 && exportacao.length > 200, "varredura cega: as funções de edição/exportação não foram encontradas");
  verdade(edicao.includes("garantirFecho("), "edição manual deveria reconferir o fecho");
  verdade(exportacao.includes("garantirFecho("), "exportação deveria reconferir o fecho de novo, por segurança");
});

// ── Nota de riscos nunca entra sem passar pelo filtro "aponta, não decide" ───────────────────

teste("HARD GATE: TODA função que grava a nota de riscos filtra ANTES de gravar", () => {
  for (const { onde, corpo } of funcoesQueGravam("notaRiscos")) {
    const idxFiltro = corpo.indexOf("filtrarNotaDeRiscos(");
    const idxGravar = corpo.indexOf("notaRiscos:");
    verdade(idxFiltro !== -1, `${onde} grava notaRiscos sem chamar filtrarNotaDeRiscos`);
    verdade(idxFiltro < idxGravar, `${onde} filtra DEPOIS de gravar — filtrar depois não filtra nada`);
    // E o que é gravado é a versão filtrada, nunca a lista crua que o modelo escreveu.
    verdade(
      !/notaRiscos:\s*estruturada\.riscos/.test(corpo),
      `${onde} grava a nota de riscos crua do modelo — é exatamente o "decide em vez de apontar" que esta trava impede`,
    );
  }
});

// ── Exportação: OAB + checkbox, sempre os dois, sempre no servidor ───────────────────────────

teste("HARD GATE: confirmarExportacao recusa sem avaliarExportacao().pode, e recusa sem o checkbox", () => {
  const corpo = codigoDe(corpoDaFuncao(FONTE_ACOES, "confirmarExportacao"));
  verdade(corpo.length > 300, "corpoDaFuncao não encontrou confirmarExportacao");
  verdade(corpo.includes("avaliarExportacao("), "deveria checar avaliarExportacao (só advogado com OAB)");
  // CHAMAR NÃO É OBEDECER. A primeira versão desta asserção só exigia que `avaliarExportacao(`
  // aparecesse no corpo: trocar a linha seguinte por `void avaliacao;` passava verde, e estagiário
  // e advogado sem OAB exportavam. O veredito tem de DESVIAR a execução.
  verdade(/if \(!avaliacao\.pode\) return \{ error: avaliacao\.motivo!? \};/.test(corpo),
    "o veredito de avaliarExportacao precisa interromper a exportação, não só ser calculado");
  verdade(corpo.includes("if (!confirmouCheckbox)"), "deveria recusar explicitamente quando o checkbox não foi marcado");
  const idxAvaliacao = corpo.indexOf("avaliarExportacao(");
  const idxDocx = corpo.indexOf("montarPeticaoWord(");
  verdade(idxAvaliacao !== -1 && idxDocx !== -1 && idxAvaliacao < idxDocx, "a checagem de OAB precisa vir ANTES de montar o arquivo");
});

teste("HARD GATE: a nota de destaque obrigatória é sempre montada antes de gerar o .docx exportado — nunca pode sumir", () => {
  const corpo = codigoDe(corpoDaFuncao(FONTE_ACOES, "confirmarExportacao"));
  verdade(corpo.length > 300, "corpoDaFuncao não encontrou confirmarExportacao");
  verdade(corpo.includes("montarNotaObrigatoria("), "deveria montar a nota obrigatória");
  verdade(corpo.includes("notaObrigatoriaTexto: notaObrigatoria"), "deveria passar a nota obrigatória montada para o .docx, nunca uma string vazia/omitida");
});

teste("HARD GATE: toda exportação registra quem confirmou e quando (PeticionamentoExportacao)", () => {
  const corpo = codigoDe(corpoDaFuncao(FONTE_ACOES, "confirmarExportacao"));
  verdade(corpo.includes("peticionamentoExportacao.create("), "deveria criar o registro de auditoria da exportação");
  verdade(corpo.includes("confirmadoPorId: user.id"), "o registro precisa gravar QUEM confirmou");
  // O REGISTRO NÃO PODE SER CONDICIONAL. Só `includes` deixava passar `if (false) await prisma.
  // peticionamentoExportacao.create(...)`: a auditoria morria e a suíte continuava verde. Exigir a
  // linha no nível do corpo da função (dois espaços de indentação, começando em `await`) fecha isso
  // — dentro de qualquer `if`/`try` a indentação seria maior.
  verdade(/\n  await prisma\.peticionamentoExportacao\.create\(/.test(corpo),
    "o registro de auditoria precisa ser incondicional, no corpo da ação — nunca dentro de um if");
});

teste("HARD GATE: o metadado de rascunho de IA é sempre passado ao gerar o .docx", () => {
  const corpo = codigoDe(corpoDaFuncao(FONTE_ACOES, "confirmarExportacao"));
  verdade(/montarPeticaoWord\(\s*\{/.test(corpo), "deveria chamar montarPeticaoWord");
  verdade(corpo.includes("confirmadoPorNome: user.name"), "metadado deveria incluir quem confirmou");
  const chamaMetadados = codigoDe(FONTE_DOCX).includes("acrescentarMetadados(zip, meta)");
  verdade(chamaMetadados, "montarPeticaoWord deveria sempre acrescentar os metadados obrigatórios");
});

// ── Citações: uma a uma, sem atalho — decisão do dono (22/09/2026) ─────────────────────────────

teste("HARD GATE: confirmarExportacao recusa exportar com citação pendente, ANTES de montar o .docx", () => {
  const corpo = codigoDe(corpoDaFuncao(FONTE_ACOES, "confirmarExportacao"));
  verdade(corpo.length > 300, "corpoDaFuncao não encontrou confirmarExportacao");
  verdade(corpo.includes("sincronizarCitacoes("), "deveria resincronizar a lista de citações antes de contar as pendentes");
  // ADAPTADA 23/09/2026: a contagem passou a excluir `excluidaEm: null` também (citação excluída
  // pelo advogado não pede mais confirmação — ver excluirCitacao) — o regex tolera esse campo a
  // mais sem deixar de exigir os dois campos originais (sessaoId e confirmadaPorId nulo).
  verdade(/peticionamentoCitacao\.count\(\{\s*where:\s*\{\s*sessaoId,\s*confirmadaPorId:\s*null,\s*excluidaEm:\s*null\s*\}/.test(corpo), "deveria contar citações ATIVAS (não excluídas) com confirmadaPorId nulo desta sessão");
  // CHAMAR NÃO É OBEDECER (mesma armadilha já documentada acima para avaliarExportacao): o veredito
  // precisa DESVIAR a execução, não só ser calculado e ignorado.
  verdade(/if \(citacoesPendentes > 0\) \{/.test(corpo), "o veredito de citações pendentes precisa interromper a exportação, não só ser calculado");
  const idxContagem = corpo.indexOf("peticionamentoCitacao.count(");
  const idxDocx = corpo.indexOf("montarPeticaoWord(");
  verdade(idxContagem !== -1 && idxDocx !== -1 && idxContagem < idxDocx, "a checagem de citações pendentes precisa vir ANTES de montar o arquivo");
});

// ── Molde/exemplo nunca entra como citação, e a graduação de fonte bloqueia a aprovação ─────────
// (endurecimento 23/09/2026 — ver lib/peticionamentoIdentificadorDeJulgado.ts e
// lib/peticionamentoAprovacao.ts para as réguas puras; aqui só a prova de que a ação as USA).

teste("HARD GATE: aprovarMinutaGerarPeca recusa aprovar quando avaliarAprovacaoDeMinuta reprova, ANTES de gravar", () => {
  const corpo = codigoDe(corpoDaFuncao(FONTE_ACOES, "aprovarMinutaGerarPeca"));
  verdade(corpo.length > 200, "corpoDaFuncao não encontrou aprovarMinutaGerarPeca — a varredura não está lendo certo");
  verdade(corpo.includes("avaliarAprovacaoDeMinuta("), "deveria calcular a avaliação com a régua pura, não reimplementar a regra aqui");
  verdade(/if \(!avaliacao\.podeAprovar\) \{/.test(corpo), "o veredito de avaliarAprovacaoDeMinuta precisa DESVIAR a execução, não só ser calculado");
  const idxIf = corpo.indexOf("if (!avaliacao.podeAprovar)");
  const idxUpdate = corpo.indexOf("peticionamentoSessao.update(");
  verdade(idxIf !== -1 && idxUpdate !== -1 && idxIf < idxUpdate, "a recusa precisa vir ANTES de gravar minutaAprovadaEm");
  verdade(corpo.includes("haAvisoDeMolde: avisosDeMolde.length > 0"), "a aprovação precisa considerar os avisos de molde, não só a confirmação de cada citação");
});

teste("HARD GATE: excluirCitacao apaga o REGISTRO, nunca o texto da minuta", () => {
  const corpo = codigoDe(corpoDaFuncao(FONTE_ACOES, "excluirCitacao"));
  verdade(corpo.length > 200, "corpoDaFuncao não encontrou excluirCitacao — a varredura não está lendo certo");
  verdade(corpo.includes("excluidaPorId: user.id") && corpo.includes("excluidaEm: new Date()"), "deveria gravar quem excluiu e quando");
  // A TROCA MAIS PERIGOSA POSSÍVEL AQUI seria excluirCitacao também apagar/editar `minutaTexto` —
  // isso apagaria o texto da PEÇA por engano ao excluir só o REGISTRO de citação.
  verdade(!/minutaTexto\s*:/.test(corpo), "excluirCitacao NUNCA pode escrever em minutaTexto — excluir o registro não apaga o texto da minuta");
  verdade(corpo.includes("aindaNoCorpo"), "a resposta precisa dizer se o texto ainda está no corpo, já que excluir o registro não o remove de lá");
});

teste("HARD GATE: listarCitacoesParaValidacao separa ativas de excluídas, e não pede confirmação de uma citação excluída", () => {
  const corpo = codigoDe(corpoDaFuncao(FONTE_ACOES, "listarCitacoesParaValidacao"));
  verdade(corpo.length > 300, "corpoDaFuncao não encontrou listarCitacoesParaValidacao");
  verdade(corpo.includes("!c.excluidaEm"), "deveria filtrar as citações ATIVAS (não excluídas) para a lista de confirmação");
  verdade(corpo.includes("avaliarFonteDeCitacao("), "cada citação da tela precisa da graduação de fonte, não só de fonteUrl/fonteSecundariaUrl crus");
  verdade(corpo.includes("avaliarAprovacaoDeMinuta("), "a tela precisa saber se pode aprovar, calculado pela régua pura");
});

teste("HARD GATE: atualizarCorpoDaMinuta desfaz a aprovação final junto com a confirmação de citação — editar depois de aprovar não pode deixar a aprovação de pé", () => {
  const corpo = codigoDe(corpoDaFuncao(FONTE_ACOES, "atualizarCorpoDaMinuta"));
  verdade(corpo.length > 150, "corpoDaFuncao não encontrou atualizarCorpoDaMinuta");
  verdade(corpo.includes("sincronizarCitacoes("), "a regra antiga continua valendo: editar o corpo resincroniza as citações");
  verdade(corpo.includes("minutaAprovadaEm: null") && corpo.includes("minutaAprovadaPorId: null"),
    "editar o corpo precisa zerar a aprovação final — senão uma minuta aprovada continuaria 'aprovada' depois de mudar de conteúdo");
});

teste("HARD GATE: NÃO existe ação de 'confirmar todas as citações' — é uma por vez, sempre", () => {
  // Varre TODO o arquivo (não só uma função) porque o ponto desta trava é a AUSÊNCIA de uma
  // funcionalidade inteira — não há uma função específica para isolar e conferir por dentro.
  const codigo = codigoDe(FONTE_ACOES);
  const proibido = /confirmarTodas|confirmarcitacoes\(|marcarTodasComoLidas|revisarTodas/i;
  verdade(!proibido.test(codigo.replace(/\s+/g, "")), "não deveria existir nenhuma rotina de confirmação em lote das citações");
  // A ÚNICA escrita em PeticionamentoCitacao.confirmadaPorId é dentro de confirmarCitacaoIndividual,
  // sempre por UM id específico (`where: { id: citacaoId }`) — nunca um updateMany.
  verdade(!codigo.includes("peticionamentoCitacao.updateMany("), "confirmação de citação nunca pode ser um updateMany (confirmaria mais de uma de uma vez)");
});

teste("HARD GATE: confirmarCitacaoIndividual grava quem confirmou e quando, uma citação por chamada", () => {
  const corpo = codigoDe(corpoDaFuncao(FONTE_ACOES, "confirmarCitacaoIndividual"));
  verdade(corpo.length > 150, "corpoDaFuncao não encontrou confirmarCitacaoIndividual");
  verdade(corpo.includes("confirmadaPorId: user.id"), "deveria gravar quem confirmou");
  verdade(corpo.includes("confirmadaEm: new Date()"), "deveria gravar quando confirmou");
  verdade(corpo.includes("hashDoTexto: hashDeTexto("), "deveria gravar a impressão do texto no momento da confirmação");
});

teste("HARD GATE: sincronizarCitacoes apaga a citação cuja identidade não bate mais — é assim que editar invalida a confirmação", () => {
  const corpo = codigoDe(corpoDaFuncao(FONTE_CITACOES, "sincronizarCitacoes"));
  verdade(corpo.length > 300, "corpoDaFuncao não encontrou sincronizarCitacoes");
  verdade(corpo.includes("peticionamentoCitacao.delete("), "deveria apagar citação cujo texto (na forma normalizada) não existe mais na lista atual");
  verdade(
    /if \(!chavesMantidas\.has\(chave\)\) operacoes\.push\(prisma\.peticionamentoCitacao\.delete\(/.test(corpo),
    "a exclusão precisa ser condicionada a 'não estar mais entre as chaves mantidas' — sem isso, apagaria tudo ou nada",
  );
});

// ══════════════════════════════════════════════════════════════════════════════════════════
// ACHADO DA REVISÃO — O "LI E REVISEI" PODIA PASSAR A RESPONDER POR UM LINK NUNCA ABERTO.
//
// O teste que estava aqui exigia que o update de sincronização NUNCA tocasse em
// confirmadaPorId/confirmadaEm. Ele guardava uma coisa de verdade — uma confirmação que deve
// sobreviver (só a FORMA do texto mudou) não pode ser apagada por engano — mas enunciava a regra
// de forma absoluta demais, e por isso deixava passar o caso inverso: o mesmo update trocava
// `fonteUrl`/`fonteSecundariaUrl` e mantinha a confirmação de pé.
//
// A decisão do dono é explícita sobre o objeto da confirmação: "os links utilizados na dupla
// validação para conferência, uma a uma". O "li e revisei" é sobre a citação E os links por onde
// ela foi conferida. `jurisprudenciaCitada` é repovoada a cada geração do Hermes, então a MESMA
// ementa pode voltar com outra fonte secundária (ou com uma que antes não existia) sem uma
// vírgula do texto mudar — e a confirmação de ontem passava a valer por um link que o advogado
// nunca viu. hashDoTexto não pega isso: ele é impressão do TEXTO, e o texto não mudou.
//
// Os dois testes abaixo são as duas metades da regra. Nenhum deles afrouxa o anterior: o primeiro
// é a garantia que o teste antigo dava, agora dita com precisão; o segundo é a que faltava.
// ══════════════════════════════════════════════════════════════════════════════════════════

teste("HARD GATE: mudança só na FORMA do texto preserva a confirmação — a invalidação é condicionada, nunca automática", () => {
  const corpo = codigoDe(corpoDaFuncao(FONTE_CITACOES, "sincronizarCitacoes"));
  verdade(corpo.length > 300, "corpoDaFuncao não encontrou sincronizarCitacoes");
  const inicioUpdate = corpo.indexOf("prisma.peticionamentoCitacao.update(");
  verdade(inicioUpdate !== -1, "sincronizarCitacoes deveria ter um update para citação já existente");
  const fimUpdate = corpo.indexOf("})),", inicioUpdate);
  const trechoUpdate = corpo.slice(inicioUpdate, fimUpdate === -1 ? undefined : fimUpdate);
  // Se confirmadaPorId aparecer SEM condição, uma confirmação válida cai a cada resincronização —
  // e como listarCitacoesParaValidacao resincroniza a CADA abertura da tela, o advogado nunca
  // conseguiria terminar de confirmar.
  if (trechoUpdate.includes("confirmadaPorId")) {
    verdade(/\.\.\.\(\s*mudaramOsLinks\s*\?/.test(trechoUpdate),
      "o update zera confirmadaPorId sem condicionar à mudança dos links — toda resincronização apagaria confirmação válida, e a tela resincroniza a cada abertura");
  }
});

teste("HARD GATE: mudança nos LINKS derruba a confirmação — o \"li e revisei\" não pode responder por um link que ninguém abriu", () => {
  const corpo = codigoDe(corpoDaFuncao(FONTE_CITACOES, "sincronizarCitacoes"));
  verdade(/const mudaramOsLinks\s*=/.test(corpo),
    "sumiu a distinção entre mudou-a-forma-do-texto e mudaram-os-links — sem ela a confirmação sobrevive a uma troca de fonte");
  verdade(/existente\.fonteUrl !== item\.fonteUrl/.test(corpo) && /existente\.fonteSecundariaUrl !== item\.fonteSecundariaUrl/.test(corpo),
    "a comparação de links deixou de cobrir as DUAS fontes (a original e a secundária da dupla validação)");
  const inicioUpdate = corpo.indexOf("prisma.peticionamentoCitacao.update(");
  const fimUpdate = corpo.indexOf("})),", inicioUpdate);
  const trechoUpdate = corpo.slice(inicioUpdate, fimUpdate === -1 ? undefined : fimUpdate);
  verdade(/mudaramOsLinks\s*\?/.test(trechoUpdate),
    "o update não usa mudaramOsLinks — os links seriam trocados com a confirmação de pé");
  for (const campo of ["confirmadaPorId: null", "confirmadaEm: null", "hashDoTexto: null"]) {
    verdade(trechoUpdate.includes(campo),
      `a invalidação por troca de link não zera ${campo} — sobraria rastro de uma confirmação que já não vale`);
  }
});

// ── Clientes diferentes nunca se misturam ────────────────────────────────────────────────────

teste("HARD GATE: alternarVinculo valida o cliente ANTES de gravar qualquer vínculo novo", () => {
  const corpo = codigoDe(corpoDaFuncao(FONTE_ACOES, "alternarVinculo"));
  verdade(corpo.includes("validarNovoVinculo("), "deveria chamar validarNovoVinculo");
  const idxValidacao = corpo.indexOf("validarNovoVinculo(");
  const idxUpdate = corpo.lastIndexOf("prisma.peticionamentoSessao.update(");
  verdade(idxValidacao !== -1 && idxUpdate !== -1 && idxValidacao < idxUpdate, "a validação precisa vir ANTES da gravação do vínculo");
});

resumo("Peticionamento — varredura dos hard gates");
