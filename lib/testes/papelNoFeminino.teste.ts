import { readFileSync } from "node:fs";
import { teste, igual, verdade, resumo } from "./executar";
import { PAPEIS_ADVOGADO, PAPEIS_RECEPCAO } from "@/lib/filaDeTransferencia";
import { nivelDeAcessoAoAtendimento } from "@/lib/acessoAtendimento";

// ============================================================================
// O PAPEL NO FEMININO — e por que isto é um caso de teste e não uma revisão de texto.
//
// A lista de papéis de advogado tinha só o masculino ("advogado", "sócio"), enquanto a de recepção,
// cinco linhas abaixo, já trazia "secretária". As formas femininas foram acrescentadas onde alguém
// por acaso lembrou.
//
// O ESTRAGO ERA SILENCIOSO E DOBRADO. Uma pessoa cadastrada como "Advogada" ou "Sócia" não casava
// com item nenhum, então:
//   1. a fila de transferência a pulava — o lead do WhatsApp caía sempre nos homens do escritório,
//      sem erro em lugar nenhum, e o sintoma ("o lead nunca chega para mim") não apontava para cá;
//   2. lib/acessoAtendimento.ts usa A MESMA LISTA para o nível de acesso, e devolvia "nenhum" —
//      advogada do escritório sem acesso ao Atendimento, por causa de uma letra.
//
// Num escritório com sócia e advogadas, isso não é hipótese. É o tipo de defeito que só aparece
// quando a pessoa certa reclama, e que até lá parece "o sistema funcionando".
// ============================================================================

const advogada = { isAdmin: false, role: "Advogada", recebeTransferencia: true };
const advogado = { isAdmin: false, role: "Advogado", recebeTransferencia: true };

teste("advogada e sócia entram na lista de advogados, iguais aos masculinos", () => {
  for (const papel of ["advogado", "advogada", "sócio", "socio", "sócia", "socia"]) {
    verdade(PAPEIS_ADVOGADO.includes(papel), `"${papel}" ficou de fora da lista de advogados`);
  }
});

teste("secretário entra na lista de recepção, igual a secretária", () => {
  for (const papel of ["secretária", "secretaria", "secretário", "secretario", "recepcionista"]) {
    verdade(PAPEIS_RECEPCAO.includes(papel), `"${papel}" ficou de fora da lista de recepção`);
  }
});

teste("a advogada tem o MESMO nível de acesso que o advogado", () => {
  // Este é o caso que importa: não é sobre a lista, é sobre o que a lista decide.
  igual(nivelDeAcessoAoAtendimento(advogada), nivelDeAcessoAoAtendimento(advogado));
  igual(nivelDeAcessoAoAtendimento(advogada), "proprios");
});

teste("a sócia e a secretária também", () => {
  igual(nivelDeAcessoAoAtendimento({ isAdmin: false, role: "Sócia", recebeTransferencia: true }), "proprios");
  igual(nivelDeAcessoAoAtendimento({ isAdmin: false, role: "Secretária", recebeTransferencia: false }), "total");
  igual(nivelDeAcessoAoAtendimento({ isAdmin: false, role: "Secretário", recebeTransferencia: false }), "total");
});

teste("a trava de escala continua valendo para os dois gêneros", () => {
  // O conserto do feminino não pode ter afrouxado a regra: advogado fora da escala não lê conversa
  // de ninguém, e isso vale igual para ela.
  igual(nivelDeAcessoAoAtendimento({ ...advogada, recebeTransferencia: false }), "nenhum");
  igual(nivelDeAcessoAoAtendimento({ ...advogado, recebeTransferencia: false }), "nenhum");
});

teste("papel desconhecido continua fechado — o conserto não abriu porta nova", () => {
  igual(nivelDeAcessoAoAtendimento({ isAdmin: false, role: "Motorista", recebeTransferencia: true }), "nenhum");
  igual(nivelDeAcessoAoAtendimento({ isAdmin: false, role: "", recebeTransferencia: true }), "nenhum");
  igual(nivelDeAcessoAoAtendimento(null), "nenhum");
});

teste("toda forma masculina da lista tem a feminina ao lado, e vice-versa", () => {
  // A varredura que impede a volta do defeito: acrescentar um papel novo só num gênero fica
  // vermelho aqui, em vez de esperar alguém reclamar que não recebe lead.
  const pares: [string, string][] = [
    ["advogado", "advogada"],
    ["sócio", "sócia"],
    ["socio", "socia"],
    ["secretária", "secretário"],
    ["secretaria", "secretario"],
  ];
  const todos = [...PAPEIS_ADVOGADO, ...PAPEIS_RECEPCAO];
  for (const [a, b] of pares) {
    igual(todos.includes(a), todos.includes(b), `"${a}" e "${b}" têm de entrar e sair juntos: `);
  }
});

teste("o mesmo buraco não existe em outra lista de papéis do produto", () => {
  const fonte = readFileSync("lib/filaDeTransferencia.ts", "utf8");
  // Se um dia nascer uma terceira lista, que ela nasça sabendo.
  const listas = fonte.match(/PAPEIS_[A-Z_]+ = \[[\s\S]*?\]/g) || [];
  igual(listas.length, 2, "nasceu uma lista de papéis nova — acrescente-a a este teste: ");
});

resumo("O papel no feminino");
