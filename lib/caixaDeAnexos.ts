// A CAIXA DE ANEXOS DO PORTAL (DESIGN.md §10, 15/10/2026) — a parte pura, sem banco nem tela.
//
// A caixa pontilhada fixa na barra de sub-abas recebe arquivos de qualquer tela do portal e um
// assistente leva cada um ao lugar exato (Onde → Qual → Tipo → Conferir). Este módulo guarda as
// regras que não dependem de servidor: quais destinos existem, o que a tela atual já diz sobre o
// destino (o atalho "Anexar aqui"), onde a caixa NÃO aparece e a sugestão de tipo pelo nome do arquivo.

import { DOCUMENT_TYPE_GROUPS } from "@/lib/documentTypes";

/**
 * Os destinos OPERACIONAIS que o Lúmen já sabe anexar (nada financeiro):
 *   processo / caso → Attachment.caseId           (lib/actions/attachments.ts:finalizeAttachmentUpload)
 *   atendimento     → Attachment.attendanceId     (idem, com o recorte de quem vê o atendimento)
 *   assessoria      → AssessoriaDocumento         (app/api/assessoria/documentos/upload), em três partes:
 *                     documento da empresa, um parecer/demanda, ou uma licitação (Attachment.licitacaoId).
 * "Tarefa da agenda" ficou de fora de propósito: o servidor só anexa em tarefa DE LICITAÇÃO; uma
 * tarefa avulsa cairia na raiz do Drive sem vínculo nenhum.
 */
export type TipoDeDestino = "processo" | "caso" | "atendimento" | "assessoria";
export type ParteDaAssessoria = "empresa" | "parecer" | "licitacao";

export const DESTINOS: { tipo: TipoDeDestino; nome: string; apoio: string }[] = [
  { tipo: "processo", nome: "Processo", apoio: "judicial ou administrativo" },
  { tipo: "caso", nome: "Caso", apoio: "extrajudicial" },
  { tipo: "atendimento", nome: "Atendimento", apoio: "lead ou cliente em triagem" },
  { tipo: "assessoria", nome: "Assessoria jurídica", apoio: "documento da empresa, parecer ou licitação" },
];

export const PARTES_DA_ASSESSORIA: { parte: ParteDaAssessoria; nome: string; apoio: string }[] = [
  { parte: "empresa", nome: "Documento da empresa", apoio: "contrato, procuração, ata, alvará…" },
  { parte: "parecer", nome: "Um parecer (demanda)", apoio: "a pasta do parecer" },
  { parte: "licitacao", nome: "Uma licitação", apoio: "edital, proposta, habilitação" },
];

/** Quais destinos esta pessoa pode usar (os mesmos portões do resto do portal). */
export function destinosPermitidos(acesso: { podeAtendimento: boolean; assessoria: boolean }): TipoDeDestino[] {
  return DESTINOS.map((d) => d.tipo).filter((t) => (t === "atendimento" ? acesso.podeAtendimento : t === "assessoria" ? acesso.assessoria : true));
}

/**
 * O destino que a TELA ATUAL já diz (o atalho "Anexar aqui" do primeiro passo). Processo e caso
 * moram na mesma rota (/processos/[id]); quem distingue é o servidor, pelo `type` do registro.
 */
export function destinoDaRota(pathname: string | null | undefined): { tipo: "processo" | "atendimento" | "assessoria"; id: string } | null {
  if (!pathname) return null;
  const m = pathname.match(/^\/(processos|atendimento|assessoria)\/([^/?#]+)/);
  if (!m) return null;
  const id = decodeURIComponent(m[2]);
  // Rotas de lista/ação que não são um registro.
  if (["novo", "funil", "nova"].includes(id)) return null;
  const tipo = m[1] === "processos" ? "processo" : m[1] === "atendimento" ? "atendimento" : "assessoria";
  return { tipo, id };
}

/**
 * Onde a caixa NÃO aparece: Atendimento e Petições (pedido do dono). A Central e o Peticionamento
 * já moram fora do portal; as rotas antigas /atendimento* continuam dentro dele e ficam de fora aqui.
 */
export function caixaVisivelEm(pathname: string | null | undefined): boolean {
  if (!pathname) return true;
  return !/^\/(atendimento|peticionamento|atendimento-central)(\/|$)/.test(pathname);
}

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\.[a-z0-9]{1,5}$/, "") // extensão
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Siglas e nomes do dia a dia que o rótulo do catálogo não escreve.
const APELIDOS: Record<string, string[]> = {
  DOC_PESSOAL_PF_PJ: ["CNH", "Identidade", "Carteira de Trabalho"],
};

const CONECTIVOS = new Set(["de", "da", "do", "das", "dos", "e", "a", "o", "ao", "em", "para", "com"]);

/**
 * O tipo SUGERIDO pelo nome do arquivo — só sugestão, sempre editável no passo Tipo.
 * Procura, no catálogo nativo, o tipo cujas palavras (sem conectivos) aparecem todas no nome; entre
 * vários, fica o de mais palavras ("Petição Inicial" ganha de "Petição"). Palavra de 4+ letras casa
 * pelo começo ("contestacao" casa "contestacao_final"; "procuracao" casa "procuracoes"); "RG" e
 * "CNH" casam inteiras. Nada que se pareça: null — o passo Tipo fica vazio e a pessoa escolhe.
 */
export function sugerirTipoPeloNome(nomeDoArquivo: string): string | null {
  const palavrasDoNome = normalizar(nomeDoArquivo).split(" ").filter(Boolean);
  if (palavrasDoNome.length === 0) return null;
  const casa = (palavra: string) =>
    palavrasDoNome.some((p) => (palavra.length >= 4 ? p.startsWith(palavra.slice(0, Math.max(4, palavra.length - 2))) : p === palavra));
  let melhor: { key: string; peso: number } | null = null;
  for (const grupo of DOCUMENT_TYPE_GROUPS) {
    for (const t of grupo.types) {
      if (t.key === "OUTRO") continue;
      // Rótulo composto ("CPF/RG/Contrato Social/…") = alternativas: basta uma casar inteira.
      for (const alternativa of [...t.label.split("/"), ...(APELIDOS[t.key] ?? [])]) {
        const palavras = normalizar(alternativa)
          .split(" ")
          .filter((p) => p && !CONECTIVOS.has(p));
        if (palavras.length === 0 || !palavras.every(casa)) continue;
        // Empate: o tipo que se chama SÓ isso ganha do rótulo composto ("Contrato Social" > "CPF/RG/Contrato Social/…").
        const peso = palavras.length + (t.label.includes("/") ? 0 : 0.5);
        if (!melhor || peso > melhor.peso) melhor = { key: t.key, peso };
      }
    }
  }
  return melhor?.key ?? null;
}
