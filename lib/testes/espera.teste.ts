import { readFileSync } from "node:fs";
import { teste, igual, verdade, resumo } from "./executar";
import {
  rotuloDaEspera,
  ordenarPorEspera,
  procedencia,
  nomeDaLinha,
  rotuloDaVolta,
  comQuemEsta,
  type QuemEspera,
} from "@/lib/rotulosDaEspera";

// ============================================================================
// QUEM ESTÁ ESPERANDO RESPOSTA.
//
// A fila da tela inicial do app. O que precisa estar certo aqui é a ORDEM — é a única coisa que a
// tela promete: quem está esperando há mais tempo aparece primeiro. Uma fila fora de ordem é pior
// que nenhuma fila, porque ela é obedecida.
// ============================================================================

const linha = (p: Partial<QuemEspera> & { id: string }): QuemEspera => ({
  nome: "Fulano",
  ultimaMensagem: null,
  esperandoHa: null,
  respondido: false,
  campanha: null,
  responsavel: null,
  meu: false,
  prazoISO: null,
  voltaDaFila: 1,
  ...p,
});

// ── O RÓTULO DA ESPERA ──────────────────────────────────────────────────────

teste("a espera cabe numa palavra", () => {
  igual(rotuloDaEspera(0), "agora");
  igual(rotuloDaEspera(1), "1 min");
  igual(rotuloDaEspera(59), "59 min");
  igual(rotuloDaEspera(60), "1h");
  igual(rotuloDaEspera(1439), "23h");
  igual(rotuloDaEspera(1440), "1d");
  igual(rotuloDaEspera(4320), "3d");
});

teste("quem não está esperando não tem rótulo de espera", () => {
  // Nulo aqui não é falta de dado: é "ninguém está esperando nesta conversa", e a tela mostra
  // "respondido" no lugar. Devolver "0 min" faria toda conversa respondida parecer urgente.
  igual(rotuloDaEspera(null), null);
});

// ── A ORDEM ─────────────────────────────────────────────────────────────────

teste("quem espera há mais tempo vem primeiro", () => {
  const fila = [
    linha({ id: "c", esperandoHa: 6 }),
    linha({ id: "a", esperandoHa: 41 }),
    linha({ id: "b", esperandoHa: 11 }),
  ].sort(ordenarPorEspera);
  igual(fila.map((q) => q.id), ["a", "b", "c"]);
});

teste("quem já foi respondido vai para o fim, por mais recente que seja", () => {
  const respondido = linha({ id: "respondido", esperandoHa: null, respondido: true });
  const esperando = linha({ id: "esperando", esperandoHa: 1 });

  // A comparação é verificada NOS DOIS SENTIDOS, e não só pelo resultado de um sort de dois itens.
  // Um comparador que devolve "vem antes" para os dois lados é incoerente — e um sort de dois itens
  // esconde isso, porque a ordem em que o motor chama o comparador é detalhe de implementação. Com
  // trinta itens o mesmo defeito embaralha a fila inteira.
  verdade(ordenarPorEspera(respondido, esperando) > 0, "respondido deveria vir depois de quem espera");
  verdade(ordenarPorEspera(esperando, respondido) < 0, "quem espera deveria vir antes do respondido");

  const fila = [respondido, esperando].sort(ordenarPorEspera);
  igual(fila.map((q) => q.id), ["esperando", "respondido"]);

  // E com fila grande, que é onde o defeito aparece de verdade.
  const grande = [
    linha({ id: "r1", esperandoHa: null, respondido: true }),
    linha({ id: "e1", esperandoHa: 3 }),
    linha({ id: "r2", esperandoHa: null, respondido: true }),
    linha({ id: "e2", esperandoHa: 30 }),
    linha({ id: "r3", esperandoHa: null, respondido: true }),
    linha({ id: "e3", esperandoHa: 12 }),
  ].sort(ordenarPorEspera);
  igual(grande.map((q) => q.id), ["e2", "e3", "e1", "r1", "r2", "r3"]);
});

teste("empate não deixa a lista trocar de ordem sozinha", () => {
  // Sem critério final, dois atendimentos com o mesmo tempo de espera saem em ordem diferente a
  // cada leitura do banco — e uma lista que se mexe sozinha entre dois toques é uma lista em que
  // ninguém confia.
  const a = [linha({ id: "z", esperandoHa: 10 }), linha({ id: "y", esperandoHa: 10 })].sort(ordenarPorEspera);
  const b = [linha({ id: "y", esperandoHa: 10 }), linha({ id: "z", esperandoHa: 10 })].sort(ordenarPorEspera);
  igual(a.map((q) => q.id), b.map((q) => q.id));
  const c = [linha({ id: "b", respondido: true }), linha({ id: "a", respondido: true })].sort(ordenarPorEspera);
  igual(c.map((q) => q.id), ["a", "b"]);
});

teste("nenhum atendimento se perde ao ordenar", () => {
  const entrada = Array.from({ length: 40 }, (_, i) =>
    linha({ id: `id${i}`, esperandoHa: i % 3 === 0 ? null : (i * 7) % 90 })
  );
  const saida = [...entrada].sort(ordenarPorEspera);
  igual(saida.length, entrada.length);
  igual([...saida.map((q) => q.id)].sort(), [...entrada.map((q) => q.id)].sort());
});

// ── A LINHA DE PROCEDÊNCIA ──────────────────────────────────────────────────

teste("a procedência diz de onde veio e de quem é", () => {
  igual(procedencia(linha({ id: "1", campanha: "Erro médico — parto", meu: true })), "Erro médico — parto · seu");
  igual(procedencia(linha({ id: "2", campanha: null, responsavel: "Rodrigo" })), "sem campanha · Rodrigo");
  igual(procedencia(linha({ id: "3" })), "sem campanha · sem responsável");
});

// ── O NOME DA LINHA ─────────────────────────────────────────────────────────

teste("número no lugar do nome é escrito como número", () => {
  // Quando o WhatsApp não manda o nome do perfil, `clientName` nasce com o próprio número. Colado
  // numa lista ele não é nome nem é telefone: é um dado que ninguém lê.
  igual(nomeDaLinha("5562996142280", "5562996142280"), "+55 (62) 99614-2280");
  igual(nomeDaLinha("", "5562996142280"), "+55 (62) 99614-2280");
  igual(nomeDaLinha("Maria Aparecida Silva", "5562996142280"), "Maria Aparecida Silva");
});

teste("sem nome e sem telefone, a linha ainda diz alguma coisa", () => {
  igual(nomeDaLinha(null, null), "Sem nome");
  igual(nomeDaLinha("   ", ""), "Sem nome");
});

// ── A FILA DA TRIAGEM ───────────────────────────────────────────────────────

teste("a volta da fila é contada a partir de quem já teve a vez", () => {
  igual(rotuloDaVolta(1), "1ª vez na fila");
  igual(rotuloDaVolta(3), "3ª vez na fila");
  // Zero e negativo não existem — mas se um `filaJaTentou` torto produzisse um, "0ª vez na fila"
  // seria uma frase que não quer dizer nada numa tela que alguém lê às onze da noite.
  igual(rotuloDaVolta(0), "1ª vez na fila");
  igual(rotuloDaVolta(-2), "1ª vez na fila");
});

teste("lead sem responsável está com a RECEPÇÃO, não com ninguém", () => {
  // "sem responsável" faria a fila parecer abandonada quando ela está exatamente onde deveria: o
  // que chega sem dono é da recepção, que é quem atende o que chega sem dono.
  igual(comQuemEsta(linha({ id: "1", responsavel: null })), "Recepção");
  igual(comQuemEsta(linha({ id: "2", responsavel: "Rodrigo Prado" })), "Rodrigo Prado");
});

teste("a fila da Triagem só mostra quem de fato está esperando", () => {
  // Um lead respondido não é fila: se ele entrasse, a contagem do cabeçalho ("3 leads") mentiria e
  // a tela mandaria alguém correr atrás de conversa que já foi atendida.
  const fonte = readFileSync("app/(app)/atendimento/funil/page.tsx", "utf8");
  verdade(fonte.includes("filter((q) => q.esperandoHa !== null)"), "a Triagem não separa quem está esperando");
  verdade(fonte.includes("veTodoOAtendimento(viewer)"), "a Triagem perdeu o gate de nível total");
});

// ── AS PORTAS ───────────────────────────────────────────────────────────────

teste("o que a tela do navegador lê não arrasta o banco junto", () => {
  // O build quebrou por isto: o sino é componente de CLIENTE e precisa do rótulo da espera;
  // enquanto o rótulo morava ao lado da consulta, importá-lo arrastava `@/lib/prisma` para o
  // pacote do navegador. A separação é a correção, e este teste é o que impede a volta.
  // A varredura olha as linhas de IMPORT, e não o texto do arquivo: a nota acima cita
  // `@/lib/prisma` de propósito, e um teste que casasse com a menção acusaria o próprio comentário
  // que explica a regra.
  const importes = (caminho: string) =>
    readFileSync(caminho, "utf8")
      .split("\n")
      .filter((l) => /^\s*import\b/.test(l))
      .join("\n");
  const puro = importes("lib/rotulosDaEspera.ts");
  verdade(!puro.includes("@/lib/prisma"), "o módulo puro voltou a importar o banco");
  verdade(!puro.includes("next/headers"), "o módulo puro voltou a importar next/headers");
  for (const cliente of ["components/atendimento/FilaDeEspera.tsx", "components/mobile/MobileAtendimentosCard.tsx", "lib/leadNoSino.ts"]) {
    verdade(!importes(cliente).includes("@/lib/esperaDoAtendimento"), `${cliente} importa o módulo que fala com o banco`);
  }
});

teste("a fila é buscada com o recorte por dono dentro da consulta", () => {
  // Um advogado da escala não pode trazer para a memória do servidor a conversa do colega — nem
  // para contar quantas são. O recorte entra no WHERE, e a varredura existe para que ele não saia
  // dali num refatoramento.
  const fonte = readFileSync("lib/esperaDoAtendimento.ts", "utf8");
  verdade(fonte.includes("...recorte,"), "o recorte por dono não entra no WHERE da fila");
  verdade(/const where = \{[^}]*officeId,/.test(fonte), "a fila não filtra por escritório");
  // A lista de status fora da fila mora numa constante nomeada (FORA_DA_FILA) — o teste olha a
  // constante, e não o `where`, porque é nela que a decisão está escrita.
  const fora = /const FORA_DA_FILA = \[([^\]]*)\]/.exec(fonte)?.[1] ?? "";
  for (const status of ["RASCUNHO", "CONVERTIDO", "ARQUIVADO", "RECUSADO"]) {
    verdade(fora.includes(`"${status}"`), `${status} não deveria contar como gente esperando`);
  }
  verdade(fonte.includes("notIn: FORA_DA_FILA"), "a consulta da fila não usa a lista de status fora da fila");
});

teste("a tela inicial do app só consulta a fila para quem pode ver o Atendimento", () => {
  const fonte = readFileSync("app/m/page.tsx", "utf8");
  verdade(fonte.includes("podeAtendimento && user"), "a tela inicial consulta a fila sem checar o acesso");
  verdade(fonte.includes("filtroDoAtendimento(user, user.id)"), "a tela inicial não passa o recorte por dono");
});

resumo("Quem está esperando");
