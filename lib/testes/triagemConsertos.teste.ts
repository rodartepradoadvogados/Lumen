import { readFileSync } from "node:fs";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao, hrefsDeLinks } from "./executar";

// ============================================================================
// DOIS CONSERTOS PEQUENOS, RELATADOS PELO DONO COM O PRODUTO NA MÃO.
//
// 1) A LINHA DA FILA PRECISA ABRIR A CONVERSA — as três guias da Triagem (mais o celular)
//    ensinavam três coisas diferentes sobre o que é clicável numa linha de lista. Padronizamos
//    pelo que o celular (MobileAtendimentosCard) e o quadro do funil (QuadroDoFunil) já faziam:
//    a área de informação é o link, e o que precisa continuar fora dele (botão "Abrir", ações de
//    reverter/arquivar/ver a carta) fica como IRMÃO do link, nunca aninhado — link dentro de link
//    é HTML inválido e quebra de formas silenciosas, sem erro nenhum no console.
//
// 2) RENOMEAR O ASSUNTO PRECISA RENOMEAR A PASTA DO DRIVE — convertAttendanceToCase já faz isso
//    (best-effort, só quando já existe pasta, sem trocar o id). updateAttendanceSubject não fazia
//    nada, e a pasta ficava com o nome velho pra sempre. Aqui provamos que o mesmo cuidado foi
//    copiado: renomeia por ID (nunca cria pasta nova), nunca derruba a edição do assunto se o
//    Drive falhar, e nunca reescreve o driveFolderId.
// ============================================================================

/**
 * Devolve, para um par (abertura, fechamento) de tags JSX, o índice da primeira abertura e o da
 * primeira PRÓXIMA abertura que aparece antes do fechamento correspondente — usado para provar
 * que um <Link> não contém outro <Link> dentro. Não tenta parear chaves genéricas: com só duas
 * tags candidatas por arquivo (a linha inteira, e o botão/ação que tem de ficar fora), a primeira
 * abertura e o primeiro fechamento bastam para provar a NÃO-aninhação.
 */
function primeiroLinkNaoContemSegundo(fonte: string): boolean {
  const aberturas = [...fonte.matchAll(/<Link\b/g)].map((m) => m.index!);
  const fechamentos = [...fonte.matchAll(/<\/Link>/g)].map((m) => m.index!);
  verdade(aberturas.length >= 2, "esperava pelo menos dois <Link> na linha (a linha inteira + a ação que fica fora)");
  verdade(fechamentos.length >= 1, "não achou nenhum </Link> fechando");
  // O primeiro </Link> tem de fechar ANTES do segundo <Link> abrir — senão o segundo Link nasceu
  // dentro do primeiro.
  return fechamentos[0] < aberturas[1];
}

// ── GUIA 1 · FilaDeEspera ────────────────────────────────────────────────────

teste("a linha de 'Esperando resposta' inteira abre a conversa, e o botão Abrir fica fora do link", () => {
  const fonte = codigoDe(readFileSync("components/atendimento/FilaDeEspera.tsx", "utf8"));

  // DOIS ENDEREÇOS DERIVADOS DO MESMO REGISTRO, e IGUAIS ENTRE SI: um no link que envolve a linha
  // inteira, outro no botão "Abrir" que continua existindo. Um só significaria que a linha voltou a
  // ser um <div> inerte; dois diferentes, que o botão e a linha passaram a abrir coisas diferentes.
  //
  // A asserção olha a EXPRESSÃO do href, não a grafia dela (ver hrefsDeLinks em executar.ts). Esta
  // linha já foi `/atendimento/${q.id}` cru e hoje é hrefDaConversa(destino, q.id), porque a Central
  // de Atendimento abre a conversa na própria tela — uma asserção colada na grafia antiga teria
  // reprovado exatamente essa mudança, e não teria reprovado defeito nenhum.
  const hrefs = hrefsDeLinks(fonte).filter((h) => /\bq\.id\b/.test(h));
  igual(hrefs.length, 2, "esperava o link da linha inteira MAIS o link do botão Abrir, ambos derivados de q.id");
  igual(hrefs[0], hrefs[1], "o botão Abrir e a linha passaram a abrir endereços diferentes");

  verdade(primeiroLinkNaoContemSegundo(fonte), "o botão Abrir está aninhado dentro do link da linha — HTML inválido");

  // O botão continua existindo, com fronteira de palavra: `>AbrirTudo<` não devia passar aqui.
  verdade(/\bAbrir\b/.test(fonte), "o botão Abrir sumiu da tela");

  // Foco visível por teclado no link novo.
  verdade(fonte.includes("focus-visible:ring"), "o link da linha não tem foco visível por teclado");
});

// ── GUIA 3 · RecusadosParaAnalise ────────────────────────────────────────────

teste("a linha de 'Recusados' inteira abre a conversa, e as ações ficam fora do link", () => {
  // Decisão registrada: a guia 3 também virou linha inteira clicável, pela mesma razão de
  // coerência (padronizar pelo celular e pelo funil) — mas as ações (reverter/arquivar/ver a
  // carta) NÃO podem entrar no link, porque a MESMA linha tem botões que disparam ação (não
  // navegação), e um <button> dentro de um <a> também é inválido, além do link-dentro-de-link.
  const fonte = codigoDe(readFileSync("components/atendimento/RecusadosParaAnalise.tsx", "utf8"));

  // Mesma leitura por EXPRESSÃO da guia 1, e pelo mesmo motivo: o endereço da linha hoje é calculado
  // (hrefDaConversa), e o que tem de continuar verdadeiro é "um link só cobre a linha, e ele é
  // derivado do attendanceId". "Ver a recusa" também deriva do attendanceId, mas leva a OUTRO painel
  // — por isso sai da contagem pelo CALCULADOR que ele chama, não pela grafia do endereço.
  //
  // ESTAS DUAS LINHAS ERAM PRESAS À GRAFIA `aba=ficha` (o defeito 3 de executar.ts): separavam os
  // dois links pela rota antiga escrita à mão no componente, e uma delas exigia o literal
  // "aba=ficha&bloco=processo" dentro do arquivo. Quando a etapa 3 passou a CALCULAR o endereço da
  // recusa (hrefDaRecusa, para o ícone não tirar mais a pessoa da Central), as duas reprovariam a
  // correção e nenhuma reprovaria defeito. O que não pode mudar é isto: dois links, um por painel,
  // ambos derivados do id do registro, e nenhum dos dois com a rota embutida.
  const derivados = hrefsDeLinks(fonte).filter((h) => /\br\.attendanceId\b/.test(h));
  const hrefsDaLinha = derivados.filter((h) => h.includes("hrefDaConversa"));
  const hrefsDaRecusa = derivados.filter((h) => h.includes("hrefDaRecusa"));
  igual(derivados.length, 2, "esperava dois links derivados do attendanceId: a linha inteira e 'Ver a recusa'");
  igual(hrefsDaLinha.length, 1, "esperava um único link cobrindo a linha inteira (não mais um link só no nome)");

  // "Ver a recusa" é uma navegação diferente (o painel da recusa, e não a conversa) e continua sendo
  // o seu próprio link — mas tem de ficar FORA do link da linha, como irmão.
  igual(hrefsDaRecusa.length, 1, "o link 'Ver a recusa' sumiu, ou deixou de ser calculado por hrefDaRecusa");
  verdade(/aria-label="Ver a recusa"/.test(fonte), "o ícone perdeu o nome acessível 'Ver a recusa' — quem usa leitor de tela fica com um ícone muda na linha");
  verdade(primeiroLinkNaoContemSegundo(fonte), "um link ficou aninhado dentro do link da linha — HTML inválido");

  // Os botões de ação continuam existindo e fora do link (reverter/arquivar).
  verdade(fonte.includes("reverterRecusa(r.recusaId)"), "o botão de reverter sumiu");
  verdade(fonte.includes("arquivarRecusa(r.recusaId)"), "o botão de arquivar sumiu");

  verdade(fonte.includes("focus-visible:ring"), "o link da linha não tem foco visível por teclado");
});

// ── CONSERTO 2 · renomear o assunto renomeia a pasta do Drive ───────────────

const fonteAttendance = readFileSync("lib/actions/attendance.ts", "utf8");
const corpo = corpoDaFuncao(fonteAttendance, "updateAttendanceSubject");

teste("updateAttendanceSubject existe e tem corpo (varredura não engoliu o arquivo)", () => {
  verdade(corpo.length > 0, "corpoDaFuncao não achou updateAttendanceSubject");
  verdade(corpo.length < 2000, "o corpo veio grande demais — a varredura pode ter transbordado para a função seguinte");
});

teste("só renomeia a pasta quando ela já existe — nunca cria uma nova", () => {
  verdade(/if \(existing\.driveFolderId/.test(corpo), "a renomeação deixou de checar se a pasta já existe");
  verdade(corpo.includes("renameDriveFolder("), "parou de chamar renameDriveFolder");
  // getOrCreateAttendanceFolder é quem CRIA pasta (ver lib/googleDrive.ts) — não pode aparecer
  // aqui: editar o texto do assunto não é motivo para um atendimento ganhar pasta no Drive.
  verdade(!corpo.includes("getOrCreateAttendanceFolder"), "a edição do assunto passou a criar pasta no Drive");
});

teste("não renomeia à toa quando o nome novo é igual ao antigo", () => {
  verdade(corpo.includes("trimmed !== existing.subject"), "a chamada ao Drive deixou de comparar com o nome antigo");
});

teste("a renomeação é best-effort: falha do Drive não pode derrubar a edição do assunto", () => {
  const iTry = corpo.indexOf("try {");
  verdade(iTry >= 0, "a chamada ao Drive perdeu o try/catch");
  const iCatch = corpo.indexOf("catch", iTry);
  verdade(iCatch >= 0, "a chamada ao Drive perdeu o catch");
  // O bloco catch (comentários já removidos por codigoDe/corpoDaFuncao) tem de estar vazio —
  // nem relançar o erro, nem devolver `{ error }`. Ele fica entre o `catch {` e o primeiro `}`
  // que fecha na mesma coluna (o catch aqui não abre chave nova por dentro).
  const fechaCatch = corpo.indexOf("}", iCatch);
  const corpoDoCatch = corpo.slice(iCatch, fechaCatch);
  verdade(!corpoDoCatch.includes("throw"), "o catch relança o erro — uma falha do Drive derrubaria a edição do assunto");
  verdade(!corpoDoCatch.includes("return"), "o catch devolve erro — uma falha do Drive derrubaria a edição do assunto");

  // E depois do catch a função segue até o fim normal (revalida e devolve sucesso) — prova de que
  // o fluxo continua mesmo se o try acima tiver explodido.
  const depoisDoCatch = corpo.slice(fechaCatch);
  verdade(depoisDoCatch.includes('revalidatePath("/atendimento")'), "o fluxo não continua depois do catch");
  verdade(depoisDoCatch.includes("return {};"), "a função para de devolver sucesso no fim");
});

teste("nunca reescreve o driveFolderId — o id é o que amarra tudo no banco, só o nome muda", () => {
  // `select: { ..., driveFolderId: true }` é LEITURA, e tem de continuar existindo — é dele que
  // vem o id usado para renomear. O que não pode existir é uma ESCRITA: `data: { ..., driveFolderId`.
  verdade(corpo.includes("driveFolderId: true"), "a função parou de ler o driveFolderId existente");
  verdade(!/data:\s*\{[^}]*driveFolderId/.test(corpo), "o driveFolderId passou a ser reescrito no banco");
});

teste("segue o mesmo padrão de convertAttendanceToCase: best-effort e comentado", () => {
  // A conversão já resolvia isso — este conserto copia o padrão, não inventa um novo. Ver o
  // comentário ao lado do try/catch de lá.
  const conversao = corpoDaFuncao(fonteAttendance, "convertAttendanceToCase");
  verdade(conversao.includes("renameDriveFolder("), "convertAttendanceToCase não é mais a referência a seguir");
  verdade(conversao.includes("try {") && conversao.includes("catch"), "convertAttendanceToCase perdeu o próprio best-effort");
});

teste("o assunto é GRAVADO antes de a pasta ser renomeada", () => {
  // A ordem é a garantia. Renomear a pasta primeiro e gravar depois abre a janela em que o Drive
  // já tem o nome novo e o banco ainda tem o velho — e se a gravação falhar ali, a pasta fica
  // batizada com um assunto que o atendimento nunca teve. Do jeito certo, o pior caso é o oposto
  // e é o barato: o assunto corrigido e a pasta com o nome antigo até a próxima edição.
  const fonte = codigoDe(readFileSync("lib/actions/attendance.ts", "utf8"));
  const corpo = corpoDaFuncao(fonte, "updateAttendanceSubject");
  verdade(corpo.length > 0, "updateAttendanceSubject sumiu");

  const gravou = corpo.indexOf("prisma.attendance.update(");
  const renomeou = corpo.indexOf("renameDriveFolder(");
  verdade(gravou > 0, "o assunto deixou de ser gravado no banco");
  verdade(renomeou > 0, "a pasta deixou de ser renomeada");
  verdade(gravou < renomeou, "a pasta passou a ser renomeada ANTES de o assunto ser gravado");
});

teste("renameDriveFolder recebe o ID da pasta primeiro, e o nome novo depois", () => {
  // OS DOIS PARÂMETROS SÃO `string`, então trocar um pelo outro compila sem um pio: o TypeScript
  // não tem como saber que um é id e o outro é nome. Trocados, o Lúmen pediria ao Drive para
  // renomear uma pasta cujo "id" é o texto do assunto — não existe, a chamada falha, e o
  // best-effort engole o erro em silêncio. A renomeação simplesmente nunca aconteceria, e ninguém
  // veria nada. Esta asserção existe só para travar a ordem.
  const fonte = codigoDe(readFileSync("lib/actions/attendance.ts", "utf8"));
  const corpo = corpoDaFuncao(fonte, "updateAttendanceSubject");
  verdade(/renameDriveFolder\(\s*existing\.driveFolderId\s*,\s*trimmed\s*,/.test(corpo),
    "os argumentos de renameDriveFolder saíram da ordem (id da pasta, nome novo, escritório)");
});

resumo("Triagem: linha clicável e renomear a pasta do Drive junto com o assunto");
