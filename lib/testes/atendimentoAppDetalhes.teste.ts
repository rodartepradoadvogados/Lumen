import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe } from "./executar";
import { fraseDoPrazo, resumoDoAtendimento, agruparPorColuna, lerValorEmReais, valorParaCampo, anotacaoParaTexto, enderecoSeguroDoAnexo, origemDoAnexo, diaValido } from "@/lib/detalhesDoAtendimento";
import { validarConversao, revisaoDaConversao, OPCOES_DO_APLICATIVO, OPCOES_DO_SITE, numeroParaGravar } from "@/lib/conversaoEmProcesso";
import { lerTriagem, gravarTriagem, acrescentarFato, confirmarItem, corrigirFato, removerFato, propostaPedeDecisao, manterProposta, reabrirProposta, rotuloDaOrigem } from "@/lib/triagemApurada";

const raiz = join(__dirname, "..", "..");
const quem = { nome: "Helena" };
const agora = new Date("2026-09-29T12:00:00Z");

teste("prazo em português: vencido, hoje, amanhã, futuro", () => {
  igual(fraseDoPrazo("2026-09-28", "2026-09-29"), { texto: "venceu ontem", tom: "vencido" });
  igual(fraseDoPrazo("2026-09-26", "2026-09-29")?.texto, "venceu há 3 dias");
  igual(fraseDoPrazo("2026-09-29", "2026-09-29")?.tom, "hoje");
  igual(fraseDoPrazo("2026-09-30", "2026-09-29")?.texto, "vence amanhã");
  igual(fraseDoPrazo(null, "2026-09-29"), null);
});

teste("resumo de uma linha: só o que existe", () => {
  igual(resumoDoAtendimento({ area: "Sucessões", stage: "PROPOSTA", estimatedValue: 4800, prazosAbertos: ["2026-09-28", null, "2026-10-05"], hoje: "2026-09-29" }).replace(/\s/g, " "), "Sucessões · Proposta · R$ 4.800,00 · 3 pendências abertas · a próxima venceu ontem".replace(/\s/g, " "));
  igual(resumoDoAtendimento({ area: null, stage: "NOVO", estimatedValue: null, prazosAbertos: [], hoje: "2026-09-29" }), "Novo · sem pendências");
});

teste("colunas reais: tarefa sem coluna ou em coluna extinta cai na primeira", () => {
  const cols = [{ id: "a", name: "A", isDoneCol: false }, { id: "b", name: "B", isDoneCol: true }];
  const g = agruparPorColuna(cols, [{ columnId: "b" }, { columnId: null }, { columnId: "x" }]);
  igual(g.get("a")!.length, 2);
  igual(g.get("b")!.length, 1);
});

teste("valor em reais digitado no celular", () => {
  igual(lerValorEmReais("R$ 4.800,50"), 4800.5);
  igual(lerValorEmReais("4.800"), 4800);
  igual(lerValorEmReais("4800.5"), 4800.5);
  igual(lerValorEmReais(""), null);
  igual(lerValorEmReais("abc"), "invalido");
  igual(lerValorEmReais("-5"), "invalido");
  igual(valorParaCampo(null), "");
  verdade(diaValido("2026-02-28") && !diaValido("2026-02-30") && !diaValido("28/02/2026"), "dia de calendário");
});

teste("anexo: só http(s) abre; o resto é 'link indisponível'", () => {
  verdade(enderecoSeguroDoAnexo("https://drive.google.com/file/d/x/view") !== null, "https");
  igual(enderecoSeguroDoAnexo("javascript:alert(1)"), null);
  igual(enderecoSeguroDoAnexo("data:text/html,x"), null);
  igual(enderecoSeguroDoAnexo("/relativo"), null);
  igual(origemDoAnexo("https://drive.google.com/x"), "Google Drive");
  igual(origemDoAnexo("javascript:1"), "link indisponível");
});

teste("anotação: HTML vira texto e avisa da formatação", () => {
  igual(anotacaoParaTexto("<p>Oi</p><p>Tchau &amp; até</p>"), { texto: "Oi\nTchau & até", temFormatacao: false });
  igual(anotacaoParaTexto("<p><strong>x</strong></p>").temFormatacao, true);
});

teste("conversão: as travas (já convertido, recusado, nome temporário, CNJ)", () => {
  const base = { tipo: "CASO" as const, nomeDoContato: "Maria", status: "EM_TRIAGEM", convertedCaseId: null };
  igual(validarConversao(base, OPCOES_DO_APLICATIVO), null);
  verdade(/já virou/.test(validarConversao({ ...base, convertedCaseId: "c1" }, OPCOES_DO_SITE) ?? ""), "site também trava o duplo clique");
  verdade(/já virou/.test(validarConversao({ ...base, status: "CONVERTIDO" }, OPCOES_DO_SITE) ?? ""), "status convertido");
  verdade(/recusado/.test(validarConversao({ ...base, status: "RECUSADO" }, OPCOES_DO_APLICATIVO) ?? ""), "recusado trava no app");
  igual(validarConversao({ ...base, status: "RECUSADO" }, OPCOES_DO_SITE), null);
  verdade(/temporário/.test(validarConversao({ ...base, nomeDoContato: "Novo contato (+55 62 99999-0002)" }, OPCOES_DO_APLICATIVO) ?? ""), "nome temporário");
  igual(validarConversao({ ...base, nomeDoContato: "Novo contato (x)" }, OPCOES_DO_SITE), null);
  const j = { ...base, tipo: "JUDICIAL" as const };
  verdade(/número/.test(validarConversao(j, OPCOES_DO_APLICATIVO) ?? ""), "judicial sem número");
  verdade(/dígito/.test(validarConversao({ ...j, numero: "1234567-00.2026.8.09.0051" }, OPCOES_DO_APLICATIVO) ?? ""), "CNJ com DV errado");
  igual(validarConversao({ ...j, numero: "0012345-08.2026.8.09.0051" }, OPCOES_DO_APLICATIVO), null);
  igual(validarConversao({ ...j, numero: "qualquer" }, OPCOES_DO_SITE), null);
  igual(numeroParaGravar("00123450820268090051"), "0012345-08.2026.8.09.0051");
});

teste("revisão da conversão diz o que cria, o que leva, o que NÃO copia e que não desfaz", () => {
  const r = revisaoDaConversao({ tipo: "CASO", numero: null, vara: null, assunto: "Inventário", nomeDoContato: "Paulo", cliente: "novo", materia: "Sucessões", responsavel: "Helena", temRelato: true, anexos: 2, temPastaNoDrive: true, anotacoesDoUsuario: 1, pendenciasAbertas: 3, tarefasAbertas: 1, honorario: { valor: 1000, modo: "DINHEIRO" } });
  const t = r.map((i) => i.texto).join("\n");
  verdade(/Cria o caso com título “Inventário”/.test(t) && /Cria o cliente “Paulo”/.test(t) && /2 anexos passam/.test(t) && /pasta do Drive/.test(t), "criado e levado");
  verdade(/1 anotação sua continua/.test(t) && /não são copiadas/.test(t), "anotações não copiadas");
  verdade(/3 pendências abertas, 1 tarefa aberta/.test(t), "o que fica");
  igual(r[r.length - 1].tom, "nao-desfaz");
});

teste("triagem: acrescentar, confirmar, corrigir, remover e preservar outras chaves do metadata", () => {
  let t = lerTriagem({ anaResponde: true });
  t = acrescentarFato(t, { id: "f1", rotulo: " Data ", valor: " 12/03 " }, quem, agora);
  igual(t.fatos[0], { id: "f1", rotulo: "Data", valor: "12/03", estado: "PESSOA", por: "Helena", em: agora.toISOString() });
  t = confirmarItem(t, { fatoId: "f1" }, quem, agora)!;
  igual(t.fatos[0].estado, "CONFIRMADO");
  t = confirmarItem(t, { campo: "area" }, quem, agora)!;
  igual(t.carimbos.area?.estado, "CONFIRMADO");
  t = corrigirFato(t, "f1", "13/03", quem, agora)!;
  igual(t.fatos[0].estado, "CORRIGIDO");
  igual(confirmarItem(t, { fatoId: "nao" }, quem, agora), null);
  const meta = gravarTriagem({ anaResponde: true, outra: 1 }, t) as Record<string, unknown>;
  igual(meta.anaResponde, true);
  igual(lerTriagem(meta).fatos.length, 1);
  igual(removerFato(t, "f1")!.fatos.length, 0);
  let erro = "";
  try { acrescentarFato(t, { id: "x", rotulo: "", valor: "a" }, quem, agora); } catch (e) { erro = (e as Error).message; }
  verdade(/Diga o que é/.test(erro), "rótulo vazio");
});

teste("triagem: lixo no Json é descartado; sem carimbo é 'Da triagem' (não finge Ana)", () => {
  igual(lerTriagem("x"), { carimbos: {}, fatos: [] });
  igual(lerTriagem({ triagem: { fatos: [{ id: 1 }, "a"], carimbos: { area: { estado: "X" } } } }), { carimbos: {}, fatos: [] });
  igual(rotuloDaOrigem(null), "Da triagem");
  igual(rotuloDaOrigem("PESSOA", "Ana"), "Anotado por Ana");
});

teste("proposta de recusa: 'manter' esconde sem apagar; nova proposta reabre", () => {
  const t0 = lerTriagem(null);
  verdade(propostaPedeDecisao(t0, "texto", "2026-09-29T10:00:00Z"), "pede decisão");
  igual(propostaPedeDecisao(t0, null, null), false);
  const t1 = manterProposta(t0, "2026-09-29T10:00:00Z", quem, agora);
  igual(propostaPedeDecisao(t1, "texto", "2026-09-29T10:00:00Z"), false);
  verdade(propostaPedeDecisao(t1, "outra", "2026-09-30T10:00:00Z"), "proposta nova volta");
  verdade(propostaPedeDecisao(reabrirProposta(t1), "texto", "2026-09-29T10:00:00Z"), "reabrir");
});

// ── varredura: toda ação nova passa pela porta do Atendimento ────────────────
teste("ações da aba Detalhes: cada função exportada abre pela porta com recorte, antes de ler o corpo", () => {
  const src = codigoDe(readFileSync(join(raiz, "lib/actions/detalhesDoAtendimento.ts"), "utf8"));
  verdade(src.includes("atendimentoDaAcao"), "usa a porta");
  verdade(!/officeId:\s*viewer\.officeId\s*,?\s*(id|attendanceId)/.test(src) || src.includes("whereDeUmAtendimento"), "recorte");
  const funcoes = [...src.matchAll(/export async function (\w+)\(([\s\S]*?)\n\}\n/g)];
  verdade(funcoes.length >= 14, "achou as ações: " + funcoes.length);
  for (const f of funcoes) {
    const corpo = f[0];
    const porta = /atendimentoDaAcao\(|tarefaDoAtendimento\(|gravarNaTriagem\(/.test(corpo);
    verdade(porta, `${f[1]} não passa pela porta do Atendimento`);
  }
  verdade(!/prisma\.attendance\.(findFirst|findUnique|update|updateMany)\(\{\s*where:\s*\{\s*id/.test(src), "nenhuma consulta de Attendance só por id");
});

teste("tarefas do atendimento: o atendimento entra no WHERE (tarefa de outro lead não é esta)", () => {
  const src = codigoDe(readFileSync(join(raiz, "lib/actions/detalhesDoAtendimento.ts"), "utf8"));
  verdade(/task\.findFirst\(\{ where: \{ id: tarefaId, officeId: r\.viewer\.officeId, attendanceId: id \}/.test(src), "findFirst da tarefa");
  verdade((src.match(/task\.updateMany\(\{\s*where: \{ id: tarefaId, officeId: (r\.)?viewer\.officeId, attendanceId: id \}/g) ?? []).length >= 3, "updateMany com attendanceId");
  const tasks = codigoDe(readFileSync(join(raiz, "lib/actions/tasks.ts"), "utf8"));
  verdade(/whereDoAtendimento\(viewer\)/.test(tasks), "createTask confere o recorte do atendimento");
});

teste("anotação: editar e excluir conferem autor e recorte do atendimento", () => {
  const src = codigoDe(readFileSync(join(raiz, "lib/actions/anotacoes.ts"), "utf8"));
  verdade(/export async function updateAnotacao/.test(src), "updateAnotacao existe");
  verdade((src.match(/podeMexerNaAnotacaoDoAtendimento\(/g) ?? []).length >= 3, "delete e update usam a checagem");
  verdade(/authorId: viewer\.id/.test(src), "autor");
});

teste("a página Detalhes barra pelo recorte e as telas do app não desenham HTML cru de anexo", () => {
  const pag = readFileSync(join(raiz, "app/atendimento-app/(shell)/[id]/detalhes/page.tsx"), "utf8");
  verdade(pag.includes("exigirAcessoAoAtendimentoNaTela") && pag.includes("whereDeUmAtendimento"), "porta e recorte");
  verdade(/anotacoes: \{ where: \{ authorId: viewer\.id \}/.test(pag), "só as anotações do usuário");
  const dir = join(raiz, "components/atendimento-app/detalhes");
  for (const n of readdirSync(dir)) {
    const c = readFileSync(join(dir, n), "utf8");
    verdade(!/window\.confirm|alert\(/.test(c), `${n} usa confirm/alert nativo`);
    verdade(!/text-\[\d+px\]/.test(c), `${n} usa tamanho de fonte arbitrário`);
  }
});

resumo("atendimento app: aba Detalhes");
