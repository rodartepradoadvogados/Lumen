import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe } from "./executar";
import vm from "node:vm";
import { abaAtiva, destinoDoVoltar, ehConversa, ehTelaCheia, guiaDaConversa, idDaConversaNoCaminho, itensDaBarra } from "@/lib/navegacaoDoAtendimentoApp";
import { CHAVE_DO_TEMA, SCRIPT_INICIAL_DO_TEMA, estaEmNoite, lerPreferenciaDeTema } from "@/lib/temaDoAtendimentoApp";

// ============================================================================
// ONDA A DO APLICATIVO DE ATENDIMENTO, ETAPA 1 (casca e navegação): a barra por nível de acesso, a
// tela cheia da conversa, o tema Dia / Noite / Automático e o botão voltar — regra pura + travas de código.
// ============================================================================

const RAIZ = process.cwd();
const le = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf8");

// ── A BARRA POR NÍVEL ───────────────────────────────────────────────────────────────────────────

teste("barra do nível TOTAL: Conversas · Funil · + · Triagem · Mais, nessa ordem", () => {
  igual(itensDaBarra("total").map((i) => i.chave), ["conversas", "funil", "novo", "triagem", "mais"]);
  igual(itensDaBarra("total").map((i) => i.rotulo), ["Conversas", "Funil", "Novo atendimento", "Triagem", "Mais"]);
});

teste("barra do nível PRÓPRIOS: quatro itens, SEM o Funil (o funil é do escritório inteiro)", () => {
  igual(itensDaBarra("proprios").map((i) => i.chave), ["conversas", "novo", "triagem", "mais"]);
});

teste("barra do nível NENHUM: nenhuma (só a tela 'Sem acesso' e o Sair)", () => {
  igual(itensDaBarra("nenhum"), []);
});

teste("os destinos da barra são os do app, e o + abre o novo atendimento que já existe", () => {
  const h = Object.fromEntries(itensDaBarra("total").map((i) => [i.chave, i.href]));
  igual(h, {
    conversas: "/atendimento-app",
    funil: "/atendimento-app/funil",
    novo: "/atendimento-app/novo",
    triagem: "/atendimento-app/triagem",
    mais: "/atendimento-app/mais",
  });
});

// ── TELA CHEIA: a barra some na conversa ────────────────────────────────────────────────────────

teste("a conversa (chat e detalhes) e o + são tela cheia: sem barra inferior", () => {
  verdade(ehTelaCheia("/atendimento-app/cmabc123"), "chat");
  verdade(ehTelaCheia("/atendimento-app/cmabc123/detalhes"), "detalhes");
  verdade(ehTelaCheia("/atendimento-app/novo"), "novo");
});

teste("as abas NÃO são tela cheia: a barra aparece", () => {
  for (const c of ["/atendimento-app", "/atendimento-app/", "/atendimento-app/funil", "/atendimento-app/triagem", "/atendimento-app/mais", "/atendimento-app/tema", "/atendimento-app/perfil", "/atendimento-app/equipe", "/atendimento-app/sair", "/atendimento-app/alertas", "/atendimento-app/conversas"]) {
    verdade(!ehTelaCheia(c), `${c} deveria ter barra`);
  }
});

teste("reconhece a conversa, o id e a guia aberta", () => {
  verdade(ehConversa("/atendimento-app/x1"), "id");
  verdade(!ehConversa("/atendimento-app/funil"), "funil não é conversa");
  verdade(!ehConversa("/outra-coisa/x1"), "fora do app");
  igual(idDaConversaNoCaminho("/atendimento-app/x1/detalhes"), "x1");
  igual(idDaConversaNoCaminho("/atendimento-app/mais"), null);
  igual(guiaDaConversa("/atendimento-app/x1"), "chat");
  igual(guiaDaConversa("/atendimento-app/x1/detalhes"), "detalhes");
  igual(guiaDaConversa("/atendimento-app/mais"), null);
});

teste("a aba acesa: as subtelas de Mais acendem Mais; o app na raiz acende Conversas", () => {
  igual(abaAtiva("/atendimento-app"), "conversas");
  igual(abaAtiva("/atendimento-app/funil"), "funil");
  igual(abaAtiva("/atendimento-app/triagem"), "triagem");
  igual(abaAtiva("/atendimento-app/tema"), "mais");
  igual(abaAtiva("/atendimento-app/novo"), "novo");
});

teste("voltar segue a pilha: Detalhes -> Chat -> lista", () => {
  igual(destinoDoVoltar("detalhes", "x1", "/atendimento-app/x1"), { tipo: "voltar" });
  igual(destinoDoVoltar("detalhes", "x1", null), { tipo: "ir", href: "/atendimento-app/x1" });
  igual(destinoDoVoltar("chat", "x1", "/atendimento-app"), { tipo: "voltar" });
  igual(destinoDoVoltar("chat", "x1", "/atendimento-app/triagem"), { tipo: "voltar" });
  igual(destinoDoVoltar("chat", "x1", null), { tipo: "ir", href: "/atendimento-app" });
  // veio dos Detalhes da própria conversa: não "volta" para ela mesma
  igual(destinoDoVoltar("chat", "x1", "/atendimento-app/x1/detalhes"), { tipo: "ir", href: "/atendimento-app" });
});

// ── TEMA ────────────────────────────────────────────────────────────────────────────────────────

teste("tema: Dia, Noite e Automático; valor estranho vira Dia; Automático segue o sistema", () => {
  igual(lerPreferenciaDeTema("dark"), "dark");
  igual(lerPreferenciaDeTema("auto"), "auto");
  igual(lerPreferenciaDeTema("light"), "light");
  igual(lerPreferenciaDeTema(null), "light");
  igual(lerPreferenciaDeTema("roxo"), "light");
  verdade(!estaEmNoite("light", true), "Dia não segue o sistema");
  verdade(estaEmNoite("dark", false), "Noite é Noite");
  verdade(estaEmNoite("auto", true), "Automático com sistema escuro");
  verdade(!estaEmNoite("auto", false), "Automático com sistema claro");
});

let htmlRestante = new Set<string>();
teste("o script inicial do tema aplica a MESMA regra (executado de verdade, sem piscar o Dia)", () => {
  const roda = (salvo: string | null, sistemaEscuro: boolean, armazenamentoQuebrado = false, htmlDark = false) => {
    const classes = new Set<string>();
    const html = new Set<string>(htmlDark ? ["dark"] : []);
    htmlRestante = html;
    const el = { classList: { toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)) } };
    const contexto = {
      localStorage: { getItem: (k: string) => { if (armazenamentoQuebrado) throw new Error("bloqueado"); return k === CHAVE_DO_TEMA ? salvo : null; } },
      window: { matchMedia: () => ({ matches: sistemaEscuro }) },
      document: {
        getElementById: (id: string) => (id === "atendimento-shell" ? el : null),
        documentElement: { classList: { remove: (c: string) => html.delete(c) } },
      },
    };
    vm.runInNewContext(SCRIPT_INICIAL_DO_TEMA, contexto);
    return classes.has("atendimento-dark");
  };
  verdade(roda("dark", false), "Noite");
  verdade(!roda("light", true), "Dia ignora o sistema");
  verdade(roda("auto", true), "Automático + sistema escuro");
  verdade(!roda("auto", false), "Automático + sistema claro");
  verdade(!roda(null, true), "sem escolha = Dia");
  verdade(!roda(null, false, true), "armazenamento bloqueado não derruba a página");
  // REGRESSÃO (o botão de tema "não funcionava"): o `dark` que o layout raiz põe no <html> (sistema escuro
  // ou site em Noite) fazia o Dia sair escuro. Dentro do app, o <html> não pode ficar `dark`.
  verdade(!roda("light", true, false, true), "Dia com sistema escuro continua Dia");
  verdade(!htmlRestante.has("dark"), "o script tira o `dark` do site do <html>");
  roda("dark", false, false, true);
  verdade(!htmlRestante.has("dark"), "Noite também não deixa o `dark` do site no <html>");
});

teste("o tema do app não deixa o `dark` do site vazar: aplicar() tira e a saída do app devolve", () => {
  const tema = codigoDe(le("components/atendimento-app/tema.ts"));
  verdade(tema.includes('document.documentElement.classList.remove("dark")'), "aplicar() precisa tirar o dark do <html>");
  verdade(tema.includes("devolverTemaDoSite") && tema.includes("temaEfetivo()"), "sair do app devolve o tema do site");
  const seguidor = codigoDe(le("components/atendimento-app/SeguidorDeNavegacao.tsx"));
  verdade(seguidor.includes("useEffect(() => devolverTemaDoSite, [])"), "o seguidor devolve o tema ao desmontar");
  const css = le("app/globals.css");
  verdade(/\.atendimento-dark\s*\{[^}]*--sf-fundo:/.test(css), "a paleta de Noite do app é toda de .atendimento-dark");
});

teste("a casca aplica a barra por nível e esconde na tela cheia; o layout barra o nível nenhum", () => {
  const casca = codigoDe(le("app/atendimento-app/(shell)/AtendimentoAppShell.tsx"));
  verdade(casca.includes("ehTelaCheia(pathname)") && casca.includes("<BarraInferior nivel={nivel}"), "casca");
  const layout = codigoDe(le("app/atendimento-app/(shell)/layout.tsx"));
  verdade(layout.includes('nivel === "nenhum"'), "o nível nenhum não renderiza filhos");
  verdade(layout.includes("Sem acesso ao Atendimento"), "título da tela sem acesso");
  const barra = codigoDe(le("components/atendimento-app/BarraInferior.tsx"));
  verdade(barra.includes("itensDaBarra(nivel)"), "a barra usa a regra por nível");
});
teste("nada de hex, de fonte fora da rampa nem de sombra na barra e no cabeçalho do app (só tokens)", () => {
  for (const f of ["components/atendimento-app/BarraInferior.tsx", "components/atendimento-app/BotaoVoltar.tsx", "app/atendimento-app/(shell)/AtendimentoAppShell.tsx"]) {
    const codigo = codigoDe(le(f));
    verdade(!/#[0-9a-fA-F]{3,8}\b/.test(codigo), `${f}: hex cru`);
    verdade(!new RegExp("text-\\[\\d+" + "px\\]").test(codigo), `${f}: tamanho de fonte fora da rampa`);
    verdade(!/\bshadow-/.test(codigo), `${f}: sombra`);
  }
});

resumo("Atendimento app, onda A — casca e navegação");
