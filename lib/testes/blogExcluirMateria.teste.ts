import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe, corpoDaFuncao } from "./executar";

// ============================================================================
// BOTÃO DE EXCLUIR MATÉRIA — pedido do dono do escritório, 24/09/2026: "botão de excluir matéria
// cadastrada pelo escritório" (as matérias do Blog Jurídico, model BlogPost).
//
// Exclusão é destrutiva, e o pedido explícito foi confirmação + exclusão REVERSÍVEL, no mesmo
// padrão `excluidaEm` que já existe em PeticionamentoCitacao — nunca DELETE físico. A suíte prova
// as duas pontas: o schema só GANHOU coluna anulável (nenhuma existente foi tocada, e o mesmo
// campo de PeticionamentoCitacao continua de pé — controle de que a varredura mirou o modelo
// certo), e a ação/UI usam soft-delete de ponta a ponta, sem reabrir a matéria em nenhum lugar que
// já mostrava só o que está PUBLICADO/pendente de verdade.
// ============================================================================

const RAIZ = process.cwd();

// PeticionamentoCitacao TAMBÉM declara um campo `excluidaEm` — por isso a leitura não pode ser
// `schema.includes("excluidaEm")` (casaria no modelo errado, ou nos dois, sem provar qual é qual:
// a armadilha de âncora que casa no lugar errado). Extrai só o bloco `model <nome> { ... }` por
// CONTAGEM DE CHAVES, mesma técnica de corpoDaFuncao (executar.ts) para função TypeScript.
function blocoDoModelo(schema: string, nome: string): string {
  const cabecalho = `model ${nome} {`;
  const i = schema.indexOf(cabecalho);
  if (i < 0) return "";
  let nivel = 0;
  for (let j = i; j < schema.length; j++) {
    if (schema[j] === "{") nivel++;
    else if (schema[j] === "}") {
      nivel--;
      if (nivel === 0) return schema.slice(i, j + 1);
    }
  }
  return "";
}

const SCHEMA = readFileSync(join(RAIZ, "prisma", "schema.prisma"), "utf8");
const BLOG_POST_MODEL = blocoDoModelo(SCHEMA, "BlogPost");
const PETICIONAMENTO_CITACAO_MODEL = blocoDoModelo(SCHEMA, "PeticionamentoCitacao");

// ── 1. O SCHEMA — coluna nova, anulável, no modelo certo ────────────────────────────────────────

teste("a varredura achou o bloco certo do modelo BlogPost, e não o arquivo inteiro nem outro modelo", () => {
  verdade(BLOG_POST_MODEL.length > 200, "blocoDoModelo não achou 'model BlogPost { ... }' — varredura cega");
  verdade(BLOG_POST_MODEL.length < 3000, "o bloco transbordou para o próximo modelo — a contagem de chaves não fechou no lugar certo");
  verdade(!BLOG_POST_MODEL.includes("model Photo"), "o bloco extraído engoliu o modelo seguinte (Photo) — corpo errado, as asserções abaixo valeriam para outro modelo");
});

teste("BlogPost ganhou excluidaEm e excluidaPorId, os dois ANULÁVEIS — nenhuma coluna obrigatória nova", () => {
  verdade(/excluidaEm\s+DateTime\?/.test(BLOG_POST_MODEL),
    "excluidaEm sumiu do modelo BlogPost, ou deixou de ser anulável — `prisma db push` roda DEPOIS do build em produção, e uma coluna obrigatória sem valor quebraria toda linha de BlogPost já cadastrada");
  verdade(/excluidaPorId\s+String\?/.test(BLOG_POST_MODEL),
    "excluidaPorId sumiu do modelo BlogPost, ou deixou de ser anulável");
});

teste("nenhuma coluna existente de BlogPost foi removida ou renomeada — só acréscimo", () => {
  const camposDeSempre = ["id", "slug", "title", "area", "type", "summary", "content", "status", "officeId"];
  for (const campo of camposDeSempre) {
    verdade(new RegExp(`\\b${campo}\\b`).test(BLOG_POST_MODEL), `o campo '${campo}' de BlogPost sumiu do schema — coluna removida apaga dado de produção`);
  }
});

teste("controle: o excluidaEm de PeticionamentoCitacao (de outra entrega) continua de pé, sem relação com este — prova de que a varredura mirou o modelo certo", () => {
  verdade(PETICIONAMENTO_CITACAO_MODEL.length > 200, "blocoDoModelo não achou PeticionamentoCitacao — o teste de controle não vale nada");
  verdade(/excluidaEm\s+DateTime\?/.test(PETICIONAMENTO_CITACAO_MODEL), "PeticionamentoCitacao perdeu seu próprio excluidaEm — mudança fora do escopo desta entrega");
});

// ── 2. A AÇÃO deleteBlogPost — soft-delete de verdade, com o mesmo portão das outras ────────────

const BLOG_ACTIONS_FONTE = readFileSync(join(RAIZ, "lib", "actions", "blog.ts"), "utf8");
const DELETE_BODY = corpoDaFuncao(BLOG_ACTIONS_FONTE, "deleteBlogPost");

teste("a varredura achou o corpo de deleteBlogPost, e não o arquivo inteiro nem a função vizinha", () => {
  verdade(DELETE_BODY.length > 100, "corpoDaFuncao não achou deleteBlogPost — varredura cega, as asserções abaixo passariam sobre string vazia");
  verdade(DELETE_BODY.length < 1200, "o corpo transbordou para a função seguinte (unpublishBlogPost) — asserção sobre trecho errado");
  verdade(!DELETE_BODY.includes("unpublishBlogPost"), "o corpo de deleteBlogPost inclui a função vizinha — a heurística de fechamento de chave furou");
});

teste("MUTAÇÃO PRINCIPAL: deleteBlogPost nunca apaga a linha — soft-delete, nunca DELETE físico", () => {
  verdade(!/blogPost\.delete\(/.test(DELETE_BODY),
    "deleteBlogPost passou a chamar prisma.blogPost.delete — isso é DELETE FÍSICO; o pedido foi exclusão reversível (mesmo padrão de PeticionamentoCitacao.excluidaEm)");
  verdade(/excluidaEm:\s*new Date\(\)/.test(DELETE_BODY), "deleteBlogPost não seta excluidaEm — deixou de marcar a exclusão");
  verdade(/excluidaPorId:\s*viewer\.id/.test(DELETE_BODY), "deleteBlogPost não registra quem excluiu (excluidaPorId)");
});

teste("deleteBlogPost passa pelo mesmo portão das outras ações do blog, e barra por escritório de quem pediu", () => {
  verdade(/assertBlogAdmin\(\)/.test(DELETE_BODY),
    "deleteBlogPost não chama assertBlogAdmin — qualquer usuário logado (não só admin com acesso ao Blog) poderia excluir matéria");
  verdade(/officeId:\s*viewer\.officeId/.test(DELETE_BODY),
    "deleteBlogPost não filtra por officeId de quem pediu — um id de matéria de OUTRO escritório poderia ser excluído (o multi-tenant é o isolamento por officeId em toda consulta)");
});

teste("deleteBlogPost não encontra (e não reprocessa) uma matéria já excluída", () => {
  verdade(/excluidaEm:\s*null/.test(DELETE_BODY),
    "o findFirst de deleteBlogPost deixou de exigir excluidaEm: null — clicar duas vezes, ou duas abas na mesma matéria, encontraria e reprocessaria quem já foi excluído");
});

teste("todo findFirst de lib/actions/blog.ts (as 6 ações) exige excluidaEm: null — nenhuma ação opera sobre matéria já excluída", () => {
  const semComentarios = codigoDe(BLOG_ACTIONS_FONTE);
  const comGuardaCompleta = [...semComentarios.matchAll(/officeId:\s*viewer\.officeId,\s*excluidaEm:\s*null/g)];
  igual(comGuardaCompleta.length, 6, "esperava 6 ocorrências de 'officeId: viewer.officeId, excluidaEm: null' (uma por ação) em lib/actions/blog.ts — alguma ação perdeu a guarda contra matéria já excluída");
});

// ── 3. TODO PONTO DE LEITURA QUE MOSTRA A MATÉRIA exclui quem já foi excluído ───────────────────
//
// Cada arquivo abaixo tem uma prova PRÓPRIA (não um `includes("excluidaEm")` solto no arquivo
// inteiro, que casaria em qualquer comentário) — a busca é pela QUERY que já filtrava por
// status/officeId, ganhando `excluidaEm: null` ao lado, tolerante a quebra de linha e espaço.

function leCodigoDe(caminhoRelativo: string): string {
  return codigoDe(readFileSync(join(RAIZ, caminhoRelativo), "utf8"));
}

teste("app/(app)/configuracoes/page.tsx: as duas listas do admin (pendente e publicada) excluem quem já foi excluído", () => {
  const c = leCodigoDe("app/(app)/configuracoes/page.tsx");
  verdade(/status:\s*"AGUARDANDO_REVISAO",\s*excluidaEm:\s*null/.test(c), "a lista de revisão pendente do admin (computador) não filtra excluidaEm: null");
  verdade(/status:\s*"PUBLICADO",\s*excluidaEm:\s*null/.test(c), "a lista de publicadas do admin (computador) não filtra excluidaEm: null");
});

teste("app/m/configuracoes/page.tsx: as mesmas duas listas, no PWA, também excluem quem já foi excluído", () => {
  const c = leCodigoDe("app/m/configuracoes/page.tsx");
  verdade(/status:\s*"AGUARDANDO_REVISAO",\s*excluidaEm:\s*null/.test(c), "a lista de revisão pendente do admin (celular) não filtra excluidaEm: null — o PWA reusa BlogReviewManager, mas a QUERY daqui é própria e também precisa do filtro");
  verdade(/status:\s*"PUBLICADO",\s*excluidaEm:\s*null/.test(c), "a lista de publicadas do admin (celular) não filtra excluidaEm: null");
});

teste("app/blog/page.tsx: a listagem pública não mostra matéria excluída", () => {
  const c = leCodigoDe("app/blog/page.tsx");
  verdade(/status:\s*"PUBLICADO",\s*excluidaEm:\s*null/.test(c), "a listagem pública do blog não filtra excluidaEm: null — uma matéria excluída continuaria aparecendo para qualquer visitante");
});

teste("app/blog/[slug]/page.tsx: as QUATRO consultas (metadata, a ficha, mesma área, recentes) excluem quem já foi excluído", () => {
  const c = leCodigoDe("app/blog/[slug]/page.tsx");
  // As duas primeiras (generateMetadata e a página) buscam por slug — o status ainda não é
  // conhecido nesse ponto (é conferido DEPOIS, em `post.status !== "PUBLICADO"`), então elas não
  // têm `status: "PUBLICADO"` no `where`; teriam de ter `excluidaEm: null` mesmo assim, senão a
  // ficha de uma matéria excluída continuaria abrindo por URL direta.
  const porSlug = [...c.matchAll(/slug:\s*params\.slug,\s*officeId:\s*office\.id,\s*excluidaEm:\s*null/g)];
  igual(porSlug.length, 2, "esperava 2 ocorrências de 'slug: params.slug, officeId: office.id, excluidaEm: null' (generateMetadata e a página) — alguma das duas perdeu o filtro, e a matéria excluída continuaria abrindo pela URL");
  // As outras duas (mesma área, recentes) já filtram por status: "PUBLICADO".
  const porStatus = [...c.matchAll(/status:\s*"PUBLICADO",\s*excluidaEm:\s*null/g)];
  igual(porStatus.length, 2, "esperava 2 ocorrências de 'status: \"PUBLICADO\", excluidaEm: null' (mesma área e recentes) — alguma das duas consultas de 'continuar lendo' perdeu o filtro");
});

teste("app/sitemap.ts: URL de matéria excluída sai do sitemap público", () => {
  const c = leCodigoDe("app/sitemap.ts");
  verdade(/status:\s*"PUBLICADO",\s*excluidaEm:\s*null/.test(c), "o sitemap não filtra excluidaEm: null — a URL de uma matéria excluída continuaria sendo anunciada para indexação");
});

teste("app/api/photos/file/[id]/route.ts: matéria excluída deixa de contar como post público (a foto volta a exigir sessão)", () => {
  const c = leCodigoDe("app/api/photos/file/[id]/route.ts");
  verdade(/status:\s*"PUBLICADO",\s*excluidaEm:\s*null/.test(c),
    "linkedToPublicPost não filtra excluidaEm: null — a foto de uma matéria já excluída continuaria servida sem sessão, como se o post ainda estivesse no ar");
});

// ── 4. A UI — confirmação antes de excluir, nos dois lugares onde a matéria aparece ─────────────

const REVIEW_FONTE = readFileSync(join(RAIZ, "components", "BlogReviewManager.tsx"), "utf8");
const REVIEW = codigoDe(REVIEW_FONTE);
const PUBLISHED_FONTE = readFileSync(join(RAIZ, "components", "BlogPublishedManager.tsx"), "utf8");
const PUBLISHED = codigoDe(PUBLISHED_FONTE);

teste("BlogReviewManager: existe um botão de excluir, chamando deleteBlogPost, com confirmação ANTES da chamada", () => {
  verdade(REVIEW.includes("deleteBlogPost"), "BlogReviewManager não importa/usa deleteBlogPost — não há como excluir uma matéria pendente");
  verdade(/onClick=\{handleDelete\}/.test(REVIEW), "nenhum elemento chama handleDelete — o botão de excluir não está ligado a nada");

  const corpo = corpoDaFuncao(REVIEW_FONTE, "handleDelete");
  verdade(corpo.length > 30, "corpoDaFuncao não achou handleDelete em BlogReviewManager — varredura cega");
  const c = codigoDe(corpo);
  const iConfirm = c.indexOf("window.confirm(");
  const iDelete = c.indexOf("deleteBlogPost(");
  verdade(iConfirm >= 0, "handleDelete não pede confirmação (window.confirm) — exclusão destrutiva sem confirmar é o defeito que este pedido existe para evitar");
  verdade(iDelete >= 0, "handleDelete não chama deleteBlogPost");
  verdade(iConfirm < iDelete, "a confirmação vem DEPOIS da chamada a deleteBlogPost — a matéria já teria sido excluída antes de perguntar");
});

teste("BlogPublishedManager: existe um botão de excluir, chamando deleteBlogPost, com confirmação ANTES da chamada", () => {
  verdade(PUBLISHED.includes("deleteBlogPost"), "BlogPublishedManager não importa/usa deleteBlogPost — não há como excluir uma matéria já publicada");
  verdade(/onClick=\{\(\)\s*=>\s*handleDelete\(/.test(PUBLISHED), "nenhum elemento chama handleDelete — o botão de excluir não está ligado a nada");

  const corpo = corpoDaFuncao(PUBLISHED_FONTE, "handleDelete");
  verdade(corpo.length > 30, "corpoDaFuncao não achou handleDelete em BlogPublishedManager — varredura cega");
  const c = codigoDe(corpo);
  const iConfirm = c.indexOf("window.confirm(");
  const iDelete = c.indexOf("deleteBlogPost(");
  verdade(iConfirm >= 0, "handleDelete não pede confirmação (window.confirm)");
  verdade(iDelete >= 0, "handleDelete não chama deleteBlogPost");
  verdade(iConfirm < iDelete, "a confirmação vem DEPOIS da chamada a deleteBlogPost — a matéria já teria sido excluída antes de perguntar");
});

teste("nenhum dos dois botões de excluir usa hex cru — só tokens (var(--...) via classe Tailwind)", () => {
  // O par usado (text-atencao / hover:bg-grave-bg) é o mesmo de components/DeleteButton.tsx —
  // aqui só se garante que não voltou hex cru para os dois arquivos tocados por esta entrega.
  verdade(!/#[0-9a-fA-F]{3,8}/.test(REVIEW), "BlogReviewManager.tsx ganhou hex cru");
  verdade(!/#[0-9a-fA-F]{3,8}/.test(PUBLISHED), "BlogPublishedManager.tsx ganhou hex cru");
});

resumo("Botão de excluir matéria do blog jurídico (soft-delete)");
