import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe } from "./executar";
import { ITENS, GRUPOS, SECAO_LEGADA, itemAtivo, itemVisivelEmConfiguracao, hrefDoItem } from "@/lib/gestao/configuracoes";
import { RAIL_SECTIONS, sectionForPathname, resolveTwoLevelLabel } from "@/lib/navSections";

// A NOVA GESTÃO (PR gestao-redesenho): o mapa de Configurações, os redirecionamentos que impedem
// link salvo de quebrar, o gabarito único e as regras de cor do plano.

const RAIZ = process.cwd();
const ler = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");
function arquivos(dir: string, acc: string[] = []): string[] {
  for (const n of readdirSync(join(RAIZ, dir))) {
    const rel = `${dir}/${n}`;
    if (statSync(join(RAIZ, rel)).isDirectory()) arquivos(rel, acc);
    else if (/\.(tsx|ts)$/.test(n)) acc.push(rel);
  }
  return acc;
}
const PAGINAS_DE_GESTAO = [...arquivos("app/(app)/indicadores"), ...arquivos("app/(app)/conexoes"), ...arquivos("app/(app)/contatos"), ...arquivos("app/(app)/configuracoes")];
const COMPONENTES_DE_GESTAO = [...arquivos("components/gestao"), ...arquivos("components/indicadores"), ...arquivos("components/configuracoes"), ...arquivos("components/conexoes")];

teste("Configurações: seis grupos, cada um com pelo menos um item, chaves únicas", () => {
  igual(GRUPOS.map((g) => g.chave), ["conta", "escritorio", "pessoas", "fluxos", "dados", "plano"]);
  for (const g of GRUPOS) verdade(ITENS.some((i) => i.grupo === g.chave), `grupo ${g.chave} sem item`);
  igual(new Set(ITENS.map((i) => i.chave)).size, ITENS.length, "chave de item repetida");
});

teste("Configurações: todo nome antigo de ?secao= tem destino (ou redireciona) — nenhum link salvo quebra", () => {
  for (const [antigo, novo] of Object.entries(SECAO_LEGADA)) {
    if (novo !== null) verdade(ITENS.some((i) => i.chave === novo && !i.href), `?secao=${antigo} aponta para '${novo}', que não existe`);
  }
  const p = codigoDe(ler("app/(app)/configuracoes/page.tsx"));
  verdade(/searchParams\.secao === "equipe"[^\n]*redirect\("\/contatos\/equipe"\)/.test(p), "?secao=equipe não redireciona para Pessoas > Equipe");
});

teste("Configurações: item ativo pela rota própria e pelo nome antigo", () => {
  igual(itemAtivo("/configuracoes/comunicados", null, ITENS)?.chave, "comunicados");
  igual(itemAtivo("/configuracoes/acessos/previa", null, ITENS)?.chave, "acessos");
  igual(itemAtivo("/configuracoes", "geral", ITENS)?.chave, "senha");
  igual(itemAtivo("/configuracoes", "atendimento", ITENS)?.chave, "recusa");
  igual(itemAtivo("/configuracoes", null, ITENS)?.chave, "senha");
  igual(hrefDoItem(ITENS.find((i) => i.chave === "financeiro")!), "/configuracoes?secao=financeiro");
});

teste("Configurações: quem não é administrador vê só o que já via (senha, comunicados, aplicativo, identidade, acessos, privacidade, importar)", () => {
  const ctx = { isAdmin: false, blog: true, whatsapp: true, atendimento: true };
  igual(ITENS.filter((i) => itemVisivelEmConfiguracao(i, ctx)).map((i) => i.chave), ["senha", "comunicados", "aplicativo", "identidade", "acessos", "privacidade", "importar"]);
  const adm = { isAdmin: true, blog: false, whatsapp: false, atendimento: false };
  const chaves = ITENS.filter((i) => itemVisivelEmConfiguracao(i, adm)).map((i) => i.chave);
  verdade(!chaves.includes("blog") && !chaves.includes("atendente") && !chaves.includes("recusa"), "item de módulo não contratado apareceu");
  verdade(chaves.includes("usuarios") && chaves.includes("cobranca"), "administrador perdeu item");
});

teste("Navegação: as rotas antigas continuam na seção Gestão e o rótulo da guia é o novo", () => {
  for (const rota of ["/relatorios", "/relatorios/personalizado/imprimir", "/produtividade", "/indicadores/processos", "/contatos/duplicados", "/conexoes/relatorio-pastas", "/configuracoes/acessos/previa"]) {
    igual(sectionForPathname(rota), "gestao", `${rota} saiu da seção Gestão`);
  }
  igual(resolveTwoLevelLabel("/contatos/clientes"), "Gestão - Pessoas");
  igual(resolveTwoLevelLabel("/indicadores/produtividade"), "Gestão - Indicadores");
  igual(RAIL_SECTIONS.find((s) => s.key === "gestao")!.items[0].href, "/indicadores");
});

teste("Redirecionamentos: as rotas antigas existem e só redirecionam", () => {
  const casos: [string, RegExp][] = [
    ["app/(app)/relatorios/page.tsx", /redirect\("\/indicadores/],
    ["app/(app)/produtividade/page.tsx", /redirect\(`\/indicadores\/produtividade/],
    ["app/(app)/contatos/page.tsx", /redirect\("\/contatos\/clientes"\)/],
    ["app/(app)/configuracoes/duplicados/page.tsx", /redirect\("\/contatos\/duplicados"\)/],
    ["app/(app)/configuracoes/relatorio-pastas/page.tsx", /redirect\("\/conexoes\/relatorio-pastas"\)/],
  ];
  for (const [arq, re] of casos) verdade(re.test(codigoDe(ler(arq))), `${arq} não redireciona`);
  verdade(/redirect\("\/delegar"\)/.test(codigoDe(ler("app/(app)/produtividade/page.tsx"))), "?aba=delegar não vai para /delegar");
});

teste("Gabarito: nenhuma página de Gestão monta o próprio <h1> (PageHeader) — só o PaginaGestao", () => {
  // A ficha de um cliente (/contatos/clientes/[id]) é uma página de REGISTRO, como a do processo:
  // o título dela é o nome do cliente, e não o destino.
  for (const arq of PAGINAS_DE_GESTAO.filter((a) => !a.includes("[id]"))) {
    const c = codigoDe(ler(arq));
    verdade(!/<PageHeader/.test(c), `${arq} usa PageHeader: o título deve vir do gabarito`);
    verdade(!/<h1/.test(c), `${arq} tem <h1> próprio`);
  }
  const g = codigoDe(ler("components/gestao/PaginaGestao.tsx"));
  verdade(/<h1 className="text-autuacao font-bold/.test(g), "o h1 do gabarito perdeu 28/700");
});

teste("Cor e forma: sem bordô em gráfico, sem filete lateral colorido, sem hex cru nem tamanho arbitrário nas telas de Gestão", () => {
  for (const arq of [...PAGINAS_DE_GESTAO, ...COMPONENTES_DE_GESTAO]) {
    const c = codigoDe(ler(arq));
    verdade(!/border-l-4/.test(c), `${arq}: border-l-4`);
    verdade(!/text-\[\d+px\]/.test(c), `${arq}: tamanho de fonte arbitrário`);
    if (/indicadores/.test(arq)) verdade(!/#[0-9a-fA-F]{6}\b/.test(c), `${arq}: hex cru`);
  }
});

teste("Acesso: Financeiro e inadimplência só aparecem a quem tem acesso ao Financeiro; funil só a quem vê o Atendimento todo", () => {
  const v = codigoDe(ler("app/(app)/indicadores/page.tsx"));
  verdade(/socio = Boolean\(viewer\.isAdmin \|\| viewer\.financeAccess\)/.test(v), "regra de sócio mudou");
  verdade(/{socio && \(/.test(v), "o bloco de dinheiro deixou de ser condicionado ao sócio");
  verdade(/vFunil = Boolean\(modulos\.atendimento && veTodoOAtendimento\(viewer\)\)/.test(v), "regra do funil mudou");
  verdade(/somenteUserId: socio \? undefined : viewer\.id/.test(v), "quem não é sócio passou a ver a carga da equipe");
  verdade(/notFound\(\)/.test(codigoDe(ler("app/(app)/indicadores/[secao]/page.tsx"))), "URL direta de Financeiro sem acesso não devolve 404");
  verdade(/if \(!permitido\) return null/.test(codigoDe(ler("lib/gestao/inadimplencia.ts"))) && /if \(!permitido\) return null/.test(codigoDe(ler("lib/gestao/receitaEResultado.ts"))), "as consultas de dinheiro perderam a trava de permissão");
});

resumo("Gestão — redesenho");
