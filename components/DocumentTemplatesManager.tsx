"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, X, UploadCloud, ExternalLink } from "lucide-react";
import { createDocumentTemplateLink, deleteDocumentTemplate } from "@/lib/actions/documentTemplates";
import { TEMPLATE_CATEGORIES, MERGE_FIELDS } from "@/lib/documentCategories";

type Template = { id: string; name: string; category: string; driveUrl: string };

export default function DocumentTemplatesManager({ templates, driveConnected }: { templates: Template[]; driveConnected: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [category, setCategory] = useState(TEMPLATE_CATEGORIES[0].value as string);
  const [driveUrl, setDriveUrl] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const byCategory = TEMPLATE_CATEGORIES.map((c) => ({ ...c, items: templates.filter((t) => t.category === c.value) }));

  async function uploadFile(file: File) {
    if (!name.trim()) {
      setError("Preencha o nome do modelo antes de anexar o arquivo.");
      return;
    }
    setError(null);
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("name", name.trim());
    formData.append("category", category);
    try {
      const res = await fetch("/api/document-templates/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erro ao enviar arquivo.");
      } else {
        setName("");
        router.refresh();
      }
    } catch {
      setError("Erro ao enviar arquivo. Verifique sua conexão.");
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  }

  function handleAddLink() {
    if (!name.trim() || !driveUrl.trim()) {
      setError("Preencha nome e link do Drive.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createDocumentTemplateLink({ name: name.trim(), category, driveUrl: driveUrl.trim() });
      if (result.error) setError(result.error);
      else {
        setName("");
        setDriveUrl("");
        router.refresh();
      }
    });
  }

  function handleDelete(id: string) {
    if (!window.confirm("Remover este modelo? O arquivo continua no Google Drive, apenas o vínculo será removido.")) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteDocumentTemplate(id);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {byCategory.map(
        (cat) =>
          cat.items.length > 0 && (
            <div key={cat.value}>
              <p className="text-xs font-semibold text-tx-3 uppercase tracking-wide mb-1.5">{cat.label}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                {cat.items.map((t) => (
                  <div key={t.id} className="group relative flex items-center gap-2 bg-sf-apoio border border-regua px-3 py-2">
                    <FileText size={15} className="text-tx-3 shrink-0" />
                    <a href={t.driveUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-tx truncate flex-1 hover:underline">
                      {t.name}
                    </a>
                    <ExternalLink size={11} className="text-acao shrink-0" />
                    <button
                      onClick={() => handleDelete(t.id)}
                      disabled={pending}
                      data-tip="Remover modelo"
                      className="absolute top-1 right-1 p-1 text-tx-3 opacity-0 group-hover:opacity-100 hover:text-vinho hover:bg-sf transition-all bg-sf-apoio"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )
      )}
      {templates.length === 0 && <p className="text-xs text-tx-3">Nenhum modelo cadastrado ainda.</p>}

      <details className=" border border-regua bg-sf-apoio px-3 py-2.5">
        <summary className="text-xs font-semibold text-tx cursor-pointer">
          Como escrever um modelo que preenche os dados automaticamente
        </summary>
        <div className="mt-2 space-y-2 text-xs text-tx-2">
          <p>
            O modelo precisa ser um arquivo do <strong>Word (.docx)</strong> — convertido automaticamente para Google Docs ao enviar
            aqui — ou um <strong>Google Docs</strong> já existente (cole o link). <strong>PDF não funciona</strong> como modelo:
            não há como preencher os dados automaticamente nele.
          </p>
          <p>
            No texto do seu contrato/petição/procuração, escreva os campos que devem ser preenchidos entre chaves duplas, exatamente
            como na lista abaixo — ex.: <code className="bg-sf px-1 rounded">Eu, {"{{CLIENTE}}"}, portador do CPF {"{{CLIENTE_CPF}}"}...</code>.
            Sem esses tokens no texto, o documento é gerado normalmente, mas nenhum dado é preenchido.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
            {MERGE_FIELDS.map((f) => (
              <div key={f.token} className="flex items-baseline gap-1.5">
                <code className="bg-sf px-1 rounded shrink-0">{`{{${f.token}}}`}</code>
                <span className="text-tx-3">{f.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </details>

      <div className="pt-2 border-t border-regua space-y-2.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div>
            <label className="text-xs font-medium text-tx-2">Nome do modelo</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Contrato de honorários com pagamento de entrada + êxito"
              className="cfg-input w-full"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-tx-2">Categoria</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="cfg-input w-full">
              {TEMPLATE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {driveConnected ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex flex-col items-center justify-center gap-1.5 border-2 border-dashed p-4 cursor-pointer transition-colors ${
              dragOver ? "border-acao bg-acao-bg" : "border-regua-forte hover:border-acao hover:bg-sf-apoio"
            }`}
          >
            <UploadCloud size={20} className="text-tx-3" />
            <p className="text-xs text-tx-2 text-center">
              {uploading ? "Enviando para o Google Drive..." : "Arraste o arquivo do modelo aqui, ou clique para selecionar do computador"}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadFile(file);
                e.target.value = "";
              }}
            />
          </div>
        ) : (
          <p className="text-[11px] text-aviso bg-aviso-bg px-2.5 py-1.5">
            Google Drive não conectado — conecte acima para anexar arquivos, ou cole um link já existente abaixo.
          </p>
        )}

        <div className="flex gap-2">
          <input value={driveUrl} onChange={(e) => setDriveUrl(e.target.value)} placeholder="ou cole um link do Google Drive já existente" className="cfg-input flex-1" />
          <button onClick={handleAddLink} disabled={pending} className="bg-acao hover:bg-acao-hover text-acao-tx text-xs font-semibold px-4 disabled:opacity-50 transition-colors">
            Salvar link
          </button>
        </div>

        {error && <p className="text-[11px] text-urgente bg-urgente-bg px-2.5 py-1.5">{error}</p>}
      </div>
    </div>
  );
}
