// Vários anexos no cadastro são finalizados em sequência (baixa do Blob + Drive por item) — pode
// passar dos 10s padrão da Vercel; ver mesmo comentário em lib/actions/cases.ts.
export const maxDuration = 60;

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/currentUser";
import { isStorageConnected } from "@/lib/storageProvider";
import { createCase } from "@/lib/actions/cases";
import { PageHeader, Card } from "@/components/ui";
import MoneyInput from "@/components/MoneyInput";
import ClientPicker from "@/components/ClientPicker";
import OpposingPartyFields from "@/components/OpposingPartyFields";
import AssessoriaSelect from "@/components/AssessoriaSelect";
import SaveCaseButton from "@/components/SaveCaseButton";
import NewCaseAttachmentsField from "@/components/NewCaseAttachmentsField";
import NovoCaseNaturezaSection from "@/components/NovoCaseNaturezaSection";
import CaseMateriaField from "@/components/processo/CaseMateriaField";
import AssuntosField from "@/components/processo/AssuntosField";

export const dynamic = "force-dynamic";

export default async function NewCasePage({ searchParams }: { searchParams: { type?: string; processNumber?: string; title?: string; assessoriaId?: string } }) {
  const viewer = await getCurrentUser();
  if (!viewer) notFound();

  const defaultType = searchParams.type || "JUDICIAL";
  // "Processo" (tem número e tramita em órgão, ver lib/caseNatureza.ts) é o único caso em que o
  // NaturezaPicker faz sentido — "Caso" (Extrajudicial/Atendimento/Consultivo, chegados por
  // NewEntityMenu.tsx ou por link antigo) continua exatamente como sempre foi, com o <select>
  // de Tipo original, sem o passo de natureza.
  const isProcessoFlow = defaultType === "JUDICIAL" || defaultType === "ADMINISTRATIVO";
  const initialNatureza: "JUDICIAL" | "ADMINISTRATIVO" = defaultType === "ADMINISTRATIVO" ? "ADMINISTRATIVO" : "JUDICIAL";
  const [clients, users, assessoriasRaw, tribunais, storageConnected] = await Promise.all([
    prisma.client.findMany({ where: { officeId: viewer.officeId }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { active: true, officeId: viewer.officeId }, orderBy: { name: "asc" } }),
    // Só assessorias ATIVAS entram na lista — MAS a assessoria de origem entra sempre, mesmo
    // suspensa ou encerrada. Sem essa exceção, quem clicava "Novo processo"/"Novo caso" de
    // dentro de uma assessoria não-ATIVA via o seletor sumir e o vínculo se perdia no submit,
    // sem erro nenhum. Ver components/AssessoriaSelect.tsx.
    prisma.assessoria.findMany({
      where: {
        officeId: viewer.officeId,
        ...(searchParams.assessoriaId
          ? { OR: [{ status: "ATIVA" }, { id: searchParams.assessoriaId }] }
          : { status: "ATIVA" }),
      },
      include: { client: true },
      orderBy: { client: { name: "asc" } },
    }),
    // Tribunal é catálogo global (sem officeId) — a ordenação real por CATEGORIA_ORDER acontece
    // no componente cliente (TribunalPickerModal), aqui só traz os dados.
    prisma.tribunal.findMany({ orderBy: [{ categoria: "asc" }, { ordem: "asc" }] }),
    // Gate da área de arrastar arquivo: pergunta pelo ARMAZENAMENTO do escritório, não pelo
    // Google. Um escritório em OneDrive ou Dropbox tem armazenamento conectado e mesmo assim
    // não via onde soltar o arquivo, porque a checagem era específica do Drive.
    isStorageConnected(viewer.officeId),
  ]);
  // `status` vai junto para o seletor poder marcar "(Suspensa)"/"(Encerrada)" na assessoria de
  // origem — sem isso ela apareceria com o nome certo mas sem sinal nenhum de que não está ativa.
  const assessorias = assessoriasRaw.map((a) => ({ id: a.id, clientName: a.client.name, status: a.status }));

  async function submit(formData: FormData) {
    "use server";
    let stagedAttachments: { blobUrl: string; name: string; contentType: string; docType?: string }[] = [];
    try {
      const raw = String(formData.get("stagedAttachments") || "");
      if (raw) stagedAttachments = JSON.parse(raw);
    } catch {
      stagedAttachments = [];
    }
    // ClientPicker/OpposingPartyFields (litisconsórcio) emitem um hidden input por entrada —
    // getAll traz todas, cada uma um JSON {clientId/newClientName/role} ou {name/document/role/address}.
    const clients = formData
      .getAll("clientEntries")
      .map((raw) => {
        try {
          return JSON.parse(String(raw));
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    const parties = formData
      .getAll("partyEntries")
      .map((raw) => {
        try {
          return JSON.parse(String(raw));
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    await createCase({
      title: String(formData.get("title")),
      type: String(formData.get("type")),
      materias: formData.getAll("materias").map(String),
      assuntos: formData.getAll("assuntos").map(String),
      distributedAt: String(formData.get("distributedAt") || ""),
      processNumber: String(formData.get("processNumber") || ""),
      court: String(formData.get("court") || ""),
      caseValue: String(formData.get("caseValue") || ""),
      clients,
      parties,
      responsibleId: String(formData.get("responsibleId") || ""),
      description: String(formData.get("description") || ""),
      assessoriaId: String(formData.get("assessoriaId") || ""),
      tribunalSigla: String(formData.get("tribunalSigla") || ""),
      tribunalNome: String(formData.get("tribunalNome") || ""),
      tribunalSistema: String(formData.get("tribunalSistema") || ""),
      tribunalLink: String(formData.get("tribunalLink") || ""),
      // Só preenchidos de fato quando type === "ADMINISTRATIVO" (ver isAdministrativo em
      // createCase) — emitidos pelo OrgaoAdministrativoPicker dentro de NovoCaseNaturezaSection.
      adminEsfera: String(formData.get("adminEsfera") || ""),
      adminMateria: String(formData.get("adminMateria") || ""),
      stagedAttachments,
      // Preenchido quando o cadastro nasceu do botão "Cadastrar novo processo" de uma publicação
      // (o link carrega ?publicationId=..., e SaveCaseButton emite o hidden input dentro deste
      // form). createCase vincula a publicação ao processo recém-criado, para o usuário não ter
      // que voltar em Publicações e vincular à mão o que ele já pediu ali.
      publicationId: String(formData.get("publicationId") || ""),
    });
  }

  return (
    <div className="p-6 max-w-2xl mx-auto animate-fade-in">
      <PageHeader title="Novo Processo/Caso" subtitle="Cadastre um novo card — ele aparecerá na Agenda e no Kanban conforme tarefas forem criadas" />
      <Card className="p-6">
        <form action={submit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-tx-2">Título do Caso</label>
            <input name="title" required defaultValue={searchParams.title} className="input" placeholder="Ex: Fulano de Tal x Empresa XYZ" />
          </div>

          {isProcessoFlow ? (
            <>
              <NovoCaseNaturezaSection
                tribunais={tribunais}
                defaultNatureza={initialNatureza}
                defaultProcessNumber={searchParams.processNumber}
                inputClassName="input"
              />
              <CaseMateriaField />
              <div>
                <label className="text-xs font-medium text-tx-2">Data da distribuição</label>
                <input name="distributedAt" type="date" className="input" />
              </div>
            </>
          ) : (
            // Ramo CASO (Extrajudicial/Atendimento/Consultivo): não existe número de processo,
            // vara/comarca, tribunal nem valor da causa — isso tudo é conceito de demanda
            // judicial, e aqui não há uma. "Judicial" foi removido do <select> de Tipo de
            // propósito: isProcessoFlow acima é decidido a partir do type da URL (searchParams,
            // no primeiro render do server component), não do valor corrente deste <select> — se
            // "Judicial" continuasse como opção aqui, dava pra escolher Judicial e enviar o
            // formulário sem nenhum campo judicial na tela (o ramo renderizado não muda). Pra
            // cadastrar um Judicial de verdade, o usuário entra por "Novo Processo" (NewEntityMenu.tsx),
            // não trocando o Tipo dentro de "Novo Caso".
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-tx-2">Tipo</label>
                <select name="type" defaultValue={defaultType} className="input">
                  <option value="EXTRAJUDICIAL">Extrajudicial</option>
                  <option value="ATENDIMENTO">Atendimento</option>
                  <option value="CONSULTIVO">Consultivo</option>
                </select>
              </div>
              <CaseMateriaField />
            </div>
          )}

          {/* Valor da Causa só faz sentido para uma demanda judicial — some no ramo CASO. Sem
              isProcessoFlow, o grid fica com um item só (Advogado Responsável ocupa a largura). */}
          <div className={isProcessoFlow ? "grid grid-cols-1 sm:grid-cols-2 gap-4" : ""}>
            {isProcessoFlow && (
              <div>
                <label className="text-xs font-medium text-tx-2">Valor da Causa (R$)</label>
                <MoneyInput name="caseValue" className="input" />
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-tx-2">Advogado Responsável</label>
              <select name="responsibleId" className="input">
                <option value="">Não definido</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* No ramo CASO some o "Papel do cliente no processo": Autor/Réu/Recorrente só fazem
              sentido dentro de uma relação processual, e num caso extrajudicial/consultivo não
              há processo nenhum. Ver hideRole em components/ClientPicker.tsx. */}
          <ClientPicker clients={clients} inputClassName="input" hideRole={!isProcessoFlow} />

          <OpposingPartyFields inputClassName="input" />

          <AssessoriaSelect assessorias={assessorias} inputClassName="input" defaultValue={searchParams.assessoriaId} />

          <AssuntosField inputClassName="input" />

          <div>
            <label className="text-xs font-medium text-tx-2">Descrição (observações livres)</label>
            <textarea name="description" rows={2} className="input" />
          </div>

          <NewCaseAttachmentsField driveConnected={storageConnected} />

          <SaveCaseButton defaultType={defaultType} />
        </form>
      </Card>

      <style>{`
        .input { width: 100%; margin-top: 0.25rem; border: 1px solid var(--regua-forte); border-radius: 0.3125rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; color: var(--tx); background: var(--sf-superficie); }
        .input:focus { outline: none; box-shadow: 0 0 0 2px var(--acao-bg); }
      `}</style>
    </div>
  );
}
