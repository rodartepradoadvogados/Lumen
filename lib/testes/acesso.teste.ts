import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo } from "./executar";
import {
  nivelDeAcessoAoAtendimento,
  podeVerAtendimentos,
  veTodoOAtendimento,
  filtroDoAtendimento,
  recorteDosAlertasDeAtendimento,
} from "@/lib/acessoAtendimento";
import { montarFila, type PessoaDaFila } from "@/lib/filaDeTransferencia";

// ============================================================================
// OS TRÊS NÍVEIS DO ATENDIMENTO.
//
//   TOTAL     administrador e recepção — lista inteira, funil, qualquer conversa.
//   PRÓPRIOS  advogado NA ESCALA de demandas, sócio ou não — abre atendimento à mão e vê só o
//             que foi repassado a ele. O Lúmen não é o caminho dele (recebe por WhatsApp e
//             e-mail), é o registro.
//   NENHUM    todo o resto.
//
// A matriz inteira é testada. E o recorte por dono é testado COMO PEDAÇO DE CONSULTA, porque é
// assim que ele é usado: filtrar depois de buscar já teria trazido para a memória do servidor a
// conversa que aquela pessoa não pode ler.
// ============================================================================

const socio = { isAdmin: true, role: "Sócio", recebeTransferencia: true };
const adminSemEscala = { isAdmin: true, role: "Advogado", recebeTransferencia: false };
const recepcao = { isAdmin: false, role: "Recepcionista/Secretária", recebeTransferencia: false };
const recepcaoAntiga = { isAdmin: false, role: "Recepcionista", recebeTransferencia: false };
const advogadoNaEscala = { isAdmin: false, role: "Advogado", recebeTransferencia: true };
const advogadoForaDaEscala = { isAdmin: false, role: "Advogado", recebeTransferencia: false };
const estagiarioNaEscala = { isAdmin: false, role: "Estagiário", recebeTransferencia: true };
const financeiro = { isAdmin: false, role: "Financeiro", recebeTransferencia: false };

// ── Nível total ──────────────────────────────────────────────────────────────────────────────

teste("administrador vê tudo, esteja ou não na escala", () => {
  igual(nivelDeAcessoAoAtendimento(socio), "total");
  igual(nivelDeAcessoAoAtendimento(adminSemEscala), "total");
  igual(nivelDeAcessoAoAtendimento({ isAdmin: true, role: "Contador", recebeTransferencia: false }), "total");
});

teste("a recepção vê tudo, no rótulo novo e no antigo", () => {
  igual(nivelDeAcessoAoAtendimento(recepcao), "total");
  igual(nivelDeAcessoAoAtendimento(recepcaoAntiga), "total");
  igual(nivelDeAcessoAoAtendimento({ isAdmin: false, role: "secretária", recebeTransferencia: false }), "total");
  igual(nivelDeAcessoAoAtendimento({ isAdmin: false, role: "  Recepcionista/Secretária  ", recebeTransferencia: false }), "total");
});

// ── Nível próprios ───────────────────────────────────────────────────────────────────────────

teste("advogado NA ESCALA vê os próprios, mesmo sem ser sócio", () => {
  igual(nivelDeAcessoAoAtendimento(advogadoNaEscala), "proprios");
  igual(nivelDeAcessoAoAtendimento({ isAdmin: false, role: "Sócio", recebeTransferencia: true }), "proprios");
});

teste("advogado FORA da escala não vê nada", () => {
  // A marca nasce desligada de propósito: advogado que não recebe lead não tem por que ler a
  // conversa de ninguém.
  igual(nivelDeAcessoAoAtendimento(advogadoForaDaEscala), "nenhum");
});

teste("estar na escala não basta: o papel tem de ser de advogado", () => {
  igual(nivelDeAcessoAoAtendimento(estagiarioNaEscala), "nenhum");
  igual(nivelDeAcessoAoAtendimento({ isAdmin: false, role: "Marketing", recebeTransferencia: true }), "nenhum");
});

// ── Nível nenhum ─────────────────────────────────────────────────────────────────────────────

teste("papel desconhecido, vazio ou ausente não vê nada", () => {
  igual(nivelDeAcessoAoAtendimento(financeiro), "nenhum");
  igual(nivelDeAcessoAoAtendimento({ isAdmin: false, role: "Coordenador", recebeTransferencia: true }), "nenhum");
  igual(nivelDeAcessoAoAtendimento({ isAdmin: false, role: "", recebeTransferencia: true }), "nenhum");
  igual(nivelDeAcessoAoAtendimento({ isAdmin: false, role: null, recebeTransferencia: true }), "nenhum");
  igual(nivelDeAcessoAoAtendimento(null), "nenhum");
  igual(nivelDeAcessoAoAtendimento(undefined), "nenhum");
});

teste("valores quase-verdadeiros não valem acesso", () => {
  for (const valor of [1, "true", "sim", {}, []]) {
    igual(
      nivelDeAcessoAoAtendimento({ isAdmin: valor as unknown as boolean, role: "Contador", recebeTransferencia: false }),
      "nenhum",
      `isAdmin=${JSON.stringify(valor)}: `,
    );
    igual(
      nivelDeAcessoAoAtendimento({ isAdmin: false, role: "Advogado", recebeTransferencia: valor as unknown as boolean }),
      "nenhum",
      `recebeTransferencia=${JSON.stringify(valor)}: `,
    );
  }
});

// ── O recorte da consulta ────────────────────────────────────────────────────────────────────

teste("quem vê tudo não recorta nada", () => {
  igual(filtroDoAtendimento(socio, "u1"), {});
  igual(filtroDoAtendimento(recepcao, "u1"), {});
});

teste("quem vê os próprios recorta pelo responsável", () => {
  igual(filtroDoAtendimento(advogadoNaEscala, "u1"), { responsibleId: "u1" });
});

teste("quem não vê nada recebe um filtro IMPOSSÍVEL, nunca um vazio", () => {
  // Se alguém chamar esta função sem antes barrar o acesso, o resultado tem de ser lista vazia —
  // nunca a lista inteira. Um `{}` aqui seria a falha mais silenciosa possível.
  const f = filtroDoAtendimento(financeiro, "u1");
  verdade(f.responsibleId !== undefined, "o filtro de quem não tem acesso veio vazio");
  verdade(f.responsibleId !== "u1", "o filtro de quem não tem acesso devolveu os dele");
});

teste("o recorte dos alertas distingue 'nenhum' de 'todos'", () => {
  igual(recorteDosAlertasDeAtendimento(socio, "u1"), {});
  igual(recorteDosAlertasDeAtendimento(advogadoNaEscala, "u1"), { responsibleId: "u1" });
  igual(recorteDosAlertasDeAtendimento(financeiro, "u1"), null);
});

// ── As três perguntas derivadas ──────────────────────────────────────────────────────────────

teste("podeVer abre para dois níveis; veTodo abre só para um", () => {
  igual([socio, recepcao, advogadoNaEscala, financeiro].map(podeVerAtendimentos), [true, true, true, false]);
  igual([socio, recepcao, advogadoNaEscala, financeiro].map(veTodoOAtendimento), [true, true, false, false]);
});

// ── A fila voltou a aceitar advogado que não é sócio ─────────────────────────────────────────

let n = 0;
function pessoa(over: Partial<PessoaDaFila> = {}): PessoaDaFila {
  n += 1;
  return { id: `p${n}`, nome: `Pessoa ${n}`, papel: "Advogado", ativo: true, recebeTransferencia: true, criadoEm: new Date(2026, 0, n), ...over };
}

teste("advogado sem ser sócio CONTINUA na fila — ele recebe por WhatsApp e e-mail", () => {
  const fila = montarFila([pessoa({ id: "a" }), pessoa({ id: "b" })], "ADVOGADOS");
  igual(fila.map((p) => p.id), ["a", "b"]);
});

teste("e quem está na fila tem, no Lúmen, acesso ao que foi repassado a ele", () => {
  // As duas regras têm de casar: estar na escala e ver os próprios são a MESMA condição vista de
  // dois lados. Se divergirem, o lead chega a quem não consegue abri-lo.
  igual(nivelDeAcessoAoAtendimento(advogadoNaEscala), "proprios");
});

// ── A varredura: nenhuma porta sem tranca ────────────────────────────────────────────────────

function arquivosDe(pasta: string): string[] {
  const achados: string[] = [];
  const raiz = process.cwd();
  const caminhar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      if (nome === "node_modules" || nome === ".next" || nome.startsWith(".")) continue;
      const cheio = join(dir, nome);
      if (statSync(cheio).isDirectory()) caminhar(cheio);
      else if (nome.endsWith(".ts") || nome.endsWith(".tsx")) achados.push(cheio.slice(raiz.length + 1));
    }
  };
  caminhar(join(raiz, pasta));
  return achados;
}

teste("toda página de atendimento tem a trava de nível", () => {
  const paginas = arquivosDe("app").filter((a) => a.includes("atendimento") && a.endsWith("page.tsx"));
  verdade(paginas.length >= 6, `só ${paginas.length} páginas encontradas — a varredura não está lendo certo`);
  // Procura a CHAMADA, e não o nome: a linha de `import` sozinha satisfazia um teste que buscasse
  // só o identificador, e uma página que perdesse a trava passaria com o import órfão em cima.
  const sem = paginas.filter((a) => {
    const t = readFileSync(join(process.cwd(), a), "utf8");
    return !t.includes("if (!podeVerAtendimentos(") && !t.includes("if (!veTodoOAtendimento(");
  });
  igual(sem, [], "páginas de atendimento SEM a trava: ");
});

teste("toda consulta de UM atendimento nas ações carrega o recorte por dono", () => {
  const t = readFileSync(join(process.cwd(), "lib/actions/attendance.ts"), "utf8").split("\n");
  const sem: string[] = [];
  t.forEach((linha, i) => {
    // Linha que busca/atualiza um atendimento por id dentro do escritório.
    if (!/where: \{ id(: attendanceId)?, officeId:/.test(linha)) return;
    if (!linha.includes("filtroDoAtendimento")) sem.push(`linha ${i + 1}: ${linha.trim().slice(0, 70)}`);
  });
  igual(sem, [], "consultas de atendimento SEM o recorte por dono: ");
});

teste("toda ação de atendimento tem a trava de acesso", () => {
  const t = readFileSync(join(process.cwd(), "lib/actions/attendance.ts"), "utf8").split("\n");
  const sem: string[] = [];
  t.forEach((linha, i) => {
    if (!/const (viewer|user) = await getCurrentUser\(\)/.test(linha)) return;
    if (!t.slice(i, i + 5).join("\n").includes("if (!podeVerAtendimentos(")) sem.push(`linha ${i + 1}`);
  });
  igual(sem, [], "ações de atendimento SEM a trava: ");
});

resumo("Acesso ao atendimento");
