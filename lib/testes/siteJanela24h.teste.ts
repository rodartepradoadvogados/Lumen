import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";
import { janelaDoWhatsapp, recusaDaJanelaFechada } from "@/lib/janelaDe24h";
import { nomeParaAFaixa } from "@/lib/faixaDaJanela";
import { PREFIXO_NOME_TEMPORARIO } from "@/lib/nomeTemporarioDoLead";
import { pareceTelefone } from "@/lib/avisoDeLead";

// A JANELA DE 24 H NO SITE E NO /m (mesma regra do aplicativo): a caixa de resposta avisa ANTES, com as mesmas saídas, e o
// servidor recusa cedo, sem tentar a Meta. Padrão de atendimentoAppJanela.teste.ts: regra pura + travas de código.

const le = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
const AGORA = new Date(Date.UTC(2026, 8, 29, 15, 0));
const haHoras = (h: number) => new Date(AGORA.getTime() - h * 3_600_000);

teste("REGRA: Meta com a última entrada há mais de 24 h, ou sem entrada nenhuma, está fechada", () => {
  igual(janelaDoWhatsapp("META", haHoras(23), AGORA), { aberta: true });
  igual(janelaDoWhatsapp("META", haHoras(30), AGORA), { aberta: false, horasDesdeAUltimaEntrada: 30 });
  igual(janelaDoWhatsapp("META", null, AGORA), { aberta: false, horasDesdeAUltimaEntrada: null });
});

teste("REGRA: Evolution nunca tem janela, nem sem nenhuma entrada", () => {
  igual(janelaDoWhatsapp("EVOLUTION", null, AGORA), { aberta: true });
  igual(janelaDoWhatsapp("evolution", haHoras(500), AGORA), { aberta: true });
});

teste("RECUSA DO SERVIDOR: diz o motivo, as saídas, e não é o erro da Meta", () => {
  const f = janelaDoWhatsapp("META", haHoras(30), AGORA);
  verdade(!f.aberta, "deveria estar fechada");
  if (f.aberta) return;
  const t = recusaDaJanelaFechada("Maria", f);
  verdade(t.startsWith("Fora da janela de 24 h."), t);
  verdade(t.includes("Maria escreveu pela última vez há 30 h"), t);
  verdade(/ligue|WhatsApp/.test(t) && t.includes("tarefa"), "sem saída");
  verdade(!/\b(API|Meta|Graph|webhook)\b/i.test(t), "jargão");
  const nunca = janelaDoWhatsapp("META", null, AGORA);
  if (!nunca.aberta) verdade(recusaDaJanelaFechada("O cliente", nunca).includes("ainda não escreveu"), "cliente que nunca escreveu");
});

teste("NOME: temporário ou com cara de telefone vira 'o cliente'; nome real dá o primeiro nome", () => {
  igual(nomeParaAFaixa("Maria Souza"), { nomeTemporario: false, primeiroNome: "Maria" });
  igual(nomeParaAFaixa("5562981283481"), { nomeTemporario: true, primeiroNome: "" });
  igual(nomeParaAFaixa("+55 (62) 98128-3481"), { nomeTemporario: true, primeiroNome: "" });
  igual(nomeParaAFaixa(""), { nomeTemporario: true, primeiroNome: "" });
  igual(nomeParaAFaixa(null), { nomeTemporario: true, primeiroNome: "" });
  igual(nomeParaAFaixa(`${PREFIXO_NOME_TEMPORARIO} 1234`), { nomeTemporario: true, primeiroNome: "" }, "o prefixo copiado à mão saiu do lugar");
  for (const n of ["Maria", "5562981283481", "12345", "+55 62 99999-8888", "João 2"]) {
    igual(nomeParaAFaixa(n).nomeTemporario, pareceTelefone(n) || n.startsWith(PREFIXO_NOME_TEMPORARIO), `diverge de pareceTelefone em "${n}"`);
  }
});

teste("SERVIDOR: replyWhatsapp confere a janela DEPOIS do recorte e ANTES de chamar a Meta", () => {
  const r = codigoDe(corpoDaFuncao(le("lib/actions/attendance.ts"), "replyWhatsapp"));
  const iRecorte = r.indexOf("recorteDaConversa(");
  const iJanela = r.indexOf("janelaDaConversa(attendanceId, user.officeId");
  const iRecusa = r.indexOf("recusaDaJanelaFechada(");
  const iEnvio = r.indexOf("sendWhatsappText(");
  verdade(iRecorte >= 0 && iJanela > iRecorte && iRecusa > iJanela && iEnvio > iRecusa, `ordem errada: ${iRecorte}/${iJanela}/${iRecusa}/${iEnvio}`);
  verdade(r.includes("if (!janela.aberta)"), "sem o desvio de janela fechada");
  verdade(!/EVOLUTION/i.test(r), "a Evolution é decidida pela regra pura, não por um if solto aqui");
});

teste("CAIXA: fechada troca o campo pela MESMA faixa do app, tema do site; aberta/sem janela mantém o campo", () => {
  const c = codigoDe(le("components/WhatsappReplyBox.tsx"));
  verdade(c.includes('import FaixaDaJanelaFechada from "@/components/atendimento-app/FaixaDaJanelaFechada"'), "não reusa o componente do app");
  verdade(c.includes("janela && !janela.aberta"), "só fecha quando a janela vem e está fechada");
  verdade(c.includes('tema="site"'), "sem o tema do site");
  verdade(c.indexOf("janela && !janela.aberta") > c.indexOf("useTransition()"), "return antes dos hooks");
  verdade(c.includes("<textarea"), "o campo sumiu");
});

teste("FAIXA: o tema do site não usa tokens --atd-* (só existem dentro de .atendimento-shell); o do app continua igual", () => {
  const f = codigoDe(le("components/atendimento-app/FaixaDaJanelaFechada.tsx"));
  const iSite = f.indexOf("site: {");
  const iFim = f.indexOf("} as const");
  const site = f.slice(iSite, iFim);
  verdade(iSite > 0 && iFim > iSite, "não achou o tema do site");
  verdade(!/atd-/.test(site), "o tema do site usa token do app");
  verdade(/bg-atd-ouro-suave/.test(f.slice(f.indexOf("app: {"), iSite)) && /rounded-atd-pilula/.test(f.slice(f.indexOf("app: {"), iSite)), "o tema do app mudou");
  verdade(f.includes('tema = "app"'), "o padrão deixou de ser o app");
  const compositor = codigoDe(le("components/atendimento-app/CompositorDoChat.tsx"));
  verdade(!compositor.includes("tema="), "o aplicativo passou a passar tema");
});

teste("PÁGINAS: as três telas (site, /m e Central) calculam a janela e a passam, com o telefone", () => {
  for (const p of ["app/(app)/atendimento/[id]/page.tsx", "app/m/(shell)/atendimento/[id]/page.tsx", "app/atendimento-central/page.tsx"]) {
    const s = codigoDe(le(p));
    verdade(s.includes("janelaDaConversa("), `${p} não calcula a janela`);
    const caixa = s.slice(s.indexOf("<WhatsappReplyBox"));
    verdade(/janela=\{janelaDoWhatsapp\}/.test(caixa.slice(0, 300)) && /telefone=\{/.test(caixa.slice(0, 300)), `${p} não passa janela e telefone`);
  }
});

resumo("Site e /m — janela de 24 h antes de digitar, servidor recusa cedo");
