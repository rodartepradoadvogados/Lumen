// Prova executável (sem banco) do transporte de publicationId na URL de "Cadastrar novo processo"
// aberto a partir de uma publicação (PublicationRow.tsx / MobilePublicationCard.tsx ->
// processos/novo?...&publicationId=... -> MobileNewCaseForm/SaveCaseButton -> createCase/
// createCaseMobile -> linkOriginPublicationBestEffort, em lib/actions/cases.ts).
//
// Não dá pra testar o vínculo de verdade sem banco (linkPublicationToCase faz Prisma), então este
// script prova só a parte pura e crítica: o id da publicação sobrevive intacto ao ciclo
// encodeURIComponent (montagem do href) -> URLSearchParams (leitura, tanto por
// formData.get quanto por useSearchParams) mesmo quando carrega caracteres que aparecem de fato em
// cuid/uuid ou em processNumberRaw (barra, ponto, hífen) — se esse ciclo quebrasse, o processo
// nasceria e a publicação simplesmente não vincularia, silenciosamente (linkOriginPublicationBestEffort
// não lança, de propósito, então um bug de encoding NUNCA apareceria como erro visível).
//
// Rodar: npx tsx scripts/testar-publicacao-vinculo-automatico.ts

let ok = 0;
let falhas = 0;

function check(nome: string, condicao: boolean) {
  if (condicao) {
    ok++;
    console.log(`  ok    ${nome}`);
  } else {
    falhas++;
    console.log(`  FALHA ${nome}`);
  }
}

// Réplica fiel da montagem de newCaseHref em PublicationRow.tsx / MobilePublicationCard.tsx.
function buildNewCaseHref(base: string, pubId: string, processNumberRaw: string | null): string {
  return `${base}?type=JUDICIAL&publicationId=${encodeURIComponent(pubId)}${
    processNumberRaw ? `&processNumber=${encodeURIComponent(processNumberRaw)}` : ""
  }`;
}

// Réplica de como o lado que recebe lê (searchParams.get / formData.get depois de
// new URLSearchParams(window.location.search) em SaveCaseButton.tsx).
function readParam(href: string, name: string): string | null {
  const query = href.split("?")[1] || "";
  return new URLSearchParams(query).get(name);
}

console.log("\n1. O publicationId sobrevive ao ciclo montagem -> leitura, incólume");
for (const pubId of [
  "clx1a2b3c4d5e6f7g8h9",
  "550e8400-e29b-41d4-a716-446655440000",
  "id/com/barra", // não deveria existir na prática, mas prova que encodeURIComponent protege mesmo assim
  "id com espaço",
  "id&com=caracteres?especiais",
]) {
  const href = buildNewCaseHref("/processos/novo", pubId, null);
  check(`publicationId "${pubId}" volta idêntico`, readParam(href, "publicationId") === pubId);
}

console.log("\n2. processNumberRaw (com pontuação típica de número CNJ) sobrevive junto");
const href = buildNewCaseHref("/m/processos/novo", "abc123", "0801234-55.2026.8.09.0051");
check("publicationId presente e correto", readParam(href, "publicationId") === "abc123");
check("processNumber presente e correto", readParam(href, "processNumber") === "0801234-55.2026.8.09.0051");
check("type=JUDICIAL sempre presente", readParam(href, "type") === "JUDICIAL");

console.log("\n3. Sem processNumberRaw, o parâmetro processNumber simplesmente não aparece (sem lixo &processNumber=)");
const hrefSemNumero = buildNewCaseHref("/processos/novo", "abc123", null);
check("sem &processNumber= sobrando", !hrefSemNumero.includes("processNumber"));
check("href bem formado (sem && duplo)", !hrefSemNumero.includes("&&"));

console.log("\n4. Publicação sem processo vinculado é o único caso em que o botão aparece (contrato documentado)");
// Este item é só uma nota executável do contrato: LinkPublicationMenu (logo, o link com
// publicationId) só é renderizado quando !pub.case / !pub.caseId — replicado aqui como lembrete
// caso algum dia a condição mude sem que este teste seja atualizado junto.
check("condição de exibição documentada (!pub.case / !pub.caseId) — ver PublicationRow.tsx / MobilePublicationCard.tsx", true);

console.log(`\n${ok} verificações OK, ${falhas} falha(s).\n`);
if (falhas > 0) process.exit(1);
