import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo } from "./executar";
import { podeVerAtendimentos, SEM_ACESSO_AO_ATENDIMENTO } from "@/lib/acessoAtendimento";
import { montarFila, type PessoaDaFila } from "@/lib/filaDeTransferencia";

// ============================================================================
// QUEM PODE VER O ATENDIMENTO.
//
// A regra do dono: administrador e recepção, e mais ninguém. Atendimento não é lista de tarefas —
// é a conversa crua de quem ainda não é cliente contando o problema antes de saber se contrata.
// Tem doença, tem dívida, tem briga de família.
//
// A MATRIZ INTEIRA É TESTADA, e a varredura no fim confere que nenhuma tela ou ação de
// atendimento ficou sem a trava. Esconder o menu não é travar: uma Server Action é um endereço
// HTTP, e quem souber o nome dela a chama sem passar por tela nenhuma.
// ============================================================================

const socio = { isAdmin: true, role: "Sócio" };
const admin = { isAdmin: true, role: "Advogado" };
const recepcao = { isAdmin: false, role: "Recepcionista/Secretária" };
const recepcaoAntiga = { isAdmin: false, role: "Recepcionista" };
const advogado = { isAdmin: false, role: "Advogado" };
const estagiario = { isAdmin: false, role: "Estagiário" };
const financeiro = { isAdmin: false, role: "Financeiro" };

// ── Quem entra ───────────────────────────────────────────────────────────────────────────────

teste("administrador entra, qualquer que seja o papel dele", () => {
  igual(podeVerAtendimentos(socio), true);
  igual(podeVerAtendimentos(admin), true);
  igual(podeVerAtendimentos({ isAdmin: true, role: "Contador" }), true);
});

teste("a recepção entra, no rótulo novo e no antigo", () => {
  igual(podeVerAtendimentos(recepcao), true);
  igual(podeVerAtendimentos(recepcaoAntiga), true);
  igual(podeVerAtendimentos({ isAdmin: false, role: "Secretária" }), true);
  // O rótulo mudou de "Recepcionista" para "Recepcionista/Secretária" e quem já estava cadastrado
  // continua com o valor antigo no banco. Aceitar só o novo tiraria a recepção do ar num deploy.
  igual(podeVerAtendimentos({ isAdmin: false, role: "recepcionista" }), true, "caixa não pode importar: ");
  igual(podeVerAtendimentos({ isAdmin: false, role: "  Recepcionista/Secretária  " }), true, "espaço não pode importar: ");
});

// ── Quem NÃO entra ───────────────────────────────────────────────────────────────────────────

teste("advogado que NÃO é administrador não entra — foi assim que o dono determinou", () => {
  igual(podeVerAtendimentos(advogado), false);
  igual(podeVerAtendimentos({ isAdmin: false, role: "Sócio" }), false);
});

teste("estagiário, financeiro e afins não entram", () => {
  igual(podeVerAtendimentos(estagiario), false);
  igual(podeVerAtendimentos(financeiro), false);
  igual(podeVerAtendimentos({ isAdmin: false, role: "Marketing" }), false);
  igual(podeVerAtendimentos({ isAdmin: false, role: "Contador" }), false);
});

teste("papel desconhecido, vazio ou ausente NÃO entra", () => {
  // Fechado por padrão: um `role` que ninguém reconhece é exatamente o caso em que não se deve
  // adivinhar a favor do acesso.
  igual(podeVerAtendimentos({ isAdmin: false, role: "Coordenador de Projetos" }), false);
  igual(podeVerAtendimentos({ isAdmin: false, role: "" }), false);
  igual(podeVerAtendimentos({ isAdmin: false, role: null }), false);
  igual(podeVerAtendimentos({ isAdmin: false, role: undefined }), false);
  igual(podeVerAtendimentos(null), false);
  igual(podeVerAtendimentos(undefined), false);
});

teste("um isAdmin que não seja exatamente `true` não vale administrador", () => {
  for (const valor of [1, "true", "sim", {}, []]) {
    igual(
      podeVerAtendimentos({ isAdmin: valor as unknown as boolean, role: "Advogado" }),
      false,
      `isAdmin=${JSON.stringify(valor)} deveria NÃO dar acesso: `,
    );
  }
});

// ── A consequência na fila ───────────────────────────────────────────────────────────────────

let n = 0;
function pessoa(over: Partial<PessoaDaFila> = {}): PessoaDaFila {
  n += 1;
  return {
    id: `p${n}`,
    nome: `Pessoa ${n}`,
    papel: "Advogado",
    ativo: true,
    isAdmin: true,
    recebeTransferencia: true,
    criadoEm: new Date(2026, 0, n),
    ...over,
  };
}

teste("advogado sem ser administrador sai da fila de advogados", () => {
  // Se ficasse, receberia a conversa e bateria numa tela de acesso negado: o lead ficaria com
  // dono e sem atendimento, e o relógio de quinze minutos giraria em falso até fechar a volta.
  const fila = montarFila([pessoa({ id: "a" }), pessoa({ id: "b", isAdmin: false })], "ADVOGADOS");
  igual(fila.map((p) => p.id), ["a"]);
});

teste("a recepção NÃO precisa ser administradora para entrar na fila dela", () => {
  const fila = montarFila([pessoa({ id: "r", papel: "Recepcionista/Secretária", isAdmin: false })], "RECEPCAO");
  igual(fila.map((p) => p.id), ["r"]);
});

teste("a fila de advogados pode ficar vazia, e isso é melhor que entregar a quem não abre", () => {
  igual(montarFila([pessoa({ id: "a", isAdmin: false }), pessoa({ id: "b", isAdmin: false })], "ADVOGADOS").length, 0);
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

teste("toda página de atendimento tem a trava", () => {
  const paginas = [...arquivosDe("app")].filter((a) => a.includes("atendimento") && a.endsWith("page.tsx"));
  verdade(paginas.length >= 6, `só ${paginas.length} páginas de atendimento encontradas — a varredura não está lendo certo`);
  // Procura a CHAMADA, e não o nome da função: a linha de `import` sozinha satisfazia um teste
  // que buscasse só "podeVerAtendimentos", e uma página que perdesse a trava continuaria
  // passando com o import órfão em cima. Foi o que uma mutação mostrou.
  const sem = paginas.filter((a) => !readFileSync(join(process.cwd(), a), "utf8").includes("if (!podeVerAtendimentos("));
  igual(sem, [], "páginas de atendimento SEM a trava: ");
});

teste("toda ação de atendimento tem a trava, logo depois de saber quem está do outro lado", () => {
  const texto = readFileSync(join(process.cwd(), "lib/actions/attendance.ts"), "utf8").split("\n");
  const sem: string[] = [];
  texto.forEach((linha, i) => {
    if (!/const (viewer|user) = await getCurrentUser\(\)/.test(linha)) return;
    // A trava tem de estar nas cinco linhas seguintes: depois de saber quem é, antes de consultar.
    if (!texto.slice(i, i + 5).join("\n").includes("if (!podeVerAtendimentos(")) sem.push(`linha ${i + 1}`);
  });
  igual(sem, [], "ações de atendimento SEM a trava: ");
});

teste("a frase da recusa é uma só, e não uma por tela", () => {
  verdade(SEM_ACESSO_AO_ATENDIMENTO.includes("administradores"), "a frase não diz quem pode");
  verdade(SEM_ACESSO_AO_ATENDIMENTO.includes("recepção"), "a frase não menciona a recepção");
});

resumo("Acesso ao atendimento");
