import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe } from "./executar";
import { RAIL_SECTIONS, visibleSectionItems, type ContextoDeVisibilidade } from "@/lib/navSections";
import { veTodoOAtendimento, podeVerAtendimentos } from "@/lib/acessoAtendimento";
import type { OfficeModules } from "@/lib/officeModules";

// ============================================================================
// A CENTRAL DE ATENDIMENTO — ETAPA 1 (casca e navegação).
//
// Fundir Atendimentos + Triagem num item de menu só é reversível; ALARGAR quem enxerga o quê não
// é — por isso esta suíte mira, antes de tudo, a regra de acesso: o item de menu exige o portão
// mais baixo (`atendimentoOnly`, igual ao antigo "Atendimentos"), e a aba Triagem, DENTRO da
// tela, continua exigindo o portão mais alto (`atendimentoTotal`) — sem ela aparecer desabilitada
// ou cinza: ausente do DOM. A rota de servidor da Triagem antiga
// (app/(app)/atendimento/funil/page.tsx) não é tocada nesta etapa, e continua sendo ELA a trava
// de verdade — esconder a aba na tela nova é só conveniência.
// ============================================================================

const RAIZ = process.cwd();
const CTX = (over: Partial<ContextoDeVisibilidade> = {}): ContextoDeVisibilidade => ({
  hasFinanceAccess: false,
  modules: { financeiro: true, whatsapp: true, atendimento: true, assessoria: true } as OfficeModules,
  podeAtendimento: false,
  veTodoAtendimento: false,
  ...over,
});

const comunicacao = RAIL_SECTIONS.find((s) => s.key === "comunicacao");

// ── 1. A seção tem exatamente três itens, na ordem pedida ──────────────────────────────────────

teste("Comunicação tem exatamente três itens: Publicações, Contatos, Atendimento — nesta ordem", () => {
  verdade(!!comunicacao, "a seção 'comunicacao' sumiu de RAIL_SECTIONS — varredura cega");
  igual(comunicacao!.items.map((i) => i.label), ["Publicações", "Contatos", "Atendimento"]);
});

teste("o item fundido aponta para a rota nova, e ela abre em aba nova do navegador", () => {
  const item = comunicacao!.items.find((i) => i.label === "Atendimento");
  verdade(!!item, "o item 'Atendimento' não existe mais em Comunicação");
  igual(item!.href, "/atendimento-central");
  igual(item!.abrirEmNovaAba, true, "sem abrirEmNovaAba, o item cairia no clique único/duplo comum — mesma aba do Lúmen");
});

teste("as rotas antigas não foram removidas do menu por acidente — elas simplesmente não têm mais item próprio", () => {
  // Nenhum item de Comunicação aponta mais para /atendimento ou /atendimento/funil — o item novo
  // é o único caminho de menu para o módulo. As ROTAS em si continuam existindo (ver a suíte de
  // "toda página de atendimento tem a trava de nível" em acesso.teste.ts, que ainda as encontra).
  const hrefs = comunicacao!.items.map((i) => i.href);
  igual(hrefs.includes("/atendimento"), false);
  igual(hrefs.includes("/atendimento/funil"), false);
});

// ── 2. O item exige atendimentoOnly, NÃO MAIS QUE ISSO ──────────────────────────────────────────

teste("o item 'Atendimento' aparece para quem só tem atendimentoOnly — o portão mais baixo, igual ao antigo 'Atendimentos'", () => {
  const visiveis = visibleSectionItems(comunicacao!, CTX({ podeAtendimento: true, veTodoAtendimento: false }));
  verdade(visiveis.some((i) => i.label === "Atendimento"), "quem tem atendimentoOnly deveria ver o item 'Atendimento'");
});

teste("HARD GATE: quem não tem NENHUM acesso ao Atendimento não vê o item, mesmo com o resto liberado", () => {
  const visiveis = visibleSectionItems(comunicacao!, CTX({ podeAtendimento: false, veTodoAtendimento: false, hasFinanceAccess: true }));
  igual(visiveis.some((i) => i.label === "Atendimento"), false);
});

teste("o item não exige NADA além de atendimentoOnly — não é adminOnly, não é financeOnly, não depende de veTodoAtendimento", () => {
  const item = comunicacao!.items.find((i) => i.label === "Atendimento")!;
  igual(item.atendimentoOnly, true);
  igual(Boolean(item.atendimentoTotal), false, "o item não pode exigir atendimentoTotal — isso alargaria a régua para BAIXO do que a Triagem antiga exigia, ou faria o item sumir para quem só tem atendimentoOnly");
  igual(Boolean(item.adminOnly), false);
});

// ── 3. A aba Triagem, dentro da tela, continua exigindo atendimentoTotal — e a rota de servidor
//       da Triagem antiga não foi afrouxada. Esta é a mutação que mais importa: quem só tem
//       atendimentoOnly (nível "proprios") NUNCA pode ver a Triagem, nem pela aba nova, nem pela
//       URL antiga. ──────────────────────────────────────────────────────────────────────────────

const advogadoNaEscala = { isAdmin: false, role: "Advogado", recebeTransferencia: true }; // nível "proprios": só atendimentoOnly
const socio = { isAdmin: true, role: "Sócio", recebeTransferencia: true }; // nível "total": atendimentoOnly E atendimentoTotal

teste("quem só tem atendimentoOnly (nível 'proprios') NÃO tem atendimentoTotal", () => {
  igual(podeVerAtendimentos(advogadoNaEscala), true);
  igual(veTodoOAtendimento(advogadoNaEscala), false);
});

teste("quem vê tudo (nível 'total') tem os dois portões", () => {
  igual(podeVerAtendimentos(socio), true);
  igual(veTodoOAtendimento(socio), true);
});

const PAGE = codigoDe(readFileSync(join(RAIZ, "app", "atendimento-central", "page.tsx"), "utf8"));
const FUNIL_PAGE = codigoDe(readFileSync(join(RAIZ, "app", "(app)", "atendimento", "funil", "page.tsx"), "utf8"));

teste("TRAVA: a Central de Atendimento decide a aba Triagem por veTodoOAtendimento, não por podeVerAtendimentos", () => {
  // A linha exata que decide se a aba existe. Procura a CHAMADA (não só o import) — um import
  // órfão de veTodoOAtendimento não gate nada.
  verdade(/const veTodo = veTodoOAtendimento\(viewer\);/.test(PAGE),
    "app/atendimento-central/page.tsx não calcula mais `veTodo` a partir de veTodoOAtendimento(viewer) — a mutação que afrouxaria a Triagem para atendimentoOnly não seria pega");
});

teste("TRAVA: a Triagem só é oferecida (aba visível E dados de escritório inteiro buscados) quando veTodo é verdadeiro", () => {
  // O SELETOR DE ABAS: sem `veTodo &&` na frente, a aba apareceria para todo mundo.
  verdade(/\{veTodo && \(/.test(PAGE), "o seletor de abas principais não está condicionado a `veTodo` — a aba Triagem apareceria para quem só tem atendimentoOnly");
  // AS CONSULTAS DE ESCRITÓRIO INTEIRO (fila, funil, recusados): sem o gate, elas rodariam e a
  // aba mostraria dado de quem não deveria ver, mesmo que o botão da aba estivesse escondido.
  verdade(/if \(veTodo\) \{/.test(PAGE), "as consultas de Triagem (fila/funil/recusados) não estão dentro de `if (veTodo)` — rodariam para qualquer nível de acesso");
  // O CONTEÚDO DA ABA: mesmo que alguém force `?aba=triagem` na URL, o painel não pode renderizar
  // sem veTodo também aqui — a linha força o fallback para "atendimentos".
  verdade(/abaPedida === "triagem" && !veTodo/.test(PAGE),
    "a página não força mais '?aba=triagem' de volta para 'atendimentos' quando falta atendimentoTotal — a URL direta bastaria para ver a Triagem");
  verdade(/aba === "triagem" && veTodo/.test(PAGE), "o painel de Triagem é renderizado sem checar `veTodo` de novo no JSX — um bug em `aba` sozinho abriria a Triagem para quem não pode");
});

teste("TRAVA: a rota de servidor da Triagem ANTIGA (/atendimento/funil) continua recusando quem não tem atendimentoTotal — não foi tocada nesta etapa", () => {
  verdade(/if \(!veTodoOAtendimento\(viewer\)\) notFound\(\);/.test(FUNIL_PAGE),
    "app/(app)/atendimento/funil/page.tsx deixou de barrar por veTodoOAtendimento — a trava de servidor da Triagem, que é a que vale de verdade, foi afrouxada");
});

teste("a Central de Atendimento também barra na entrada por podeVerAtendimentos (o portão mais baixo, para todo o resto)", () => {
  verdade(/if \(!podeVerAtendimentos\(viewer\)\) notFound\(\);/.test(PAGE),
    "app/atendimento-central/page.tsx perdeu a trava de nível mínimo — quem não tem acesso nenhum não pode nem chegar a esta tela");
});

// ── 4. Os tokens dos três planos existem, e os da moldura têm o MESMO valor nos dois temas ─────

const CSS = readFileSync(join(RAIZ, "app", "atendimento-central", "atendimento-central.css"), "utf8");

function ocorrencias(token: string): string[] {
  const re = new RegExp(`${token}:\\s*([^;]+);`, "g");
  return [...CSS.matchAll(re)].map((m) => m[1].trim());
}

teste("os tokens de MOLDURA existem e aparecem UMA SÓ VEZ no arquivo — a prova de que não mudam de tema", () => {
  const molduraTokens = [
    "--frame-bg",
    "--frame-bg-raised",
    "--frame-border",
    "--frame-border-strong",
    "--frame-tx-0",
    "--frame-tx-1",
    "--frame-tx-2",
    "--frame-tx-ghost",
    "--frame-accent",
  ];
  for (const t of molduraTokens) {
    const vals = ocorrencias(t);
    igual(vals.length, 1, `${t} deveria ser declarado uma única vez (nunca redeclarado em .dark) — encontrei ${vals.length} declaração(ões)`);
  }
});

teste("os tokens de LISTA e TRABALHO existem e trocam de valor entre os dois temas", () => {
  const conteudoTokens = ["--list-bg", "--list-bg-hover", "--work-bg", "--work-bg-raised"];
  for (const t of conteudoTokens) {
    const vals = ocorrencias(t);
    igual(vals.length, 2, `${t} deveria ter exatamente duas declarações (clara e escura) — encontrei ${vals.length}`);
    verdade(vals[0] !== vals[1], `${t} tem o MESMO valor nos dois temas (${vals[0]}) — isto é um token de moldura, não de conteúdo`);
  }
});

teste("--work-bg-raised do tema escuro é um TOKEN de verdade neste arquivo, não um número mágico solto no componente", () => {
  verdade(CSS.includes("--work-bg-raised: #323e55;"), "o valor derivado de --work-bg-raised (escuro) não está declarado como token no arquivo de paleta");
  // E não pode estar solto em `page.tsx` como hex cru — só via var(--work-bg-raised) ou clases
  // Tailwind normais (bg-sf etc, dos componentes hospedados).
  verdade(!/#[0-9a-fA-F]{3,8}/.test(PAGE), "app/atendimento-central/page.tsx tem hex cru — algum token da paleta vazou como número mágico em vez de var(--...)");
});

teste("o texto explica a diferença entre o alternador desta tela e o do Peticionamento — decisão registrada, não implícita", () => {
  // Não é uma trava de comportamento, mas garante que a decisão (mesmo mecanismo .dark do
  // resto do site, e não um data-theme próprio como o Peticionamento) fica registrada em código,
  // e não só na cabeça de quem escreveu.
  verdade(CSS.includes(".dark .atd-central"), "o arquivo de tokens não usa mais a classe .dark do site — o mecanismo de tema mudou sem atualizar a decisão registrada");
});

// ── 5. Nenhuma rota de app/m mudou de comportamento ─────────────────────────────────────────────

teste("app/m não importa lib/navSections — a mudança de menu do desktop não pode vazar para o app de celular", () => {
  const arquivosDoApp = [
    "app/m/page.tsx",
    "app/m/mais/page.tsx",
    "app/m/atendimento/page.tsx",
    "app/m/atendimento/[id]/page.tsx",
    "app/m/atendimento/novo/page.tsx",
  ];
  for (const rel of arquivosDoApp) {
    const t = readFileSync(join(RAIZ, rel), "utf8");
    igual(t.includes("navSections"), false, `${rel} passou a importar lib/navSections — o app de celular não deveria depender do menu do desktop`);
  }
});

teste("as rotas de atendimento do app de celular continuam apontando para /m/atendimento, sem mudança", () => {
  const maisPage = readFileSync(join(RAIZ, "app", "m", "mais", "page.tsx"), "utf8");
  verdade(maisPage.includes('"/m/atendimento"'), "app/m/mais/page.tsx deixou de apontar para /m/atendimento — o item de navegação do celular mudou de destino");
});

resumo("Central de Atendimento — etapa 1 (casca e navegação)");
