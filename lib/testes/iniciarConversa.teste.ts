import { readFileSync } from "node:fs";
import { teste, verdade, resumo, corpoDaFuncao } from "./executar";

// ============================================================================
// INICIAR CONVERSA (F5.5, item 4) — "colocar para poder iniciar conversa, tanto no atendimento
// como em clientes, advogado, fornecedor". As ações vivem em lib/actions/attendance.ts e usam
// Prisma de ponta a ponta, então não cabem no corredor de teste de mesa sem banco — a prova aqui é
// a mesma desta casa para essas travas (ver lib/testes/funil.teste.ts e o comentário de
// lib/testes/executar.ts sobre corpoDaFuncao): ler o CORPO de cada função, sem comentário, ancorado
// em código que só existe ali dentro — nunca uma frase que também aparece na prosa do cabeçalho do
// arquivo, que é a armadilha desta casa.
// ============================================================================

const fonteAttendance = readFileSync("lib/actions/attendance.ts", "utf8");

teste("iniciarConversaComContato recusa advogado ADVERSO — não é atendimento, é a parte contrária", () => {
  const corpo = corpoDaFuncao(fonteAttendance, "iniciarConversaComContato");
  verdade(corpo.length > 0, "iniciarConversaComContato não foi encontrada");
  verdade(
    corpo.includes('if (l.side === "ADVERSO") return { error:'),
    "a função não recusa mais o advogado adverso no servidor",
  );
});

teste("buscarContatosParaConversa nunca devolve equipe nem advogado adverso", () => {
  const corpo = corpoDaFuncao(fonteAttendance, "buscarContatosParaConversa");
  verdade(corpo.length > 0, "buscarContatosParaConversa não foi encontrada");
  verdade(corpo.includes('c.tipo !== "equipe"'), "a busca voltou a incluir gente da equipe");
  verdade(corpo.includes("Advogado adverso"), "a busca parou de excluir o advogado adverso");
});

teste("iniciarConversaComContato busca telefone e nome NO CADASTRO — nunca aceita o que vier do formulário", () => {
  // A trava de isolamento por escritório (REGRA DA CASA): cliente/advogado/fornecedor são
  // consultados com officeId no where, e é de lá — não do parâmetro da função — que nome e
  // telefone saem. Ancorado nos três `findFirst`, um por tipo.
  const corpo = corpoDaFuncao(fonteAttendance, "iniciarConversaComContato");
  verdade(corpo.includes("prisma.client.findFirst({ where: { id: contatoId, officeId: viewer.officeId }"), "cliente não reconfere officeId");
  verdade(corpo.includes("prisma.lawyer.findFirst({ where: { id: contatoId, officeId: viewer.officeId }"), "advogado não reconfere officeId");
  verdade(corpo.includes("prisma.supplier.findFirst({ where: { id: contatoId, officeId: viewer.officeId }"), "fornecedor não reconfere officeId");
});

teste("iniciarOuRetomarConversa reaproveita conversa aberta em vez de duplicar", () => {
  const corpo = corpoDaFuncao(fonteAttendance, "iniciarOuRetomarConversa");
  verdade(corpo.length > 0, "iniciarOuRetomarConversa não foi encontrada");
  verdade(
    corpo.includes('where: { officeId, waPhone: numeroE164, status: { not: "ARQUIVADO" }, ...filtroDoAtendimento(viewer, viewer.id) }'),
    "parou de procurar uma conversa já aberta com este telefone antes de criar outra",
  );
});

teste("iniciarOuRetomarConversa reconfere o recorte por dono — não escreve em conversa alheia", () => {
  // REGRA DA CASA: quem só vê os próprios atendimentos não pode agir sobre o que não poderia
  // listar. Sem isto, bastaria acertar o telefone de um cliente de outro colega para mandar
  // mensagem na conversa dele. A segunda consulta (sem recorte) existe só para dar um ERRO
  // explicando o que houve, nunca para agir sobre a conversa achada por ela.
  const corpo = corpoDaFuncao(fonteAttendance, "iniciarOuRetomarConversa");
  verdade(corpo.includes("...filtroDoAtendimento(viewer, viewer.id)"), "a busca da conversa existente perdeu o recorte por dono");
  verdade(
    corpo.includes("Já existe uma conversa com este número, mas você não tem acesso a ela"),
    "sumiu o aviso de conversa existente fora do alcance de quem pediu",
  );
});

teste("iniciarOuRetomarConversa devolve o id do atendimento mesmo quando o envio falha", () => {
  // "O ATENDIMENTO NUNCA SE PERDE" — sem isto, uma falha de envio (ex.: janela de 24h da Meta)
  // deixaria quem tentou sem como reabrir a conversa e tentar de novo.
  const corpo = corpoDaFuncao(fonteAttendance, "iniciarOuRetomarConversa");
  verdade(
    corpo.includes("return { error: envio.error || \"Não foi possível enviar a mensagem.\", id: attendanceId"),
    "o retorno de erro parou de incluir o id do atendimento já criado",
  );
});

teste("a lista de Advogados só oferece \"iniciar conversa\" para PARCEIRO com telefone", () => {
  const fonte = readFileSync("app/(app)/contatos/advogados/page.tsx", "utf8");
  verdade(
    fonte.includes('l.side === "PARCEIRO" && l.phone && <IniciarConversaContatoButton'),
    'a tela de Advogados parou de exigir side === "PARCEIRO" e telefone antes de oferecer o botão',
  );
});

resumo("iniciar conversa (F5.5)");
