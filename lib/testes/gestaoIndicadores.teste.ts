import { teste, igual, verdade, resumo } from "./executar";
import { hojeCalendario, diasEntre, situacaoDoPrazo } from "@/lib/gestao/dias";
import { agregarCarga, ordenarCarga } from "@/lib/gestao/cargaCalculo";
import { agruparInadimplencia } from "@/lib/gestao/inadimplencia";
import { montarFechamento } from "@/lib/gestao/fecharMes";
import { descreverExecucao, traduzirHttp, resumirSaude, ordenarFalhasPrimeiro } from "@/lib/gestao/saudeIntegracoes";
import { conversaoDosDecididos, propostasParadas } from "@/lib/gestao/funil";
import { resumirSemTriagem } from "@/lib/gestao/semTriagem";
import { ultimosMeses, mediana, agregarCaixa, resumirCaixa } from "@/lib/gestao/receitaEResultado";
import { pontosPorPessoa, tabelaDePontos, comoSeCalculamOsPontos } from "@/lib/gestao/pontos";

// Indicadores da Gestão (PR gestao-redesenho): a régua de datas, a carga por pessoa, a
// inadimplência por cliente, o fechamento do mês, a tradução do log de integrações e o funil.

const utc = (s: string) => new Date(`${s}T00:00:00Z`);

teste("hoje é o dia de Brasília, mesmo quando o UTC já virou o dia (22h de segunda em Brasília = terça em UTC)", () => {
  const segunda22h = new Date("2026-09-29T01:30:00Z"); // 28/09 22:30 em Brasília
  igual(hojeCalendario(segunda22h).toISOString(), "2026-09-28T00:00:00.000Z");
  const meioDia = new Date("2026-09-29T15:00:00Z"); // 29/09 12:00
  igual(hojeCalendario(meioDia).toISOString(), "2026-09-29T00:00:00.000Z");
});

teste("prazo de hoje NÃO é atrasado; ontem é; sete dias à frente ainda está na janela; oito não", () => {
  const hoje = utc("2026-09-29");
  igual(situacaoDoPrazo(utc("2026-09-29"), hoje), "vence-na-janela");
  igual(situacaoDoPrazo(utc("2026-09-28"), hoje), "atrasado");
  igual(situacaoDoPrazo(utc("2026-10-06"), hoje), "vence-na-janela");
  igual(situacaoDoPrazo(utc("2026-10-07"), hoje), "adiante");
  igual(diasEntre(utc("2026-09-01"), utc("2026-09-29")), 28);
});

teste("carga: conta abertas, atrasadas, janela de 7 dias, sem triagem e feitas no mês por pessoa", () => {
  const hoje = utc("2026-09-29");
  const linhas = agregarCarga({
    pessoas: [{ id: "a", name: "Ana" }, { id: "b", name: "Bruno" }],
    abertas: [
      { responsibleId: "a", status: "PENDENTE", dueDate: utc("2026-09-20") },
      { responsibleId: "a", status: "EM_ANDAMENTO", dueDate: utc("2026-10-01") },
      { responsibleId: "a", status: "PENDENTE", dueDate: utc("2026-12-01") },
      { responsibleId: "b", status: "PENDENTE", dueDate: utc("2026-09-29") },
      { responsibleId: "b", status: "CONCLUIDO", dueDate: utc("2026-09-01") }, // concluída não é aberta
      { responsibleId: "zzz", status: "PENDENTE", dueDate: utc("2026-09-01") }, // fora da lista de pessoas
      { responsibleId: null, status: "PENDENTE", dueDate: utc("2026-09-01") },
    ],
    publicacoesSemTriagem: [{ assignedToId: "a" }, { assignedToId: "a" }, { assignedToId: null }],
    concluidasNoMes: [{ responsibleId: "b" }, { responsibleId: "b" }, { responsibleId: null }],
    hoje,
  });
  const a = linhas.find((l) => l.userId === "a")!;
  const b = linhas.find((l) => l.userId === "b")!;
  igual([a.abertas, a.atrasadas, a.vencemEm7, a.semTriagem, a.feitasNoMes], [3, 1, 1, 2, 0]);
  igual([b.abertas, b.atrasadas, b.vencemEm7, b.semTriagem, b.feitasNoMes], [1, 0, 1, 0, 2]);
});

teste("ordenar a carga põe o maior primeiro e desempata pelas atrasadas", () => {
  const base = { semTriagem: 0, feitasNoMes: 0, vencemEm7: 0 };
  const o = ordenarCarga(
    [
      { userId: "1", nome: "A", abertas: 5, atrasadas: 1, ...base },
      { userId: "2", nome: "B", abertas: 5, atrasadas: 3, ...base },
      { userId: "3", nome: "C", abertas: 9, atrasadas: 0, ...base },
    ],
    "abertas"
  );
  igual(o.map((l) => l.userId), ["3", "2", "1"]);
});

teste("inadimplência agrupa por cliente, soma o saldo, ignora saldo zero e calcula o maior atraso", () => {
  const hoje = utc("2026-09-29");
  const r = agruparInadimplencia(
    [
      { id: "1", clientId: "c1", clientName: "Cliente Um", payerName: null, dueDate: utc("2026-08-30"), saldo: 1000 },
      { id: "2", clientId: "c1", clientName: "Cliente Um", payerName: null, dueDate: utc("2026-09-10"), saldo: 500.5 },
      { id: "3", clientId: "c2", clientName: "Cliente Dois", payerName: null, dueDate: utc("2026-09-28"), saldo: 200 },
      { id: "4", clientId: "c3", clientName: "Quitado", payerName: null, dueDate: utc("2026-09-01"), saldo: 0 },
      { id: "5", clientId: null, clientName: null, payerName: "Parte adversa", dueDate: utc("2026-09-01"), saldo: 50 },
    ],
    hoje
  );
  igual(r.contas, 4);
  igual(Math.round(r.total * 100) / 100, 1750.5);
  igual(r.devedores.map((d) => d.nome), ["Cliente Um", "Cliente Dois", "Parte adversa"]);
  igual(r.devedores[0].diasDeAtraso, 30);
  igual(r.devedores[0].contas, 2);
});

teste("fechar o mês: sem acesso ao financeiro o item de lançamentos NÃO aparece; com acesso, aparece", () => {
  const sem = montarFechamento({ publicacoesSemTriagem: 46, tarefasSemResponsavel: 1, lancamentosSemCategoria: null });
  igual(sem.map((i) => i.chave), ["publicacoes", "tarefas"]);
  igual(sem[1].rotulo, "tarefa sem responsável");
  const com = montarFechamento({ publicacoesSemTriagem: 0, tarefasSemResponsavel: 7, lancamentosSemCategoria: 12 });
  igual(com.map((i) => i.chave), ["publicacoes", "tarefas", "lancamentos"]);
  igual(com[2].quantidade, 12);
});

teste("log: o código HTTP vira frase com consequência, e falha sem detalhe não some", () => {
  verdade(/não respondeu/.test(traduzirHttp(503)!), "503 sem tradução");
  verdade(/recusou o acesso/.test(traduzirHttp(401)!), "401 sem tradução");
  igual(traduzirHttp(200), null);
  igual(descreverExecucao({ status: "OK", httpStatus: 200, itemCount: 0, message: null }), "consultou e não havia novidade");
  igual(descreverExecucao({ status: "OK", httpStatus: 200, itemCount: 1, message: null }), "trouxe 1 item novo");
  igual(descreverExecucao({ status: "OK", httpStatus: 200, itemCount: 12, message: null }), "trouxe 12 itens novos");
  verdade(/tribunal não respondeu/.test(descreverExecucao({ status: "ERRO", httpStatus: 503, itemCount: null, message: "Service Unavailable" })), "erro 503 mal descrito");
  igual(descreverExecucao({ status: "ERRO", httpStatus: null, itemCount: null, message: null }), "falhou sem detalhe registrado");
});

teste("saúde: o cabeçalho conta as falhas (nunca '0 exigem atenção' ao lado de um erro) e as falhas vêm primeiro", () => {
  igual(resumirSaude([{ status: "OK" }, { status: "ERRO" }, { status: "ERRO" }], "nos últimos 7 dias").texto, "2 falhas nos últimos 7 dias");
  igual(resumirSaude([{ status: "OK" }, { status: "AVISO" }], "nos últimos 7 dias").texto, "1 aviso nos últimos 7 dias");
  igual(resumirSaude([{ status: "OK" }], "nos últimos 7 dias").texto, "Tudo em ordem");
  const o = ordenarFalhasPrimeiro([
    { status: "OK", startedAt: "2026-09-29T10:00:00Z" },
    { status: "ERRO", startedAt: "2026-09-27T10:00:00Z" },
    { status: "OK", startedAt: "2026-09-28T10:00:00Z" },
    { status: "ERRO", startedAt: "2026-09-28T09:00:00Z" },
  ]);
  igual(o.map((r) => r.status + r.startedAt.slice(8, 10)), ["ERRO28", "ERRO27", "OK29", "OK28"]);
});

teste("funil: conversão só dos decididos, com o n; sem decididos não inventa percentual", () => {
  igual(conversaoDosDecididos(6, 3), { percentual: 67, decididos: 9 });
  igual(conversaoDosDecididos(0, 0), { percentual: null, decididos: 0 });
  const agora = new Date("2026-09-29T12:00:00Z");
  igual(
    propostasParadas(
      [
        { stageChangedAt: new Date("2026-09-10T12:00:00Z"), createdAt: new Date("2026-08-01T12:00:00Z") },
        { stageChangedAt: new Date("2026-09-25T12:00:00Z"), createdAt: new Date("2026-08-01T12:00:00Z") },
        { stageChangedAt: null, createdAt: new Date("2026-09-01T12:00:00Z") },
      ],
      agora
    ),
    2
  );
});

teste("sem triagem: uma definição, com a idade da mais antiga em dias de Brasília", () => {
  const hoje = utc("2026-09-29");
  const r = resumirSemTriagem([{ publishedAt: new Date("2026-06-20T15:00:00Z") }, { publishedAt: new Date("2026-09-01T15:00:00Z") }], hoje);
  igual(r.total, 2);
  igual(r.diasDaMaisAntiga, 101);
  igual(resumirSemTriagem([], hoje), { total: 0, maisAntigaEm: null, diasDaMaisAntiga: null });
});

teste("pontos: soma por responsável, ignora sem responsável, tabela lida do banco e padrão 10", () => {
  const m = pontosPorPessoa([
    { responsibleId: "a", points: 30 },
    { responsibleId: "a", points: 10 },
    { responsibleId: null, points: 99 },
    { responsibleId: "b", points: 20 },
  ]);
  igual(m.get("a"), { pontos: 40, tarefas: 2 });
  igual(m.get("b"), { pontos: 20, tarefas: 1 });
  igual(m.size, 2);
  igual(tabelaDePontos([{ type: "PRAZO", points: 30 }]), ["Tarefa 10", "Evento 10", "Audiência 10", "Perícia 10", "Prazo 30"]);
  verdade(comoSeCalculamOsPontos([{ type: "PRAZO", points: 30 }]).includes("Prazo 30"), "frase sem a tabela");
});

teste("caixa: meses em Brasília, mediana, variação contra o período anterior e aviso de pico", () => {
  const meses = ultimosMeses(new Date("2026-09-29T15:00:00Z"), 24);
  igual([meses.length, meses[23].chave, meses[0].chave, meses[23].rotulo], [24, "2026-09", "2024-10", "set/26"]);
  igual(mediana([1, 9, 3]), 3);
  igual(mediana([1, 2, 3, 4]), 2.5);
  // 1º de setembro às 01h UTC ainda é agosto em Brasília
  const caixa = agregarCaixa([{ paidDate: new Date("2026-09-01T01:00:00Z"), valor: 100 }], [], meses);
  igual(caixa.find((m) => m.chave === "2026-08")!.recebido, 100);
  igual(caixa.find((m) => m.chave === "2026-09")!.recebido, 0);
  // série plana de 100, com pico de 1000 em jan/26 e setembro fraco
  const serie = meses.map((m) => ({ ...m, recebido: m.chave === "2026-01" ? 1000 : m.chave === "2026-09" ? 40 : 100, pago: 30 }));
  const r = resumirCaixa(serie, 1);
  igual(r.periodo.recebido, 40);
  igual(r.variacaoDoRecebido, -60);
  igual(r.pico?.rotulo, "jan/26");
  igual(resumirCaixa(serie, 12).variacaoDoRecebido, null);
  igual(resumirCaixa(serie, 1).serie.length, 6);
});

resumo("Gestão — indicadores");
