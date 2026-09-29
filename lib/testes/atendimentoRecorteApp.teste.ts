import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe } from "./executar";
import { whereDoAtendimento, whereDeUmAtendimento, nivelDeAcessoAoAtendimento } from "@/lib/acessoAtendimento";

// ============================================================================
// O APLICATIVO DE ATENDIMENTO E A API TÊM O MESMO RECORTE DA CENTRAL.
//
// Antes: app/atendimento-app/** e app/api/atendimento/** filtravam só por officeId — quem não tinha
// acesso ao Atendimento (ou só devia ver os próprios leads) lia e alterava a conversa de qualquer
// lead do escritório. Aqui: (1) o `where` que essas telas usam, nos níveis reais; (2) uma varredura
// do código que falha se uma consulta de Attendance nova aparecer nesses caminhos sem o recorte.
// ============================================================================

const total = { id: "u-adm", officeId: "of-1", isAdmin: true, role: "Sócio", recebeTransferencia: true };
const recepcao = { id: "u-rec", officeId: "of-1", isAdmin: false, role: "Recepcionista/Secretária", recebeTransferencia: false };
const advNaEscala = { id: "u-adv", officeId: "of-1", isAdmin: false, role: "Advogado", recebeTransferencia: true };
const advFora = { id: "u-fora", officeId: "of-1", isAdmin: false, role: "Advogado", recebeTransferencia: false };
const financeiro = { id: "u-fin", officeId: "of-1", isAdmin: false, role: "Financeiro", recebeTransferencia: false };
const semPapel = { id: "u-x", officeId: "of-1", isAdmin: false, role: null, recebeTransferencia: null };

teste("nível total: só o escritório entra no where (vê todos os leads)", () => {
  igual(whereDoAtendimento(total), { officeId: "of-1" });
  igual(whereDoAtendimento(recepcao), { officeId: "of-1" });
});

teste("nível próprios: escritório + responsável = ele mesmo", () => {
  igual(whereDoAtendimento(advNaEscala), { officeId: "of-1", responsibleId: "u-adv" });
});

teste("sem acesso: where IMPOSSÍVEL, nunca vazio (falha fechada)", () => {
  for (const v of [advFora, financeiro, semPapel]) {
    igual(nivelDeAcessoAoAtendimento(v), "nenhum");
    const w = whereDoAtendimento(v);
    igual(w.officeId, "of-1");
    igual(w.responsibleId, "__sem-acesso__");
    verdade(w.responsibleId !== v.id, "não pode casar com o próprio id");
  }
});

teste("um atendimento pelo id: o id da URL nunca substitui o escritório nem o dono", () => {
  igual(whereDeUmAtendimento(advNaEscala, "att-9"), { id: "att-9", officeId: "of-1", responsibleId: "u-adv" });
  igual(whereDeUmAtendimento(total, "att-9"), { id: "att-9", officeId: "of-1" });
  // outro escritório: o officeId é o de quem pede, não o do lead
  igual(whereDeUmAtendimento({ ...total, officeId: "of-2" }, "att-9").officeId, "of-2");
});

// ── Varredura do código ──────────────────────────────────────────────────────────────────────

function arquivos(dir: string, acc: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) arquivos(p, acc);
    else if (/\.(ts|tsx)$/.test(n)) acc.push(p);
  }
  return acc;
}
const raiz = join(__dirname, "..", "..");

teste("app/atendimento-app e app/api/atendimento: toda consulta de Attendance carrega o recorte", () => {
  const alvos = [...arquivos(join(raiz, "app/atendimento-app")), ...arquivos(join(raiz, "app/api/atendimento"))];
  let achou = 0;
  for (const f of alvos) {
    const codigo = codigoDe(readFileSync(f, "utf8"));
    if (!/prisma\.attendance\./.test(codigo)) continue;
    achou++;
    verdade(/whereDoAtendimento|whereDeUmAtendimento|atendimentoDaRota/.test(codigo), `${f} consulta Attendance sem o recorte por dono`);
    verdade(!/officeId:\s*viewer\.officeId/.test(codigo.replace(/\.\.\.whereDoAtendimento\([^)]*\)/g, "")) || /whereDoAtendimento|whereDeUmAtendimento/.test(codigo), `${f}: officeId cru`);
  }
  verdade(achou >= 5, "a varredura tem de encontrar as consultas (senão o teste ficou cego)");
});

teste("toda página do app de Atendimento barra sem acesso; funil exige o nível total", () => {
  const paginas = arquivos(join(raiz, "app/atendimento-app/(shell)")).filter((f) => /page\.tsx$/.test(f));
  const publicas = ["perfil", "tema", "sair"]; // não tocam em lead
  for (const f of paginas) {
    if (publicas.some((p) => f.includes(`/${p}/`))) continue;
    const codigo = readFileSync(f, "utf8");
    verdade(codigo.includes("exigirAcessoAoAtendimentoNaTela"), `${f} não chama a porta do Atendimento`);
  }
  const funil = readFileSync(join(raiz, "app/atendimento-app/(shell)/funil/page.tsx"), "utf8");
  verdade(funil.includes("veTodoOAtendimento"), "o funil do app é só do nível total");
  const funilSite = readFileSync(join(raiz, "app/(app)/atendimento/funil/page.tsx"), "utf8");
  verdade(funilSite.includes("veTodoOAtendimento"), "o funil do site é só do nível total");
});

teste("as rotas da API passam pela guarda (401/403/404) antes de tocar no lead", () => {
  for (const r of ["mensagens"]) {
    const codigo = readFileSync(join(raiz, `app/api/atendimento/[id]/${r}/route.ts`), "utf8");
    verdade(codigo.includes("atendimentoDaRota(params.id)"), `${r} sem guarda`);
    verdade(!/officeId:\s*viewer\.officeId/.test(codigo), `${r} voltou a filtrar só por escritório`);
    verdade(codigo.indexOf("atendimentoDaRota") < codigo.indexOf("req.json"), `${r}: a guarda vem antes de ler o corpo`);
  }
});

resumo("atendimento: recorte no app e na API");
