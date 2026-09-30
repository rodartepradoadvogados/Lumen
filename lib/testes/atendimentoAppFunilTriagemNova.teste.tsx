import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe } from "./executar";
import LinhaDaTriagem from "@/components/atendimento-app/LinhaDaTriagem";

// ============================================================================
// ETAPA 4 do acabamento WhatsApp: Funil, Triagem, Nova conversa e telas de estado (30/09/2026). Só VISUAL:
// os recortes de acesso e as ações continuam provados em atendimentoAppLista/atendimentoAppCasca/... e aqui
// se confere que nenhum deles saiu do lugar.
// ============================================================================

const le = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
const canal = (c: number) => ((c / 255) <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
const lum = (h: string) => 0.2126 * canal(parseInt(h.slice(1, 3), 16)) + 0.7152 * canal(parseInt(h.slice(3, 5), 16)) + 0.0722 * canal(parseInt(h.slice(5, 7), 16));
const contraste = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

const FUNIL = codigoDe(le("app/atendimento-app/(shell)/funil/page.tsx"));
const TRIAGEM = codigoDe(le("app/atendimento-app/(shell)/triagem/page.tsx"));
const NOVO = codigoDe(le("app/atendimento-app/(shell)/novo/page.tsx"));
const FORM = codigoDe(le("components/mobile/MobileNewAttendanceForm.tsx"));

teste("ACESSO INTACTO: o Funil segue só para nível total (notFound antes de consultar) e todas as telas usam o recorte", () => {
  verdade(FUNIL.includes("if (!veTodoOAtendimento(viewer)) notFound();"), "funil: quem só vê os próprios não tem funil");
  verdade(FUNIL.indexOf("notFound()") < FUNIL.indexOf("prisma.attendance.findMany"), "funil: recusa antes da consulta");
  verdade(/whereDoAtendimento\(viewer\)/.test(FUNIL) && /whereDoAtendimento\(viewer\)/.test(TRIAGEM), "funil e triagem com o recorte de dono");
  verdade(TRIAGEM.includes("findAttendanceIdsByLooseName(q, baseFilters)"), "a busca da triagem leva o recorte");
  verdade(FUNIL.includes("exigirAcessoAoAtendimentoNaTela()") && TRIAGEM.includes("exigirAcessoAoAtendimentoNaTela()") && NOVO.includes("exigirAcessoAoAtendimentoNaTela()"), "as três telas exigem acesso");
  verdade(!FUNIL.includes("draggable") && !FUNIL.includes("onDrop"), "não há arrastar no celular");
});

teste("FUNIL: cartão de lead sem contorno pesado, com avatar, nome, assunto, selinho de fase, dias e responsável", () => {
  // (não dá para renderizar: o seletor de fase usa useRouter; a conferência é sobre o código do cartão)
  const c = codigoDe(le("components/atendimento-app/LeadDoFunil.tsx"));
  verdade(c.includes("<Avatar nome={lead.clientName}") && c.includes("{lead.clientName}") && c.includes("{lead.subject}"), "avatar, nome, assunto");
  verdade(c.includes('<Selinho tom="fase">{stageLabels[estagio]}</Selinho>'), "selinho de fase");
  verdade(c.includes('<Selinho tom="alerta">Follow-up atrasado</Selinho>'), "follow-up atrasado em selinho de alerta");
  verdade(c.includes("dia(s) no estágio") && c.includes("{lead.responsavel}"), "dias no estágio e responsável");
  verdade(!/\bborder\b|border-2/.test(c), "sem contorno no cartão");
  verdade(c.includes("href={`/atendimento-app/${lead.id}`}") && c.includes("min-h-[72px]"), "a linha abre a conversa, alvo >= 72 px");
  verdade(c.includes("Motivo: {lead.lostReason}"), "motivo da perda continua à vista");
  verdade(c.includes('s !== "PERDIDO" || lead.stage === "PERDIDO"'), "não se manda para Perdido por este seletor (regra do motivo da perda)");
  verdade(c.indexOf("</Link>") < c.indexOf("<EstagioDoLeadSelect"), "o seletor é irmão do link (link dentro de link é HTML inválido)");
  verdade(FUNIL.includes("followUpAtrasado: Boolean(followupLate)") && FUNIL.includes('!["FECHADO", "PERDIDO"].includes(a.stage)'), "regra do follow-up atrasado intacta");
});

teste("FUNIL: colunas recolhidas por padrão, cartão preenchido, contagem em SeloContagem, estado vazio amigável", () => {
  const c = codigoDe(le("components/atendimento-app/ColunasDoFunilApp.tsx"));
  verdade(c.includes("bg-atd-pilula") && !/\bborder\b/.test(c), "coluna = cartão preenchido, sem contorno");
  verdade(c.includes("<SeloContagem valor={total}"), "contagem em SeloContagem");
  verdade(c.includes("useColunasRecolhidas"), "regra de recolhimento compartilhada");
  verdade(FUNIL.includes("Nenhum atendimento neste estágio."), "estado vazio amigável");
  verdade(FUNIL.includes("<ColunasDoFunilApp"), "usa as colunas do app");
});

teste("FUNIL: o seletor de fase mostra o erro (não engole) e mantém alvo de 44 px, foco visível herdado", () => {
  const s = codigoDe(le("components/atendimento/EstagioDoLeadSelect.tsx"));
  verdade(s.includes('role="alert"') && s.includes("setErro("), "falha ao mudar de fase aparece na tela");
  verdade(s.includes("min-h-11"), "alvo de 44 px");
  verdade(s.includes("setAttendanceStage(") && s.includes("setValor(anterior)"), "mesma ação, volta ao valor anterior em falha");
  verdade(le("app/globals.css").includes(".atendimento-shell :where(a, button, input, select, textarea, summary, [tabindex]):focus-visible"), "foco visível global do app cobre select/botão/link");
});

teste("TRIAGEM: fila no estilo da lista (avatar, sem divisória, selinhos), filtros em pílula, busca em pílula, vazio amigável", () => {
  const html = renderToStaticMarkup(<LinhaDaTriagem linha={{ id: "t1", clientName: "Carlos Lima", subject: "Contrato de aluguel", status: "NOVO", channel: "WHATSAPP", area: "Cível", data: "30/09/2026", responsavel: "Dr. Paulo" }} />);
  verdade(html.includes(">CL<") && html.includes("Carlos Lima") && html.includes("Contrato de aluguel"), "avatar, nome, assunto");
  verdade(html.includes('data-tom="fase"') && html.includes("WhatsApp") && html.includes("Cível") && html.includes("Dr. Paulo"), "selinhos e responsável");
  verdade(html.includes("min-h-[72px]") && html.includes('href="/atendimento-app/t1"'), "linha inteira é o alvo (>= 72 px)");
  verdade(!html.includes("divide-") && !html.includes("border-b"), "sem divisória");
  verdade(TRIAGEM.includes("<FiltroPilula") && TRIAGEM.includes("<CampoPilula") && !TRIAGEM.includes("divide-y") && !TRIAGEM.includes("<Card"), "filtros e busca em pílula; sem cartão com divisórias");
  verdade(TRIAGEM.includes('aria-current') || TRIAGEM.includes("ativo={"), "aba ativa marcada");
  verdade(TRIAGEM.includes("Nenhum atendimento aqui") && TRIAGEM.includes("Nada encontrado"), "estados vazios em português");
  verdade(TRIAGEM.includes('name="q"') && TRIAGEM.includes('type="submit"') && TRIAGEM.includes('action="/atendimento-app/triagem"'), "busca por formulário GET (funciona sem JavaScript)");
  verdade(TRIAGEM.includes("bg-atd-ouro") && TRIAGEM.includes("text-atd-ouro-tx"), "botão Buscar em ouro com tinta escura");
  verdade(!TRIAGEM.includes("/atendimento-app/novo"), "o 'Novo' da tela virou o botão flutuante da casca (sem duplicar)");
});

teste("NOVA CONVERSA: variante do app em pílulas, botão primário ouro, erro visível; o site (/m) não passa a variante", () => {
  verdade(FORM.includes('variante?: "app"') && FORM.includes("bg-atd-pilula"), "variante do app");
  verdade(FORM.includes("bg-atd-ouro") && FORM.includes("text-atd-ouro-tx") && FORM.includes("h-[52px]"), "botão primário ouro de 52 px");
  verdade(FORM.includes("min-h-11"), "campos com alvo de 44 px");
  verdade(FORM.includes('role="alert"') && FORM.includes("Preencha ao menos o nome do contato e o assunto."), "erro visível e mesma validação");
  verdade(/createAttendance\(\{[\s\S]*clientName,/.test(FORM) && FORM.includes("finalizeAttachmentUpload"), "mesma criação e mesmos anexos");
  verdade(NOVO.includes('variante="app"'), "a rota do app pede a variante");
  const site = codigoDe(le("app/m/(shell)/atendimento/novo/page.tsx"));
  verdade(!site.includes("variante"), "o site segue com o visual de sempre");
  verdade(NOVO.includes("exigirAcessoAoAtendimentoNaTela") && NOVO.includes("modules.atendimento"), "acesso e módulo desligado seguem conferidos");
  verdade(!NOVO.includes("atd-hdr") && !NOVO.includes("border-ouro-acento"), "sem cabeçalho em faixa nem filete de ouro");
});

teste("ESTADOS: erro, sem acesso à conversa, sem acesso ao Atendimento e tela indisponível no acabamento novo, com alvo de 44 px", () => {
  const arquivos = ["app/atendimento-app/(shell)/error.tsx", "components/atendimento-app/SemAcessoAConversa.tsx", "app/atendimento-app/(shell)/not-found.tsx"];
  for (const f of arquivos) {
    const c = codigoDe(le(f));
    verdade(c.includes("rounded-atd-pilula") && c.includes("min-h-11"), `${f}: botão em pílula de 44 px`);
    verdade(!c.includes("rounded-[2px]") && !/bg-ouro-acento|bg-sf-fundo/.test(c), `${f}: sem o visual antigo`);
  }
  const erro = codigoDe(le(arquivos[0]));
  verdade(erro.includes('role="alert"') && erro.includes("Tentar de novo") && erro.includes("bg-atd-ouro"), "erro: alerta, texto amigável, ouro");
  const layout = codigoDe(le("app/atendimento-app/(shell)/layout.tsx"));
  verdade(layout.includes("rounded-atd-pilula") && layout.includes("nivel === \"nenhum\"") && layout.includes("SEM_ACESSO_AO_ATENDIMENTO"), "sem acesso ao Atendimento: mesma regra, botão novo");
  const sem = codigoDe(le("components/atendimento-app/SemAcessoAConversa.tsx"));
  verdade(sem.includes("ATENDIMENTO_DE_OUTRA_PESSOA") && !/clientName|contactPhone|subject/.test(sem), "sem acesso à conversa: nenhum dado do lead");
  const nf = codigoDe(le(arquivos[2]));
  verdade(!/prisma|clientName/.test(nf), "tela indisponível não lê banco");
});

teste("CONTRASTE AA nas combinações novas destas telas, em Dia e Noite", () => {
  const css = le("app/globals.css");
  const bloco = (sel: string) => { const i = css.indexOf(`\n${sel} {`); return css.slice(i, css.indexOf("\n}\n", i)); };
  const dia = bloco(".atendimento-shell"), noite = bloco(".atendimento-dark");
  const val = (t: string, n: string): string => {
    const m = (t === "noite" ? noite : dia).match(new RegExp(`--${n}:\\s*([^;]+);`)) ?? dia.match(new RegExp(`--${n}:\\s*([^;]+);`));
    const v = m![1].trim();
    const r = v.match(/^var\(--([a-z0-9-]+)\)$/);
    return r ? val(t, r[1]) : v;
  };
  for (const t of ["dia", "noite"]) {
    for (const [a, b] of [["atd-cinza-previa", "atd-pilula-bg-2"], ["atd-cinza-terciario", "atd-pilula-bg"], ["atd-texto-ouro", "atd-ouro-suave"], ["atd-ouro-tx", "atd-ouro"], ["atd-selo-tx", "atd-selo-bg"], ["atd-cinza-previa", "atd-tela"]]) {
      verdade(contraste(val(t, a), val(t, b)) >= 4.5, `${a} sobre ${b} em ${t}`);
    }
  }
  igual(FUNIL.includes("text-atd-terciario"), true);
});

teste("HIGIENE: nada de hex, de fonte fora da rampa nem de sombra nos arquivos novos", () => {
  for (const f of ["components/atendimento-app/ColunasDoFunilApp.tsx", "components/atendimento-app/LeadDoFunil.tsx", "components/atendimento-app/LinhaDaTriagem.tsx", "app/atendimento-app/(shell)/funil/page.tsx", "app/atendimento-app/(shell)/triagem/page.tsx", "app/atendimento-app/(shell)/novo/page.tsx", "app/atendimento-app/(shell)/not-found.tsx"]) {
    const c = codigoDe(le(f));
    verdade(!/#[0-9a-fA-F]{3,8}\b/.test(c), `${f}: hex cru`);
    verdade(!new RegExp("text-\\[\\d+" + "px\\]").test(c), `${f}: fonte fora da rampa`);
    verdade(!/\bshadow-/.test(c), `${f}: sombra`);
  }
});

teste("SITE INTACTO: o quadro do funil do site e da Central não importam nada do acabamento do app", () => {
  for (const f of ["components/atendimento/QuadroDoFunil.tsx", "components/atendimento/ColunasRecolhiveis.tsx", "app/(app)/atendimento/funil/page.tsx"]) {
    verdade(!/atendimento-app\//.test(le(f)), `${f} importa o app`);
  }
});

teste("CONTORNO DOS CAMPOS: site e /m ficam IDÊNTICOS (classes de sempre, sem o token do app); o app leva o contorno só na variante", () => {
  const INPUT_DO_SITE = "w-full mt-1 border border-regua px-3 py-2 text-sm text-tx bg-sf focus:outline-none focus:ring-2 focus:ring-marca-tx";
  verdade(FORM.includes(`const INPUT_DO_SITE =\n  "${INPUT_DO_SITE}"`), "input do site em /m: a mesma string de antes");
  verdade(FORM.includes('"flex-1 min-w-0 border border-regua px-3 py-2 text-sm text-tx bg-sf focus:outline-none focus:ring-2 focus:ring-marca-tx"'), "assunto do site: igual");
  verdade(FORM.includes('"text-corpo border border-regua bg-sf text-tx rounded px-1.5 py-1 max-w-[140px] shrink-0"'), "tipo de documento do anexo no site: igual");
  verdade(/const ehApp = variante === "app";/.test(FORM) && /ehApp \? APP\.pais : undefined/.test(FORM) && /ehApp \? APP\.ddi : undefined/.test(FORM) && /ehApp \? APP\.pend : undefined/.test(FORM) && /ehApp \? APP\.selo :/.test(FORM), "todo campo novo é condicionado à variante do app");
  const tel = codigoDe(le("components/PhoneInput.tsx"));
  verdade(tel.includes('classeDoPais ?? "h-full flex items-center gap-1 border border-regua rounded-md px-2.5 text-sm text-tx bg-sf whitespace-nowrap"') && tel.includes('classeDoDdi ?? "w-16 shrink-0 border border-regua rounded-md px-2 text-sm text-tx bg-sf text-center"'), "PhoneInput sem props: visual de sempre");
  verdade(!tel.includes("atd-"), "PhoneInput não conhece tokens do app");
  const pend = codigoDe(le("components/PendenciasEditor.tsx"));
  verdade(pend.includes('classeDoCampo ?? INPUT_DO_SITE') && pend.includes('INPUT_DO_SITE = "w-full text-xs border border-regua-forte bg-sf text-tx px-2 py-1"') && !pend.includes("atd-"), "PendenciasEditor sem prop: visual de sempre");
  for (const f of ["app/m/(shell)/atendimento/novo/page.tsx", "components/NewAttendanceModal.tsx", "components/AttendancePendenciasPanel.tsx"]) {
    const c = codigoDe(le(f));
    verdade(!c.includes("atd-campo") && !c.includes("classeDoDdi") && !c.includes("classeDoCampo") && !c.includes('variante="app"'), `${f}: sem nada do contorno do app`);
  }
});

resumo("Atendimento app — Funil, Triagem, Nova conversa e estados (etapa 4)");
