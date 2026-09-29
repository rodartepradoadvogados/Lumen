import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe } from "./executar";
import {
  APOIO_DO_WHATSAPP_PESSOAL,
  EXPLICACAO_DA_FAIXA,
  PASSOS_PARA_REABRIR,
  TITULO_DA_FAIXA,
  amanhaEmBrasilia,
  digitosParaContato,
  enderecoDeLigar,
  enderecoDoWhatsappPessoal,
  tituloDaTarefaDeRetorno,
} from "@/lib/faixaDaJanela";
import { diaValido } from "@/lib/detalhesDoAtendimento";

// PR 6 DO APLICATIVO DE ATENDIMENTO: a faixa da janela de 24 h fechada (Ligar, meu WhatsApp, Criar tarefa,
// Como reabrir) — números, textos honestos e as travas de código (só Meta, recorte, alvo de 44 px).

const RAIZ = process.cwd();
const le = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf8");

teste("NÚMERO: só dígitos, com o DDI 55 quando veio sem ele", () => {
  igual(digitosParaContato("+55 (62) 99999-8888"), "5562999998888");
  igual(digitosParaContato("62 99999-8888"), "5562999998888");
  igual(digitosParaContato("(62) 3333-4444"), "556233334444");
  igual(digitosParaContato("5562999998888"), "5562999998888");
  igual(digitosParaContato("0055 62 99999 8888"), "5562999998888");
  igual(digitosParaContato("+1 415 555 0132"), "14155550132", "número estrangeiro com DDI fica como veio");
});

teste("NÚMERO: curto demais, vazio ou lixo não vira link", () => {
  igual(digitosParaContato(""), null);
  igual(digitosParaContato(null), null);
  igual(digitosParaContato("12345"), null);
  igual(digitosParaContato("6299998888"), null, "10 dígitos com terceiro dígito 9 não é fixo brasileiro nem tem DDI");
  igual(enderecoDeLigar("abc"), null);
  igual(enderecoDoWhatsappPessoal(undefined), null);
});

teste("LINKS: Ligar é tel: (ligação normal) e o WhatsApp pessoal é wa.me com só dígitos", () => {
  igual(enderecoDeLigar("(62) 99999-8888"), "tel:+5562999998888");
  igual(enderecoDoWhatsappPessoal("+55 62 99999-8888"), "https://wa.me/5562999998888");
});

teste("TAREFA: título padrão 'Retomar contato com <nome>' e 'este número' quando o nome é temporário", () => {
  igual(tituloDaTarefaDeRetorno("Maria Souza", false), "Retomar contato com Maria Souza");
  igual(tituloDaTarefaDeRetorno("+55 62 99999-8888", true), "Retomar contato com este número");
  igual(tituloDaTarefaDeRetorno("   ", false), "Retomar contato com este número");
  verdade(tituloDaTarefaDeRetorno("x".repeat(500), false).length <= 200, "cabe no limite da ação");
});

teste("TAREFA: a data padrão é amanhã em Brasília e é um dia válido (a ação exige data)", () => {
  igual(amanhaEmBrasilia(new Date(Date.UTC(2026, 8, 29, 17, 32))), "2026-09-30");
  igual(amanhaEmBrasilia(new Date(Date.UTC(2026, 8, 30, 1, 0))), "2026-09-30", "01:00 UTC ainda é dia 29 em Brasília");
  igual(amanhaEmBrasilia(new Date(Date.UTC(2026, 11, 31, 15, 0))), "2027-01-01", "vira o ano");
  verdade(diaValido(amanhaEmBrasilia()), "dia inválido");
});

teste("TEXTOS: o título e a explicação são os combinados; nada de jargão nem promessa falsa", () => {
  igual(TITULO_DA_FAIXA, "Fora da janela de 24 h");
  verdade(EXPLICACAO_DA_FAIXA.includes("modelo aprovado — ainda não disponível aqui"), "diz que o modelo ainda não existe");
  const tudo = [EXPLICACAO_DA_FAIXA, APOIO_DO_WHATSAPP_PESSOAL, ...PASSOS_PARA_REABRIR].join(" ");
  verdade(!/\b(API|Meta|Cloud|webhook|template|SIP|VoIP)\b/i.test(tudo), "jargão de plataforma");
  verdade(APOIO_DO_WHATSAPP_PESSOAL.includes("número pessoal, não do número do escritório"), "avisa que sai do número pessoal");
  verdade(PASSOS_PARA_REABRIR.length === 3, "três caminhos: cliente escrever, modelo, outro canal");
});

teste("FAIXA: aparece só sem janela (Meta), nunca para Evolution nem sem WhatsApp", () => {
  const c = codigoDe(le("components/atendimento-app/CompositorDoChat.tsx"));
  verdade(c.includes("FaixaDaJanelaFechada"), "o compositor não usa a faixa");
  const iSem = c.indexOf("!estado.temWhatsapp");
  const iJanela = c.indexOf("!estado.janela.aberta");
  verdade(iSem >= 0 && iJanela > iSem, "sem WhatsApp vem antes da janela");
  const j = codigoDe(le("lib/janelaDe24h.ts"));
  verdade(/EVOLUTION"\) return \{ aberta: true \}/.test(j.replace(/\s+/g, " ")) || j.includes('=== "EVOLUTION"'), "Evolution sempre aberta");
});

teste("FAIXA: alvos de 44 px, links externos seguros, sem faixa lateral, raio 2 px, sem hex/sombra", () => {
  const f = codigoDe(le("components/atendimento-app/FaixaDaJanelaFechada.tsx"));
  verdade(f.includes("min-h-11"), "alvo de 44 px");
  verdade(/target="_blank" rel="noopener noreferrer"/.test(f), "wa.me abre fora com noopener");
  verdade(!/border-l-\d|border-l\b|border-r-\d/.test(f), "faixa lateral colorida");
  verdade(!/rounded-(md|lg|xl|full|sm)\b/.test(f), "raio fora de 2 px");
  verdade(!/#[0-9a-fA-F]{3,8}\b/.test(f), "hex cru");
  verdade(!/\bshadow-/.test(f), "sombra");
  verdade(f.includes("aria-expanded") && f.includes("aria-controls"), "botões que abrem blocos declaram estado");
  verdade(f.includes('role="region"'), "região nomeada");
});

teste("TAREFA: usa a ação do app, que confere sessão e recorte por dono; a faixa não grava nada por conta própria", () => {
  const f = codigoDe(le("components/atendimento-app/FaixaDaJanelaFechada.tsx"));
  verdade(f.includes("criarTarefaDoAtendimento(idDaConversa"), "usa a ação do atendimento");
  verdade(!/prisma|fetch\(/.test(f), "a faixa não fala com banco nem rota");
  const a = codigoDe(le("lib/actions/detalhesDoAtendimento.ts"));
  const corpo = a.slice(a.indexOf("export async function criarTarefaDoAtendimento"));
  verdade(corpo.indexOf("atendimentoDaAcao(id)") >= 0 && corpo.indexOf("atendimentoDaAcao(id)") < corpo.indexOf("createTask("), "guarda antes de criar");
});

teste("PÁGINA: o telefone vem do servidor (waPhone ou contato) até a faixa", () => {
  verdade(codigoDe(le("app/atendimento-app/(shell)/[id]/page.tsx")).includes("telefone={c.waPhone ?? c.contactPhone ?? null}"), "a página não passa o telefone");
  verdade(codigoDe(le("components/atendimento-app/ChatDaConversa.tsx")).includes("telefone={telefone}"), "o chat não repassa o telefone");
});

resumo("Atendimento app — faixa da janela fechada (PR 6)");
