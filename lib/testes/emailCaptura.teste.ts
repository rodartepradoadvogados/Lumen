import { teste, igual, verdade, resumo } from "./executar";
import { decidirEmail, acharNumeroDeProcesso, enderecoDoRemetente, ehRemetenteDeTribunal, type EntradaEmail } from "../emailCaptura";

// Números válidos (dígito verificador conferido em cnjNumero.teste.ts).
const CNJ = "5012345-88.2024.8.09.0051";

const PROJUDI: EntradaEmail = {
  from: "sistema-projudi@tjgo.jus.br",
  fromName: "SISTEMAPROJUDI",
  subject: "[PROJUDI]Informação de intimação/citação",
  text: "Sr(a). FULANO DE TAL,\n\nO Poder Judiciário do Estado de Goiás informa que está disponível uma intimação/citação referente ao processo nº. 5618319.57 em sua caixa de entrada no Sistema PROJUDI.\n\nSistema PROJUDI\n\nObs.: Esta mensagem não possui valor legal.\n\nEsta é um mensagem automática gerada às 30/09/2026 17:44:50.",
};

// ---------- os casos medidos em produção ----------
teste("o aviso do Projudi-GO (número curto) é aceito", () => {
  const d = decidirEmail(PROJUDI);
  igual(d.acao, "ACEITAR");
  if (d.acao === "ACEITAR") {
    igual(d.numero, "5618319.57");
    igual(d.origemNaoReconhecida, false);
  }
});

teste("BTG Pactual 'Publicação de documentos' é recusado: não tem número de processo", () => {
  const d = decidirEmail({ from: "comunicacao@btgpactual-exemplo.com.br", subject: "BTG Pactual - Publicação de documentos no Portal do Investidor", text: "Prezado cliente, novos documentos foram publicados no seu portal." });
  igual(d.acao, "RECUSAR");
});

teste("o aviso do próprio Lúmen é recusado por cabeçalho, por nome e por assunto não renderizado", () => {
  const base = { from: "avisos@lumen.exemplo.com.br", subject: "Nova publicação — {{processo}}", text: "1 nova(s) publicação(ões) recebida(s)." };
  igual(decidirEmail({ ...base, cabecalhos: { lumen: true } }).acao, "RECUSAR");
  igual(decidirEmail({ ...base, fromName: "Lúmen" }).acao, "RECUSAR");
  igual(decidirEmail({ ...base }).acao, "RECUSAR", "o {{ no assunto basta");
  igual(decidirEmail({ from: "sistema@x.com", subject: "Novas publicações", text: "ok", enderecosDoSistema: ["sistema@x.com"] }).acao, "RECUSAR");
});

teste("GitHub e alertas do Google são recusados mesmo com 'publicação' no assunto", () => {
  igual(decidirEmail({ from: "notifications@github.com", subject: "[rodartepradoadvogados/Lumen] Blog jurídico: publicação do post", text: "Novo comentário." }).acao, "RECUSAR");
  igual(decidirEmail({ from: "no-reply@accounts.google.com", subject: "Alerta de segurança", text: "Novo login." }).acao, "RECUSAR");
});

teste("[Push] de movimentação processual de tribunal, com o número no assunto, é aceito", () => {
  const d = decidirEmail({ from: "push@tjgo.jus.br", subject: `[Push] Movimentação processual do processo ${CNJ}`, text: "Houve movimentação no processo." });
  igual(d.acao, "ACEITAR");
});

// ---------- regras de remetente ----------
teste("remetente desconhecido com número válido vai para a quarentena", () => {
  const d = decidirEmail({ from: "alguem@escritorio-parceiro.adv.br", subject: `Fwd: processo ${CNJ}`, text: "Veja isto." });
  igual(d.acao, "QUARENTENA");
});

teste("remetente desconhecido, processo CADASTRADO e texto de intimação: entra, marcado como origem não reconhecida", () => {
  const d = decidirEmail({
    from: "alguem@escritorio-parceiro.adv.br",
    subject: `Fwd: intimação — ${CNJ}`,
    text: "Segue a intimação recebida hoje para a parte.",
    processoCadastrado: (n) => n === CNJ,
  });
  igual(d.acao, "ACEITAR");
  if (d.acao === "ACEITAR") igual(d.origemNaoReconhecida, true);
});

teste("processo cadastrado mas sem texto de intimação continua em quarentena", () => {
  const d = decidirEmail({ from: "alguem@x.com", subject: `Bom dia, sobre o ${CNJ}`, text: "Podemos falar amanhã?", processoCadastrado: () => true });
  igual(d.acao, "QUARENTENA");
});

teste("regra PERMITIR do escritório aceita remetente desconhecido; NEGAR recusa", () => {
  const e: EntradaEmail = { from: "avisos@diario-privado.com.br", subject: `Publicação ${CNJ}`, text: "Despacho publicado." };
  igual(decidirEmail(e).acao, "QUARENTENA");
  igual(decidirEmail({ ...e, regras: { permitir: ["@diario-privado.com.br"], negar: [] } }).acao, "ACEITAR");
  igual(decidirEmail({ ...e, regras: { permitir: [], negar: ["avisos@diario-privado.com.br"] } }).acao, "RECUSAR");
});

teste("PERMITIR por endereço vence NEGAR por domínio", () => {
  const e: EntradaEmail = { from: "oficial@vara.exemplo.com", subject: `Intimação ${CNJ}`, text: "Intimação." };
  igual(decidirEmail({ ...e, regras: { permitir: ["oficial@vara.exemplo.com"], negar: ["@exemplo.com"] } }).acao, "ACEITAR");
  igual(decidirEmail({ ...e, regras: { permitir: [], negar: ["@exemplo.com"] } }).acao, "RECUSAR");
});

teste("mensagem em massa de quem não é tribunal é recusada; de tribunal, não", () => {
  const base = { subject: `Despacho ${CNJ}`, text: "Despacho publicado." };
  igual(decidirEmail({ ...base, from: "newsletter@juridico-exemplo.com", cabecalhos: { listUnsubscribe: true } }).acao, "RECUSAR");
  igual(decidirEmail({ ...base, from: "intimacao@tjgo.jus.br", cabecalhos: { listUnsubscribe: true } }).acao, "ACEITAR");
});

// ---------- número de processo ----------
teste("CNJ com dígito verificador errado não vira publicação: quarentena, nunca fila", () => {
  const d = decidirEmail({ from: "intimacao@tjgo.jus.br", subject: "Intimação 0001234-56.2023.5.18.0001", text: "texto" });
  igual(d.acao, "QUARENTENA");
});

teste("número só dentro de resposta citada (linhas '>') não conta", () => {
  igual(acharNumeroDeProcesso("Re: reunião", `Ok, combinado.\n> ${CNJ}\n> intimação`, { remetenteProjudi: false }), null);
});

teste("número curto só vale para remetente do Projudi; de outro remetente é ruído", () => {
  igual(acharNumeroDeProcesso("x", "ref. 5618319.57", { remetenteProjudi: false }), null);
  igual(acharNumeroDeProcesso("x", "processo nº 5618319.57", { remetenteProjudi: true })?.numero, "5618319.57");
});

teste("CNJ válido no assunto é encontrado mesmo com corpo vazio", () => {
  igual(acharNumeroDeProcesso(`[Push] Movimentação processual do processo ${CNJ}`, "", { remetenteProjudi: false })?.tipo, "CNJ");
});

// ---------- utilitários ----------
teste("endereço do remetente em minúsculo, com ou sem nome", () => {
  igual(enderecoDoRemetente("SISTEMAPROJUDI <Sistema-Projudi@TJGO.jus.br>"), "sistema-projudi@tjgo.jus.br");
  igual(enderecoDoRemetente("a@b.com"), "a@b.com");
  igual(enderecoDoRemetente(null), "");
});
teste("reconhece remetente de tribunal", () => {
  verdade(ehRemetenteDeTribunal("sistema-projudi@tjgo.jus.br"), "projudi");
  verdade(ehRemetenteDeTribunal("noreply@trt18.jus.br"), "jus.br");
  verdade(ehRemetenteDeTribunal("andamentos@jusbrasil.com.br"), "jusbrasil");
  verdade(!ehRemetenteDeTribunal("alguem@gmail.com"), "gmail comum");
});

resumo("e-mail: critério de captura (número de processo, remetente, quarentena)");
