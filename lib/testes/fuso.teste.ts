import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo } from "./executar";

// ============================================================================
// A TRAVA DO FUSO.
//
// Este teste não olha uma função: olha o CÓDIGO-FONTE inteiro. Ele existe porque o defeito que
// acabou de ser consertado — 26 lugares formatando hora sem dizer o fuso, todos três horas
// adiantados no servidor — não é do tipo que se conserta uma vez. Ele volta na próxima tela nova,
// porque `toLocaleTimeString("pt-BR", …)` é o que qualquer pessoa escreve sem pensar, e porque o
// resultado PARECE certo na máquina de quem escreveu (que está em Brasília).
//
// Um teste de mesa não pegaria: a função nova estaria certa e a tela nova, errada. Então a trava
// mora aqui, na varredura.
// ============================================================================

const PASTAS = ["app", "components", "lib"];
const EXTENSOES = [".ts", ".tsx"];

/** Os dois arquivos onde o padrão aparece legitimamente: o módulo do fuso, e este teste. */
const ONDE_PODE = new Set(["lib/horaDeBrasilia.ts", "lib/testes/fuso.teste.ts"]);

/**
 * `toLocaleString` serve para NÚMERO e para DATA, e neste projeto ele é usado sobretudo para
 * dinheiro. Estas marcas identificam a formatação de número, que não tem fuso nenhum a declarar.
 *
 * É heurística, e é heurística de propósito: distinguir por texto se o receptor é um Date ou um
 * number não dá. Um falso positivo custa uma linha nesta lista; um falso NEGATIVO custa um
 * horário errado numa tela de auditoria, que é onde o horário mais importa.
 */
const E_NUMERO = /style:\s*"currency"|FractionDigits|notation:|style:\s*"percent"/;

function arquivosDe(pasta: string, raiz: string = process.cwd()): string[] {
  const achados: string[] = [];
  const caminhar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      if (nome === "node_modules" || nome === ".next" || nome.startsWith(".")) continue;
      const cheio = join(dir, nome);
      if (statSync(cheio).isDirectory()) caminhar(cheio);
      else if (EXTENSOES.some((e) => nome.endsWith(e))) achados.push(cheio.slice(raiz.length + 1));
    }
  };
  caminhar(join(raiz, pasta));
  return achados;
}

function varrer(padrao: RegExp): { arquivo: string; linha: number; texto: string }[] {
  const fora: { arquivo: string; linha: number; texto: string }[] = [];
  for (const pasta of PASTAS) {
    for (const arquivo of arquivosDe(pasta)) {
      if (ONDE_PODE.has(arquivo)) continue;
      const linhas = readFileSync(join(process.cwd(), arquivo), "utf8").split("\n");
      linhas.forEach((texto, i) => {
        const limpo = texto.trim();
        // Comentário não é código: a linha que EXPLICA o padrão não pode reprovar a varredura.
        if (limpo.startsWith("//") || limpo.startsWith("*")) return;
        if (E_NUMERO.test(texto)) return;
        if (padrao.test(texto)) fora.push({ arquivo, linha: i + 1, texto: limpo.slice(0, 110) });
      });
    }
  }
  return fora;
}

function listar(achados: { arquivo: string; linha: number; texto: string }[]): string {
  return achados.map((a) => `\n    ${a.arquivo}:${a.linha}  ${a.texto}`).join("");
}

teste("nenhuma hora é formatada sem dizer o fuso", () => {
  // Pega `toLocaleTimeString(` que não traga `timeZone` na mesma linha.
  const achados = varrer(/toLocaleTimeString\((?![^)]*timeZone)/);
  igual(
    achados.length,
    0,
    `há hora formatada sem fuso — use horaDeBrasilia() de lib/horaDeBrasilia.ts:${listar(achados)}\n  `,
  );
});

teste("nenhum instante é formatado como data sem dizer o fuso", () => {
  // `toLocaleString` completo (data + hora) tem o mesmo problema e é mais fácil de esquecer.
  const achados = varrer(/\.toLocaleString\((?![^)]*timeZone)/);
  igual(
    achados.length,
    0,
    `há data-e-hora formatada sem fuso — use dataEHoraDeBrasilia():${listar(achados)}\n  `,
  );
});

// ============================================================================
// A SEGUNDA TRAVA: formatDate() COM UM INSTANTE DENTRO.
//
// formatDate() (components/ui.tsx) e formatCalendarDate() são DUAS FUNÇÕES DE PROPÓSITO
// DIFERENTE, e o nome parecido é a armadilha. formatCalendarDate() força UTC de propósito, porque
// dueDate/prazoFinal/date nascem de <input type="date"> como meia-noite UTC — e é ISSO que
// formatDate() faz hoje (lê no fuso local, que em produção não é Brasília), então qualquer
// instante (createdAt e companhia — "quando isso ACONTECEU", não um dia escolhido) que passa por
// formatDate() sai com a hora certa só por acaso, e com o DIA ERRADO perto da meia-noite de
// Brasília. A auditoria de 2026-09 encontrou e corrigiu ~40 desses; esta trava é para a próxima
// tela nova, que vai reincidir do mesmo jeito que toLocaleTimeString() reincidia antes da trava
// acima — alguém escreve `formatDate(x.createdAt)` porque compila, os dois campos são DateTime, e
// a tela parece certa na hora de testar (de dia, longe da virada).
//
// A LISTA ABAIXO É POSITIVA (o que É instante), não "tudo que termina em At/Em" — essa regra mais
// simples FOI TENTADA e tem falso positivo confirmado nesta base: nextContactAt (Attendance) e
// paidAt (PlatformExpense) terminam em "At" e são DIA DE CALENDÁRIO, escolhidos num
// <input type="date"> (ver AttendanceCommercialForm.tsx / PlatformExpenseModal.tsx); protocoladoEm
// (ProtocoloLote) termina em "Em" e também é dia, não instante (ver lib/actions/protocolos.ts).
// Um "paidAt" idêntico em TenantInvoice, por outro lado, É instante (carimbado com now() na baixa,
// ver lib/actions/painelMestre.ts) — o MESMO NOME quer dizer coisas diferentes em dois models, e é
// exatamente por isso que a lista é por confirmação, campo a campo, e não por padrão de texto no
// nome. createdAt/updatedAt entram sempre: são os dois carimbos que o Prisma preenche sozinho
// (@default(now())/@updatedAt) em praticamente todo model, e nenhum humano os edita.
//
// LIMITE CONHECIDO: isto olha o NOME do identificador na chamada. `formatDate(iso)` com `iso`
// vindo de um `enviadoEm` três linhas acima (ver o formatEnviadoEm de
// components/mobile/MobileCaseProtocolosTab.tsx, que por isso chama dataDeBrasilia por dentro, não
// formatDate) escapa da varredura. Não tem como uma regex ler o tipo — isso pede um lint de
// verdade (eslint-plugin com acesso ao TypeScript checker), fora do escopo desta trava.
const SUFIXOS_DE_INSTANTE_CONFIRMADOS = [
  "createdAt",
  "updatedAt",
  "completedAt", // Task — carimbado ao concluir, não escolhido
  "publishedAt", // Publication — quando o diário publicou, não vencimento
  "firstResponseAt", // Attendance — carimbado no primeiro contato
  "escalatedAt", // CaseInstanceEscalation
  "returnedAt", // CaseInstanceEscalation
  "transferidoEm", // Attendance
  "enviadoEm", // DocumentoEnvio
  "expiresAt", // token OAuth (BtgConnection e afins)
  "lastUsedAt", // ApiKey
  "ultimoHitAt", // TermoVigilancia
];

teste("formatDate() nunca recebe um instante (createdAt e companhia são dia, não calendário)", () => {
  const padrao = new RegExp(`formatDate\\(\\s*[\\w.?!]*\\.(?:${SUFIXOS_DE_INSTANTE_CONFIRMADOS.join("|")})\\b`);
  const achados = varrer(padrao);
  igual(
    achados.length,
    0,
    `formatDate() recebeu um campo que é instante, não dia — troque por dataDeBrasilia()/dataEHoraDeBrasilia() de lib/horaDeBrasilia.ts:${listar(achados)}\n  `,
  );
});

teste("a varredura está de fato lendo o projeto, e não uma pasta vazia", () => {
  // Sem esta conferência, um erro de caminho faria os dois testes acima passarem por não terem
  // olhado NADA — que é o jeito mais silencioso de uma trava deixar de travar.
  const total = PASTAS.reduce((n, p) => n + arquivosDe(p).length, 0);
  verdade(total > 300, `a varredura só achou ${total} arquivos; o projeto tem muito mais`);
  const comHora = varrer(/horaDeBrasilia\(/);
  verdade(comHora.length > 15, `só ${comHora.length} usos de horaDeBrasilia encontrados — a varredura não está lendo certo`);
});

resumo("Trava do fuso");
