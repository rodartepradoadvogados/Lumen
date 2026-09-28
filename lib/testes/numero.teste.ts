import { readFileSync } from "node:fs";
import { teste, igual, verdade, resumo } from "./executar";
import {
  casarContato,
  mesmoNumeroDaAgenda,
  enderecoDoContato,
  separarDdi,
  telefoneLegivel,
  podeCadastrarComo,
  TIPOS_PARA_CADASTRAR,
  type ContatoConhecido,
} from "@/lib/quemEEsteNumero";
import { telefoneDoAtendimento } from "@/lib/identificarNumero";

// ============================================================================
// QUEM É ESTE NÚMERO.
//
// Três coisas são provadas aqui, e a terceira é a que importa mais:
//
//   1. O casamento acha o contato apesar do nono dígito, e não acha quando não há quem achar.
//   2. A separação de DDI não inventa DDD (o caso "62999998888" lido como Indonésia).
//   3. A PRECEDÊNCIA: quando o mesmo número está em duas agendas, quem ganha é o advogado.
//      É a regra que evita responder a um adverso como se fosse lead, e é a única aqui cujo erro
//      não se desfaz depois.
// ============================================================================

const cliente: ContatoConhecido = { tipo: "cliente", id: "c1", nome: "Maria Souza", telefone: "+55 62 99999-8888" };
const advogado: ContatoConhecido = { tipo: "advogado", id: "a1", nome: "Dr. Alberto", telefone: "+55 62 99999-8888", detalhe: "Advogado adverso" };
const fornecedor: ContatoConhecido = { tipo: "fornecedor", id: "f1", nome: "Papelaria", telefone: "+55 11 3333-4444" };
const equipe: ContatoConhecido = { tipo: "equipe", id: "u1", nome: "Jairo", telefone: "+55 62 99999-8888", detalhe: "Sócio" };
const semTelefone: ContatoConhecido = { tipo: "cliente", id: "c9", nome: "Cadastro vazio", telefone: "" };

// ── 1. O CASAMENTO ──────────────────────────────────────────────────────────

teste("acha o cliente pelo número do WhatsApp, com DDI colado", () => {
  igual(casarContato([cliente], "556299998888")?.id, "c1");
});

teste("acha o cliente mesmo com o nono dígito de diferença", () => {
  // O cadastro tem 8 dígitos de assinante; o WhatsApp manda 9. É o caso que uma comparação de
  // string devolveria como desconhecido — e um cliente de cinco anos apareceria como lead novo.
  igual(casarContato([{ ...cliente, telefone: "+55 62 9999-8888" }], "5562999998888")?.id, "c1");
});

teste("acha o cliente cadastrado SEM código de país — o caso da maioria do banco", () => {
  // Medido no banco de homologação: `phoneDdi` é nulo em todos os clientes antigos, porque a coluna
  // nasceu depois. Se este caso não casar, o cruzamento com a agenda falha para quase todo mundo — e
  // falha calado: a tela oferece "cadastrar" um cliente que existe há dois anos.
  const antigo: ContatoConhecido = { tipo: "cliente", id: "c7", nome: "Carlos Eduardo", telefone: "(62) 99123-4567" };
  igual(casarContato([antigo], "5562991234567")?.id, "c7");
  igual(casarContato([antigo], "556291234567")?.id, "c7");
});

teste("a comparação da agenda vale nos dois sentidos, e não afrouxa demais", () => {
  igual(mesmoNumeroDaAgenda("62991234567", "5562991234567"), true);
  igual(mesmoNumeroDaAgenda("5562991234567", "62991234567"), true);
  igual(mesmoNumeroDaAgenda("6291234567", "5562991234567"), true);
  // Dois números nacionais diferentes continuam diferentes: acrescentar 55 aos dois lados não pode
  // transformar a comparação em "qualquer coisa casa".
  igual(mesmoNumeroDaAgenda("62991234567", "62991234568"), false);
  igual(mesmoNumeroDaAgenda("62991234567", "11991234567"), false);
  igual(mesmoNumeroDaAgenda("", "5562991234567"), false);
  igual(mesmoNumeroDaAgenda(null, null), false);
});

teste("DDD 55 não é confundido com código de país", () => {
  // Santa Maria, no Rio Grande do Sul, é DDD 55 — e há cadastros antigos com só o número, sem DDD
  // nenhum, de quando o escritório anotava telefone de recado. Uma comparação que TIRASSE o "55" da
  // frente para tentar casar faria o número de Santa Maria virar o telefone de recado de outra
  // pessoa. Acrescentar 55 é uma suposição segura; tirar não é, e é por isso que só se acrescenta.
  igual(mesmoNumeroDaAgenda("5599112345", "99112345"), false);
  igual(mesmoNumeroDaAgenda("99112345", "5599112345"), false);
});

teste("não acha ninguém quando o número não está na agenda", () => {
  igual(casarContato([cliente, fornecedor], "5511912345678"), null);
});

teste("sem número não acha ninguém, e não estoura", () => {
  igual(casarContato([cliente], null), null);
  igual(casarContato([cliente], ""), null);
  igual(casarContato([cliente], "   "), null);
});

teste("um cadastro sem telefone não reconhece todo mundo, e não derruba a tela", () => {
  // Duas armadilhas diferentes no mesmo lugar. A primeira é comparar "" com "" e dar igual, o que
  // faria o primeiro cadastro vazio da agenda ser a resposta para qualquer número que chegasse.
  igual(casarContato([semTelefone], "5562999998888"), null);
  // A segunda é o telefone NULO — que o tipo diz que não existe e o banco de um escritório com
  // dados antigos entrega de vez em quando. A defesa vive em somenteDigitos (`numero || ""`), e é
  // por isso que este caso passa por casarContato em vez de chamar mesmoNumero direto: o que se
  // prova aqui é que a página do atendimento NÃO vira erro 500 por causa de um cadastro sujo.
  const sujo = { tipo: "cliente" as const, id: "c8", nome: "Registro antigo", telefone: null as unknown as string };
  igual(casarContato([sujo, cliente], "5562999998888")?.id, "c1");
  igual(casarContato([sujo], "5562999998888"), null);
});

// ── 2. A PRECEDÊNCIA ────────────────────────────────────────────────────────

teste("o mesmo número em duas agendas: o advogado ganha do cliente", () => {
  igual(casarContato([cliente, advogado], "5562999998888")?.tipo, "advogado");
});

teste("a ordem em que os contatos chegam não muda quem ganha", () => {
  // Sem a precedência explícita, quem ganharia é quem o banco devolvesse primeiro — e isso muda
  // conforme a ordem das consultas, que é exatamente o tipo de coisa que quebra sem ninguém ver.
  igual(casarContato([advogado, cliente], "5562999998888")?.tipo, "advogado");
  igual(casarContato([cliente, advogado], "5562999998888")?.tipo, "advogado");
});

teste("advogado ganha de equipe, e equipe ganha de fornecedor", () => {
  igual(casarContato([equipe, advogado], "5562999998888")?.tipo, "advogado");
  igual(
    casarContato([{ ...fornecedor, telefone: "+55 62 99999-8888" }, equipe], "5562999998888")?.tipo,
    "equipe"
  );
});

// ── 3. O ENDEREÇO DA FICHA ──────────────────────────────────────────────────

teste("o cliente vai para a ficha; os outros, para a lista filtrada pelo nome", () => {
  igual(enderecoDoContato(cliente), "/contatos/clientes/c1");
  igual(enderecoDoContato(advogado), "/contatos/advogados?q=Dr.%20Alberto");
  igual(enderecoDoContato(fornecedor), "/contatos/fornecedores?q=Papelaria");
  igual(enderecoDoContato(equipe), "/contatos/equipe?q=Jairo");
});

teste("nome com & ou ? não quebra o link da lista", () => {
  igual(enderecoDoContato({ tipo: "fornecedor", id: "f2", nome: "Silva & Cia?" }), "/contatos/fornecedores?q=Silva%20%26%20Cia%3F");
});

teste("as três listas ligadas de fato leem o q da URL", () => {
  // Prova de que o link não mente: uma lista que ignora o `q` abriria inteira, e a pessoa acharia
  // que clicou no nome errado. A varredura é do código, porque é o código que precisa ter mudado.
  for (const lista of ["advogados", "fornecedores", "equipe"]) {
    const fonte = readFileSync(`app/(app)/contatos/${lista}/page.tsx`, "utf8");
    verdade(fonte.includes("searchParams.q"), `contatos/${lista} não lê searchParams.q`);
    verdade(fonte.includes('contains: q'), `contatos/${lista} não filtra pelo nome`);
    verdade(fonte.includes("FiltradoPorNome"), `contatos/${lista} filtra sem dizer que filtrou`);
  }
});

// ── 4. A SEPARAÇÃO DE DDI ───────────────────────────────────────────────────

teste("número brasileiro com DDI é partido em 55 + assinante", () => {
  igual(separarDdi("556299998888"), { ddi: "55", numero: "6299998888" });
  igual(separarDdi("5562999998888"), { ddi: "55", numero: "62999998888" });
  igual(separarDdi("+55 62 99999-8888"), { ddi: "55", numero: "62999998888" });
});

teste("número nacional sem DDI não vira estrangeiro", () => {
  // "62" é o DDI da Indonésia. Sem a regra de tamanho nacional, este número seria cadastrado como
  // indonésio com assinante de nove dígitos — plausível, existente, e errado.
  igual(separarDdi("62999998888"), { ddi: "", numero: "62999998888" });
  igual(separarDdi("6299998888"), { ddi: "", numero: "6299998888" });
});

teste("número estrangeiro de verdade é reconhecido pelo prefixo", () => {
  igual(separarDdi("351912345678"), { ddi: "351", numero: "912345678" });
});

teste("sem número, devolve vazio nos dois campos", () => {
  igual(separarDdi(null), { ddi: "", numero: "" });
  igual(separarDdi("abc"), { ddi: "", numero: "" });
});

teste("o número vira algo que gente reconhece", () => {
  igual(telefoneLegivel("5562991234567"), "+55 (62) 99123-4567");
  igual(telefoneLegivel("556232221000"), "+55 (62) 3222-1000");
  igual(telefoneLegivel("62991234567"), "(62) 99123-4567");
  igual(telefoneLegivel("(62) 99123-4567"), "(62) 99123-4567");
});

teste("o que não dá para formatar volta como veio, em vez de virar outro número", () => {
  // Um número estrangeiro cortado em blocos brasileiros seria ilegível E errado. Feio e certo
  // ganha de bonito e errado.
  igual(telefoneLegivel("351912345678"), "351912345678");
  igual(telefoneLegivel("12345"), "12345");
  igual(telefoneLegivel(null), "");
});

// ── 5. O TELEFONE DO ATENDIMENTO ────────────────────────────────────────────

teste("o número do WhatsApp ganha do que alguém digitou", () => {
  igual(telefoneDoAtendimento({ waPhone: "556299998888", contactPhone: "11 3333-4444", contactPhoneDdi: "55" }), "556299998888");
});

teste("sem WhatsApp, usa o digitado já com o DDI embutido", () => {
  igual(telefoneDoAtendimento({ waPhone: null, contactPhone: "62 99999-8888", contactPhoneDdi: "55" }), "+55 62 99999-8888");
});

teste("atendimento sem telefone nenhum devolve nulo", () => {
  igual(telefoneDoAtendimento({ waPhone: "", contactPhone: "   ", contactPhoneDdi: "55" }), null);
  igual(telefoneDoAtendimento({}), null);
});

// ── 6. O QUE A TELA OFERECE CADASTRAR ───────────────────────────────────────

teste("equipe não está entre os tipos que a conversa cadastra", () => {
  // Quem é da casa é cadastrado em Configurações, com papel e senha — não por um botão numa
  // conversa de WhatsApp.
  verdade(!TIPOS_PARA_CADASTRAR.includes("equipe" as never), "equipe não deveria ser cadastrável daqui");
  igual(podeCadastrarComo("equipe"), false);
  igual(podeCadastrarComo("cliente"), true);
  igual(podeCadastrarComo("advogado"), true);
  igual(podeCadastrarComo("fornecedor"), true);
  igual(podeCadastrarComo("qualquer-coisa"), false);
});

teste("a ação de cadastrar confere o acesso ao atendimento antes de criar", () => {
  // Um botão que cria cadastro no escritório sem passar pela mesma porta do resto do Atendimento
  // seria um caminho lateral para dentro dos dados — e a varredura existe para que ele não nasça
  // num refatoramento futuro.
  const fonte = readFileSync("lib/actions/contatoDoAtendimento.ts", "utf8");
  verdade(fonte.includes("if (!podeVerAtendimentos(viewer))"), "a ação não checa podeVerAtendimentos");
  verdade(fonte.includes("filtroDoAtendimento(viewer, viewer.id)"), "a ação não recorta pelo dono do atendimento");
  verdade(fonte.includes("if (!podeCadastrarComo(tipo))"), "a ação aceita tipo que a tela não oferece");
});

resumo("Quem é este número");
