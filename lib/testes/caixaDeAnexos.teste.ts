import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teste, igual, verdade, resumo, codigoDe } from "./executar";
import { DESTINOS, caixaVisivelEm, destinoDaRota, destinosPermitidos, sugerirTipoPeloNome } from "@/lib/caixaDeAnexos";

// ============================================================================
// A CAIXA DE ANEXOS DO PORTAL (DESIGN.md §10, aprovada pelo dono em 15/10/2026).
// O que fica travado:
//   1. onde ela aparece (toda tela do portal, menos Atendimento e Petições) e em que lugar (a barra
//      de sub-abas, nos dois ramos: com e sem abas);
//   2. só destinos operacionais que o servidor sabe anexar (nada financeiro, nada de tarefa avulsa),
//      com os mesmos portões de acesso do resto do portal;
//   3. a sugestão de tipo pelo nome do arquivo (e que ela nunca inventa);
//   4. o envio passa pelos caminhos que já existem e já reconferem tudo no servidor;
//   5. as buscas do assistente usam o MESMO recorte do envio (escritório, quem vê o atendimento, módulo).
// ============================================================================

const RAIZ = process.cwd();
const le = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf8");
const CAIXA = codigoDe(le("components", "CaixaDeAnexos.tsx"));
const ACOES = codigoDe(le("lib", "actions", "caixaDeAnexos.ts"));
const BARRA = codigoDe(le("components", "PageSectionTabs.tsx"));

teste("ONDE APARECE: em toda tela do portal, menos Atendimento e Petições", () => {
  for (const r of ["/painel", "/processos", "/processos/abc", "/agenda", "/kanban", "/assessoria/x", "/financeiro/despesas", "/contatos"]) verdade(caixaVisivelEm(r), `some em ${r}`);
  for (const r of ["/atendimento", "/atendimento/abc", "/atendimento/funil", "/peticionamento", "/atendimento-central"]) verdade(!caixaVisivelEm(r), `aparece em ${r}`);
});

teste("NA BARRA DE SUB-ABAS: a caixa entra nos dois ramos (com abas e sem abas, como o Painel)", () => {
  igual((BARRA.match(/\{caixa\}/g) ?? []).length, 2, "a caixa não está nos dois ramos da barra: ");
  verdade(/<CaixaDeAnexos podeAtendimento=\{podeAtendimento\} assessoria=\{Boolean\(modules\?\.assessoria\)\} \/>/.test(BARRA), "a barra não repassa os portões de acesso");
  verdade(/h-10/.test(BARRA), "a barra mudou de altura (o quadro da página saltaria)");
});

teste("DESTINOS: só os operacionais que o servidor anexa — sem Financeiro e sem tarefa avulsa", () => {
  igual(DESTINOS.map((d) => d.tipo), ["processo", "caso", "atendimento", "assessoria"]);
  verdade(!/financ|tarefa|task/i.test(JSON.stringify(DESTINOS)), "destino financeiro ou de tarefa voltou");
  igual(destinosPermitidos({ podeAtendimento: false, assessoria: false }), ["processo", "caso"]);
  igual(destinosPermitidos({ podeAtendimento: true, assessoria: true }), ["processo", "caso", "atendimento", "assessoria"]);
});

teste("ANEXAR AQUI: a tela atual vira o destino só quando é um registro", () => {
  igual(destinoDaRota("/processos/ck123"), { tipo: "processo", id: "ck123" });
  igual(destinoDaRota("/processos/ck123/editar"), { tipo: "processo", id: "ck123" });
  igual(destinoDaRota("/assessoria/a9?aba=docs"), { tipo: "assessoria", id: "a9" });
  igual(destinoDaRota("/atendimento/at1"), { tipo: "atendimento", id: "at1" });
  for (const r of ["/processos", "/processos/novo", "/atendimento/funil", "/agenda", null]) igual(destinoDaRota(r), null, `${r}: `);
});

teste("SUGESTÃO DE TIPO: acha pelo nome, prefere o nome mais completo, e não inventa", () => {
  const casos: [string, string | null][] = [
    ["Replica_Marina_Alves_v3.docx", "REPLICA"],
    ["Contestacao final.pdf", "CONTESTACAO"],
    ["Peticao inicial com tutela.pdf", "PETICAO_INICIAL"],
    ["Peticao.pdf", "PETICAO"],
    ["Procuracao assinada.pdf", "PROCURACAO"],
    ["Contrato social consolidado.pdf", "CONTRATO_SOCIAL"],
    ["CNH.pdf", "DOC_PESSOAL_PF_PJ"],
    ["Atestado medico.pdf", "ATESTADO_MEDICO"],
    ["foto.jpg", null],
    ["IMG_2026_10_15.jpeg", null],
  ];
  for (const [nome, esperado] of casos) igual(sugerirTipoPeloNome(nome), esperado, `${nome}: `);
});

teste("ENVIO: pelos caminhos que já existem (Blob temporário + finalizeAttachmentUpload / rota da Assessoria)", () => {
  verdade(/handleUploadUrl: "\/api\/attachments\/blob-token"/.test(CAIXA), "sem o Blob temporário (o limite de corpo da função barraria arquivo grande)");
  verdade(/finalizeAttachmentUpload\(/.test(CAIXA), "processo/caso/atendimento/licitação não passam por finalizeAttachmentUpload");
  verdade(/fetch\("\/api\/assessoria\/documentos\/upload"/.test(CAIXA), "assessoria não passa pela rota dela");
  // res.ok ANTES do corpo — um 413/504 de fora da rota não é JSON (mesma lição de AssessoriaDocumentosTab).
  verdade(/corpo = await res\.json\(\)[\s\S]{0,120}catch[\s\S]{0,80}if \(!res\.ok\)/.test(CAIXA), "o erro HTTP pode virar texto genérico");
  verdade(/router\.refresh\(\)/.test(CAIXA), "a tela não se atualiza depois de anexar");
});

teste("NADA SEM CONFIRMAÇÃO: soltar ou escolher arquivo abre o pop-up, nunca envia direto", () => {
  const comecar = CAIXA.slice(CAIXA.indexOf("const comecar = useCallback"), CAIXA.indexOf("}, []);", CAIXA.indexOf("const comecar = useCallback")));
  verdade(/setEtapa\("confirmar"\)/.test(comecar) && !/upload\(/.test(comecar), "o arquivo sai sem a pessoa confirmar");
  verdade(/Anexar este documento\?|Anexar estes/.test(CAIXA), "sem a pergunta do pop-up");
});

teste("BUSCAS: o mesmo recorte do envio — escritório sempre, quem vê o atendimento, módulo da assessoria", () => {
  const blocos = ACOES.split(/export async function /).slice(1);
  for (const b of blocos) verdade(/getCurrentUser\(\)/.test(b), `${b.slice(0, 30)}: sem sessão`);
  verdade((ACOES.match(/officeId: user\.officeId/g) ?? []).length >= 6, "alguma consulta sem o escritório");
  verdade(/if \(!podeVerAtendimentos\(user\)\) return \{ itens: \[\] \}/.test(ACOES) && /\.\.\.whereDoAtendimento\(user\)/.test(ACOES), "atendimento sem o recorte de quem vê");
  verdade((ACOES.match(/if \(!modulos\.assessoria\)/g) ?? []).length >= 2, "assessoria sem o portão do módulo");
  verdade(!/update|create|delete|upsert/.test(ACOES.replace(/createdAt|updatedAt/g, "")), "as ações da caixa só leem — o envio é dos caminhos que já existem");
});

resumo("Caixa de Anexos do portal (15/10/2026)");
