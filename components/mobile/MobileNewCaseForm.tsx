"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createCaseMobile } from "@/lib/actions/cases";
import { FilePlus2, Scale, Landmark } from "lucide-react";
import ClientPicker from "@/components/ClientPicker";
import OpposingPartyFields from "@/components/OpposingPartyFields";
import AssessoriaSelect from "@/components/AssessoriaSelect";
import TribunalFields from "@/components/TribunalFields";
import NewCaseAttachmentsField from "@/components/NewCaseAttachmentsField";
import type { TribunalCatalogEntry } from "@/lib/tribunaisCatalog";
import { ORGAOS_ADMINISTRATIVOS, CATEGORIA_ORDER_ADMIN, findOrgaoBySigla } from "@/lib/orgaosAdministrativos";
import { ESFERAS, MATERIAS_ADMIN } from "@/lib/caseNatureza";
import CaseMateriaField from "@/components/processo/CaseMateriaField";
import AssuntosField from "@/components/processo/AssuntosField";

const inputClass =
  "w-full mt-1 border border-navy-800/12 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-navy-900 dark:text-cream-50 bg-white dark:bg-navy-950 focus:outline-none focus:ring-2 focus:ring-gold-500/40";
const labelClass = "text-xs font-medium text-navy-800/60 dark:text-cream-50/60";

// Duas naturezas de cadastro possíveis neste formulário — a terceira ("Caso", ver
// lib/caseNatureza.ts) nunca é uma opção de cadastro direta, só existe como leitura do que já
// está no banco (EXTRAJUDICIAL/ATENDIMENTO/CONSULTIVO continuam escondidos atrás do <select>
// "Tipo" de sempre, dentro da pílula Judicial).
type Natureza = "JUDICIAL" | "ADMINISTRATIVO";

type Client = { id: string; name: string };
type UserOption = { id: string; name: string };
type AssessoriaOption = { id: string; clientName: string };

export default function MobileNewCaseForm({
  clients,
  users,
  assessorias,
  tribunais,
  defaultType,
  defaultProcessNumber,
  driveConnected,
}: {
  clients: Client[];
  users: UserOption[];
  assessorias: AssessoriaOption[];
  tribunais: TribunalCatalogEntry[];
  defaultType: string;
  defaultProcessNumber: string;
  driveConnected: boolean;
}) {
  const router = useRouter();
  // Publicação de origem (ver LinkPublicationMenu / MobilePublicationCard.tsx): quando o
  // cadastro foi aberto a partir de "Cadastrar novo processo" dentro de uma publicação, a URL
  // traz ?publicationId=... — lido aqui (client component) em vez de recebido como prop porque
  // app/m/processos/novo/page.tsx é arquivo de outro agente e não pode ser tocado nesta tarefa.
  const searchParams = useSearchParams();
  const publicationId = searchParams.get("publicationId") || undefined;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Pílula de natureza escolhida no topo do formulário. Se a tela foi aberta com
  // ?type=ADMINISTRATIVO na URL, já abre na pílula certa; qualquer outro valor (inclusive os
  // legados) cai em Judicial, onde o <select> "Tipo" de sempre continua resolvendo o resto.
  const [natureza, setNatureza] = useState<Natureza>(defaultType === "ADMINISTRATIVO" ? "ADMINISTRATIVO" : "JUDICIAL");
  const [type, setType] = useState(defaultType === "ADMINISTRATIVO" ? "JUDICIAL" : defaultType);
  const [attachmentsUploading, setAttachmentsUploading] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Campos do órgão administrativo escolhido — reaproveitam os mesmos 4 nomes que
  // Case.tribunalSigla/tribunalNome/tribunalSistema/tribunalLink já usam para tribunal judicial
  // (ver comentário em lib/orgaosAdministrativos.ts: o mesmo par de colunas guarda tribunal OU
  // órgão dependendo da natureza). Como aqui construímos o payload manualmente em vez de ler
  // <TribunalFields> do formData, guardamos em estado próprio em vez de inputs hidden.
  const [orgaoSigla, setOrgaoSigla] = useState("");
  const [orgaoNome, setOrgaoNome] = useState("");
  const [orgaoSistema, setOrgaoSistema] = useState("");
  const [orgaoLink, setOrgaoLink] = useState("");
  const [adminEsfera, setAdminEsfera] = useState("");
  const [adminMateria, setAdminMateria] = useState("");

  // Escolher um órgão do catálogo pré-preenche esfera/matéria com o padrão dele — os dois
  // <select> continuam livres para ajuste manual depois (o mesmo órgão pode atuar em mais de
  // uma esfera; o catálogo é só um ponto de partida, não uma trava).
  function handleOrgaoChange(sigla: string) {
    setOrgaoSigla(sigla);
    const orgao = findOrgaoBySigla(sigla);
    if (orgao) {
      setOrgaoNome(orgao.nome);
      setOrgaoSistema(orgao.sistemas);
      setOrgaoLink(orgao.portalUrl);
      setAdminEsfera(orgao.esferaPadrao);
      setAdminMateria(orgao.materiaPadrao);
    } else {
      setOrgaoNome("");
      setOrgaoSistema("");
      setOrgaoLink("");
    }
  }

  // Ver components/NewCaseAttachmentsField.tsx e components/SaveCaseButton.tsx — mesmo evento,
  // mesma correção: bloquear o envio enquanto algum anexo ainda está subindo pro Blob, pra não
  // criar o caso só com os que já tinham terminado a tempo (bug real: "só subiram 3 documentos").
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const handleUploading = (e: Event) => setAttachmentsUploading(Boolean((e as CustomEvent).detail?.uploading));
    form.addEventListener("lumen:attachments-uploading", handleUploading);
    return () => form.removeEventListener("lumen:attachments-uploading", handleUploading);
  }, []);

  async function handleSubmit(formData: FormData) {
    const title = String(formData.get("title") || "").trim();
    if (!title) {
      setError("Preencha ao menos o título do caso.");
      return;
    }
    if (attachmentsUploading) {
      setError("Aguarde o envio dos anexos terminar antes de salvar.");
      return;
    }
    setError("");
    setLoading(true);
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
    const isAdministrativo = natureza === "ADMINISTRATIVO";
    try {
      const result = await createCaseMobile({
        title,
        // Administrativo tem um único type possível (ADMINISTRATIVO) — o <select> "Tipo" nem
        // aparece nesse ramo. Judicial mantém exatamente o comportamento de sempre.
        type: isAdministrativo ? "ADMINISTRATIVO" : String(formData.get("type") || "JUDICIAL"),
        materias: formData.getAll("materias").map(String),
        assuntos: formData.getAll("assuntos").map(String),
        distributedAt: String(formData.get("distributedAt") || "") || undefined,
        processNumber: String(formData.get("processNumber") || "") || undefined,
        court: String(formData.get("court") || "") || undefined,
        caseValue: String(formData.get("caseValue") || "") || undefined,
        clients,
        parties,
        responsibleId: String(formData.get("responsibleId") || "") || undefined,
        description: String(formData.get("description") || "") || undefined,
        assessoriaId: String(formData.get("assessoriaId") || "") || undefined,
        tribunalSigla: (isAdministrativo ? orgaoSigla : String(formData.get("tribunalSigla") || "")) || undefined,
        tribunalNome: (isAdministrativo ? orgaoNome : String(formData.get("tribunalNome") || "")) || undefined,
        tribunalSistema: (isAdministrativo ? orgaoSistema : String(formData.get("tribunalSistema") || "")) || undefined,
        tribunalLink: (isAdministrativo ? orgaoLink : String(formData.get("tribunalLink") || "")) || undefined,
        adminEsfera: isAdministrativo ? adminEsfera || undefined : undefined,
        adminMateria: isAdministrativo ? adminMateria || undefined : undefined,
        stagedAttachments,
        publicationId,
      });
      router.push(`/m/processos/${result.id}${result.anexosComErro ? `?anexosFalhos=${result.anexosComErro}` : ""}`);
    } catch {
      setError("Não foi possível salvar o processo. Tente novamente.");
      setLoading(false);
    }
  }

  const isAdministrativo = natureza === "ADMINISTRATIVO";
  // "Processo" (número, vara, tribunal/órgão, valor da causa) x "Caso" — mesma distinção de
  // app/(app)/processos/novo/page.tsx (isProcessoFlow lá), só que aqui derivada de estado
  // reativo em vez de searchParams, porque o Tipo já é um <select> controlado.
  const isProcessoFlow = isAdministrativo || type === "JUDICIAL";
  const salvarLabel = attachmentsUploading ? "Enviando anexos..." : loading ? "Salvando..." : isProcessoFlow ? "Salvar Processo" : "Salvar Caso";

  return (
    <form ref={formRef} action={handleSubmit} className="space-y-3">
      <div>
        <label className={labelClass}>Título do Caso</label>
        <input name="title" required className={inputClass} placeholder="Ex: Fulano de Tal x Empresa XYZ" />
      </div>

      {/* Natureza — a decisão que muda o resto do formulário embaixo (tribunal x órgão,
          esfera/matéria). Duas pílulas grandes lado a lado, versão de toque do NaturezaPicker
          do desktop (que é feito para tela grande e não serve aqui). */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setNatureza("JUDICIAL")}
          aria-pressed={natureza === "JUDICIAL"}
          className={`flex flex-col items-center gap-1 rounded-xl border-2 py-3 transition-colors ${
            natureza === "JUDICIAL"
              ? "border-gold-600 bg-gold-500/10 dark:border-gold-400 dark:bg-gold-400/10"
              : "border-navy-800/12 dark:border-white/10 bg-white dark:bg-navy-950"
          }`}
        >
          <Scale size={18} className={natureza === "JUDICIAL" ? "text-gold-700 dark:text-gold-400" : "text-navy-800/35 dark:text-cream-50/35"} />
          <span className={`text-sm font-semibold ${natureza === "JUDICIAL" ? "text-navy-900 dark:text-cream-50" : "text-navy-800/60 dark:text-cream-50/60"}`}>
            Judicial
          </span>
        </button>
        <button
          type="button"
          onClick={() => setNatureza("ADMINISTRATIVO")}
          aria-pressed={natureza === "ADMINISTRATIVO"}
          className={`flex flex-col items-center gap-1 rounded-xl border-2 py-3 transition-colors ${
            natureza === "ADMINISTRATIVO"
              ? "border-bordo-600 bg-bordo-600/10 dark:border-bordo-400 dark:bg-bordo-600/20"
              : "border-navy-800/12 dark:border-white/10 bg-white dark:bg-navy-950"
          }`}
        >
          <Landmark size={18} className={natureza === "ADMINISTRATIVO" ? "text-bordo-700 dark:text-bordo-400" : "text-navy-800/35 dark:text-cream-50/35"} />
          <span className={`text-sm font-semibold ${natureza === "ADMINISTRATIVO" ? "text-navy-900 dark:text-cream-50" : "text-navy-800/60 dark:text-cream-50/60"}`}>
            Administrativo
          </span>
        </button>
      </div>

      {natureza === "JUDICIAL" ? (
        <>
          <div>
            <label className={labelClass}>Tipo</label>
            <select name="type" value={type} onChange={(e) => setType(e.target.value)} className={inputClass}>
              <option value="JUDICIAL">Judicial</option>
              <option value="EXTRAJUDICIAL">Extrajudicial</option>
              <option value="ATENDIMENTO">Atendimento</option>
              <option value="CONSULTIVO">Consultivo</option>
            </select>
          </div>

          <CaseMateriaField />

          {type === "JUDICIAL" && (
            <div>
              <label className={labelClass}>Data da distribuição</label>
              <input name="distributedAt" type="date" className={inputClass} />
            </div>
          )}

          {/* Número do processo/vara/tribunal só fazem sentido quando o Tipo escolhido acima
              também é Judicial — Extrajudicial/Atendimento/Consultivo (mesma pílula "Judicial",
              ver comentário no topo do arquivo) não tramitam em processo nenhum. Diferente do
              formulário desktop (onde o ramo é fixado no primeiro render, a partir da URL), aqui
              o <select> "Tipo" já é estado reativo — então basta condicionar ao "type" atual em
              vez de precisar tirar "Judicial" da lista de opções. */}
          {type === "JUDICIAL" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Número do Processo</label>
                  <input name="processNumber" defaultValue={defaultProcessNumber} className={inputClass} placeholder="0000000-00.0000..." />
                </div>
                <div>
                  <label className={labelClass}>Vara/Comarca</label>
                  <input name="court" className={inputClass} />
                </div>
              </div>

              {/* Mesma posição relativa do formulário desktop: logo após Vara/Comarca */}
              <TribunalFields tribunais={tribunais} inputClassName={inputClass} />
            </>
          )}
        </>
      ) : (
        <>
          <CaseMateriaField />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Número do processo administrativo</label>
              <input name="processNumber" defaultValue={defaultProcessNumber} className={inputClass} placeholder="Ex.: TC 012.345/2026-7" />
            </div>
            <div>
              <label className={labelClass}>Vara/Comarca</label>
              <input name="court" className={inputClass} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Órgão administrativo</label>
            <select value={orgaoSigla} onChange={(e) => handleOrgaoChange(e.target.value)} className={inputClass}>
              <option value="">Selecione...</option>
              {CATEGORIA_ORDER_ADMIN.map((categoria) => (
                <optgroup key={categoria} label={categoria}>
                  {ORGAOS_ADMINISTRATIVOS.filter((o) => o.categoria === categoria).map((o) => (
                    <option key={o.sigla} value={o.sigla}>
                      {o.sigla} — {o.nome}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Esfera</label>
              <select value={adminEsfera} onChange={(e) => setAdminEsfera(e.target.value)} className={inputClass}>
                <option value="">Selecione...</option>
                {ESFERAS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Matéria</label>
              <select value={adminMateria} onChange={(e) => setAdminMateria(e.target.value)} className={inputClass}>
                <option value="">Selecione...</option>
                {MATERIAS_ADMIN.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </>
      )}

      {/* Valor da Causa só faz sentido para uma demanda judicial (Judicial ou Administrativo) —
          some quando o Tipo escolhido é Extrajudicial/Atendimento/Consultivo. Sem isProcessoFlow,
          o grid fica com um item só (Responsável ocupa a largura). */}
      <div className={isProcessoFlow ? "grid grid-cols-2 gap-3" : ""}>
        {isProcessoFlow && (
          <div>
            <label className={labelClass}>Valor da Causa (R$)</label>
            <input name="caseValue" type="number" step="0.01" className={inputClass} />
          </div>
        )}
        <div>
          <label className={labelClass}>Responsável</label>
          <select name="responsibleId" defaultValue="" className={inputClass}>
            <option value="">Não definido</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* No ramo CASO some o "Papel do cliente no processo": Autor/Réu/Recorrente só fazem
          sentido dentro de uma relação processual, e num caso extrajudicial/consultivo não há
          processo nenhum. Mesma regra do desktop — ver hideRole em components/ClientPicker.tsx. */}
      <ClientPicker clients={clients} inputClassName={inputClass} hideRole={!isProcessoFlow} />

      <OpposingPartyFields inputClassName={inputClass} />

      <AssessoriaSelect assessorias={assessorias} inputClassName={inputClass} />

      <AssuntosField inputClassName={inputClass} />

      <div>
        <label className={labelClass}>Descrição (observações livres)</label>
        <textarea name="description" rows={2} className={inputClass} />
      </div>

      <NewCaseAttachmentsField driveConnected={driveConnected} />

      {error && <p className="text-xs font-semibold text-bordo-600 dark:text-bordo-400">{error}</p>}

      <button
        type="submit"
        disabled={loading || attachmentsUploading}
        className="w-full flex items-center justify-center gap-1.5 bg-bordo-600 hover:bg-bordo-700 dark:bg-bordo-500 dark:hover:bg-bordo-600 text-white font-semibold text-sm py-2.5 rounded-lg transition-colors disabled:opacity-50"
      >
        <FilePlus2 size={15} /> {salvarLabel}
      </button>
    </form>
  );
}
